// Project Electron only. Local deterministic service; no remote API or user data.
// electron scripts/probes/rpc-large-message-electron.cjs 9 <evidence-directory>
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),mib=Number(process.argv[2]||9),out=process.argv[3]?path.resolve(process.argv[3]):fs.mkdtempSync(path.join(os.tmpdir(),'amble-rpc-large-'));
// Completion size is independent of the existing 32 MiB HTTP request budget.
// Stop/resume keeps history within that budget; an oversized-request probe is separate.
const resumeMib=Math.min(mib,9);
assert.ok(Number.isFinite(mib)&&mib>=9&&mib<=128);fs.mkdirSync(out,{recursive:true});const profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
const {Database}=require(root+'/electron/database.cjs'),{AgentRuntime}=require(root+'/electron/agent-runtime.cjs'),spool=require(root+'/electron/text-spool.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{const end=Date.now()+120000;while(Date.now()<end){if(await fn())return;await sleep(25);}throw Error('probe timeout');};
const records=[],sources=[],events=[],samples=[];let server,db,runtime,phase='complete',ready=false,timer,release,requests=0;
function digest(owner,key){const hash=crypto.createHash('sha256');let length=0;for(let offset=0;;){const p=require(root+'/electron/runtime-text-cache.cjs').range(owner,key,offset);hash.update(p.text,'utf16le');length+=p.text.length;offset+=p.text.length;if(offset>=p.total)break;}return {length,hash:hash.digest('hex')};}
function texts(run){return run.messages.filter(m=>m.role==='assistant'&&m.agentRole!=='conversation').map(m=>({id:m.id,kind:m.kind||'answer',...digest(m,'text')}));}
app.whenReady().then(async()=>{
 const {CodexRPC}=require(root+'/electron/codex-rpc.cjs');
 server=http.createServer(async(req,res)=>{
  let bytes=0;for await(const b of req)bytes+=b.length;requests++;events.push({phase,request:requests,bytes});
  res.writeHead(200,{'content-type':'text/event-stream'});
  const send=async(delta,finish_reason=null)=>{const line='data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\n\n';await require(root+'/electron/byte-stream.cjs').writeChunk(res,line);};
  try{
   if(phase==='resumed'){await send({content:'Resumed after large history 中文😀'},'stop');res.end('data: [DONE]\n\n');return;}
   const source={phase,answer:{length:0,hash:crypto.createHash('sha256')},reasoning:{length:0,hash:crypto.createHash('sha256')}};
   const chunk='中文😀 "quote" \\ line\n'.repeat(800),target=Math.ceil((phase==='stop'?resumeMib:mib)*1048576);
   for(const [kind,field] of [['reasoning','reasoning_content'],['answer','content']]){
    while(source[kind].length<target){const text=chunk.slice(0,Math.min(chunk.length,target-source[kind].length));await send({[field]:text});source[kind].length+=text.length;source[kind].hash.update(text,'utf16le');}
   }
   for(const kind of ['answer','reasoning'])source[kind].hash=source[kind].hash.digest('hex');sources.push(source);ready=true;
   if(phase==='stop'){await new Promise(r=>{release=r;res.once('close',r);});return;}
   await send({},'stop');res.end('data: [DONE]\n\n');
  }catch(error){if(!res.destroyed){events.push({phase,serverError:error.message});res.destroy();}}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 db=new Database(profile);await db.call('ready');
 runtime=new AgentRuntime({directory:profile,database:db,provider:{secret:async()=>({model:'large-fixture',protocol:'chat',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1'})},workspace:{read:async()=>({projects:[]})},publish(){},projectRun:require(root+'/electron/history-pages.cjs').pageRun,conversationOptions:{infer:async()=>({action:'execute',reply:'Starting isolated probe'})},rpcFactory:options=>{const rpc=new CodexRPC(options),call=rpc.call.bind(rpc);rpc.call=(method,params,...rest)=>{if(method==='thread/resume')events.push({method,excludeTurns:params.excludeTurns});return call(method,params,...rest)};return rpc;}});await runtime.init();
 timer=setInterval(()=>samples.push({at:new Date().toISOString(),memory:process.memoryUsage(),processes:app.getAppMetrics()}),100);timer.unref();
 for(const mode of ['complete','stop']){
  phase=mode;ready=false;const run=await runtime.start({prompt:'Generate the deterministic large body.',permission:'default'});await until(()=>ready||!runtime.contexts.size);assert.equal(ready,true);await until(()=>{const live=runtime.runs.find(r=>r.id===run.id);return ['answer','reasoning'].every(kind=>live.messages.some(m=>(m.kind||'answer')===kind&&(require(root+'/electron/runtime-text-cache.cjs').reference(m,'text')?.length??m.text?.length)===sources.at(-1)[kind].length));});
  if(mode==='stop'){const t=performance.now();await runtime.stop(run.id);await until(()=>!runtime.contexts.size);events.push({action:'stop',ms:performance.now()-t});release?.();}
  else await until(()=>!runtime.contexts.size);
  const live=runtime.runs.find(r=>r.id===run.id),before=texts(live);assert.equal(live.status,mode==='stop'?'interrupted':'completed',live.error);
  for(const kind of ['answer','reasoning'])assert.ok(before.some(v=>v.kind===kind&&v.length===sources.at(-1)[kind].length&&v.hash===sources.at(-1)[kind].hash),kind+' final hash mismatch');
  records.push({phase:mode,status:live.status,texts:before});
  if(mode==='stop'){phase='resumed';await runtime.start({runId:run.id,prompt:'Continue after the large stopped response.'});await until(()=>!runtime.contexts.size);assert.equal(live.status,'completed',live.error);const after=texts(live);for(const previous of before)assert.ok(after.some(v=>v.id===previous.id&&v.hash===previous.hash));assert.ok(after.some(v=>v.length==='Resumed after large history 中文😀'.length));records.push({phase:'resumed',status:live.status,texts:after});}
 }
 assert.ok(events.some(e=>e.method==='thread/resume'&&e.excludeTurns===true));
 const before=runtime.runs.map(r=>({id:r.id,status:r.status,texts:texts(r)})).sort((a,b)=>a.id.localeCompare(b.id));await runtime.shutdown();runtime=null;await db.close();db=new Database(profile);await db.call('ready');const restored=await db.call('readRuntimeRuns');const cacheBefore=db.textCache.stats();const after=restored.map(r=>({id:r.id,status:r.status,texts:r.messages.filter(m=>m.role==='assistant'&&m.agentRole!=='conversation').map(m=>{const ref=require(root+'/electron/runtime-text-cache.cjs').reference(m,'text'),h=crypto.createHash('sha256');let length=0;for(let offset=0;;){const p=require(root+'/electron/runtime-text-cache.cjs').range(m,'text',offset);h.update(p.text,'utf16le');length+=p.text.length;offset+=p.text.length;if(offset>=p.total)break;}return {id:m.id,kind:m.kind||'answer',length,hash:h.digest('hex')};})})).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(after,before);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,mib,resumeMib,records,events,sources,restartHashesEqual:true,coldCache:cacheBefore,metrics:require(root+'/electron/performance-metrics.cjs').metrics.snapshot()},null,2));
}).catch(error=>{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:false,error:error.stack,records,events,sources},null,2));process.exitCode=1;}).finally(async()=>{clearInterval(timer);release?.();await runtime?.shutdown().catch(()=>{});await db?.close().catch(()=>{});server?.closeAllConnections();server?.close();fs.writeFileSync(path.join(out,'samples.json'),JSON.stringify(samples));app.exit(process.exitCode||0);});
