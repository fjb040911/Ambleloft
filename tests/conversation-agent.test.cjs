const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {ChatInputs}=require('../core/forms/chat-inputs.cjs');
const {Database}=require('../electron/database.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(infer){
 const calls=[];
 const runtime=new AgentRuntime({directory:'/unused',publish(){},conversationOptions:{infer}});
 runtime.changed=()=>{};runtime.persist=async()=>{};
 const run={id:'run',status:'running',threadId:'thread',turnId:'turn',messages:[{id:'root',role:'user',text:'Optimize scheduler'}],tools:[],approvals:[],questions:[]};
 const context={key:'context',run,turnKey:'root',dualAgent:true,config:{model:'test',apiKey:'secret'},rpc:{call:async(method,args)=>{calls.push({method,args});return {};},close(){}}};
 runtime.runs=[run];runtime.contexts.set(context.key,context);
 return {runtime,run,context,calls};
}
const input=(id,text)=>({id,runId:'run',source:'user',text});
const dispatch={onDispatch:async()=>{}};

test('discussion updates use the execution lane and acknowledgement without reclassifying or consuming forms',async()=>{
 const f=fixture(()=>assert.fail('The discussion host already classified this message'));
 f.context.dualAgent=false;f.run.collaboration={mode:'discussion',requestId:'discussion'};
 f.run.questions=[{id:'pending-question'}];
 const update={...input('discussion-update','只调整架构，保留原有补充信息功能'),source:'discussion',discussionRequestId:'discussion'};
 await f.runtime.deliverFormInput(update,dispatch);
 assert.equal(f.calls[0].method,'turn/steer');assert.ok(f.calls[0].args.input[0].text.endsWith(update.text));
 assert.equal(f.run.conversation.updates[0].state,'delivered');assert.deepEqual(f.run.questions,[{id:'pending-question'}]);
 f.runtime.notification(f.context,{method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'mcpToolCall',server:'atelier_progress',tool:'acknowledge_update',status:'completed',arguments:{version:1,summary:'已应用架构调整，保留补充信息流程。'}}}});
 assert.equal(f.run.conversation.updates[0].state,'applied');
 await f.runtime.deliverFormInput({...input('form-answer','原有表单回答'),source:'form'},dispatch);
 assert.equal(f.calls[1].args.input[0].text,'原有表单回答');assert.equal(f.run.conversation.updates.length,1);
});

test('progress questions reply in a separate lane without steering or completing execution',async()=>{
 const f=fixture(async(config,job)=>{assert.equal(job.input.task.objective,'Optimize scheduler');return {action:'reply',reply:'正在分析调度瓶颈。'};});
 f.runtime.maxConcurrent=0;
 await f.runtime.deliverFormInput(input('status','进度如何'),dispatch);
 assert.equal(f.calls.length,0);assert.equal(f.run.status,'running');assert.ok(!f.context.done);
 assert.equal(f.run.messages[1].role,'user');assert.equal(f.run.messages[2].agentRole,'conversation');
 assert.equal(f.run.messages[1].inputDeliveryState,'delivered');assert.equal(await f.runtime.hasFormInput(input('status','')),true);
});

test('updates keep exact user text, get versions, and require an explicit executor acknowledgement',async()=>{
 const f=fixture(async()=>({action:'execute',reply:'会将顺序约束交给执行侧。'}));
 await f.runtime.deliverFormInput(input('update','必须保持任务顺序'),dispatch);
 assert.equal(f.calls[0].method,'turn/steer');assert.equal(f.calls[0].args.clientUserMessageId,'update');
 assert.match(f.calls[0].args.input[0].text,/version 1/);assert.ok(f.calls[0].args.input[0].text.endsWith('必须保持任务顺序'));
 assert.equal(f.run.conversation.updates[0].state,'delivered');
 const acknowledge=(version,extra={})=>f.runtime.notification(f.context,{method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'mcpToolCall',server:'atelier_progress',tool:'acknowledge_update',status:'completed',arguments:{version,summary:'已调整方案并通知相关子任务。'},...extra}}});
 acknowledge(99);acknowledge(1,{result:{isError:true}});assert.equal(f.run.conversation.updates[0].state,'delivered');
 acknowledge(1);assert.equal(f.run.conversation.updates[0].state,'applied');
 const count=f.run.messages.length;acknowledge(1);assert.equal(f.run.messages.length,count);
});

test('queued updates are acknowledged once; status questions remain answerable before executor startup',async()=>{
 let decisions=0;const f=fixture(async(config,job)=>{decisions++;return {action:job.input.userMessage==='status'?'reply':'execute',reply:'Received'};});
 f.context.rpc=null;f.run.status='preparing';f.run.turnId=null;
 await assert.rejects(f.runtime.deliverFormInput(input('update','constraint'),dispatch),{code:'BUSY'});
 await assert.rejects(f.runtime.deliverFormInput(input('update','constraint'),dispatch),{code:'BUSY'});
 await f.runtime.deliverFormInput(input('status','status'),dispatch);
 assert.equal(decisions,2);assert.equal(f.run.conversation.version,1);
 assert.equal(f.run.messages.filter(m=>m.role==='assistant').length,2);
});

test('a late conversation result cannot steer a completed turn or append a stale answer',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise);
 const delivery=f.runtime.deliverFormInput(input('late','change'),dispatch);
 f.context.done=true;pending.resolve({action:'execute',reply:'late answer'});
 await assert.rejects(delivery,{code:'BUSY'});assert.equal(f.calls.length,0);
 assert.equal(f.run.messages.filter(m=>m.role==='assistant').length,0);
});

