const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {createProviderStore}=require('../electron/provider.cjs');
test('runtime carries the frozen employee and space references on new and resumed model requests without changing permissions',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-role-runtime-'));let runtime;
 try{
  const provider=createProviderStore(directory,{});const config=await provider.save({create:true,name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'test',executable:process.execPath});
  const calls=[];let current={id:'employee',revision:1,name:'Reviewer',domain:'Software',responsibilities:'Review evidence',methods:'Read first',deliverables:'Report',skills:[{id:'skill',name:'check-sources',description:'Check sources',version:1,path:'/fixture/SKILL.md',body:'Require evidence for conclusions.'}]};
  runtime=new AgentRuntime({directory,provider,workspace:{read:async()=>({projects:[],tasks:[]})},publish(){},rpcFactory:()=>({close(){},send(){},call:async(method,params)=>{calls.push({method,params});if(method==='thread/start'||method==='thread/resume')return {thread:{id:'thread'}};if(method==='turn/start')return {turn:{id:'turn'}};return {};}})});await runtime.init();runtime.drain=()=>{};
  runtime.workforce={prepare:async(id,previous)=>previous||structuredClone(current)};
  const collaboration={requestId:'r1',spaceId:'s1',spaceName:'Space',mode:'discussion',documents:[{title:'Contract',revision:1,body:'Pinned reference'}]};
  const run=await runtime.start({prompt:'Review',employeeId:'employee',providerId:config.id},{collaboration});
  assert.equal(run.title,'Reviewer · Review');
  runtime.active.rpc=runtime.rpcFactory();await runtime.execute(runtime.active);
  let call=calls.find(c=>c.method==='thread/start');assert.match(call.params.developerInstructions,/Require evidence/);assert.match(call.params.developerInstructions,/Pinned reference/);assert.match(call.params.developerInstructions,/WHEN relevant/);assert.equal(call.params.approvalPolicy,'on-request');assert.equal(call.params.sandbox,'read-only');
  await runtime.finish(runtime.active,'completed');current={...current,revision:2,name:'Changed',methods:'Changed method'};calls.length=0;
  await runtime.start({runId:run.id,prompt:'Continue'});runtime.active.rpc=runtime.rpcFactory();await runtime.execute(runtime.active);
  call=calls.find(c=>c.method==='thread/resume');assert.match(call.params.developerInstructions,/Reviewer/);assert.doesNotMatch(call.params.developerInstructions,/Changed method/);assert.match(call.params.developerInstructions,/Pinned reference/);await runtime.finish(runtime.active,'completed');
  await assert.rejects(runtime.start({runId:run.id,prompt:'Other',employeeId:'different'}),/新建任务/);
 }finally{await runtime?.shutdown();await fs.rm(directory,{recursive:true,force:true});}
});
test('collaboration reserves its project during skill preparation against ordinary task starts',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-role-lock-'));let runtime,release;
 try{
  const provider=createProviderStore(directory,{});
  const config=await provider.save({create:true,name:'Fixture',baseUrl:'https://fixture.invalid/v1',model:'test',executable:process.execPath});
  runtime=new AgentRuntime({directory,provider,workspace:{read:async()=>({projects:[{id:'p1',path:directory}],tasks:[]})},publish(){}});
  await runtime.init();runtime.drain=()=>{};
  let entered;const preparing=new Promise(resolve=>{entered=resolve;});
  runtime.workforce={prepare:async()=>{entered();await new Promise(resolve=>{release=resolve;});return null;}};
  const work=runtime.start({prompt:'Implement',projectId:'p1',providerId:config.id},{collaboration:{mode:'work'}});
  await preparing;
  await assert.rejects(runtime.start({prompt:'Ordinary',projectId:'p1',providerId:config.id}),/已有活跃任务/);
  release();await work;await runtime.finish(runtime.active,'completed');
  runtime.workforce={prepare:async()=>null};
  await runtime.start({prompt:'Ordinary',projectId:'p1',providerId:config.id});
  await assert.rejects(runtime.start({prompt:'Implement',projectId:'p1',providerId:config.id},{collaboration:{mode:'work'}}),/已有活跃任务/);
  await runtime.finish(runtime.active,'completed');
 }finally{release?.();await runtime?.shutdown();await fs.rm(directory,{recursive:true,force:true});}
});

test('space tools use the scoped host channel and do not inherit generic MCP permission prompts',()=>{
 const {configurationArgs}=require('../electron/codex-rpc.cjs');
 const args=configurationArgs({baseUrl:'http://127.0.0.1:1234/v1',model:'test'},'/tmp/isolated',{url:'http://127.0.0.1:1235/mcp',tool_timeout_sec:30});
 for(const name of ['space_list_documents','space_read_document','space_search_knowledge','space_propose_document'])assert.ok(args.includes('mcp_servers.amble_extensions.tools.'+name+'.approval_mode="approve"'));
 assert.ok(!args.some(s=>s.startsWith('mcp_servers.amble_extensions.approval_mode=')));
});

test('experts resolve separate models, inherit defaults, preserve resumed model and reject removed preferences',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-expert-model-'));let runtime;
 try{
  const provider=createProviderStore(directory,{});
  const a=await provider.save({create:true,name:'A',baseUrl:'https://a.invalid/v1',model:'model-a',executable:process.execPath});
  const b=await provider.save({create:true,name:'B',baseUrl:'https://b.invalid/v1',model:'model-b',executable:process.execPath});
  let profile={id:'expert',revision:1,name:'Expert',skills:[],responsibilities:'Review',methods:'',deliverables:'',modelChoice:{providerId:b.id,model:b.model}};
  runtime=new AgentRuntime({directory,provider,workspace:{read:async()=>({projects:[],tasks:[]})},publish(){}});await runtime.init();runtime.drain=()=>{};
  runtime.workforce={prepare:async(id,previous)=>previous||structuredClone(profile)};
  const start=async(input,context={})=>{const run=await runtime.start({prompt:'Review',employeeId:'expert',...input},context);await runtime.finish(runtime.active,'completed');return run;};
  const first=await start({});assert.equal(first.providerId,b.id);assert.equal(first.model,'model-b');
  const explicit=await start({providerId:a.id,model:a.model});assert.equal(explicit.providerId,a.id);
  const space=await start({providerId:a.id,model:a.model},{collaboration:{mode:'discussion',spaceId:'s'}});assert.equal(space.providerId,b.id);
  profile={...profile,modelChoice:undefined};
  const defaultRun=await start({});assert.equal(defaultRun.providerId,a.id);
  await provider.setDefault(b.id);assert.equal((await start({})).providerId,b.id);
  const resumed=await start({runId:explicit.id});assert.equal(resumed.providerId,a.id);
  const switched=await start({runId:explicit.id,providerId:b.id,model:b.model,confirmProviderChange:true});assert.equal(switched.providerId,b.id);
  profile={...profile,modelChoice:{providerId:'removed',model:'missing'}};
  await assert.rejects(start({}),/模型服务/);
  profile={...profile,modelChoice:{providerId:b.id,model:'removed'}};
  await assert.rejects(start({}),/移除/);
 }finally{await runtime?.shutdown();await fs.rm(directory,{recursive:true,force:true});}
});
