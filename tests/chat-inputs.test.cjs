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
