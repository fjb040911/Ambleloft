// Opt-in: real configured DeepSeek + SpaceService + isolated SQLite.
// Sends only a fictional goal and built-in rules, with no experts or projects.
// Records counters, never credentials, model reasoning text or user discussions.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {createProviderStore}=require('../../electron/provider.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const directory=path.join(os.tmpdir(),'discussion-feedback-live-'+Date.now());
app.setName('Ambleloft');app.setPath('userData',directory);
app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');
app.on('window-all-closed',()=>{});
let db,service;
async function close(){await service?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');
 assert.ok(selected,'Configured DeepSeek service required');
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{
  assert.equal(method,'readSetting');assert.equal(args.key,'providers');
  return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};
 }});
 db=new Database(directory);await db.call('ready');
 // Expert execution is forbidden: this probe tests host clarification only.
 const runtime={runs:[],start:async()=>{throw Error('Unexpected expert execution');},stop:async()=>{}};
 service=new SpaceService({directory,database:db,workspace:{read:async()=>({projects:[]})},workforce:{providers,read:async()=>({employees:[]})},runtime});
 await service.initialize();
 const space=await service.save({value:{name:'虚构工单 · 流式反馈验证',purpose:'澄清虚构目标，不施工',projectIds:[],members:[]}});
 const requestId=randomUUID(),started=Date.now(),seen=new Set(),phases=new Set();let firstReasoningMs=null,reasoningUpdates=0;
 await service.coordinateDiscussion({spaceId:space.id,clientRequestId:requestId,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt:'我想做一个设备维修登记工具，还没确定给谁使用。请先帮我问清最重要的一项需求，暂不邀请专家，不创建或执行任务。'});
 while(service.hostJobs.size){
  if(Date.now()-started>100000)throw Error('Probe timeout');
  const r=(await service.snapshot()).requests.find(r=>r.id===requestId),activity=r?.host?.activity;
  if(activity&&!seen.has(r.host.revision)){seen.add(r.host.revision);phases.add(activity.phase);if(r.host.status==='running'&&activity.reasoning){firstReasoningMs??=Date.now()-started;reasoningUpdates++;}}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 const result=(await service.snapshot()).requests.find(r=>r.id===requestId);
 const evidence={checkedAt:new Date().toISOString(),provider:selected.name,model:selected.model,status:result.host.status,error:result.host.error||null,elapsedMs:Date.now()-started,firstReasoningMs,reasoningUpdates,phases:[...phases],reasoningCharacters:result.host.activity?.reasoning.length||0,questions:result.host.question?.source.definition.fields.length||0,experts:result.participants.length,plans:(await service.read()).plans.length,scope:'Real configured model + SpaceService + SQLite. Fictional goal, no expert runtime, tools or user projects. Browser UI tested separately with isolated fixtures.'};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,directory}));
 assert.equal(result.host.status,'needs-input');assert.ok(reasoningUpdates>0,'No live reasoning received');assert.ok(evidence.questions>0);assert.equal(evidence.experts,0);assert.equal(evidence.plans,0);
 await close();app.exit(0);
}).catch(async error=>{console.error(error.message);console.log('Isolated profile: '+directory);await close().catch(()=>{});app.exit(1);});
