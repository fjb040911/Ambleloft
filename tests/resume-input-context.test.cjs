const {test}=require('node:test');const assert=require('node:assert/strict');
const {resumeInputContext}=require('../electron/resume-input-context.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
test('resume includes unanswered question labels without drafts or answers fabricated from continue',async()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 runtime.inputRequests={list:async()=>[{id:'p',state:'pending',draft:{secret:'UNSUBMITTED_DRAFT'},template:{title:'配置',steps:[{fields:[{label:'运行环境'}]}]}}]};
 const run={id:'r',threadId:'thread',messages:[{id:'old',role:'assistant',inputRecord:{state:'pending',questions:[{id:'q',label:'脚本具体需要完成什么？'}]}},{id:'new',role:'user',text:'继续'}],cwd:'/tmp',permission:'default'};
 const calls=[];const rpc={send(){},async call(method,params){calls.push({method,params});return method==='turn/start'?{turn:{id:'turn'}}:{thread:{id:'thread'}};}};
 await runtime.execute({rpc,run,turnKey:'new',config:{model:'fixture'}});
 const context=calls.find(c=>c.method==='thread/resume').params.developerInstructions;
 assert.match(context,/脚本具体需要完成什么/);assert.match(context,/运行环境/);assert.doesNotMatch(context,/UNSUBMITTED_DRAFT/);
 assert.match(context,/Old native RPC questions are expired/);
 assert.equal(calls.find(c=>c.method==='turn/start').params.input[0].text,'继续');
});
test('answered most recent native question does not resurrect older pending records',async()=>{
 assert.equal(await resumeInputContext({messages:[{inputRecord:{state:'pending',questions:[{label:'old'}]}},{inputRecord:{state:'answered',questions:[{label:'new',answer:'yes'}]}}]}),'');
});
test('substantive delivered follow-up retires reminder without changing the expired record',async()=>{
 const {interruptedQuestion}=await import('../core/inputs/interrupted-question.mjs');
 const question={role:'assistant',inputRecord:{state:'pending',questions:[{label:'脚本用途'}]}};
 const answer={id:'answer',role:'user',text:'监控 vllm 的运行状态',inputDeliveryState:'queued'};
 const messages=[question,answer];
 assert.equal(interruptedQuestion(messages),question);
 assert.equal(await resumeInputContext({messages},[],'answer'),'');
 answer.inputDeliveryState='delivered';
 assert.equal(interruptedQuestion(messages),undefined);
 assert.equal(await resumeInputContext({messages}),'');
 assert.equal(question.inputRecord.state,'pending');
 messages.push({role:'user',text:'继续'});
 assert.equal(interruptedQuestion(messages),undefined);
 messages.push({...question});
 assert.equal(interruptedQuestion(messages),messages.at(-1));
});
