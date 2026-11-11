const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,{hook}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'model-switch-')),calls=[],transports=[];
 const config=(id='a',model='old')=>({id,model,baseUrl:`https://${id}.invalid/v1`,apiKey:`secret-${id}`,executable:process.execPath});
 const runtime=new AgentRuntime({directory,publish(){},provider:{secret:async(id,model)=>config(id,model)},conversationOptions:{infer:async()=>({action:'reply',reply:'Working'})}});runtime.persist=async()=>{};runtime.changed=()=>{};
 const run={id:'run',providerId:'a',model:'old',baseUrl:config().baseUrl,permission:'default',status:'running',threadId:'parent',turnId:'old-parent',messages:[{id:'root',role:'user',text:'Keep the original goal'},{id:'answer',role:'user',formSubmissionId:'answer-id',text:'Confirmed form answer',turnKey:'root'}],tools:[],approvals:[],questions:[],conversation:{version:2,updates:[{inputId:'requirement',version:2,state:'delivered',turnKey:'root',action:'execute'}]}};
 const child={id:'child',nativeThreadId:'child',nativeTurnId:'old-child',status:'running',analysisAgent:{name:'Reviewer'},analysisTask:'Review the original goal',turnKey:'root'};run.tools=[child];
 const context={key:'context',run,turnKey:'root',config:config(),dualAgent:true,nativeThreads:new Map([['child',child]]),rpcLocation:{home:directory,cwd:directory},engineParameters:{model:'old',modelProvider:'atelier',developerInstructions:'Keep role and workflow instructions'}};
 const factory=options=>{const rpc={options,closed:false,send(){},close(){this.closed=true;},async call(method,args){calls.push({method,args,rpc});const result=await hook?.(method,args,{runtime,run,context});if(result)return result;
  if(method==='turn/interrupt'){runtime.notification(context,{method:'turn/completed',params:{threadId:args.threadId,turn:{id:args.turnId,status:'interrupted'}}});return {};}
  if(method==='thread/resume')return {thread:{id:args.threadId},model:args.model,modelProvider:'atelier',sandbox:{type:args.sandbox==='danger-full-access'?'dangerFullAccess':'readOnly'},approvalPolicy:args.approvalPolicy};
  if(method==='turn/start'){const turn={id:'new-'+args.threadId,status:'inProgress'};runtime.notification(context,{method:'turn/started',params:{threadId:args.threadId,turn}});return {turn};}return {};
 }};transports.push(rpc);return rpc;};
 runtime.rpcFactory=factory;context.rpc=factory({config:config()});runtime.runs=[run];runtime.contexts.set(context.key,context);
 runtime.finish=async(c,status)=>{c.done=true;c.run.status=status;c.rpc.close();c.bridge?.close();runtime.contexts.delete(c.key);};
 t.after(async()=>{context.done=true;for(const r of transports)r.close();context.bridge?.close();await fs.rm(directory,{recursive:true,force:true});});
 return {runtime,run,context,calls,transports,child};
}
const next={runId:'run',providerId:'a',model:'new'};
test('live model switch rebuilds transport and retains thread IDs, roles, forms, update versions and permissions',async t=>{
 const f=await fixture(t),messages=f.run.messages,updates=f.run.conversation.updates;const result=await f.runtime.switchModel(next);
 assert.equal(result.state,'applied',result.error);assert.equal(f.run.model,'new');assert.equal(f.context.config.model,'new');assert.equal(f.context.turnKey,'root');assert.equal(f.run.messages,messages);assert.equal(f.run.conversation.updates,updates);assert.equal(f.context.nativeThreads.get('child'),f.child);assert.equal(f.run.permission,'default');assert.equal(f.transports.length,2);assert.equal(f.transports[0].closed,true);
 const resumes=f.calls.filter(c=>c.method==='thread/resume');assert.deepEqual(resumes.map(c=>c.args.threadId),['parent','child']);assert.ok(resumes.every(c=>c.args.model==='new'&&c.args.approvalPolicy==='on-request'));assert.match(resumes[0].args.developerInstructions,/Keep role/);
 const starts=f.calls.filter(c=>c.method==='turn/start');assert.ok(starts.every(c=>c.args.model==='new'));
 assert.match(starts.find(c=>c.args.threadId==='parent').args.input[0].text,/Keep the original goal/);
 assert.match(starts.find(c=>c.args.threadId==='child').args.input[0].text,/Review the original goal/);
});
test('cross-service changes require confirmation before stopping or transmitting history',async t=>{
 const f=await fixture(t);await assert.rejects(f.runtime.switchModel({...next,providerId:'b'}),/确认/);assert.equal(f.calls.length,0);assert.equal(f.run.model,'old');
 const result=await f.runtime.switchModel({...next,providerId:'b',confirmProviderChange:true});assert.equal(result.state,'applied',result.error);assert.equal(f.run.providerId,'b');assert.equal(f.context.config.apiKey,'secret-b');assert.equal(JSON.stringify(result).includes('secret-b'),false);
});
test('model status remains switching until every child confirms; concurrent permission changes are blocked',async t=>{
 const gate=deferred(),entered=deferred();const f=await fixture(t,{hook:async(method,args)=>{if(method==='thread/resume'&&args.threadId==='child'){entered.resolve();await gate.promise;}}});
 const switching=f.runtime.switchModel(next);await entered.promise;assert.equal(f.run.modelChange.state,'switching');assert.equal(f.run.model,'old');await assert.rejects(f.runtime.switchPermission({runId:'run',permission:'full',confirmed:true}),/正在切换/);
 await assert.rejects(f.runtime.deliverFormInput({id:'form',runId:'run',source:'form',text:'More information'},{onDispatch:()=>assert.fail('Keep queued')}),{code:'BUSY'});
 gate.resolve();assert.equal((await switching).state,'applied');
});
test('model mismatch fails closed and pauses queued inputs without replacing the previous model label',async t=>{
 const f=await fixture(t,{hook:(method,args)=>method==='thread/resume'&&args.threadId==='child'?{model:'wrong',modelProvider:'atelier',sandbox:{type:'readOnly'},approvalPolicy:'on-request'}:undefined});let paused=false;f.runtime.chatInputs={pause:async()=>{paused=true;}};
 const result=await f.runtime.switchModel(next);assert.equal(result.state,'failed');assert.equal(result.effective,null);assert.equal(f.run.model,'old');assert.equal(f.run.status,'interrupted');assert.equal(paused,true);assert.equal(f.calls.some(c=>c.method==='turn/start'),false);
});
test('stop while changing models never restarts work',async t=>{
 const gate=deferred(),entered=deferred();const f=await fixture(t,{hook:async(method)=>{if(method==='thread/resume'){entered.resolve();await gate.promise;}}});const pending=f.runtime.switchModel(next);await entered.promise;await f.runtime.stop('run');gate.resolve();assert.equal((await pending).state,'failed');assert.equal(f.calls.some(c=>c.method==='turn/start'),false);
});

