const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {CodexRPC,findCodex}=require('../electron/codex-rpc.cjs');const {AgentRuntime}=require('../electron/agent-runtime.cjs');
test('bundled engine switches models and endpoints with parent/child history and permissions intact',{timeout:30000},async t=>{
 let executable;try{executable=await findCodex();}catch{t.skip('Bundled engine unavailable');return;}
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'model-engine-')),requests=[];
 const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{requests.push({url:req.url,body});res.writeHead(200,{'content-type':'text/event-stream'});res.write(': waiting for interruption\n\n');});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const config=(id='a',model='fixture-old')=>({id,model,baseUrl:`http://127.0.0.1:${server.address().port}/${id}/v1`,executable});
 const runtime=new AgentRuntime({directory,publish(){},provider:{secret:async(id,model)=>config(id,model)}});runtime.changed=()=>{};runtime.persist=async()=>{};
 const run={id:'probe',providerId:'a',model:'fixture-old',baseUrl:config().baseUrl,permission:'default',cwd:directory,status:'running',threadId:null,turnId:null,messages:[{id:'root',role:'user',text:'Preserve original requirement 475'}],tools:[],questions:[],approvals:[]};
 const context={key:'context',run,turnKey:'root',config:config(),dualAgent:false,rpcLocation:{home:directory,cwd:directory},nativeThreads:new Map()};runtime.runs=[run];runtime.contexts.set(context.key,context);
 const original=new CodexRPC({executable,config:config(),home:directory,cwd:directory,notification:m=>runtime.notification(context,m),request:m=>runtime.request(context,m),exit(){}});context.rpc=original;
 t.after(async()=>{context.done=true;context.rpc.close();original.close();context.bridge?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,100));await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 await original.call('initialize',{clientInfo:{name:'model-engine-test',version:'1'}});original.send({method:'initialized',params:{}});
 const parent=await original.call('thread/start',{model:run.model,modelProvider:'atelier',sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'Retain original workflow.'});run.threadId=parent.thread.id;
 const parentTurn=await original.call('turn/start',{threadId:run.threadId,input:[{type:'text',text:run.messages[0].text}]});run.turnId=parentTurn.turn.id;
 const child=await original.call('thread/start',{model:run.model,modelProvider:'atelier',sandbox:'read-only',approvalPolicy:'on-request',developerInstructions:'Review the original task.'});
 const tool={id:'child',nativeThreadId:child.thread.id,status:'running',analysisAgent:{name:'Reviewer'},analysisTask:'Review requirement 475',turnKey:'root'};run.tools.push(tool);context.nativeThreads.set(child.thread.id,tool);
 tool.nativeTurnId=(await original.call('turn/start',{threadId:child.thread.id,input:[{type:'text',text:'Review requirement 475'}]})).turn.id;
 for(const [providerId,model] of [['a','fixture-new'],['b','fixture-other']]){
  const result=await runtime.switchModel({runId:run.id,providerId,model,confirmProviderChange:providerId==='b'});assert.equal(result.state,'applied',result.error);assert.equal(run.threadId,parent.thread.id);assert.equal(context.nativeThreads.get(child.thread.id),tool);
  for(const threadId of [run.threadId,child.thread.id]){const observed=await context.rpc.call('thread/resume',{threadId,excludeTurns:true});assert.equal(observed.model,model);assert.equal(observed.sandbox.type,'readOnly');assert.equal(observed.approvalPolicy,'on-request');}
  const until=Date.now()+8000;while(requests.filter(r=>r.url.startsWith('/'+providerId+'/')&&JSON.parse(r.body).model===model).length<2&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
  const received=requests.filter(r=>r.url.startsWith('/'+providerId+'/')&&JSON.parse(r.body).model===model);assert.ok(received.length>=2,'Parent and child must use the new endpoint/model');assert.ok(received.every(r=>r.body.includes('475')),'Original requirement must survive the switch');
 }
});