test('stop aborts conversation inference and archives all live descendants before finishing',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise);
 f.context.nativeThreads=new Map([['child',{nativeThreadId:'child',status:'running'}],['grandchild',{nativeThreadId:'grandchild',status:'waiting'}]]);
 const reply=f.runtime.deliverFormInput(input('q','status'),dispatch);
 const rejected=assert.rejects(reply,{code:'CANCELLED'});
 await f.runtime.stop('run');await rejected;
 assert.deepEqual(f.calls.filter(c=>c.method==='thread/archive').map(c=>c.args.threadId),['child','grandchild']);
 assert.ok(f.calls.some(c=>c.method==='turn/interrupt'));assert.equal(f.run.status,'interrupted');
 pending.resolve({action:'reply',reply:'late'});await Promise.resolve();assert.equal(f.run.messages.filter(m=>m.role==='assistant').length,0);
});

test('inference failure falls back to the executor without losing the original input',async()=>{
 const f=fixture(async()=>{throw Error('provider unavailable');});
 await f.runtime.deliverFormInput(input('update','Keep order'),dispatch);
 assert.equal(f.calls[0].method,'turn/steer');assert.ok(f.calls[0].args.input[0].text.endsWith('Keep order'));
 assert.equal(f.run.messages.filter(m=>m.role==='assistant').length,0);
});

test('outbox visits progress and cancel requests behind an update waiting for executor capacity',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dual-agent-outbox-')),database=new Database(root);
 const f=fixture(async(config,job)=>({action:job.input.userMessage==='stop'?'cancel':job.input.userMessage==='status'?'reply':'execute',reply:'Acknowledged'}));
 f.context.rpc=null;f.run.status='preparing';f.run.turnId=null;
 const queue=new ChatInputs({database,runtime:f.runtime,validate:async()=>{},publish(){}});f.runtime.chatInputs=queue;
 t.after(async()=>{await queue.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});
 for(const item of [input('update','constraint'),input('status','status'),input('stop','stop')])await database.call('chatInput',{action:'enqueue',item});
 queue.tick();await queue.poll;await Promise.all(queue.inflight.values());
 assert.equal((await queue.get('update')).state,'queued');assert.equal((await queue.get('status')).state,'delivered');assert.equal((await queue.get('stop')).state,'delivered');
 assert.equal((await queue.snapshot('run')).policy.paused,true);assert.equal(f.run.status,'interrupted');
});

test('new user task publishes its plan before execution and preserves native subagent routing',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dual-agent-start-')),decision=deferred();let runtime;
 t.after(async()=>{await runtime?.shutdown();await fs.rm(directory,{recursive:true,force:true});});
 const provider={secret:async()=>({id:'fixture',model:'test',baseUrl:'https://fixture.invalid/v1',executable:process.execPath})};
 const calls=[];runtime=new AgentRuntime({directory,provider,workspace:{read:async()=>({projects:[]})},publish(){},conversationOptions:{infer:()=>decision.promise},rpcFactory:()=>({close(){},send(){},call:async(method,args)=>{calls.push({method,args});if(method==='thread/start')return {thread:{id:'parent'}};if(method==='turn/start')return {turn:{id:'turn'}};if(method==='thread/read')return {thread:{agentNickname:'Reviewer'}};return {};}})});
 await runtime.init();runtime.maxConcurrent=0;
 await runtime.start({prompt:'Optimize scheduler'},{userAuthored:true});const context=runtime.active;
 assert.equal(runtime.pendingStarts.length,0);assert.equal(calls.length,0);
 decision.resolve({action:'execute',reply:'先检查调度与并发控制，再修改并验证。'});await context.conversationPreparation;
 assert.equal(runtime.pendingStarts.length,1);assert.equal(context.run.messages[1].agentRole,'conversation');assert.equal(calls.length,0);
 context.rpc=runtime.rpcFactory();await runtime.execute(context);
 assert.match(calls.find(c=>c.method==='thread/start').args.developerInstructions,/native subagent delegation/);
 runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'turn',item:{type:'collabAgentToolCall',tool:'spawnAgent',status:'completed',receiverThreadIds:['child'],agentsStates:{child:{status:'running'}}}}});
 assert.equal(context.run.tools[0].nativeThreadId,'child');
});

test('ordinary conversation completes without opening an execution process or claiming file changes',async()=>{
 const f=fixture(async()=>({action:'reply',reply:'你好。'}));f.context.rpc=null;
 const proceed=await f.runtime.conversation.prepare(f.context);
 assert.equal(proceed,false);assert.equal(f.run.status,'completed');assert.equal(f.run.messages.at(-1).phase,'final_answer');assert.equal(f.run.fileChanges,undefined);
});

test('out-of-order updates cannot overtake an earlier undelivered version',async()=>{
 const f=fixture(async()=>({action:'execute',reply:'Received'}));
 const rpc=f.context.rpc;f.context.rpc=null;
 await assert.rejects(f.runtime.deliverFormInput(input('first','first'),dispatch),{code:'BUSY'});
 f.context.rpc=rpc;
 await assert.rejects(f.runtime.deliverFormInput(input('second','second'),dispatch),{code:'BUSY'});
 await f.runtime.deliverFormInput(input('first','first'),dispatch);
 await f.runtime.deliverFormInput(input('second','second'),dispatch);
 assert.deepEqual(f.calls.map(c=>c.args.clientUserMessageId),['first','second']);
});
