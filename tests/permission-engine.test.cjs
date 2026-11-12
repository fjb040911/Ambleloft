const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {CodexRPC,findCodex}=require('../electron/codex-rpc.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
test('bundled engine interrupts and resumes the same active thread with confirmed permissions', {timeout:20000},async t=>{
 let executable;try{executable=await findCodex();}catch{t.skip('Bundled engine unavailable');return;}
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'permission-engine-'));
 const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': waiting for interruption\n\n');});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const config={model:'fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`};
 const runtime=new AgentRuntime({directory,publish(){}});runtime.persist=async()=>{};runtime.changed=()=>{};runtime.permissionTimeoutMs=10000;
 const run={id:'probe',permission:'default',status:'running',threadId:null,turnId:null,messages:[{id:'root',role:'user',text:'Wait for the test'}],tools:[],questions:[],approvals:[]};
 const context={key:'context',run,turnKey:'root',config,dualAgent:false};runtime.runs=[run];runtime.contexts.set(context.key,context);
 const rpc=new CodexRPC({executable,config,home:directory,cwd:directory,notification:m=>runtime.notification(context,m),request:m=>runtime.request(context,m),exit(){}});context.rpc=rpc;
 t.after(async()=>{context.done=true;await rpc.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:200});});
 await rpc.call('initialize',{clientInfo:{name:'permission-engine-test',version:'1'}});rpc.send({method:'initialized',params:{}});
 const thread=await rpc.call('thread/start',{model:'fixture',modelProvider:'atelier',sandbox:'read-only',approvalPolicy:'on-request'});run.threadId=thread.thread.id;
 const turn=await rpc.call('turn/start',{threadId:run.threadId,input:[{type:'text',text:'Wait for the test'}]});run.turnId=turn.turn.id;
 for(const permission of ['full','default']){
  const result=await runtime.switchPermission({runId:run.id,permission,confirmed:true});assert.equal(result.state,'applied',result.error);assert.equal(run.threadId,thread.thread.id);assert.equal(run.permission,permission);assert.equal(run.status,'running');
  const observed=await rpc.call('thread/resume',{threadId:run.threadId,excludeTurns:true});assert.equal(observed.sandbox.type,permission==='full'?'dangerFullAccess':'readOnly');assert.equal(observed.approvalPolicy,permission==='full'?'never':'on-request');
 }
});
