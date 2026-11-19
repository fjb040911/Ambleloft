const {TextDecoder}=require('node:util');
const {ByteLineReader}=require('./byte-stream.cjs');
const {TextSpool,install}=require('./text-spool.cjs');
const {metrics}=require('./performance-metrics.cjs');
const limit=message=>Object.assign(Error(message),{code:'STREAM_BUFFER_LIMIT'});
const invalid=()=>Object.assign(Error('引擎返回了无效的 JSON 消息'),{code:'INVALID_RPC_JSON'});

// JSON structure stays bounded in memory. Large string values are decoded into
// one private UTF-16 spool per message, never concatenated into a JSON document.
// Limits bound disk, metadata and nesting independently; the old 8 MiB memory
// budget is NOT enlarged to accommodate a larger serialized response.
class JsonFrame {
 constructor({root,stringLimit=8192,maxMetadata=8*1024*1024,maxDisk=512*1024*1024,maxNodes=100000,maxDepth=128,objectOnly=false}={}){
  Object.assign(this,{root,stringLimit,maxMetadata,maxDisk,maxNodes,maxDepth,objectOnly});
  this.decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});this.stack=[];this.holder={};this.nodes=0;this.metadata=0;this.present=false;this.token=null;
 }
 charge(bytes){this.metadata+=bytes;if(this.metadata>this.maxMetadata)throw limit('引擎消息结构超过内存预算');}
 value(value,ref){
  if(++this.nodes>this.maxNodes)throw limit('引擎消息条目过多');this.charge(64);
  const parent=this.stack.at(-1);let owner,key;
  if(!parent){if(this.present)throw invalid();this.present=true;owner=this.holder;key='value';}
  else if(parent.type==='array'&&['value','first'].includes(parent.state)){owner=parent.value;key=String(owner.length);parent.state='comma';}
  else if(parent.type==='object'&&parent.state==='value'){owner=parent.value;key=parent.key;parent.key=undefined;parent.state='comma';}
  else throw invalid();
  if(ref)install(owner,key,ref);else Object.defineProperty(owner,key,{value,writable:true,configurable:true,enumerable:true});
 }
 stringPart(text){
  const token=this.token;token.length+=text.length;
  if(token.key&&token.length>16384)throw limit('引擎消息字段名称过长');
  if(token.control&&token.length>16384)throw limit('引擎消息控制字段过长');
  token.parts.push(text);token.buffered=(token.buffered||0)+text.length;
  if(!token.key&&(token.spool||token.length>this.stringLimit)){
   this.store??=new TextSpool(this.root);token.spool??=this.store.createSegment();
   if(this.store.writtenBytes+this.store.bytes+token.buffered*2>this.maxDisk)throw limit('引擎消息正文超过临时存储预算');
   // Escape-heavy JSON can produce one code unit at a time. Batch decoded text
   // before writing; otherwise tiny buffers make each flush quadratic.
   if(token.buffered>=16384)this.flushString(token);
  }
 }
 flushString(token){if(token.buffered){this.store.append(token.spool,token.parts.join(''));token.parts=[];token.buffered=0;}}
 endString(){
  const token=this.token;this.token=null;
  if(token.key){const parent=this.stack.at(-1);parent.key=token.parts.join('');parent.state='colon';this.charge(token.length*2);}
  else if(token.spool){this.flushString(token);this.store.flush(token.spool);this.value(undefined,token.spool);}
  else {this.charge(token.length*2);this.value(token.parts.join(''));}
 }
 primitive(){const token=this.token;this.token=null;let value;try{value=JSON.parse(token.text);}catch{throw invalid();}if(value!==null&&!['boolean','number'].includes(typeof value))throw invalid();this.charge(token.text.length*2);this.value(value);}
 text(text){
  let at=0;const special=/["\\\u0000-\u001f]/g;
  while(at<text.length){
   const token=this.token;
   if(token?.kind==='string'){
    if(token.unicode!==undefined){const c=text[at++];if(!/[0-9a-fA-F]/.test(c))throw invalid();token.unicode+=c;if(token.unicode.length===4){this.stringPart(String.fromCharCode(parseInt(token.unicode,16)));delete token.unicode;}continue;}
    if(token.escape){token.escape=false;const c=text[at++];if(c==='u'){token.unicode='';continue;}const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.hasOwn(escapes,c))throw invalid();this.stringPart(escapes[c]);continue;}
    special.lastIndex=at;const match=special.exec(text),end=match?match.index:text.length;
    if(end>at)this.stringPart(text.slice(at,end));at=end;if(!match)continue;
    const c=text[at++];if(c==='"')this.endString();else if(c==='\\')token.escape=true;else throw invalid();continue;
   }
   if(token?.kind==='primitive'){
    if(/[\s,\]}]/.test(text[at])){this.primitive();continue;}
    token.text+=text[at++];if(token.text.length>128)throw limit('引擎消息标量过长');continue;
   }
   const c=text[at++];if(/[\x20\t\r\n]/.test(c))continue;
   const parent=this.stack.at(-1),state=parent?.state;
   if(c==='}'||c===']'){
    if(!parent||(c==='}'?parent.type!=='object':parent.type!=='array')||!['first','comma'].includes(state))throw invalid();this.stack.pop();continue;
   }
   if(state==='comma'){if(c!==',')throw invalid();parent.state=parent.type==='array'?'value':'key';continue;}
   if(state==='colon'){if(c!==':')throw invalid();parent.state='value';continue;}
   const key=parent?.type==='object'&&['first','key'].includes(state);
   if(c==='"'){if(!key&&!(!parent&&!this.present||parent?.type==='array'&&['first','value'].includes(state)||state==='value'))throw invalid();this.token={kind:'string',key,control:!key&&/^(?:id|method|type|status|threadId|turnId|itemId|clientId|model|modelProvider)$/.test(parent?.key||''),parts:[],length:0};continue;}
   if(key)throw invalid();
   if(c==='{'||c==='['){const value=c==='{'?{}:[];this.value(value);if(this.stack.length>=this.maxDepth)throw limit('引擎消息嵌套过深');this.stack.push({type:c==='{'?'object':'array',state:'first',value});continue;}
   if(!/[\-0-9tfn]/.test(c))throw invalid();this.token={kind:'primitive',text:c};
  }
 }
 write(bytes){this.text(this.decoder.decode(bytes,{stream:true}));}
 finish(){this.text(this.decoder.decode());if(this.token?.kind==='primitive')this.primitive();if(this.token||this.stack.length||!this.present)throw invalid();if(this.objectOnly){const value=Object.getOwnPropertyDescriptor(this.holder,'value').value;if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();}return this.holder.value;}
 close(){this.store?.close();this.stack=[];this.holder={};this.token=null;}
}

