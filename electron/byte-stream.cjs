const {metrics}=require('./performance-metrics.cjs');
const overflow=message=>Object.assign(Error(message),{code:'STREAM_BUFFER_LIMIT'});
// Byte framing instead of readline's unbounded partial-line string. FIFO delivery
// has a per-tick budget, preserving lifecycle ordering while yielding to controls.
class ByteLineReader {
 constructor(stream,onLine,onError,{high=16*1024*1024,low=4*1024*1024,maxFrame=8*1024*1024,budget=256*1024}={}){
  Object.assign(this,{stream,onLine,onError,high,low,maxFrame,budget});this.queue=[];this.head=0;this.bytes=0;this.frame=[];this.frameBytes=0;this.external=false;this.paused=false;this.closed=false;this.finished=new Promise(resolve=>{this.resolveFinished=resolve;});
  this.data=chunk=>{const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);this.queue.push(buffer);this.bytes+=buffer.length;this.flow();this.schedule();};
  this.end=()=>{this.ended=true;this.schedule();};stream.on('data',this.data);stream.on('end',this.end);
 }
 flow(){metrics.record('rpcReadBytes',this.bytes);const awaitingFrame=this.frameBytes>0&&this.head>=this.queue.length;const pause=this.external||!awaitingFrame&&(this.bytes>=this.high||this.paused&&this.bytes>this.low);if(pause&&!this.paused){this.paused=true;this.stream.pause();metrics.record('rpcReadPauses',1);}else if(!pause&&this.paused){this.paused=false;this.stream.resume();}}
 setBackpressure(value){this.external=!!value;this.flow();}
 schedule(){if(this.scheduled||this.closed)return;this.scheduled=setImmediate(()=>{this.scheduled=null;this.drain();});}
 drain(){
  let spent=0;
  try{
   while(this.head<this.queue.length&&spent<this.budget){
    const chunk=this.queue[this.head];const end=chunk.indexOf(10),length=end<0?chunk.length:end;
    if(this.frameBytes+length>this.maxFrame)throw overflow('引擎单条消息超过缓冲上限，已停止接收；已保存内容保留。');
    if(length){this.frame.push(chunk.subarray(0,length));this.frameBytes+=length;}
    spent+=length+(end<0?0:1);
    if(end<0){this.queue[this.head++]=null;}
    else{
     this.queue[this.head]=chunk.subarray(end+1);if(!this.queue[this.head].length)this.queue[this.head++]=null;
     const line=Buffer.concat(this.frame,this.frameBytes).toString('utf8');this.bytes-=this.frameBytes+1;this.frame=[];this.frameBytes=0;this.onLine(line);
     if(this.closed)return;
    }
   }
   if(this.head){this.queue=this.queue.slice(this.head);this.head=0;}
   if(this.ended&&!this.queue.length&&this.frameBytes){const line=Buffer.concat(this.frame,this.frameBytes).toString('utf8');this.bytes-=this.frameBytes;this.frame=[];this.frameBytes=0;this.onLine(line);}
   this.flow();if(this.queue.length)this.schedule();else if(this.ended)this.resolveFinished();
  }catch(error){this.close();this.onError(error);}
 }
 close(){this.closed=true;clearImmediate(this.scheduled);this.stream.off('data',this.data);this.stream.off('end',this.end);this.queue=[];this.frame=[];this.bytes=0;this.frameBytes=0;this.stream.resume();this.resolveFinished();}
}
class ByteWriter {
 constructor(stream,onError,{maxBytes=32*1024*1024,reserve=1024*1024}={}){Object.assign(this,{stream,onError,maxBytes,reserve});this.queue=[];this.bytes=0;this.blocked=false;this.closed=false;this.drain=()=>{this.blocked=false;this.pump();};stream.on('drain',this.drain);}
 send(value,priority=false){
  if(this.closed)throw Error('执行通道已关闭');const length=Buffer.byteLength(value),used=this.bytes+(this.stream.writableLength||0);
  if(length+used>this.maxBytes+(priority?this.reserve:0))throw overflow('执行通道写入积压，请稍后重试；消息未发送。');
  const data=Buffer.from(value),entry={data,priority};if(priority){const index=this.queue.findIndex(item=>!item.priority);if(index<0)this.queue.push(entry);else this.queue.splice(index,0,entry);}else this.queue.push(entry);
  this.bytes+=data.length;metrics.record('rpcWriteBytes',this.bytes);this.pump();return entry;
 }
 cancel(entry){const index=this.queue.indexOf(entry);if(index<0)return false;this.queue.splice(index,1);this.bytes-=entry.data.length;return true;}
 pump(){try{while(!this.closed&&!this.blocked&&this.queue.length){const entry=this.queue.shift();this.bytes-=entry.data.length;this.blocked=!this.stream.write(entry.data);}}catch(error){this.close();this.onError(error);}}
 close(){this.closed=true;this.queue=[];this.bytes=0;this.stream.off('drain',this.drain);}
}
// HTTP producers await drain before fetching another upstream chunk. Abort and
// close always release the waiter; an intentionally slow reader cannot leak it.
async function writeChunk(stream,chunk,signal,onWait){
 if(signal?.aborted)throw signal.reason||Error('已取消');if(stream.destroyed)throw Error('输出连接已关闭');
 if(stream.write(chunk))return;
 metrics.record('bridgeWritePauses',1);
 onWait?.(true);
 try{await new Promise((resolve,reject)=>{
  const done=error=>{stream.off('drain',drain);stream.off('close',close);stream.off('error',errorHandler);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
  const drain=()=>done(),close=()=>done(Error('输出连接已关闭')),errorHandler=error=>done(error),abort=()=>done(signal.reason||Error('已取消'));
  stream.once('drain',drain);stream.once('close',close);stream.once('error',errorHandler);signal?.addEventListener('abort',abort,{once:true});
  if(stream.destroyed)close();else if(signal?.aborted)abort();else if(!stream.writableNeedDrain)drain();
 });}finally{onWait?.(false);}
}
module.exports={ByteLineReader,ByteWriter,writeChunk};