test('queued work stores the selected model without starting early and applies it when a slot opens',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'queued-model-'));let runtime;const calls=[];
 const configs=(id='a',model='old')=>({id,model,baseUrl:'https://a.invalid/v1',executable:process.execPath});
 runtime=new AgentRuntime({directory,provider:{secret:async(id,model)=>configs(id,model)},workspace:{read:async()=>({projects:[]})},publish(){},rpcFactory:options=>({closed:false,send(){},close(){this.closed=true;},async call(method,args){calls.push({method,args});if(method==='thread/start'||method==='thread/resume')return {thread:{id:'queued-thread'},model:args.model,modelProvider:'atelier'};if(method==='turn/start')return {turn:{id:'queued-turn'}};return {};}})});
 t.after(async()=>{await runtime.shutdown();await fs.rm(directory,{recursive:true,force:true});});
 await runtime.init();runtime.maxConcurrent=0;const run=await runtime.start({prompt:'Keep queued task',providerId:'a',model:'old'});const context=runtime.active;
 const result=await runtime.switchModel({runId:run.id,providerId:'a',model:'new'});assert.equal(result.state,'configured');assert.equal(result.effective,null);assert.equal(calls.length,0);assert.equal(context.run.status,'preparing');
 runtime.maxConcurrent=1;runtime.drain();const deadline=Date.now()+3000;while(context.run.modelChange.state!=='applied'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 assert.equal(context.run.modelChange.state,'applied',context.run.error);assert.equal(context.run.model,'new');assert.equal(calls.find(c=>c.method==='thread/start').args.model,'new');assert.equal(context.run.messages.filter(m=>m.role==='user').length,1);
});

test('a conversation reply from the old model is not appended after switching; its input can retry',async t=>{
 const f=await fixture(t),gate=deferred(),entered=deferred();
 f.runtime.conversation.infer=async config=>{if(config.model==='old'){entered.resolve();return gate.promise;}return {action:'reply',reply:'New model response'};};
 const item={id:'progress-question',runId:'run',source:'user',text:'Progress?'};
 const pending=f.runtime.deliverFormInput(item,{onDispatch:async()=>{}});const rejected=assert.rejects(pending,{code:'CANCELLED'});await entered.promise;
 assert.equal((await f.runtime.switchModel(next)).state,'applied');await rejected;gate.resolve({action:'reply',reply:'Late old response'});
 await f.runtime.deliverFormInput(item,{onDispatch:async()=>{}});assert.equal(f.run.messages.some(m=>m.text==='Late old response'),false);assert.equal(f.run.messages.filter(m=>m.userInputId===item.id).length,1);assert.equal(f.run.messages.at(-1).text,'New model response');
});
