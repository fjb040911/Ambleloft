const {test}=require('node:test'),assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
function fixture(){const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};const sent=[];const context={turnKey:'user',config:{apiKey:'secret'},run:{threadId:'parent',turnId:'turn',tools:[],messages:[],approvals:[],questions:[]},rpc:{call:async()=>({thread:{agentNickname:'Kepler'}}),send:m=>sent.push(m)}};runtime.contexts.set('context',context);return {runtime,context,sent};}
function spawn(runtime,context){runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'turn',item:{type:'collabAgentToolCall',tool:'spawnAgent',status:'completed',receiverThreadIds:['child'],prompt:'Review',agentsStates:{child:{status:'pendingInit'}}}}});}
test('native child events are separate from parent messages and keep actual identity',async()=>{
 const {runtime,context}=fixture();spawn(runtime,context);await Promise.resolve();
 runtime.notification(context,{method:'turn/started',params:{threadId:'child',turn:{id:'child-turn'}}});
 runtime.notification(context,{method:'item/agentMessage/delta',params:{threadId:'child',turnId:'child-turn',itemId:'message',delta:'evidence secret'}});
 runtime.notification(context,{method:'turn/completed',params:{threadId:'child',turn:{id:'child-turn',status:'completed'}}});
 assert.equal(context.run.messages.length,0);assert.equal(context.run.tools[0].analysisAgent.name,'Kepler');assert.equal(context.run.tools[0].detail,'evidence [REDACTED]');assert.equal(context.run.tools[0].status,'completed');assert.ok(!context.done);
});
test('native child approval and question route through parent UI with source identity',async()=>{
 const {runtime,context,sent}=fixture();spawn(runtime,context);await Promise.resolve();
 runtime.notification(context,{method:'turn/started',params:{threadId:'child',turn:{id:'child-turn'}}});
 runtime.request(context,{id:10,method:'item/commandExecution/requestApproval',params:{threadId:'child',turnId:'child-turn',command:'test'}});
 assert.equal(context.run.approvals.length,1);assert.match(context.run.approvals[0].detail,/Kepler/);runtime.approve({runId:undefined,approvalId:'10',decision:'decline'});assert.deepEqual(sent.at(-1),{id:10,result:{decision:'decline'}});
 runtime.request(context,{id:11,method:'item/tool/requestUserInput',params:{threadId:'child',turnId:'child-turn',questions:[{id:'a',question:'Choose'}]}});
 assert.match(context.run.questions[0].questions[0].question,/Kepler/);
 runtime.notification(context,{method:'serverRequest/resolved',params:{threadId:'child',requestId:11}});assert.equal(context.run.questions.length,0);
 runtime.request(context,{id:12,method:'item/commandExecution/requestApproval',params:{threadId:'stranger'}});assert.equal(sent.at(-1).error.message,'Stale thread');
});
test('native stop archives the actual child; parent finish and restart never replay it',async()=>{
 const {runtime,context}=fixture();spawn(runtime,context);await Promise.resolve();let call;
 context.rpc.call=async(...args)=>{call=args;};await runtime.native.stop(context.run.tools[0].id);assert.deepEqual(call,['thread/archive',{threadId:'child'}]);assert.equal(context.run.tools[0].status,'interrupted');
 context.run.tools[0].status='running';runtime.native.finish(context);assert.equal(context.run.tools[0].status,'interrupted');assert.equal(context.nativeThreads.size,0);
 const history={tools:[{type:'analysis',status:'running',nativeThreadId:'child'}]};runtime.native.recover(history);assert.equal(history.tools[0].status,'interrupted');
});
test('stale parent and child turn events cannot overwrite current state',()=>{
 const {runtime,context}=fixture();spawn(runtime,context);runtime.notification(context,{method:'turn/started',params:{threadId:'child',turn:{id:'current'}}});
 runtime.notification(context,{method:'turn/completed',params:{threadId:'child',turn:{id:'old',status:'completed'}}});assert.equal(context.run.tools[0].status,'running');
 runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'old',item:{type:'collabAgentToolCall',receiverThreadIds:['bad']}}});assert.equal(context.run.tools.length,1);
});
test('unknown failed lookup targets never become agents and followups preserve assignment',async()=>{
 const {runtime,context}=fixture();spawn(runtime,context);await Promise.resolve();
 for(const tool of ['wait','sendInput','resumeAgent'])runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'turn',item:{type:'collabAgentToolCall',tool,status:'completed',receiverThreadIds:['mistyped','child'],prompt:'Are you online?',agentsStates:{mistyped:{status:'notFound'},child:{status:'running'}}}}});
 assert.equal(context.run.tools.length,1);assert.equal(context.run.tools[0].analysisTask,'Review');assert.equal(context.run.tools[0].analysisAgent.name,'Kepler');
});
test('metadata lookup retries transient failure and surfaces exhausted lookup errors',async()=>{
 const {runtime,context}=fixture();let calls=0;
 context.rpc.call=async()=>{if(++calls===1)throw Error('not materialized');return {thread:{agentNickname:'Noether'}};};
 spawn(runtime,context);await new Promise(resolve=>setTimeout(resolve,550));
 assert.equal(calls,2);assert.equal(context.run.tools[0].analysisAgent.name,'Noether');assert.equal(context.run.tools[0].nativeIdentityError,undefined);
 const f=fixture();let failures=0;f.context.rpc.call=async()=>{failures++;throw Error('secret unavailable');};spawn(f.runtime,f.context);
 await new Promise(resolve=>setTimeout(resolve,1600));assert.equal(failures,3);assert.match(f.context.run.tools[0].nativeIdentityError,/\[REDACTED\] unavailable/);
});
test('identity arriving after finish still names the persisted row',async()=>{
 const {runtime,context}=fixture();let resolve;context.rpc.call=()=>new Promise(r=>resolve=r);spawn(runtime,context);
 context.done=true;runtime.native.finish(context);resolve({thread:{agentNickname:'Tesla'}});await Promise.resolve();
 assert.equal(context.run.tools[0].analysisAgent.name,'Tesla');assert.equal(context.nativeThreads.size,0);
});
test('child output establishes running state and late initialization cannot regress it',()=>{
 const {runtime,context}=fixture();spawn(runtime,context);
 runtime.notification(context,{method:'item/agentMessage/delta',params:{threadId:'child',itemId:'m',delta:'Working'}});
 assert.equal(context.run.tools[0].status,'running');spawn(runtime,context);
 assert.equal(context.run.tools[0].status,'running');
});

