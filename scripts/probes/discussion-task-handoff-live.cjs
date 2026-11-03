// Opt-in integration probe: fictional local/remote repair app, isolated SQLite,
// real configured DeepSeek. No real discussions, projects, tools or execution.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {createProviderStore}=require('../../electron/provider.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const directory=path.join(os.tmpdir(),'discussion-task-handoff-live-'+Date.now());
app.setName('Ambleloft');app.setPath('userData',directory);
app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');
app.on('window-all-closed',()=>{});
let db,service;
async function close(){await service?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');assert.ok(selected,'Configured DeepSeek service required');
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{
  assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};
 }});
 const projects=[{id:'local-ui',name:'虚构报修网页',type:'local',path:path.join(directory,'ui')},{id:'remote-api',name:'虚构报修接口',type:'ssh',path:'/example/repair-api'}];
 const employees=[
  {id:'api',name:'接口工程师',responsibilities:'定义接口并实现、测试和部署服务',methods:'先明确契约，检查环境，再实现',deliverables:'接口代码、测试和部署证据',skills:[{name:'API contract review',purpose:'核对请求、响应和边界'}]},
  {id:'ui',name:'界面工程师',responsibilities:'实现本地网页和接口对接',methods:'按契约实现表单与错误反馈',deliverables:'网页、界面测试',skills:[]},
  {id:'qa',name:'验证专家',responsibilities:'检查交付是否满足约定并准备证据',methods:'按验收标准逐项核验',deliverables:'验证报告和已知问题',skills:[]}
 ];
 const runtime={runs:[],start:async()=>{throw Error('Probe must never execute experts or project work');},stop:async()=>{}};
 db=new Database(directory);await db.call('ready');service=new SpaceService({directory,database:db,workspace:{read:async()=>({projects})},workforce:{providers,read:async()=>({employees})},runtime});await service.initialize();
 const space=await service.save({value:{name:'虚构报修 · 引导交接验证',purpose:'只测试任务准备，不实施',projectIds:projects.map(p=>p.id),members:employees.map(e=>({employeeId:e.id,assignment:e.responsibilities,projectIds:e.id==='qa'?projects.map(p=>p.id):[e.id==='api'?'remote-api':'local-ui']}))}});
 const requestId=randomUUID(),started=Date.now();
 await service.coordinateDiscussion({spaceId:space.id,clientRequestId:requestId,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt:'请整理下面已确认的虚构需求，准备转为任务；暂不邀请专家分析，不开始实施。做内部课室报修工具：本地网页提交设备名称、地点、问题描述，显示按时间倒序的报修列表和详情；状态只有只读“待处理”，不做登录和状态流转。SSH 测试项目提供创建、列表和详情接口以及健康检查，SQLite 持久化，重启后记录仍可读取。服务只监听回环地址，通过 SSH 隧道联调，不影响其他服务。端口是否可用、现有运行时和目录情况未知，安排工程师在远端核查，冲突时报告、不停止其他服务。先定接口契约再并行实现界面和服务；测试必填校验、创建后查询、重启持久化，输出代码、测试和部署记录。最后由我检查证据并验收。技术细节可给出合理建议，不必反复确认，帮我明确接下来做什么。'});
 while(service.hostJobs.size){if(Date.now()-started>100000)throw Error('Host probe timeout');await new Promise(r=>setTimeout(r,100));}
 const host=(await service.snapshot()).requests.find(r=>r.id===requestId).host;
 assert.equal(host.status,'ready',host.error||host.steps.at(-1)?.text);assert.match(host.steps.at(-1).text,/整理并检查任务/);
 const draft=await service.createTaskDraft({spaceId:space.id,discussionId:requestId,commandId:randomUUID()});
 const checked=await service.guideTask({id:draft.id,expectedRevision:draft.revision,requestId:randomUUID(),locale:'zh-CN',providerId:selected.id,model:selected.model,message:''});
 const evidence={checkedAt:new Date().toISOString(),provider:selected.name,model:selected.model,hostStatus:host.status,hostRuleVersion:host.ruleVersion,hostReply:host.steps.at(-1).text,guideStatus:checked.status,guideRuleVersion:checked.assessment?.ruleVersion,summary:checked.assessment?.summary,questions:checked.assessment?.question?.source.definition.fields||[],missing:checked.assessment?.missing,packages:checked.value.packages,executions:runtime.runs.length,scope:'Real configured model + host + task guide + isolated SQLite. Fictional input only; no real project access or execution. Browser UI is verified separately using fixtures.'};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({directory,hostStatus:host.status,guideStatus:checked.status,packageCount:checked.value.packages.length,questions:evidence.questions,missing:evidence.missing,executions:runtime.runs.length}));
 assert.equal(checked.status,'ready');assert.doesNotMatch(checked.assessment.summary,/打开任务向导|点击.*整理并检查任务/);assert.ok(checked.value.packages.some(p=>p.mode==='work'&&p.projectId==='local-ui'));assert.ok(checked.value.packages.some(p=>p.mode==='work'&&p.projectId==='remote-api'));
 const plan=await service.createGuidedPlan({id:checked.id,expectedRevision:checked.revision});assert.equal(plan.status,'draft');assert.equal(runtime.runs.length,0);
 evidence.savedPlanStatus=plan.status;await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
 await close();app.exit(0);
}).catch(async error=>{console.error(error.message);console.log('Isolated profile: '+directory);await close().catch(()=>{});app.exit(1);});
