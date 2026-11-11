const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({children=true,hook}={}){
 const calls=[],threads=new Map([['parent',{id:'old-parent',status:'inProgress'}],...(children?[['child',{id:'old-child',status:'inProgress'}]]:[])]);
 const runtime=new AgentRuntime({directory:'/unused',publish(){},conversationOptions:{infer:async()=>({action:'reply',reply:'执行正在切换权限。'})}});runtime.persist=async()=>{};runtime.changed=()=>{};
 const run={id:'run',permission:'default',status:'running',threadId:'parent',turnId:'old-parent',messages:[{id:'root',role:'user',text:'Continue original objective'}],tools:[],approvals:[],questions:[],conversation:{version:1,updates:[{inputId:'update',turnKey:'root',action:'execute',version:1,state:'delivered'}]}};
 const child={id:'native-child',type:'analysis',nativeThreadId:'child',nativeTurnId:'old-child',status:'running',analysisAgent:{name:'Reviewer'},turnKey:'root'};if(children)run.tools.push(child);
 const context={key:'context',run,turnKey:'root',config:{apiKey:'secret'},dualAgent:true,nativeThreads:new Map(children?[['child',child]]:[])};
 const rpc={closed:false,send(){},close(){this.closed=true;},async call(method,args){calls.push({method,args});const override=await hook?.(method,args,{run,context,runtime});if(override)return override;
  if(method==='thread/read')return {thread:{turns:[threads.get(args.threadId)].filter(Boolean)}};
  if(method==='turn/interrupt'){const turn=threads.get(args.threadId);if(turn){turn.status='interrupted';runtime.notification(context,{method:'turn/completed',params:{threadId:args.threadId,turn:{...turn}}});}return {};}
  if(method==='thread/resume')return {thread:{id:args.threadId},sandbox:{type:args.sandbox==='danger-full-access'?'dangerFullAccess':'readOnly'},approvalPolicy:args.approvalPolicy};
  if(method==='turn/start'){const turn={id:'new-'+args.threadId,status:'inProgress'};threads.set(args.threadId,turn);runtime.notification(context,{method:'turn/started',params:{threadId:args.threadId,turn}});return {turn};}
  return {};
 }};context.rpc=rpc;runtime.runs=[run];runtime.contexts.set(context.key,context);
 runtime.finish=async(c,status)=>{c.done=true;c.run.status=status;c.rpc.close();runtime.contexts.delete(c.key);};
 return {runtime,run,context,calls,threads,child};
}
const full={runId:'run',permission:'full',confirmed:true};
test('permission changes preserve parent/child identities, original task, forms and update versions',async()=>{
 const f=fixture(),form={id:'form',draft:'not submitted'};f.runtime.inputRequests={list:async()=>[form]};
 const messages=f.run.messages,updates=f.run.conversation.updates;
 const result=await f.runtime.switchPermission(full);
 assert.equal(result.state,'applied');assert.equal(result.effective,'full');assert.equal(f.run.permission,'full');assert.equal(f.run.status,'running');assert.equal(f.context.turnKey,'root');assert.equal(f.run.messages,messages);assert.equal(f.run.conversation.updates,updates);assert.equal(form.draft,'not submitted');
 assert.equal(f.context.nativeThreads.get('child'),f.child);assert.equal(f.child.nativeTurnId,'new-child');assert.equal(f.run.turnId,'new-parent');
 assert.deepEqual(f.calls.filter(c=>c.method==='thread/resume').map(c=>c.args.threadId),['parent','child']);
 assert.ok(f.calls.filter(c=>c.method==='turn/start').every(c=>c.args.sandboxPolicy.type==='dangerFullAccess'&&c.args.approvalPolicy==='never'));
 assert.deepEqual(f.calls.filter(c=>c.method==='thread/archive').map(c=>c.args.threadId),['child','parent']);assert.equal(f.calls.filter(c=>c.method==='thread/unarchive').length,2);
});
test('not applied until engine confirms every child; downgrade resumes with restricted policy',async()=>{
 const gate=deferred(),entered=deferred();const f=fixture({hook:async(method,args)=>{if(method==='thread/resume'&&args.threadId==='child'){entered.resolve();await gate.promise;}}});f.run.permission='full';
 const switching=f.runtime.switchPermission({runId:'run',permission:'default'});await entered.promise;
 assert.equal(f.run.permissionChange.state,'switching');assert.equal(f.run.permission,'full');assert.equal(f.calls.some(c=>c.method==='turn/start'),false);
 gate.resolve();assert.equal((await switching).state,'applied');assert.equal(f.run.permission,'default');
 assert.ok(f.calls.filter(c=>c.method==='turn/start').every(c=>c.args.sandboxPolicy.type==='readOnly'&&c.args.approvalPolicy==='on-request'));
});
test('a policy mismatch fails closed without restarting any thread',async()=>{
 const f=fixture({hook:(method,args)=>method==='thread/resume'&&args.threadId==='child'?{sandbox:{type:'readOnly'},approvalPolicy:'on-request'}:undefined});
 const result=await f.runtime.switchPermission(full);assert.equal(result.state,'failed');assert.equal(result.effective,null);assert.equal(f.run.status,'interrupted');assert.equal(f.calls.some(c=>c.method==='turn/start'),false);
});
test('switching blocks execution delivery but allows conversation replies; duplicate switches rejected',async()=>{
 const gate=deferred(),entered=deferred();const f=fixture({hook:async(method)=>{if(method==='thread/resume'){entered.resolve();await gate.promise;}}});
 const switching=f.runtime.switchPermission(full);await entered.promise;
 await assert.rejects(f.runtime.switchPermission(full),/正在切换/);
 await assert.rejects(f.runtime.deliverFormInput({id:'answer',runId:'run',source:'form',text:'Confirmed answer'},{onDispatch:()=>assert.fail('must stay queued')}),{code:'BUSY'});
 await f.runtime.deliverFormInput({id:'progress',runId:'run',source:'user',text:'Progress?'},{onDispatch:async()=>{}});
 assert.equal(f.run.messages.at(-1).text,'执行正在切换权限。');gate.resolve();assert.equal((await switching).state,'applied');
});
test('user stop during switch prevents all continuation',async()=>{
 const gate=deferred(),entered=deferred();const f=fixture({hook:async(method)=>{if(method==='thread/resume'){entered.resolve();await gate.promise;}}});
 const switching=f.runtime.switchPermission(full);await entered.promise;await f.runtime.stop('run');gate.resolve();
 assert.equal((await switching).state,'failed');assert.equal(f.calls.some(c=>c.method==='turn/start'),false);
});
test('elevation requires explicit confirmation and old completion cannot finish the resumed task',async()=>{
 const f=fixture();await assert.rejects(f.runtime.switchPermission({...full,confirmed:false}),/确认/);assert.equal(f.calls.length,0);
 await f.runtime.switchPermission(full);f.runtime.notification(f.context,{method:'turn/completed',params:{threadId:'parent',turn:{id:'old-parent',status:'interrupted'}}});assert.equal(f.run.status,'running');assert.ok(!f.context.done);
});
test('a child completed during suspension is configured but not restarted',async()=>{
 const f=fixture();f.threads.get('child').status='completed';f.child.status='completed';
 await f.runtime.switchPermission(full);assert.equal(f.calls.filter(c=>c.method==='turn/start'&&c.args.threadId==='child').length,0);
});

