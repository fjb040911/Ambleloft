// Non-interactive SSH channel with bounded output and explicit unknown outcomes.
async function runChannel(client,command,{input,signal,timeoutMs=30000,maxBytes=1048576}={}){
 if(signal?.aborted)throw Error('操作已取消');
 return new Promise((resolve,reject)=>{
  let stream,timer,settled=false,size=0,exitCode=null;const out=[],err=[];
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);client.removeListener('close',lost);if(error){try{stream?.signal('TERM');stream?.close();}catch{}reject(error);}else resolve({stdout:Buffer.concat(out),stderr:Buffer.concat(err),exitCode});};
  const abort=()=>finish(Error('操作已取消，执行结果待核实；请检查是否仍有子进程运行'));
  const lost=()=>finish(Error('SSH 通道中断，执行结果未知；不会自动重跑'));
  const collect=target=>data=>{size+=data.length;if(size>maxBytes){finish(Error('远端输出超过限制，执行结果待核实'));return;}target.push(Buffer.from(data));};
  signal?.addEventListener('abort',abort,{once:true});client.once('close',lost);
  timer=setTimeout(()=>finish(Error('远端操作超时，执行结果未知；不会自动重跑')),Math.max(1000,Math.min(timeoutMs,120000)));
  try{client.exec(command,(error,channel)=>{if(error){finish(Error('无法打开 SSH 命令通道'));return;}stream=channel;if(settled){channel.close();return;}
   channel.on('data',collect(out));channel.stderr.on('data',collect(err));channel.on('error',lost);channel.on('exit',code=>{exitCode=code;});channel.on('close',()=>exitCode===null?lost():finish());
   if(input!==undefined)channel.end(input);else channel.end();
  });}catch(error){finish(error);}
 });
}
async function openPty(client,command,{cols,rows}){
 return new Promise((resolve,reject)=>client.exec(command,{pty:{term:'xterm-256color',cols,rows}},(error,stream)=>{
  if(error){reject(Error('无法创建容器终端'));return;}stream.setEncoding('utf8');stream.on('error',()=>stream.close());
  resolve({write:data=>stream.write(data),resize:(cols,rows)=>stream.setWindow(rows,cols,0,0),pause:()=>stream.pause(),resume:()=>stream.resume(),kill:()=>{try{stream.signal('HUP');}finally{stream.close();}},onData:fn=>{stream.on('data',fn);return {dispose:()=>stream.removeListener('data',fn)};},onExit:fn=>{let exited=false;const done=code=>{if(!exited){exited=true;fn({exitCode:Number.isInteger(code)?code:255});}};stream.once('close',done);client.once('close',done);return {dispose:()=>{stream.removeListener('close',done);client.removeListener('close',done);}};}});
 }));
}
module.exports={runChannel,openPty};
