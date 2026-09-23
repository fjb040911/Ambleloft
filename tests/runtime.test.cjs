const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AgentRuntime } = require('../electron/agent-runtime.cjs');

test('approvals require the live request and are consumed exactly once', () => {
  const sent = [];
  const runtime = new AgentRuntime({ directory: '/unused', publish() {} });
  runtime.changed = () => {};
  const context = { run: { id: 'run', approvals: [] }, config: { apiKey: 'secret' }, rpc: { send: value => sent.push(value) } };
  runtime.contexts.set('test',context);
  runtime.request(context, { id: 42, method: 'item/commandExecution/requestApproval', params: { command: 'echo secret' } });
  assert.equal(context.run.status, 'waiting');
  assert.ok(!context.run.approvals[0].detail.includes('secret'));
  assert.throws(() => runtime.approve({ runId: 'other', approvalId: '42', decision: 'accept' }));
  assert.equal(sent.length, 0);
  runtime.approve({ runId: 'run', approvalId: '42', decision: 'decline' });
  assert.deepEqual(sent, [{ id: 42, result: { decision: 'decline' } }]);
  assert.equal(context.run.status, 'running');
  assert.throws(() => runtime.approve({ runId: 'run', approvalId: '42', decision: 'accept' }));
});

test('corrupt history is preserved on shutdown; unfinished history is interrupted', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-history-'));
  const file = path.join(directory, 'conversations.json');
  try {
    await fs.writeFile(file, '{broken');
    const broken = new AgentRuntime({ directory, publish() {} });
    await assert.rejects(broken.init()); await broken.shutdown();
    assert.equal(await fs.readFile(file, 'utf8'), '{broken');
    await fs.writeFile(file, JSON.stringify([{ id: 'prior', status: 'waiting', approvals: [{ id: 'old' }] }]));
    const restored = new AgentRuntime({ directory, publish() {} });
    await restored.init();
    assert.equal(restored.list()[0].status, 'interrupted');
    assert.deepEqual(restored.list()[0].approvals, []);
    await restored.shutdown();
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('reasoning fragments are ordered, completed and preserved alongside answers', () => {
  const runtime = new AgentRuntime({ directory: '/unused', publish() {} }); runtime.changed = () => {};
  const context = { run: { messages: [], tools: [] }, config: { apiKey: 'secret' } };
  const event = (method, params) => runtime.notification(context, { method, params });
  event('item/reasoning/summaryTextDelta', { itemId: 'r', summaryIndex: 1, delta: 'Second' });
  event('item/reasoning/summaryTextDelta', { itemId: 'r', summaryIndex: 0, delta: 'First secret' });
  event('item/completed', { item: { id: 'r', type: 'reasoning', summary: ['First secret', 'Second'], content: [] } });
  event('item/agentMessage/delta', { itemId: 'a', delta: '# Answer' });
  assert.equal(context.run.messages.length, 2);
  assert.equal(context.run.messages[0].text, 'First [REDACTED]\n\nSecond');
  assert.equal(context.run.messages[0].status, 'completed');
  assert.equal(context.run.messages[1].text, '# Answer');
});

test('each turn freezes its own elapsed time and repeated finish cannot change it', async () => {
  const runtime = new AgentRuntime({directory:'/unused',publish(){}}); runtime.changed=()=>{};runtime.persist=async()=>{};
  const first={startedAt:new Date().toISOString()};const second={startedAt:new Date().toISOString()};
  const run={messages:[{role:'user',timing:first},{role:'assistant',text:'done'},{role:'user',timing:second}],approvals:[]};
  const a={run,timing:first,startedTick:performance.now()-65000};
  await runtime.finish(a,'completed');
  assert.ok(first.durationMs>=65000 && first.durationMs<66000);assert.equal(first.outcome,'completed');
  const frozen=first.durationMs;
  await runtime.finish(a,'interrupted');assert.equal(first.durationMs,frozen);assert.equal(first.outcome,'completed');
  const b={run,timing:second,startedTick:performance.now()-5000};
  await runtime.finish(b,'interrupted');assert.ok(second.durationMs>=5000 && second.durationMs<6000);assert.equal(first.durationMs,frozen);
});

test('restart never includes offline time in an unfinished turn duration',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-timing-'));
 try {
  await fs.writeFile(path.join(directory,'conversations.json'),JSON.stringify([{id:'interrupted',status:'running',messages:[{role:'user',timing:{startedAt:'2000-01-01T00:00:00Z'}}]}]));
  const runtime=new AgentRuntime({directory,publish(){}});await runtime.init();
  const timing=runtime.list()[0].messages[0].timing;
  assert.equal(timing.outcome,'interrupted');assert.equal(timing.durationMs,undefined);await runtime.shutdown();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('progress phases and tool deltas keep their turn and chronological order',()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const context={turnKey:'user-2',run:{messages:[],tools:[]},config:{apiKey:'secret'}};
 const event=(method,params)=>runtime.notification(context,{method,params});
 event('item/started',{item:{id:'p',type:'agentMessage',phase:'commentary',text:''}});
 event('item/agentMessage/delta',{itemId:'p',delta:'Preparing'});
 event('item/completed',{item:{id:'p',type:'agentMessage',text:'Preparing'}});
 event('item/started',{item:{id:'t',type:'commandExecution',command:'uv install',status:'inProgress'}});
 event('item/commandExecution/outputDelta',{itemId:'t',delta:'Downloading secret'});
 event('item/completed',{item:{id:'t',type:'commandExecution',command:'uv install',status:'completed'}});
 event('item/started',{item:{id:'f',type:'agentMessage',phase:'final_answer',text:''}});
 event('item/agentMessage/delta',{itemId:'f',delta:'Done'});
 assert.equal(context.run.messages[0].phase,'commentary');
 assert.equal(context.run.messages[1].phase,'final_answer');
 assert.equal(context.run.messages[1].text,'Done');
 assert.equal(context.run.tools[0].turnKey,'user-2');
 assert.equal(context.run.tools[0].detail,'Downloading [REDACTED]');
 assert.ok(context.run.messages[0].order<context.run.tools[0].order);
 assert.ok(context.run.tools[0].order<context.run.messages[1].order);
});

test('task metadata edits persist, validate projects and protect active work',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-edit-'));
 try {
  const runtime=new AgentRuntime({directory,workspace:{read:async()=>({projects:[{id:'p'}]})},publish(){}});await runtime.init();
  runtime.runs=[{id:'r',title:'Original',projectId:null,messages:[],status:'completed'}];
  await runtime.edit({id:'r',title:'Renamed',projectId:'p'});
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'conversations.json')))[0].projectId,'p');
  await assert.rejects(runtime.edit({id:'r',projectId:'missing'}));assert.equal(runtime.runs[0].title,'Renamed');
  runtime.contexts.set('test',{});await assert.rejects(runtime.edit({id:'r',remove:true}));assert.equal(runtime.runs.length,1);runtime.contexts.clear();
  await runtime.edit({id:'r',projectId:null});await runtime.edit({id:'r',archived:true});await runtime.edit({id:'r',remove:true});assert.deepEqual(runtime.list(),[]);
  const restored=new AgentRuntime({directory,publish(){}});await restored.init();assert.deepEqual(restored.list(),[]);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('archived conversations reject execution and restore to Chats when project is gone',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-archive-'));
 try{
  const runtime=new AgentRuntime({directory,workspace:{read:async()=>({projects:[]})},provider:{secret:async()=>{throw new Error('must not request credentials');}},publish(){}});await runtime.init();
  runtime.runs=[{id:'r',projectId:'deleted',title:'Example',status:'completed',messages:[]}];
  await assert.rejects(runtime.edit({id:'r',remove:true}),/归档/);await runtime.edit({id:'r',archived:true});
  await assert.rejects(runtime.start({runId:'r',prompt:'continue'}),/还原/);
  await runtime.edit({id:'r',archived:false});assert.equal(runtime.runs[0].projectId,null);assert.equal(runtime.runs[0].archivedAt,null);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('resumed conversations keep their service and model when defaults change',async()=>{
 const {createProviderStore}=require('../electron/provider.cjs');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-binding-'));
 try{
  const provider=createProviderStore(directory,{});
  const first=await provider.save({create:true,name:'First',baseUrl:'https://first.example/v1',model:'a',models:['a','b'],executable:process.execPath});
  const second=await provider.save({create:true,name:'Second',baseUrl:'https://second.example/v1',model:'c',executable:process.execPath});
  const runtime=new AgentRuntime({directory,provider,workspace:{read:async()=>({projects:[]})},publish(){},rpcFactory:()=>({close(){}})});await runtime.init();runtime.execute=async()=>{};
  const run=await runtime.start({prompt:'first',providerId:first.id,model:'b'});await runtime.finish(runtime.active,'completed');
  await provider.setDefault(second.id);
  const resumed=await runtime.start({prompt:'continue',runId:run.id});
  assert.ok(run.modelSessionId);assert.equal(resumed.modelSessionId,run.modelSessionId);assert.equal(resumed.providerId,first.id);assert.equal(resumed.model,'b');assert.equal(resumed.baseUrl,first.baseUrl);await runtime.finish(runtime.active,'completed');
  await assert.rejects(runtime.start({prompt:'switch',runId:run.id,providerId:second.id,model:'c'}),/确认/);
  const switched=await runtime.start({prompt:'switch',runId:run.id,providerId:second.id,model:'c',confirmProviderChange:true,permission:'full'});assert.equal(switched.model,'c');assert.equal(switched.permission,'full');await runtime.finish(runtime.active,'completed');
  const fresh=await runtime.start({prompt:'new'});assert.notEqual(fresh.modelSessionId,run.modelSessionId);assert.equal(fresh.providerId,second.id);await runtime.finish(runtime.active,'completed');
  await runtime.shutdown();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('plan snapshots and web activity remain associated with the correct turn',()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const context={turnKey:'u',run:{messages:[],tools:[]},config:{apiKey:'secret'}};
 runtime.notification(context,{method:'turn/plan/updated',params:{plan:[{step:'Research secret',status:'inProgress'},{step:'Write report',status:'pending'}]}});
 runtime.notification(context,{method:'turn/plan/updated',params:{plan:[{step:'Research',status:'completed'},{step:'Write report',status:'inProgress'}]}});
 assert.equal(context.run.plans.length,1);assert.equal(context.run.plans[0].turnKey,'u');assert.equal(context.run.plans[0].steps[0].status,'completed');
 runtime.notification(context,{method:'item/started',params:{item:{type:'webSearch',id:'web',query:'Agent knowledge base'}}});
 runtime.notification(context,{method:'item/completed',params:{item:{type:'webSearch',id:'web',query:'Agent knowledge base',action:{type:'search',query:'Agent knowledge base'}}}});
 assert.equal(context.run.tools.length,1);assert.equal(context.run.tools[0].turnKey,'u');assert.equal(context.run.tools[0].status,'completed');assert.match(context.run.tools[0].detail,/knowledge base/);
});

test('user questions are separate from approvals, validate answers and reject duplicate submissions',()=>{
 const sent=[];const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const context={turnKey:'u',run:{id:'r',messages:[],tools:[],approvals:[{id:'a'}]},config:{apiKey:'secret'},rpc:{send:m=>sent.push(m)}};runtime.contexts.set('test',context);
 runtime.request(context,{id:8,method:'item/tool/requestUserInput',params:{isBlocking:true,questions:[{id:'audience',header:'受众',question:'面向谁？',options:[{label:'设计师',description:'设计工作'}]},{id:'private',header:'私密',question:'私密输入',isSecret:true}]}});
 assert.equal(context.run.status,'waiting');assert.equal(context.run.questions.length,1);
 assert.throws(()=>runtime.answer({runId:'r',requestId:'8',answers:{audience:'设计师'}}),/每个问题/);
 runtime.answer({runId:'r',requestId:'8',answers:{audience:'设计师',private:'private-value'}});
 assert.equal(sent[0].result.answers.audience.answers[0],'设计师');assert.equal(sent[0].result.answers.private.answers[0],'private-value');
 assert.equal(context.run.status,'waiting');assert.equal(context.run.questions.length,0);assert.ok(!JSON.stringify(context.run).includes('private-value'));
 assert.throws(()=>runtime.answer({runId:'r',requestId:'8',answers:{}}),/失效/);
});
test('retry notifications and MCP progress follow actual events and ignore stale turns',()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const context={run:{turnId:'turn',messages:[],tools:[{id:'tool'}]},config:{apiKey:'secret'}};
 runtime.notification(context,{method:'error',params:{turnId:'turn',error:{message:'connection'},willRetry:true}});
 assert.equal(context.run.retrying,true);
 runtime.notification(context,{method:'item/mcpToolCall/progress',params:{turnId:'old',itemId:'tool',message:'wrong'}});assert.equal(context.run.tools[0].progress,undefined);
 runtime.notification(context,{method:'item/mcpToolCall/progress',params:{turnId:'turn',itemId:'tool',message:'已处理 8 个文件'}});
 assert.equal(context.run.tools[0].progress,'已处理 8 个文件');
 runtime.notification(context,{method:'item/agentMessage/delta',params:{turnId:'turn',itemId:'m',delta:'恢复'}});assert.equal(context.run.retrying,false);assert.equal(context.run.error,'');
});

test('HTTP failure shows actionable sanitized upstream reason and request ID',async()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};runtime.persist=async()=>{};
 const context={run:{},lastModelDiagnostic:{failed:true,httpStatus:400,reason:'模型服务返回 HTTP 400：图片请求不受支持或格式无效',requestId:'request-123'}};
 await runtime.finish(context,'failed','unexpected status 400');
 assert.match(context.run.error,/图片请求/);assert.match(context.run.error,/request-123/);
});
