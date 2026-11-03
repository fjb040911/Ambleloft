// Opt-in real model + AgentRuntime probe. Synthetic content, isolated profile;
// reads the selected encrypted provider only, never changes the user's app data.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{SpaceService}=require('../../core/workforce/spaces.cjs'),{AgentRuntime}=require('../../electron/agent-runtime.cjs');
const directory=path.join(os.tmpdir(),'discussion-host-live-'+Date.now());app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let db,service,runtime;async function close(){await service?.shutdown();await runtime?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');assert.ok(selected,'Configured DeepSeek service required');
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};}});
 db=new Database(directory);await db.call('ready');const workspace={read:async()=>({projects:[],tasks:[]})};
 const employees=[{id:'requirements-reviewer',name:'需求评审专家',revision:1,responsibilities:'界定内部工单用户、范围与验收条件',deliverables:'明确的需求建议',methods:'先区分已知事实与建议，引用提供的资料',domain:'测试工单',skills:[]},{id:'contract-reviewer',name:'契约评审专家',revision:1,responsibilities:'依据已给出的需求评审结果定义 API 契约与模块边界',deliverables:'接口与验收建议',methods:'先阅读需求评审结果，再界定职责边界',domain:'测试工单',skills:[]}];
 // Profiles are isolated fixtures. The runtime/model/RPC are real; Store install is not under test.
 const workforce={providers,read:async()=>({employees}),prepare:async id=>structuredClone(employees.find(e=>e.id===id))};
 runtime=new AgentRuntime({directory,database:db,workspace,provider:providers,publish(){}});runtime.workforce=workforce;await runtime.init();
 service=new SpaceService({directory,database:db,workspace,workforce,runtime});runtime.spaces=service;await service.initialize();
 const space=await service.save({value:{name:'虚构设备维修工单 · 主持人验证',purpose:'仅验证分析协调，不操作项目',projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:e.responsibilities,projectIds:[]}))}});
 const requestId=randomUUID();await service.coordinateDiscussion({spaceId:space.id,clientRequestId:requestId,locale:'zh-CN',providerId:selected.id,model:selected.model,prompt:'这是隔离试验，只讨论以下虚构需求：内部员工登记设备维修工单，必填设备编号和故障说明，初始状态 pending，可查工单状态。第一版不含审批、支付、账户系统。用户已经决定 API 前缀 /api/v1、测试端口 18765。请先委派需求评审专家分析范围和验收，再把实际结果交给契约评审专家提出接口与模块边界，不能同时派发。专家都只输出 400 字以内分析，禁止调用任何工具、访问网络、读写文件；主持人完成后汇总供用户审阅，不创建或执行任务。不要询问提供的事实。'});
 const deadline=Date.now()+300000;
 while(service.hostJobs.size){if(Date.now()>deadline)throw Error('Probe timeout');if(runtime.runs.some(r=>r.status==='waiting'))throw Error('Unexpected permission/input request; no approval granted');await new Promise(r=>setTimeout(r,500));}
 const result=(await service.snapshot()).requests.find(r=>r.id===requestId);await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));
 const evidence={checkedAt:new Date().toISOString(),provider:selected.name,model:selected.model,status:result.host.status,error:result.host.error,steps:result.host.steps.map(s=>s.action),experts:result.participants.map(p=>({employeeId:p.employeeId,status:p.status,runId:p.runId})),toolsExecuted:runtime.runs.reduce((n,r)=>n+r.tools.length,0),plans:(await service.read()).plans.length,scope:'Real configured model + host + AgentRuntime/Codex. Synthetic isolated expert profiles without Store skills; no user project content.',directory};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 assert.equal(result.participants.length,2);assert.ok(['completed','ready'].includes(result.host.status));assert.ok(result.participants.every(p=>p.status==='completed'));assert.equal(evidence.toolsExecuted,0);assert.equal(evidence.plans,0);
 const second=runtime.runs.find(r=>r.employee.id==='contract-reviewer');assert.ok(second.collaboration.sources.some(s=>s.employeeId==='requirements-reviewer'&&s.text.length));
 await close();app.exit(0);
}).catch(async error=>{console.error(error.message);console.log('Isolated profile: '+directory);await close().catch(()=>{});app.exit(1);});