test('functional title and streaming tool details retain lifecycle and original identity',async()=>{
 const {runtime,context}=fixture();
 runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'turn',item:{type:'collabAgentToolCall',tool:'spawnAgent',status:'completed',receiverThreadIds:['child'],prompt:'Task: Composer layout review\nCheck the composer without changing files.',agentsStates:{child:{status:'pendingInit'}}}}});await Promise.resolve();
 const tool=context.run.tools[0];assert.equal(tool.analysisTitle,'Composer layout review');assert.equal(tool.analysisAgent.name,'Kepler');
 const emit=(method,params)=>runtime.notification(context,{method,params:{threadId:'child',turnId:'child-turn',...params}});
 emit('turn/started',{turn:{id:'child-turn'}});
 emit('item/started',{item:{id:'cmd',type:'commandExecution',command:'inspect layout'}});
 emit('item/commandExecution/outputDelta',{itemId:'cmd',delta:'partial secret'});assert.equal(tool.nativeActivity[0].text,'partial [REDACTED]');
 emit('item/completed',{item:{id:'cmd',type:'commandExecution',command:'inspect layout',status:'completed',aggregatedOutput:'verified'}});
 emit('turn/completed',{turn:{id:'child-turn',status:'completed'}});
 assert.deepEqual(tool.nativeLifecycle.map(e=>e.status),['pending','running','completed']);assert.equal(tool.nativeActivity[0].text,'verified');assert.equal(tool.nativeActivity[0].status,'completed');
 runtime.notification(context,{method:'item/completed',params:{threadId:'parent',turnId:'turn',item:{type:'collabAgentToolCall',tool:'wait',receiverThreadIds:['child'],agentsStates:{child:{status:'running'}}}}});assert.equal(tool.status,'completed');
});
