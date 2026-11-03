// Explicit pro6000 probe: only invented discussion content, isolated DB, no real task execution.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{SpaceService}=require('../../core/workforce/spaces.cjs');
const directory=path.join(os.tmpdir(),'task-guide-live-'+Date.now());app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let db,service;
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>p.name==='pro6000');assert.ok(selected,'pro6000 must exist');
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[selected]};}});
 db=new Database(directory);await db.call('ready');
 service=new SpaceService({directory,database:db,workspace:{read:async()=>({projects:[]})},workforce:{providers,read:async()=>({employees:[{id:'reviewer',name:'文档审核专家'}]})},runtime:{runs:[],start:async()=>{throw Error('Probe must never execute tasks');}}});
 await service.initialize();const space=await service.save({value:{name:'虚构发布评审',purpose:'测试任务引导',projectIds:[],members:[{employeeId:'reviewer',assignment:'检查文档链接并报告证据',projectIds:[]}]}});
 let d=await service.createTaskDraft({spaceId:space.id,commandId:randomUUID()});
 const ask=message=>service.guideTask({id:d.id,expectedRevision:d.revision,requestId:randomUUID(),message,providerId:selected.id,model:selected.model});
 d=await ask('帮我把发布文档做好。');const insufficient=d.status==='needs-input';assert.ok(insufficient,'Vague request must not be ready');assert.ok(d.assessment.question||d.assessment.missing.length);
 d=await ask('任务只做分析，不修改任何文件，不访问网络。由 reviewer 负责对比随任务提供的虚构链接表：文档列出 /intro、/api、/faq，期望 HTTP 状态均为 200；模拟证据依次为 200、404、200。交付逐项对照表与异常清单。验收要求每个链接均列出期望、实际状态和是否符合，并指出 /api 返回 404，不将它判为通过。验证方法是人工比对这三个给定状态。没有其他依赖和约束，不必创建正式文档。请基于这些已确定事实生成待确认的任务。');
 const evidence={provider:selected.name,model:selected.model,insufficientBlocked:insufficient,secondStatus:d.status,questionCount:d.assessment.question?.source.definition.fields.length||0,hostIssues:d.assessment.missing,taskCount:d.value.packages.length,executions:service.runtime.runs.length,scope:'Only fictional brief and simulated evidence; no real project input'};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence));assert.equal(d.status,'ready');const plan=await service.createGuidedPlan({id:d.id,expectedRevision:d.revision});assert.equal(plan.status,'draft');assert.equal(service.runtime.runs.length,0);
 await service.shutdown();await db.close();app.exit(0);
}).catch(async error=>{console.error(error.message);await service?.shutdown().catch(()=>{});await db?.close().catch(()=>{});app.exit(1);});
