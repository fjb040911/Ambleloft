// Opt-in real-model lifecycle probe. Isolated profile, invented text-only tasks.
// Drives production services and AgentRuntime; never copies user projects or logs secrets.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {createProviderStore}=require('../../electron/provider.cjs');
const {createStore}=require('../../electron/store.cjs');
const {createSkills}=require('../../electron/skills.cjs');
const {CatalogStore}=require('../../core/catalog-store/service.cjs');
const {WorkforceService}=require('../../core/workforce/service.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const {AgentRuntime}=require('../../electron/agent-runtime.cjs');
const providerName=process.argv[3]||'DeepSeek';
const directory=process.argv[2]||path.join(os.tmpdir(),'topic-lifecycle-live-'+Date.now());
const resume=process.env.TOPIC_PROBE_RESUME==='1';
app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let db,catalog,workforce,spaces,runtime,space,last,rootDiscussion,selected,done=false;
const evidence={scope:'Real configured model host, task guide, AgentRuntime, scheduler and persisted services; synthetic experts and text-only inputs, no project access; API-driven, not UI clicks.',steps:[]};
const emit=v=>console.log(JSON.stringify({at:new Date().toISOString(),...v}));
const save=(name,v)=>fs.writeFile(path.join(directory,name),JSON.stringify(v,null,2),{mode:0o600});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function snapshot(){await runtime.persist();const s=await spaces.snapshot();await save('snapshot.json',s);await save('runs.json',runtime.list());await save('evidence.json',evidence);return s;}
async function close(){await spaces?.shutdown();await runtime?.shutdown();await workforce?.shutdown();await catalog?.shutdown();await db?.close();}
async function command(c){
 if(c.action==='turn'){
  const id=randomUUID(),start=Date.now();await spaces.coordinateDiscussion({spaceId:space.id,clientRequestId:id,replyTo:last?.id,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt:c.prompt,taskContext:c.taskContext});
  while(spaces.hostJobs.size){if(Date.now()-start>420000)throw Error('Host timeout');await wait(400);}
  last=(await spaces.snapshot()).requests.find(r=>r.id===id);rootDiscussion ||= id;
  assert.notEqual(last.host.status,'failed',last.host.error);
  return {id,rootDiscussion,host:last.host,participants:last.participants,elapsedMs:Date.now()-start};
 }
 if(c.action==='confirm')return spaces.createGuidedPlan({id:c.id,expectedRevision:c.revision});
 if(c.action==='control')return spaces.controlPlan({id:c.id,expectedRevision:c.revision,commandId:randomUUID(),action:c.control},{});
 if(c.action==='review'){
  const plan=(await spaces.read()).plans.find(p=>p.id===c.id),p=plan.packages.find(p=>p.id===c.packageId),a=p.attempts.at(-1);
  assert.equal(p.status,'review');return spaces.reviewPlan({planId:plan.id,packageId:p.id,attemptId:a.id,resultHash:a.resultHash,accepted:c.accepted,note:c.note});
 }
 if(c.action==='guard'){
  const before=await spaces.read();await assert.rejects(spaces.createTaskDraft({spaceId:space.id,discussionId:rootDiscussion,commandId:randomUUID(),newPlan:true}),/未结束|current task/);
  const after=await spaces.read();assert.equal(after.taskDrafts.length,before.taskDrafts.length);assert.equal(after.plans.length,before.plans.length);return {blocked:true};
 }
 if(c.action==='snapshot')return snapshot();
 if(c.action==='finish'){evidence.passed=!!c.passed;done=true;return {finished:true};}
 throw Error('Unknown command');
}
app.whenReady().then(async()=>{
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 selected=settings.providers.find(p=>p.name===providerName);assert.ok(selected,providerName+' unavailable');
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};}});
 db=new Database(directory);await db.call('ready');const workspace=createStore(directory,db),skills=createSkills(directory,db);
 catalog=new CatalogStore({directory,database:db,skills,extensions:{items:[]},sources:[]});await catalog.initialize();
 workforce=new WorkforceService({directory,database:db,skills,catalog,providers});await workforce.initialize();
 const employees=[];
 for(const [name,responsibilities] of resume?[]:[['资料整理员','严格使用用户给定数据整理清单，不编造事实'],['验算专家','核对上游真实交付与用户给定数据，指出差异']]){
  const e=await workforce.save({value:{name,responsibilities,domain:'隔离验证',methods:'只分析提供的虚构文本，不调用工具、不访问网络、不读写文件。',deliverables:'简明的逐项数据对照与结论',skills:[],modelChoice:{providerId:selected.id,model:selected.model}}});await workforce.activate({id:e.id,expectedRevision:e.revision});employees.push(e);
 }
 const seen=new Map();runtime=new AgentRuntime({directory,database:db,workspace,skills,provider:providers,publish:r=>{if(seen.get(r.id)!==r.status){seen.set(r.id,r.status);emit({runId:r.id,status:r.status,expert:r.employee?.name});}}});runtime.workforce=workforce;await runtime.init();
 spaces=new SpaceService({directory,database:db,workspace,workforce,runtime});runtime.spaces=spaces;await spaces.initialize();
 // Diagnostics contain only this isolated probe's synthetic inputs/results.
 spaces.generateDiscussionHost=async(...args)=>{const output=await require('../../core/automation/provider.cjs').generate(...args);await save('host-output-'+Date.now()+'.json',output);return output;};
 if(resume){
  Object.assign(evidence,JSON.parse(await fs.readFile(path.join(directory,'evidence.json'),'utf8')));delete evidence.passed;
  space=(await spaces.read()).spaces.find(s=>s.id===evidence.spaceId);assert.ok(space,'Isolated test space missing');
  last=(await spaces.read()).requests.filter(r=>r.spaceId===space.id&&r.host).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
  rootDiscussion=last&&require('../../core/workforce/topic-task.cjs').root(await spaces.read(),space.id,last.id);
  evidence.steps.push({at:new Date().toISOString(),command:{action:'restart-probe'},result:{ok:true}});
 }else space=await spaces.save({value:{name:'话题串行生命周期 · 真实模型验证',purpose:'只使用虚构文本验证讨论、确认、执行、验收与依赖调度',projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:e.responsibilities,projectIds:[]}))}});
 evidence.provider=selected.name;evidence.model=selected.model;evidence.spaceId=space.id;evidence.startedAt ||= new Date().toISOString();await snapshot();emit({ready:true,directory,spaceId:space.id});
 const deadline=Date.now()+45*60000;
 while(!done&&Date.now()<deadline){
  let c;try{c=JSON.parse(await fs.readFile(path.join(directory,'command.json'),'utf8'));await fs.unlink(path.join(directory,'command.json'));}catch(e){if(e.code!=='ENOENT')throw e;await wait(250);continue;}
  let result;try{result={ok:true,value:await command(c)};}catch(e){result={ok:false,error:e.message};}
  evidence.steps.push({at:new Date().toISOString(),command:c,result});await snapshot();await save('response-'+c.seq+'.json',result);emit({seq:c.seq,action:c.action,ok:result.ok,error:result.error});
 }
 await close();app.exit(evidence.passed?0:1);
}).catch(async e=>{emit({error:e.message});await close().catch(()=>{});app.exit(1);});