test('a turn accepted before activation retries only a rejected interrupt and waits for the completion boundary',async()=>{
 let first=true;const f=fixture({children:false,hook:(method)=>{if(method==='turn/interrupt'&&first){first=false;throw Object.assign(Error('no active turn to interrupt'),{rpcRejected:true});}}});
 assert.equal((await f.runtime.switchPermission(full)).state,'applied');assert.equal(f.calls.filter(c=>c.method==='turn/interrupt').length,2);
});

test('failed switch pauses the durable inbox so queued forms cannot restart execution automatically',async()=>{
 const f=fixture({hook:method=>{if(method==='thread/resume')throw Error('connection lost');}});let paused=false;
 f.runtime.chatInputs={pause:async id=>{assert.equal(id,'run');paused=true;}};
 assert.equal((await f.runtime.switchPermission(full)).state,'failed');assert.equal(paused,true);
});

test('restart marks an unfinished permission switch failed and holds the existing input queue',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'permission-recover-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 await fs.writeFile(path.join(directory,'conversations.json'),JSON.stringify([{id:'run',status:'running',messages:[],tools:[],permissionChange:{state:'switching',requested:'full',effective:null}}]));
 const runtime=new AgentRuntime({directory,publish(){}});let paused=false;runtime.chatInputs={pause:async id=>{assert.equal(id,'run');paused=true;}};
 await runtime.init();assert.equal(paused,true);assert.equal(runtime.runs[0].permissionChange.state,'failed');assert.equal(runtime.runs[0].status,'interrupted');assert.equal(runtime.contexts.size,0);
});