class RpcJsonReader extends ByteLineReader {
 constructor(stream,onMessage,onError,options={}){
  super(stream,()=>{},onError,options);this.options=options;this.onMessage=onMessage;this.frame=null;this.retained=new Set();this.retainedBytes=0;this.frameLimit=options.maxFrameBytes??512*1024*1024;
 }
 setBackpressure(value){super.setBackpressure(value);if(!value)this.schedule();}
 complete(){
  if(!this.frame)return;
  const frame=this.frame;frame.encodedBytes=this.frameBytes;this.frame=null;this.frameBytes=0;
  try{
   const value=frame.finish(),bytes=(frame.store?.writtenBytes||0)+(frame.store?.bytes||0);metrics.record('rpcJsonMetadataBytes',frame.metadata);metrics.record('rpcSpoolWrittenBytes',frame.store?.writtenBytes||0);
   // Reject before dispatch/resolve: no caller may acknowledge a reply whose
   // storage budget has already been exhausted.
   if(this.retainedBytes+bytes>(this.options.maxRetainedBytes??512*1024*1024))throw limit('引擎待处理响应超过临时存储预算');
   // Notifications are consumed synchronously. Request/reply bodies may be
   // inspected by their awaiting caller until transport close or explicit release.
   const retained=this.onMessage(value,frame);
   if(retained&&frame.store&&!this.closed){this.retained.add(frame);this.retainedBytes+=bytes;return;}
  }finally{if(!this.retained.has(frame))frame.close();}
 }
 release(frame){if(this.retained.delete(frame)){this.retainedBytes-=frame.store.writtenBytes+frame.store.bytes;frame.close();}}
 drain(){
  let spent=0;
  try{
   while(!this.external&&this.head<this.queue.length&&spent<this.budget){
    const chunk=this.queue[this.head],newline=chunk.indexOf(10),available=newline<0?chunk.length:newline;
    const length=Math.min(available,this.budget-spent,65536);
    if(this.frameBytes+length>this.frameLimit)throw limit('引擎消息超过传输存储预算');
    if(length){this.frame??=new JsonFrame({...this.options,objectOnly:true});this.frame.write(chunk.subarray(0,length));this.frameBytes+=length;this.bytes-=length;spent+=length;}
    const ended=newline===length;
    const consumed=length+(ended?1:0);if(ended){this.bytes--;spent++;metrics.record('rpcFrameBytes',this.frameBytes);this.complete();}
    if(this.closed)return;
    this.queue[this.head]=chunk.subarray(consumed);if(!this.queue[this.head].length)this.queue[this.head++]=null;
   }
   if(this.head){this.queue=this.queue.slice(this.head);this.head=0;}
   if(this.ended&&!this.queue.length&&!this.external){this.complete();this.resolveFinished();}
   this.flow();if(this.queue.length&&!this.external)this.schedule();
  }catch(error){this.close();this.onError(error);}
 }
 close(){if(this.closed)return;this.frame?.close();this.frame=null;for(const frame of this.retained||[])frame.close();this.retained?.clear();this.retainedBytes=0;super.close();this.frame=null;}
}
module.exports={JsonFrame,RpcJsonReader};
