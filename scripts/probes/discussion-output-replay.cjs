// Synthetic multi-round format probe by default. --recorded replays the one
// explicitly authorized incident read-only against the same configured provider.
// Never calls task services
// or starts an Agent. Raw model output stays in a private temporary directory.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createProviderStore}=require('../../electron/provider.cjs');
const {generate}=require('../../core/automation/provider.cjs');
const host=require('../../core/workforce/discussion-host.cjs');
const root=path.join(os.tmpdir(),'discussion-output-replay-'+Date.now());
app.setName('Ambleloft');app.setPath('userData',root);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,json,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>p.name==='DeepSeek');if(!selected)throw Error('DeepSeek provider unavailable');
 const providers=createProviderStore(root,safeStorage,{call:async()=>settings});
 const config=await providers.secret(selected.id,selected.model);
 let roster=[{id:'builder',name:'全栈工程师',responsibilities:'前后端开发与验证',methods:'验证后交付',deliverables:'代码和验证记录',skills:[],assignment:'实现目录页',projectIds:['web','api']}];
 let projects=[{id:'web',name:'虚构网页',type:'local',environment:null},{id:'api',name:'虚构服务',type:'ssh',environment:null}];
 let sources=[{id:'request-1',kind:'user',text:'规划一个虚构目录页，前端显示固定三条虚构数据，后端提供 /api/v1/items。先讨论，不执行。'},
 {id:'request-2',kind:'user',text:'把本地网页构建部署到虚构服务所在服务器，提供公网访问，仅规划不执行。'},
 {id:'request-3',kind:'user',text:'公网入口：公网 IP + HTTP，仅测试；API：同源 /api 反向代理；数据：全部虚构、不登录。已确定，请整理当前说明。'}];
 const brief={goal:'虚构目录页的公网部署规划',items:Array.from({length:25},(_,i)=>({id:'item-'+i,kind:i<3?'decision':'proposal',text:i<3?sources[i].text:'规划步骤 '+i+'：明确交付边界、依赖和实际验证证据，不假设环境已核验。',sourceIds:[sources[Math.min(i,2)].id]}))};
 let request={id:'synthetic-multiround',composer:{skills:[]},host:{brief}};
 let space={purpose:'合成多轮讨论的格式回归，仅生成说明，不执行'};
 let documents=[];
 if(process.argv.includes('--recorded')){
  const recorded=JSON.parse(execFileSync('python3',['-c',"import sqlite3,json,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); keys=['workforce.spaces.v1','workforce.roles.v1']; d={k:json.loads(c.execute('select data from settings where key=?',(k,)).fetchone()[0]) for k in keys}; d['projects']=[json.loads(r[0]) for r in c.execute('select data from projects')]; print(json.dumps(d))",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8',maxBuffer:64*1024*1024}));
  const state=recorded['workforce.spaces.v1'];
  request=state.requests.find(r=>r.id==='050528d4-270d-4a27-ad05-ead28dca0b95');if(!request)throw Error('Authorized incident request not found');
  space=state.spaces.find(s=>s.id===request.spaceId);
  roster=space.members.flatMap(m=>{const e=recorded['workforce.roles.v1'].employees.find(e=>e.id===m.employeeId);return e?[{id:e.id,name:e.name,responsibilities:e.responsibilities,methods:e.methods,deliverables:e.deliverables,skills:(e.skills||[]).map(s=>({name:s.name,purpose:s.purpose})),assignment:m.assignment,projectIds:m.projectIds}]:[];});
  projects=recorded.projects.filter(p=>space.projectIds.includes(p.id)).map(p=>({id:p.id,name:p.name,type:p.type||'local',environment:p.environment?.kind||null}));
  sources=host.sourcesFor({...state,requests:state.requests.filter(r=>r.createdAt<=request.createdAt)},space.id,host.rootOf(state.requests,request));
  documents=request.documentRefs.map(ref=>{const d=state.documents.find(d=>d.id===ref.id),v=d.versions.find(v=>v.revision===ref.revision);return {id:d.id,title:v.title||d.title,revision:v.revision,hash:v.hash,state:d.state,body:v.body};});
 }
 const legacy=process.argv.includes('--legacy');
 const rules=legacy?execFileSync('git',['show','HEAD:core/workforce/skills/discussion-host/SKILL.md'],{encoding:'utf8'}):host.rules;
 const guide=legacy?execFileSync('git',['show','HEAD:core/workforce/skills/task-creation-guide/SKILL.md'],{encoding:'utf8'}):require('../../core/workforce/task-guide.cjs').rules;
 const schema=structuredClone(host.schema);if(legacy)schema.properties.action.enum=['reply','ask','delegate','ready'];
 const job={prompt:rules+'\n'+guide,input:{locale:'zh-CN',purpose:space.purpose,roster,projects,sources,documents,selectedSkills:(request.composer?.skills||[]).map(({id,name,description,body})=>({id,name,description,instructions:body})),brief:request.host.brief,usedExperts:[],remainingDelegations:4},outputSchema:schema,maxOutputTokens:8192,repairInvalidOutput:true};
 const original=global.fetch;const attempts=[];
 global.fetch=async(...args)=>{const response=await original(...args);attempts.push({wire:await response.clone().text(),format:JSON.parse(args[1].body).response_format});return response;};
 const start=Date.now();let result,error;
 try{result=await generate(config,job,AbortSignal.timeout(180000),()=>{});host.checked(result,sources,roster,new Set(),4);}catch(e){error={message:e.message,diagnostics:e.diagnostics};}
 for(let i=0;i<attempts.length;i++)await fs.writeFile(path.join(root,'response-'+i+'.txt'),attempts[i].wire,{mode:0o600});
 await fs.writeFile(path.join(root,'job.json'),JSON.stringify(job),{mode:0o600});
 const metadata={requestId:request.id,model:config.model,legacy,recorded:process.argv.includes('--recorded'),elapsedMs:Date.now()-start,error,action:result?.action,attempts:attempts.map(a=>({wireBytes:Buffer.byteLength(a.wire),format:a.format}))};
 await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(metadata,null,2),{mode:0o600});
 console.log(JSON.stringify({...metadata,evidence:root}));app.exit(error?1:0);
}).catch(e=>{console.error(e.message);app.exit(1);});
