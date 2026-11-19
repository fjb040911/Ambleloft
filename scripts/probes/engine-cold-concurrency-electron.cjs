// Run with the project's Electron: electron scripts/probes/engine-cold-concurrency-electron.cjs [rounds]
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {Database}=require('../../electron/database.cjs');
const {AgentRuntime}=require('../../electron/agent-runtime.cjs');
const {pageRun}=require('../../electron/history-pages.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'amble-cold-concurrency-'));
app.setPath('userData',base);
const rounds=Number(process.argv[2]||10),results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,runtime,db;
app.whenReady().then(async()=>{
 assert.ok(Number.isInteger(rounds)&&rounds>0&&rounds<=100);
 server=http.createServer(async(req,res)=>{
  req.resume();await new Promise(r=>req.once('end',r));
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end('data: '+JSON.stringify({choices:[{index:0,delta:{content:'Cold concurrency verified'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(let i=0;i<rounds;i++){
  const dir=path.join(base,'round-'+i);fs.mkdirSync(dir);
  db=new Database(dir);await db.call('ready');
  runtime=new AgentRuntime({directory:dir,database:db,
   provider:{secret:async()=>({model:'fixture',protocol:'chat',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1'})},
   workspace:{read:async()=>({projects:[]})},publish(){},projectRun:pageRun,
   conversationOptions:{infer:async()=>({action:'execute',reply:'Starting'})}});
  await runtime.init();const start=Date.now();
  await Promise.all([runtime.start({prompt:'First isolated task.',permission:'default'}),runtime.start({prompt:'Second isolated task.',permission:'default'})]);
  for(let j=0;j<300&&runtime.contexts.size;j++)await sleep(100);
  const result={round:i,elapsedMs:Date.now()-start,runs:runtime.runs.map(r=>({id:r.id,status:r.status,error:r.error}))};
  results.push(result);console.log(JSON.stringify(result));
  assert.equal(result.runs.length,2);assert.ok(result.runs.every(r=>r.status==='completed'),JSON.stringify(result));
  await runtime.shutdown();runtime=null;await db.close();db=null;
 }
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 await runtime?.shutdown().catch(()=>{});await db?.close().catch(()=>{});server?.closeAllConnections();server?.close();
 try{fs.rmSync(base,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
 catch(error){console.warn('Probe profile cleanup deferred until Electron exits:',base,error.code);}
 app.exit(process.exitCode||0);
});
