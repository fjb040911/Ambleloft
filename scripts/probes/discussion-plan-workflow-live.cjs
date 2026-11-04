// Opt-in integration probe: real configured providers, isolated databases,
// fictional projects only. Runtime starts are forbidden; credentials never logged.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{SpaceService}=require('../../core/workforce/spaces.cjs');
const root=path.join(os.tmpdir(),'host-plan-workflow-'+Date.now());app.setName('Ambleloft');app.setPath('userData',root);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 assert.equal(settings.providers.length,2,'Expected the two user-configured providers');await fs.mkdir(root,{recursive:true});
 const selectedProviders=process.argv.includes('--deepseek-only')?settings.providers.filter(p=>p.name==='DeepSeek'):settings.providers;
 assert.ok(selectedProviders.length,'Requested provider is unavailable');
 const results=await Promise.allSettled(selectedProviders.map(async selected=>{
  const directory=path.join(root,selected.id),db=new Database(directory);let service;
  const evidence={provider:selected.name,model:selected.model,scope:'Real model and services; isolated synthetic data, no Agent execution or deployment',steps:[],executions:0};
  try{
   const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};}});
   await db.call('ready');const projects=[{id:'web',name:'虚构网页',type:'local',path:'/example/client'},{id:'api',name:'虚构接口',type:'ssh',path:'/example/server'}];
   const employees=[{id:'builder',name:'全栈工程师',responsibilities:'实现网页和接口并提供证据',methods:'先核对契约再分别实现',deliverables:'前后端代码与验证记录',skills:[]}];
   const runtime={runs:[],start:async()=>{evidence.executions++;throw Error('Live probe forbids Agent execution');},stop:async()=>{}};
   service=new SpaceService({directory,database:db,workspace:{read:async()=>({projects})},workforce:{providers,read:async()=>({employees})},runtime});await service.initialize();clearInterval(service.plans.timer);service.taskGuideTimeoutMs=180000;
   let space=await service.save({value:{name:'隔离的主持人规划测试',purpose:'仅规划，不执行',projectIds:['web','api'],members:[{employeeId:'builder',assignment:'负责前后端实现',projectIds:['web','api']}]}});
   space=await service.saveProjectContext({id:space.id,expectedRevision:space.revision,value:{roles:[{projectId:'web',responsibility:'静态网页，调用后端接口'},{projectId:'api',responsibility:'提供 HTTP API 并持久化数据'}],relations:[{sourceProjectId:'web',targetProjectId:'api',kind:'api',description:'网页调用 /api/v1/items 查询只读列表'}]}});
   let last;
   async function turn(prompt,taskContext){const id=randomUUID(),start=Date.now();await service.coordinateDiscussion({spaceId:space.id,clientRequestId:id,replyTo:last?.id,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt,taskContext});while(service.hostJobs.size){if(Date.now()-start>370000)throw Error('Probe timeout');await new Promise(r=>setTimeout(r,200));}last=(await service.snapshot()).requests.find(r=>r.id===id);evidence.steps.push({prompt,action:last.host.steps.at(-1)?.action,status:last.host.status,error:last.host.error,task:last.host.task,progress:last.host.progress,reply:last.host.steps.at(-1)?.text,elapsedMs:Date.now()-start});console.log(JSON.stringify({provider:selected.name,step:evidence.steps.length,action:evidence.steps.at(-1).action,status:last.host.status,elapsedMs:Date.now()-start}));assert.notEqual(last.host.status,'failed',last.host.error);return last;}
   await turn('生成任务。以下范围已经确认，直接规划，不邀请专家、不启动执行、不额外做功能：虚构的只读目录页，后端 api 项目提供 GET /api/v1/items，返回固定的三条虚构数据（id/name），无登录无写操作；前端 web 项目调用它展示列表及加载失败提示。只需两个工作节点，先后端实现并验证接口，再前端实现并验证页面。两节点均由全栈工程师负责，项目职责与关系已维护。验收使用接口响应断言和浏览器展示三条记录、失败提示截图；运行环境未知项在各节点执行时核对，不要向用户询问。请输出任务规划及流程。');
   let snap=await service.read(),draft=snap.taskDrafts.find(d=>d.id===last.host.task?.draftId);assert.ok(draft,'Host should create a persistent draft');assert.equal(snap.plans.length,0);assert.ok(draft.value.packages.length>=2);let rev=draft.revision;const rootDiscussion=last.id;
   const selectedNode=draft.value.packages.find(p=>p.projectId==='web')||draft.value.packages[0];
   await turn('解释当前选中节点为什么这样安排依赖，只解释，不修改计划。',{draftId:draft.id,draftRevision:rev,packageId:selectedNode.id});assert.equal((await service.read()).taskDrafts.find(d=>d.id===draft.id).revision,rev);
   await turn('修改当前选中节点：验收条件增加“页面加载失败后可点击重试并恢复三条记录展示”；保持其他节点、项目关系与节点标识不变。',{draftId:draft.id,draftRevision:rev,packageId:selectedNode.id});
   draft=(await service.read()).taskDrafts.find(d=>d.id===draft.id);assert.ok(draft.revision>rev);assert.ok(draft.value.packages.some(p=>p.id===selectedNode.id));assert.match(draft.value.packages.find(p=>p.id===selectedNode.id).acceptance,/重试/);
   // Explicitly confirm proposed relationships in synthetic fixture data only.
   for(let i=0;i<10&&draft.relationGuide?.nodes.length;i++){const n=draft.relationGuide.nodes[0];draft=await service.answerTaskRelations({id:draft.id,expectedRevision:draft.revision,requestKey:draft.relationGuide.requestKey,packageId:n.packageId,answers:n.prefill,locale:'zh-CN'});}
   assert.equal(draft.status,'ready',JSON.stringify(draft.assessment));const plan=await service.createGuidedPlan({id:draft.id,expectedRevision:draft.revision});assert.equal(plan.status,'draft');
   await turn('检查任务实际状态，告诉我有哪些已执行、是否需要我操作。不要修改或启动。',{planId:plan.id,planRevision:plan.revision});assert.equal(last.host.progress.planId,plan.id);assert.equal(last.host.progress.nodes.every(n=>n.status==='pending'),true);assert.equal(evidence.executions,0);evidence.passed=true;evidence.discussionId=rootDiscussion;
   await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));return {provider:selected.name,passed:true};
  }catch(e){evidence.error=e.message;await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));throw Error(selected.name+': '+e.message);}
  finally{await service?.shutdown();await db.close();}
 }));
 await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(results.map(r=>r.status==='fulfilled'?r.value:{passed:false,error:r.reason.message}),null,2));console.log('Evidence: '+root);for(const r of results)if(r.status==='rejected')console.error(r.reason.message);app.exit(results.every(r=>r.status==='fulfilled')?0:1);
}).catch(e=>{console.error(e.message);app.exit(1);});
