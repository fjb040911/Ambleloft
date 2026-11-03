// Opt-in integration probe: real host services + real Codex engine + an existing
// encrypted DeepSeek provider. Run with Electron, not plain Node. The regular
// application profile is read-only; provider credentials stay in memory.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {createSkills}=require('../../electron/skills.cjs');
const {createProviderStore}=require('../../electron/provider.cjs');
const {createStore}=require('../../electron/store.cjs');
const {CatalogStore,loadSources}=require('../../core/catalog-store/service.cjs');
const {WorkforceService}=require('../../core/workforce/service.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const {AgentRuntime}=require('../../electron/agent-runtime.cjs');
const {CodexRPC}=require('../../electron/codex-rpc.cjs');
const [directory,sourceConfig,projectRoot]=process.argv.slice(2);
if(!directory||!sourceConfig||!projectRoot)throw Error('Usage: electron workforce-discussion.cjs ISOLATED_PROFILE TRUSTED_SOURCE AI_CODING_ROOT');
app.setName('Ambleloft');app.setPath('userData',path.resolve(directory));
app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');
app.on('window-all-closed',()=>{});
let database,catalog,workforce,runtime,spaces;
const sha=text=>createHash('sha256').update(text).digest('hex');
const emit=value=>console.log(JSON.stringify({at:new Date().toISOString(),...value}));
const save=async(name,value)=>fs.writeFile(path.join(directory,name),JSON.stringify(value,null,2),{mode:0o600});
async function close(){await spaces?.shutdown();await runtime?.shutdown();await workforce?.shutdown();await catalog?.shutdown();await database?.close();}
app.whenReady().then(async()=>{
 await fs.mkdir(directory,{recursive:true});
 const providerFile=path.join(app.getPath('appData'),'Atelier/atelier.sqlite');
 const all=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",providerFile],{encoding:'utf8'}));
 const chosen=all.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');
 if(!chosen||!safeStorage.isEncryptionAvailable())throw Error('Configured DeepSeek provider unavailable');
 const provider=createProviderStore(directory,safeStorage,{call:async(method,args)=>{
  assert.equal(method,'readSetting');assert.equal(args.key,'providers');
  return {version:2,defaultId:chosen.id,providers:[{...chosen,webSearch:'disabled'}]};
 }});
 database=new Database(directory);await database.call('ready');
 const workspace=createStore(directory,database),skills=createSkills(directory,database);
 catalog=new CatalogStore({directory,database,skills,extensions:{items:[]},sources:await loadSources(sourceConfig)});await catalog.initialize();
 workforce=new WorkforceService({directory,database,skills,catalog});await workforce.initialize();
 const seen=new Map();let instructions=[];try{instructions=JSON.parse(await fs.readFile(path.join(directory,'instruction-evidence.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 runtime=new AgentRuntime({directory,database,workspace,skills,provider,publish:run=>{
  const marker=JSON.stringify([run.status,run.queued,run.error,run.tools.length]);
  if(seen.get(run.id)!==marker){seen.set(run.id,marker);emit({role:run.employee?.name,runId:run.id,status:run.status,queued:run.queued,error:run.error,tools:run.tools.length});}
 },rpcFactory:options=>{
  const rpc=new CodexRPC(options),call=rpc.call.bind(rpc);
  rpc.call=async(method,params)=>{
   if(method==='thread/start'||method==='thread/resume'){
    instructions.push({method,sha256:sha(params.developerInstructions),visibleSkillNames:['amble-project-context','amble-product','amble-architecture'].filter(name=>params.developerInstructions.includes(name)),sandbox:params.sandbox,approvalPolicy:params.approvalPolicy});
    await save('instruction-evidence.json',instructions);
   }
   return call(method,params);
  };return rpc;
 }});
 runtime.workforce=workforce;await runtime.init();
 spaces=new SpaceService({directory,database,workspace,workforce,runtime});await spaces.initialize();
 let setup;try{setup=JSON.parse(await fs.readFile(path.join(directory,'setup.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!setup){
  const roles=await workforce.roles({refresh:true});if(roles.error)throw Error(roles.error);
  const employees=[];
  for(const id of ['amble.product','amble.architecture']){
   const role=roles.items.find(r=>r.id===id);assert.ok(role);
   const employee=await workforce.save({value:{...role.zh,domain:'AI Coding 多模块推理平台',skills:role.skills}});
   await workforce.activate({id:employee.id,expectedRevision:employee.revision});employees.push(employee);
  }
  const projects=[{id:randomUUID(),name:'AI Coding 设计资料',path:projectRoot,createdAt:new Date().toISOString()},{id:randomUUID(),name:'model-router',path:path.join(projectRoot,'model-router'),createdAt:new Date().toISOString()}];
  await workspace.write({...(await workspace.read()),projects,language:'zh-CN',layoutMode:'activity'});
  const space=await spaces.save({value:{name:'AI Coding · Gateway / Router 边界验证',purpose:'依据设计与现状区分入口协议和模型调度职责，形成可追溯的建议；本次不修改 AI Coding 代码。',projectIds:projects.map(p=>p.id),members:employees.map(e=>({employeeId:e.id,assignment:e.name==='产品经理'?'定义用户价值、范围和验收标准':'定义契约、执行责任和失败恢复，审查现状与目标差异',projectIds:projects.map(p=>p.id)}))}});
  const sources=[
   {title:'总体设计摘录',file:'docs/ai-coding-platform-high-level-design.md',ranges:[[114,120],[205,222],[246,266],[575,584],[600,615]]},
   {title:'模块交付摘录',file:'docs/ai-coding-modular-delivery-solution.md',ranges:[[133,138],[157,165]]},
   {title:'Router 当前实现说明摘录',file:'model-router/README.md',ranges:[[1,5],[126,128],[168,170],[172,189]]}
  ],documents=[];
  for(const source of sources){
   const text=await fs.readFile(path.join(projectRoot,source.file),'utf8'),lines=text.split('\n');
   const body=`来源：${source.file}\n原文件 SHA-256：${sha(text)}\n核验日期：${new Date().toISOString()}\n以下仅为模块职责与接口约定摘录。README 描述不等同于代码已验收。\n\n`+source.ranges.map(([a,b])=>`### L${a}–L${b}\n`+lines.slice(a-1,b).map((line,i)=>`L${a+i}: ${line}`).join('\n')).join('\n\n');
   documents.push(await spaces.saveDocument({spaceId:space.id,title:source.title,body,adopted:true}));
  }
  setup={spaceId:space.id,employeeIds:employees.map(e=>e.id),documentIds:documents.map(d=>d.id),rounds:[randomUUID(),randomUUID()],model:chosen.model};await save('setup.json',setup);
 }
 if(!setup.rounds[2]){setup.rounds[2]=randomUUID();await save('setup.json',setup);}
 const checkTitle='交叉审阅校正';
 let correction=(await spaces.snapshot()).documents.find(d=>d.title===checkTitle);
 if(!correction)correction=await spaces.saveDocument({spaceId:setup.spaceId,title:checkTitle,adopted:false,body:'审阅问题（并非已采纳设计）：1. README L170 明确说明 Responses 转换，不支持“静默转换”是缺陷的判断；高层摘录未列 Responses 不能推出应删除现有功能。2. L187 的 InFlight 生命周期不证明只有 Router 能获取真实 token，不可据此宣称 Gateway 必然无法计量。3. HLD L584 是 K8S Service 模式；请区分单机/实例代理与 K8S Service 部署，不能一概断言不同拓扑绝对不能并存。4. 第二轮两位角色对终态 usage 的发布者仍有分歧。请明确比较方案，给出推荐但不虚构共识；将生产者、发布者、去重键、取消/崩溃导致的丢失风险分开。5. 对现有文档和代码的修改都尚未执行，不要把建议写成事实。'});
 emit({stage:'ready',model:chosen.model,spaceId:setup.spaceId,profile:directory});
 const base='请用中文讨论 ai-coding 的 model-router 与 api-gateway 职责边界。只使用已提供的最小资料摘录，不调用工具、不扫描磁盘、不写代码。先说明使用了哪些角色技能。引用必须用“文档标题 v版本 + 原文行号”，把资料事实、你的建议和未验证项分开。请注意总体设计与 Router 当前 README 的矛盾，以及当前未提供独立 Gateway 实现的证据。控制在 1000 字左右。';
 let prior=[];
 for(let round=0;round<3;round++){
  const prompt=base+(round===0?'第一轮：按你的角色给出职责边界、争议点、建议取舍和可执行验收条件。特别说明协议适配、鉴权、请求 ID、路由、重试、SSE、usage 各由谁负责；是否需要重写现有 Router。':round===1?'第二轮：阅读第一轮两位角色的已保存结果，明确指出至少一项同意和一项应修正或补充的观点，并引用对方的结果标题和版本。收敛推荐的内部契约、唯一重试/usage 责任方、MVP 验收及后续任务。不要把建议说成已经实施或用户已批准。':'第三轮：阅读第二轮两位角色的结果和“交叉审阅校正”，修正证据不足的断言。给出最终职责建议，指出已经一致和仍需决策的部分。引用对方结果及校正资料版本。特别保留现有 Responses 能力，区分不同部署模式。给出验收任务；不要声称已形成用户批准的决议。');
  const current=await spaces.start({clientRequestId:setup.rounds[round],spaceId:setup.spaceId,prompt,mode:'discussion',employeeIds:setup.employeeIds,documentIds:[...setup.documentIds,...prior,...(round===2?[correction.id]:[])],providerId:chosen.id,model:chosen.model});
  const deadline=Date.now()+360000;
  while(true){
   const snapshot=await spaces.snapshot(),request=snapshot.requests.find(r=>r.id===setup.rounds[round]);
   await save('snapshot.json',snapshot);
   if(request.participants.some(p=>['failed','interrupted'].includes(p.status)))throw Error('Discussion failed: '+request.participants.map(p=>p.error||p.status).join(' / '));
   if(request.participants.every(p=>p.status==='completed'))break;
   if(request.participants.some(p=>p.status==='waiting'))throw Error('Unexpected approval or question; no automatic permission granted');
   if(Date.now()>deadline)throw Error('Discussion timed out');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await runtime.persist();
  const request=(await spaces.snapshot()).requests.find(r=>r.id===setup.rounds[round]);
  const results=[];
  for(const participant of request.participants){
   const run=runtime.runs.find(r=>r.id===participant.runId);assert.equal(run.employee.skills.length,2);assert.equal(run.tools.length,0);
   assert.ok(participant.output.length>400);assert.ok(/总体设计摘录/.test(participant.output));assert.ok(run.modelRequests?.some(r=>r.status==='completed'||r.status==='succeeded'||r.httpStatus===200||r.status===200),JSON.stringify(run.modelRequests));
   const title=`第${round+1}轮 · ${run.employee.name}边界评审`;
   const old=(await spaces.snapshot()).documents.find(d=>d.versions.some(v=>v.sourceRunId===run.id));
   const doc=old||await spaces.saveDocument({spaceId:setup.spaceId,title,body:participant.output,sourceRunId:run.id,adopted:false});
   results.push(doc.id);
   await fs.writeFile(path.join(directory,`round-${round+1}-${run.employee.name}.md`),participant.output);
  }
  prior=results;emit({stage:'round-complete',round:round+1});
 }
 const before=await spaces.snapshot();await save('snapshot.json',before);await save('runs.json',runtime.list());await save('workspace.json',await workspace.read());await save('employees.json',await workforce.snapshot());await runtime.shutdown();
 const restarted=new AgentRuntime({directory,database,provider,workspace,skills,publish(){}});await restarted.init();
 const restored=new SpaceService({directory,database,workspace,workforce,runtime:restarted});await restored.initialize();
 const after=await restored.snapshot();assert.deepEqual(after.requests,before.requests);
 for(const request of after.requests)for(const ref of request.documentRefs){const doc=await restored.document({id:ref.id,revision:ref.revision});assert.equal(doc.hash,ref.hash);}
 assert.equal(after.documents.filter(d=>d.versions.some(v=>v.sourceRunId)).length,6);
 await save('verification.json',{checkedAt:new Date().toISOString(),model:chosen.model,roles:2,rounds:3,realRuns:after.requests.flatMap(r=>r.participants).map(p=>p.runId),signedSkills:(await workforce.snapshot()).globalSkills.map(s=>s.name),savedResults:6,pinnedReferencesRestored:true,restartPreservesResults:true,toolsExecuted:0});
 await restored.shutdown();await restarted.shutdown();emit({stage:'verified',results:6});await close();app.exit(0);
}).catch(async error=>{emit({stage:'failed',error:error.message});await save('failure.json',{at:new Date().toISOString(),error:error.message}).catch(()=>{});await close().catch(()=>{});app.exit(1);});
