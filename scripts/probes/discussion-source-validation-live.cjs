// Opt-in DeepSeek probe. Seeds a restart in an isolated database, then calls the
// real host with a new goal. Never starts tasks or writes to the user's database.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{SpaceService}=require('../../core/workforce/spaces.cjs');
const root=path.join(os.tmpdir(),'host-source-validation-'+Date.now());
app.setName('Ambleloft');app.setPath('userData',root);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>p.name==='DeepSeek');assert.ok(selected,'Configured DeepSeek provider required');
 const db=new Database(root);let service;
 const evidence={provider:selected.name,model:selected.model,scope:'Synthetic restart then new goal; isolated database, no execution',executions:0};
 try{
  await db.call('ready');
  const providers=createProviderStore(root,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[selected]};}});
  const projects=[{id:'web',name:'测试客户端',type:'local',path:'/example/client'},{id:'api',name:'测试服务端',type:'ssh',path:'/example/server'}];
  const runtime={runs:[],start:async()=>{evidence.executions++;throw Error('Execution forbidden in probe');},stop:async()=>{}};
  service=new SpaceService({directory:root,database:db,workspace:{read:async()=>({projects})},workforce:{providers,read:async()=>({employees:[]})},runtime});
  await service.initialize();clearInterval(service.plans.timer);
  const space=await service.save({value:{name:'来源校验隔离测试',purpose:'仅讨论多项目开发流程',projectIds:['web','api'],members:[]}});
  async function turn(prompt,extra={}){
   const id=randomUUID(),start=Date.now();await service.coordinateDiscussion({spaceId:space.id,clientRequestId:id,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt,...extra});
   while(service.hostJobs.size){if(Date.now()-start>370000){await service.stopDiscussionHost({requestId:id});throw Error('Probe watchdog exceeded');}await new Promise(resolve=>setTimeout(resolve,200));}
   const request=(await service.snapshot()).requests.find(r=>r.id===id);assert.notEqual(request.host.status,'failed',request.host.error);return request;
  }
  service.generateDiscussionHost=async()=>({action:'restart-guide',message:'已开始新引导，请说明目标。',brief:{goal:'',items:[]},questions:[],delegates:[]});
  const reset=await turn('开始新的引导'),draft=(await service.read()).taskDrafts[0];delete service.generateDiscussionHost;
  const start=Date.now();
  const result=await turn('目标做一个多项目开发流程的测试，包含需求讨论和确定、设计文档生成、本地 client 开发、远端 server 开发、联调和部署。先讨论目标，不生成任务，不邀请专家，不执行；请总结已知目标，并问我一个最关键的问题。',{replyTo:reset.id,taskContext:{draftId:draft.id,draftRevision:draft.revision}});
  const host=require('../../core/workforce/discussion-host.cjs'),sources=host.sourcesFor(await service.snapshot(),space.id,reset.id,reset.id);
  const ids=new Set(sources.map(s=>s.id));assert.ok(['ask','reply'].includes(result.host.steps.at(-1).action));
  assert.ok(result.host.brief.items.every(item=>item.sourceIds.length&&item.sourceIds.every(id=>ids.has(id))));
  assert.equal(evidence.executions,0);assert.equal((await service.read()).plans.length,0);
  Object.assign(evidence,{passed:true,elapsedMs:Date.now()-start,action:result.host.steps.at(-1).action,status:result.host.status,briefItemCount:result.host.brief.items.length,allSourcesValid:true,questions:result.host.question?.source.definition.fields.length||0});
 }catch(error){evidence.passed=false;evidence.error=error.message;}
 finally{await service?.shutdown();await db.close();}
 await fs.writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify({...evidence,evidence:path.join(root,'evidence.json')}));app.exit(evidence.passed?0:1);
}).catch(error=>{console.error(error.message);app.exit(1);});
