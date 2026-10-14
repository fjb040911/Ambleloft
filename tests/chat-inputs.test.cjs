const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {ChatInputs}=require('../core/forms/chat-inputs.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {pageRun}=require('../electron/history-pages.cjs');
const answer=(id='answer',runId='run')=>({id,runId,flowId:'form',text:'Answer'});
async function fixture(t,runtime,validate=async()=>{}){const root=await fs.mkdtemp(path.join(os.tmpdir(),'chat-input-test-')),database=new Database(root);const queue=new ChatInputs({database,runtime,validate,publish:()=>{}});t.after(async()=>{await queue.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});return {queue,database};}
async function flush(queue){await queue.poll;await Promise.all(queue.inflight.values());}
test('answers persist once and duplicate identities cannot change their content',async t=>{
 let calls=0;const {queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{calls++;await onDispatch({mode:'steer'});}});
 await queue.enqueue(answer());await flush(queue);await queue.enqueue(answer());await flush(queue);
 assert.equal(calls,1);assert.equal((await queue.get('answer')).state,'delivered');
 await assert.rejects(queue.enqueue({...answer(),text:'Changed'}),/CONFLICT/);
});
test('restart preserves queued answers and quarantines dispatching answers without replay',async t=>{
 let calls=0;const {database,queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{calls++;await onDispatch({});}});
 for(const item of [answer('queued'),answer('uncertain','other')])await database.call('chatInput',{action:'enqueue',item});
 await database.call('chatInput',{action:'update',id:'uncertain',state:'dispatching',target:{threadId:'thread'}});
 await queue.initialize();await flush(queue);assert.equal(calls,1);assert.equal((await queue.get('uncertain')).state,'unknown');assert.equal((await queue.get('queued')).state,'delivered');
});
test('transport failure is unknown; reconciliation is read-only and cannot resend',async t=>{
 let calls=0,found=false;const {queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{calls++;await onDispatch({});throw Error('Disconnected');},hasFormInput:async()=>found});
 await queue.enqueue(answer());await flush(queue);assert.equal((await queue.get('answer')).state,'unknown');
 await queue.reconcile('answer');queue.tick();await flush(queue);assert.equal(calls,1);
 found=true;await queue.reconcile('answer');assert.equal((await queue.get('answer')).state,'delivered');assert.equal(calls,1);
});
test('definitive turn boundary retries later; source invalidation never dispatches',async t=>{
 let valid=true,calls=0;const {queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{calls++;await onDispatch({});if(calls===1)throw Object.assign(Error('no active turn'),{rpcRejected:true,turnBoundary:true});}},async()=>{if(!valid)throw Error('Disabled');});
 await queue.enqueue(answer());await flush(queue);assert.equal((await queue.get('answer')).state,'queued');queue.tick();await flush(queue);assert.equal((await queue.get('answer')).state,'delivered');
 valid=false;await queue.enqueue(answer('disabled'));await flush(queue);assert.equal((await queue.get('disabled')).state,'failed');assert.equal(calls,2);
});
test('a waiting conversation does not block delivery in another conversation',async t=>{
 let release;const held=new Promise(r=>release=r),sent=[];const {queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{await onDispatch({});if(item.runId==='slow')await held;sent.push(item.runId);}});
 await queue.enqueue(answer('slow','slow'));await queue.poll;
 await queue.enqueue(answer('fast','fast'));await queue.poll;
 await queue.inflight.get('fast');assert.deepEqual(sent,['fast']);release();await flush(queue);
});
test('runtime routes active answers into guarded steer without opening another turn',async()=>{
 const runtime=new AgentRuntime({directory:'/tmp',publish:()=>{}});runtime.persist=async()=>{};runtime.changed=()=>{};
 const run={id:'run',status:'running',threadId:'thread',turnId:'turn',messages:[{id:'local-turn',role:'user',text:'Original'}],tools:[]};runtime.runs=[run];
 let params;runtime.contexts.set('c',{run,turnKey:'local-turn',rpc:{call:async(method,input)=>{assert.equal(method,'turn/steer');params=input;}}});
 await runtime.deliverFormInput(answer(),{onDispatch:async target=>assert.equal(target.turnId,'turn')});
 assert.equal(params.expectedTurnId,'turn');assert.equal(params.clientUserMessageId,'answer');assert.equal(run.messages[1].turnKey,'local-turn');
 const page=pageRun(run,undefined,1);assert.equal(page.totalTurns,1);assert.equal(page.messages.length,2);
});
test('runtime queues preparing/finishing contexts and idle delivery waits for actual engine acceptance',async()=>{
 const runtime=new AgentRuntime({directory:'/tmp',publish:()=>{}}),run={id:'run',status:'preparing',messages:[]};runtime.runs=[run];runtime.contexts.set('c',{run});
 await assert.rejects(runtime.deliverFormInput(answer(),{onDispatch:async()=>assert.fail()}),{code:'BUSY'});
 runtime.contexts.clear();run.status='completed';let receipt,settled=false;runtime.start=async(input,context)=>{assert.equal(input.runId,'run');receipt=context.inputDelivery;};
 const pending=runtime.deliverFormInput(answer(),{onDispatch:async()=>{}}).then(()=>settled=true);await new Promise(r=>setImmediate(r));assert.equal(settled,false);receipt.resolve();await pending;assert.equal(settled,true);
});
test('turn ending during durable dispatch is a definitive unsent boundary',async()=>{
 const runtime=new AgentRuntime({directory:'/tmp',publish:()=>{}}),run={id:'run',status:'running',threadId:'thread',turnId:'turn',messages:[]},context={run,rpc:{call:()=>assert.fail('must not send')}};runtime.runs=[run];runtime.contexts.set('c',context);
 await assert.rejects(runtime.deliverFormInput(answer(),{onDispatch:async()=>{context.done=true;}}),{rpcRejected:true,turnBoundary:true});
});
test('conversation presentation keeps steered answers, tools and final in a single turn',()=>{
 const ts=require('typescript'),vm=require('node:vm'),exports={};vm.runInNewContext(ts.transpileModule(require('node:fs').readFileSync('src/conversation-turns.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
 const turns=exports.conversationTurns({status:'completed',messages:[{id:'t',role:'user',text:'Original'},{id:'a',role:'user',turnKey:'t',text:'Answer'},{id:'final',role:'assistant',turnKey:'t',phase:'final_answer',text:'Done'}],tools:[{id:'tool',turnKey:'t'}]});
 assert.equal(turns.length,1);assert.equal(turns[0].messages.length,2);assert.equal(turns[0].final.id,'final');assert.equal(turns[0].tools.length,1);
});
test('internal RPC errors remain uncertain while invalid requests are definitively rejected',async t=>{
 const {queue}=await fixture(t,{deliverFormInput:async(item,{onDispatch})=>{await onDispatch({});throw Object.assign(Error('Rejected'),{rpcRejected:true,code:item.id==='invalid'?-32602:-32603});}});
 await queue.enqueue(answer('internal'));await flush(queue);assert.equal((await queue.get('internal')).state,'unknown');
 await queue.enqueue(answer('invalid'));await flush(queue);assert.equal((await queue.get('invalid')).state,'failed');
});

test('ordinary text uses host identity, is idempotent and retains user provenance',async t=>{
 const sent=[];const {queue}=await fixture(t,{runs:[{id:'run'},{id:'other'}],deliverFormInput:async(item,{dispatch})=>{const result=await dispatch({},()=>{sent.push(item);return Promise.resolve();});await result.receipt;}},()=>assert.fail('user input is not a form'));
 const input={runId:'run',clientMutationId:'one',text:'预算 3000 元'};
 const first=await queue.append(input);await flush(queue);await queue.append(input);await flush(queue);
 assert.equal(sent.length,1);assert.equal(sent[0].source,'user');
 await assert.rejects(queue.append({...input,text:'Changed'}),/CONFLICT/);
 const other=await queue.append({...input,runId:'other'});await flush(queue);assert.notEqual(other.id,first.id);
 await assert.rejects(queue.append({...input,source:'extension'}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(queue.append({...input,runId:'missing'}),{code:'NOT_FOUND'});
});
test('pause survives queue recreation and selective resume holds unselected inputs',async t=>{
 const sent=[],runtime={runs:[{id:'run'}],deliverFormInput:async(item,{dispatch})=>{const result=await dispatch({},()=>{sent.push(item.id);return Promise.resolve();});await result.receipt;}};
 const {database,queue}=await fixture(t,runtime);await queue.pause('run');
 await queue.enqueue(answer('one'));await queue.enqueue(answer('two'));await flush(queue);assert.deepEqual(sent,[]);
 await assert.rejects(queue.append({runId:'run',text:'Stop',clientMutationId:'stop'}),/任务已停止/);
 await queue.shutdown();const restarted=new ChatInputs({database,runtime,validate:async()=>{},publish:()=>{}});t.after(()=>restarted.shutdown());
 await restarted.initialize();await flush(restarted);assert.deepEqual(sent,[]);
 const snapshot=await restarted.snapshot('run');assert.equal(snapshot.policy.paused,true);
 const resume={runId:'run',clientMutationId:'resume',expectedPolicyGeneration:snapshot.policy.generation,deliveryIds:['two']};
 await restarted.resume(resume);await flush(restarted);assert.deepEqual(sent,['two']);assert.equal((await restarted.get('one')).held,true);
 await restarted.resume(resume);await flush(restarted);assert.deepEqual(sent,['two']);
 await assert.rejects(restarted.resume({...resume,clientMutationId:'stale'}),/CONFLICT/);
 await assert.rejects(restarted.resume({...resume,deliveryIds:['one']}),/CONFLICT/);
});
test('stop during preparation prevents dispatch and stop never waits for remote acceptance',async t=>{
 let prepare,release;const ready=new Promise(r=>prepare=r),gate=new Promise(r=>release=r);let calls=0;
 const {queue}=await fixture(t,{runs:[{id:'run'}],deliverFormInput:async(item,{dispatch})=>{prepare();await gate;const result=await dispatch({},()=>{calls++;return Promise.resolve();});await result.receipt;}});
 await queue.append({runId:'run',text:'Hi',clientMutationId:'one'});await ready;await queue.pause('run');release();await flush(queue);
 assert.equal(calls,0);assert.equal((await queue.snapshot('run')).deliveries[0].state,'queued');
 let accept,sent;const remote=new Promise(r=>accept=r),started=new Promise(r=>sent=r);
 queue.runtime.deliverFormInput=async(item,{dispatch})=>{const result=await dispatch({},()=>{sent();return remote;});await result.receipt;};
 await queue.resume({runId:'run',clientMutationId:'resume',expectedPolicyGeneration:1,deliveryIds:[(await queue.snapshot('run')).deliveries[0].id]});await started;
 await queue.pause('run');assert.equal((await queue.snapshot('run')).policy.paused,true);accept();await flush(queue);
 assert.equal((await queue.snapshot('run')).deliveries[0].state,'delivered');
});
test('unfinished outbox quota applies to all sources and archive blocks ordinary input',async t=>{
 const runtime={runs:[{id:'run'}]}, {queue,database}=await fixture(t,runtime);await queue.pause('run');
 for(let i=0;i<32;i++)await database.call('chatInput',{action:'enqueue',item:answer(`a${i}`)});
 await assert.rejects(queue.enqueue(answer('overflow')),/QUOTA_EXCEEDED/);
 runtime.runs[0].archivedAt='now';await assert.rejects(queue.append({runId:'run',text:'Hello',clientMutationId:'archived'}),{code:'FORBIDDEN'});
});
test('runtime records ordinary steered input without a form identity',async()=>{
 const runtime=new AgentRuntime({directory:'/tmp',publish:()=>{}});runtime.persist=async()=>{};runtime.changed=()=>{};
 const run={id:'run',status:'running',threadId:'thread',turnId:'turn',messages:[]};runtime.runs=[run];runtime.contexts.set('c',{run,turnKey:'original',rpc:{call:async()=>{}}});
 await runtime.deliverFormInput({id:'user:one',runId:'run',text:'Hello',source:'user'},{onDispatch:async()=>{}});
 assert.equal(run.messages[0].userInputId,'user:one');assert.equal(run.messages[0].formSubmissionId,undefined);assert.equal(run.messages[0].turnKey,'original');
});
test('runtime Stop persists pause even when the task is already idle',async t=>{
 const runtime=new AgentRuntime({directory:'/tmp',publish:()=>{}});runtime.runs=[{id:'run',status:'completed'}];
 const {queue}=await fixture(t,runtime);runtime.chatInputs=queue;
 await runtime.stop('run');assert.equal((await queue.snapshot('run')).policy.paused,true);
});
test('form submission and outbox quota rejection are one atomic transaction',async t=>{
 const {database,queue}=await fixture(t,{runs:[{id:'run'}]});await queue.pause('run');
 const flow=await database.call('formData',{action:'put',revision:null,flow:{id:'form',runId:'run',submissions:[]}});
 for(let i=0;i<32;i++)await database.call('chatInput',{action:'enqueue',item:answer(`full${i}`)});
 await assert.rejects(database.call('uiSubmit',{flow:{...flow,submissions:[{id:'extra'}]},revision:flow.revision,item:answer('extra')}),/QUOTA_EXCEEDED/);
 const [saved]=await database.call('formData',{action:'list',runId:'run'});assert.equal(saved.revision,flow.revision);assert.deepEqual(saved.submissions,[]);assert.equal(await queue.get('extra'),null);
});
test('notification reaching idle boundary becomes held and only explicit resume permits idle delivery',async t=>{
 const runtime={runs:[{id:'run'}],deliverFormInput:async()=>{throw Object.assign(Error('idle'),{code:'BUSY',holdInput:true});}};
 const {queue,database}=await fixture(t,runtime);queue.tick=()=>{};
 const item={...answer('notice'),activeOnly:true};await queue.enqueue(item);await queue.deliver(item);
 assert.equal((await queue.get(item.id)).held,true);assert.equal(await database.call('chatInput',{action:'canDispatch',id:item.id}),false);
 await queue.resume({runId:'run',clientMutationId:'release',expectedPolicyGeneration:0,deliveryIds:[item.id]});assert.equal((await queue.get(item.id)).allowIdle,true);
});
