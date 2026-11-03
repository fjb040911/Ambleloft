// Opt-in real-model integration. Uses an isolated profile and the previously
// authorized minimal AI Coding excerpt. No source repository is modified.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {createProviderStore}=require('../../electron/provider.cjs');
const {createStore}=require('../../electron/store.cjs');
const {createSkills}=require('../../electron/skills.cjs');
const {CatalogStore,loadSources}=require('../../core/catalog-store/service.cjs');
const {WorkforceService}=require('../../core/workforce/service.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const {AgentRuntime}=require('../../electron/agent-runtime.cjs');
const [directory,approvedProfile]=process.argv.slice(2);
if(!directory||!approvedProfile)throw Error('Usage: electron workforce-flow.cjs ISOLATED_PROFILE PRIOR_APPROVED_PROFILE');
app.setName('Ambleloft');app.setPath('userData',path.resolve(directory));
app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');
app.on('window-all-closed',()=>{});
let db,catalog,workforce,spaces,runtime;
const emit=value=>console.log(JSON.stringify({at:new Date().toISOString(),...value}));
const save=(name,value)=>fs.writeFile(path.join(directory,name),JSON.stringify(value,null,2),{mode:0o600});
async function close(){await spaces?.shutdown();await runtime?.shutdown();await workforce?.shutdown();await catalog?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 await fs.mkdir(directory,{recursive:true});
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const chosen=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');
 if(!chosen||!safeStorage.isEncryptionAvailable())throw Error('Configured provider unavailable');
 const provider=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:chosen.id,providers:[{...chosen,webSearch:'disabled'}]};}});
 db=new Database(directory);await db.call('ready');const workspace=createStore(directory,db),skills=createSkills(directory,db);
 catalog=new CatalogStore({directory,database:db,skills,extensions:{items:[]},sources:await loadSources()});await catalog.initialize();
 workforce=new WorkforceService({directory,database:db,skills,catalog,providers:provider});await workforce.initialize();
 const seen=new Map();runtime=new AgentRuntime({directory,database:db,provider,workspace,skills,publish:run=>{const key=run.status+':'+run.tools.length;if(seen.get(run.id)!==key){seen.set(run.id,key);emit({stage:'run',name:run.employee?.name,status:run.status,tools:run.tools.length});}}});runtime.workforce=workforce;await runtime.init();
 spaces=new SpaceService({directory,database:db,workspace,workforce,runtime});runtime.spaces=spaces;await spaces.initialize();
 const templates=await workforce.roles({refresh:true});assert.equal(templates.items.length,7);
 const employees=[];for(const id of ['amble.product','amble.architecture']){const role=templates.items.find(r=>r.id===id),employee=await workforce.save({value:{...role.zh,domain:'AI Coding 平台',skills:role.skills}});await workforce.activate({id:employee.id,expectedRevision:1});employees.push(employee);}
 const draft=await workforce.createDraft({commandId:randomUUID()});
 const edited=await workforce.saveDraft({id:draft.id,expectedRevision:1,value:draft.value,mode:'guided',step:1,brief:'设计一位 AI Coding 平台的接口架构师，关注 Gateway 与 Router 的接口边界和可验证契约。'});
 const roleSuggestion=await workforce.suggestRole({id:edited.id,expectedRevision:edited.revision,providerId:chosen.id,model:chosen.model});assert.equal(roleSuggestion.status,'ready');assert.ok(roleSuggestion.result.fields.responsibilities);await save('role-suggestion.json',roleSuggestion);emit({stage:'role-guidance-verified'});
 const space=await spaces.save({value:{name:'AI Coding · 真实交接验证',purpose:'验证职责讨论、角色技能、固定引用、受控草稿与依赖计划。',projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:e.name==='产品经理'?'用户价值、范围与验收':'接口契约、失败边界与验证',projectIds:[]}))}});
 const approved=JSON.parse(await fs.readFile(path.join(approvedProfile,'snapshot.json'),'utf8'));
 const meta=approved.documents.find(d=>d.title==='总体设计摘录');assert.ok(meta);
 const body=await fs.readFile(path.join(approvedProfile,'workforce','documents',meta.spaceId,meta.id,meta.hash+'.md'),'utf8');
 // Reviewed on 2026-10-26: 4,662 bytes of module responsibilities and interface
 // contracts only. No credentials, hostnames, user data or full document.
 assert.equal(createHash('sha256').update(body).digest('hex'),'0df1330526af19b6dfdd1a37cb41076b85f2f69fbe8e49fd285d9d02c4f09272','Approved excerpt changed; review required before transmission');
 const doc=await spaces.saveDocument({spaceId:space.id,title:meta.title,body,adopted:true});
 const suggestion=await spaces.suggestPlan({spaceId:space.id,goal:'只讨论 Gateway 与 Router 的边界，先分析需求，再由架构师评审；不实施代码，不假定独立 Gateway 仓库。',documentIds:[doc.id],providerId:chosen.id,model:chosen.model});assert.ok(suggestion.value.packages.length);await save('plan-suggestion.json',suggestion);emit({stage:'ai-plan-verified',packages:suggestion.value.packages.length});
 const packages=employees.map((e,i)=>({id:i?'architecture':'product',title:i?'架构边界复核':'产品边界评审',ownerId:e.id,mode:'discussion',projectId:null,dependencies:i?['product']:[],documentRefs:[{id:doc.id,revision:1,hash:doc.hash}],instruction:'只使用提供的最小摘录，不扫描磁盘、不执行命令。使用 space_list_documents 和 space_read_document 读取当前空间提供的文档（版本 1），基于你的角色与已加载技能，给出 model-router 与 api-gateway 的职责建议、分歧和可验证标准。引用“总体设计摘录 v1”。必须通过 space_propose_document 把你的建议保存为一份新的草稿，commandId 请用唯一的短英文标识，不得采纳。然后用简短中文汇报草稿标题；不要声称已施工或已形成共识。',deliverables:'有来源的职责建议草稿',acceptance:'受控工具提交草稿，引用固定版本，实际角色技能已加载；不执行项目命令。'}));
 let plan=await spaces.savePlan({spaceId:space.id,value:{name:'职责边界交接',goal:'产品经理提出范围，架构师基于上游结果复核契约。',packages}});
 // Explicit test model choice, retaining the production default behavior.
 await spaces.change(s=>{s.plans.find(p=>p.id===plan.id).modelChoice={providerId:chosen.id,model:chosen.model};});
 await spaces.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'start'},{});
 for(const definition of packages){
  const deadline=Date.now()+240000;
  while(true){
   await spaces.plans.pulse(plan.id);plan=(await spaces.read()).plans.find(p=>p.id===plan.id);
   const current=plan.packages.find(p=>p.id===definition.id);
   if(current.status==='review')break;
   if(['failed','interrupted','stale'].includes(current.status))throw Error('Package stopped: '+current.reason);
   if(current.status==='waiting')throw Error('Unexpected user input/approval requested; no automatic permission granted');
   if(Date.now()>deadline)throw Error('Model package timed out');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const item=plan.packages.find(p=>p.id===definition.id),attempt=item.attempts.at(-1),run=runtime.runs.find(r=>r.id===attempt.runId);
  assert.equal(run.employee.skills.length,2);
  const outputs=(await spaces.snapshot()).documents.filter(d=>d.versions.some(v=>v.sourceRunId===run.id));
  assert.ok(outputs.length,'Model must submit a real source-linked draft through the tool');
  for(const output of outputs){assert.equal(output.adoptedRevision,null);const actual=await spaces.document({id:output.id});assert.ok(actual.sourceRefs.some(r=>r.id===doc.id&&r.hash===doc.hash));assert.match(actual.body,/总体设计摘录/);}
  await spaces.reviewPlan({planId:plan.id,packageId:item.id,attemptId:attempt.id,resultHash:attempt.resultHash,accepted:true,note:'隔离集成测试验收：已断言真实草稿、来源 hash、角色技能；仅验证交接机制，不代表业务决定已获批准。'});
  emit({stage:'package-verified',package:definition.id,drafts:outputs.length});
 }
 await spaces.plans.pulse(plan.id);await runtime.persist();const snapshot=await spaces.snapshot();assert.equal(snapshot.plans[0].status,'completed');
 await save('snapshot.json',snapshot);await save('runs.json',runtime.list());await save('workspace.json',await workspace.read());await save('employees.json',await workforce.snapshot());
 await save('verification.json',{checkedAt:new Date().toISOString(),model:chosen.model,realRoles:2,skillSnapshotsPerRole:2,roleGuidance:true,aiPlanSuggestions:true,sourceTools:true,realDrafts:snapshot.documents.filter(d=>d.sourceRunId||d.versions.some(v=>v.sourceRunId)).length,dependencyHandoff:true,repositoryWrites:0,scope:'Minimal approved AI Coding excerpt; discussion and artifact handoff only'});
 emit({stage:'verified',profile:directory});await close();app.exit(0);
}).catch(async e=>{emit({stage:'failed',error:e.message});if(runtime)await save('run-errors.json',runtime.runs.map(r=>({id:r.id,status:r.status,tools:r.tools.map(t=>({label:t.label,status:t.status,detail:t.status==='failed'?t.detail:undefined})),final:r.messages.filter(m=>m.role==='assistant'&&m.phase==='final_answer').map(m=>m.text)}))).catch(()=>{});await save('failure.json',{error:e.message,at:new Date().toISOString()}).catch(()=>{});await close().catch(()=>{});app.exit(1);});
