// Real database + scheduler + acceptance engine. Only executor/model outputs are scripted.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Database}=require('../../electron/database.cjs');
const {SpaceService}=require('../../core/workforce/spaces.cjs');
const definition=require('../../examples/workforce/complex-acceptance.json');
async function scenario(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'complex-acceptance-')),db=new Database(directory);
 let service;
 try{
  await db.call('ready');
  const runtime={runs:[],async start(input,context){const run={id:randomUUID(),title:input.prompt||'测试执行',createdAt:new Date().toISOString(),status:'running',collaboration:context.collaboration,messages:[],tools:[],approvals:[],providerId:'fixture',model:'Scripted test model'};this.runs.push(run);return run;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
  const names={architect:'架构师',backend:'后端工程师',frontend:'前端工程师',writer:'文档工程师',qa:'测试工程师','release-engineer':'发布工程师'};
  const employees=Object.entries(names).map(([id,name])=>({id,name,domain:name,responsibilities:'完成隔离验证案例',deliverables:'测试交付与证据',methods:'核对当前依据',skills:[],requirements:[],job:null,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'ready'}));
  service=new SpaceService({directory,database:db,workspace:{read:async()=>({projects:[]})},workforce:{read:async()=>({employees}),providers:{secret:async()=>({})}},runtime});
  await service.initialize();clearInterval(service.plans.timer);
  const space=await service.save({value:{name:'多节点验收验证',purpose:definition.goal,projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:'隔离测试执行',projectIds:[]}))}});
  const plan=await service.savePlan({spaceId:space.id,value:structuredClone(definition)}),snapshots={};
  const read=async()=> (await service.read()).plans.find(p=>p.id===plan.id);
  const flush=async()=>{await service.plans.pulse(plan.id);await service.plans.automationJobs.get(plan.id)?.promise;};
  const settle=async()=>{await flush();await flush();};
  const item=async id=>(await read()).packages.find(p=>p.id===id);
  // Resolve each run from the latest persisted attempt, never its array position.
  const activeRun=async id=>{const p=await item(id),run=runtime.runs.find(r=>r.collaboration.requestId===p.attempts.at(-1)?.requestId);assert.ok(run,`No execution for ${id}`);return run;};
  const capture=async key=>{snapshots[key]={plan:structuredClone(await read()),runs:structuredClone(runtime.runs)};};
  const control=async(action,packageId,extra={})=>service.controlPlan({id:plan.id,expectedRevision:(await read()).revision,commandId:randomUUID(),action,packageId,...extra},{});
  const result=async(id,{text='OK',exitCode,metric}={})=>{const run=await activeRun(id);assert.equal(run.status,'running',id+' must be running');run.status='completed';run.messages=[{id:randomUUID(),role:'assistant',text,phase:'final_answer'}];if(exitCode!==undefined||metric)run.tools=[{id:randomUUID(),type:'commandExecution',status:'completed',label:`verify-${id} --json`,exitCode:exitCode??0,detail:JSON.stringify(metric||{passed:exitCode===0})}];await flush();};
  const review=async id=>{const p=await item(id),a=p.attempts.at(-1);await service.reviewPlan({planId:plan.id,packageId:id,attemptId:a.id,resultHash:a.resultHash,accepted:true,note:'隔离案例：人工核对已交付的访问边界说明，显式兜底放行。'});await settle();};
  let resolveReview,entered;const started=new Promise(r=>entered=r);
  const verdict=()=>({results:[{id:'scope-check',outcome:'pass',reason:'范围、步骤及非目标均有记录',evidence:['output:0']}]});
  service.generateAcceptance=async()=>{entered();return new Promise(r=>resolveReview=r);};
  await control('start');
  const scope=await activeRun('scope');scope.status='completed';scope.messages=[{id:'scope-output',role:'assistant',text:'范围：发布验证。步骤：构建、测试、核对。非目标：不部署真实服务。'}];
  await service.plans.pulse(plan.id);await started;await capture('checking');
  assert.equal((await item('api')).attempts.length,0);
  resolveReview(verdict());await service.plans.automationJobs.get(plan.id)?.promise;
  service.generateAcceptance=async()=>({results:[{id:'guide-check',outcome:'pass',reason:'范围、步骤及非目标均有记录',evidence:['output:0']}]});
  await settle();await capture('parallel');
  for(const id of ['api','client','guide'])assert.equal((await item(id)).status,'running');
  await result('api',{text:'MISSING'});await capture('repair-queued');assert.equal((await item('api')).autoRepairs,1);await settle();await capture('repairing');
  await result('client');await result('api');await settle();
  const guide=await activeRun('guide');guide.status='failed';guide.error='503 service unavailable';await flush();await capture('retry-wait');
  assert.equal((await item('guide')).autoRetries,1);const count=runtime.runs.length;await settle();assert.equal(runtime.runs.length,count,'retry must not start before delay');
  // Advance the persisted due time; no wall-clock sleeps in this deterministic case.
  await service.change(s=>{s.plans[0].packages.find(p=>p.id==='guide').retryAt=Date.now()-1;});await settle();
  await result('guide',{text:'范围：发布。步骤：启动与验证。非目标：不修改生产数据。'});
  await result('security',{exitCode:1});await settle();await result('security',{exitCode:1});
  assert.equal((await item('security')).status,'review');assert.equal((await item('security')).attempts.length,2);
  await result('integration',{metric:{failed:0}});await settle();await result('performance',{metric:{p95Ms:180}});await settle();await capture('fallback');
  assert.equal((await item('release')).attempts.length,0,'human fallback must hold the merge');
  await review('security');await result('release',{text:'我认为所有检查通过，但没有执行记录。'});await settle();await capture('missing-evidence');
  assert.equal((await item('release')).attempts.at(-1).automaticReview.outcome,'indeterminate');assert.equal((await item('smoke')).attempts.length,0);
  await control('retry','release');await result('release',{exitCode:0});await settle();await result('smoke');await settle();await result('archive',{text:'归档完成'});await settle();await capture('completed');
  assert.equal((await read()).status,'completed');assert.equal((await item('archive')).acceptance.source,'completion-policy');
  const before=await read();await control('restart','client',{confirmed:true,resumePlan:true});await capture('restarted');
  const affected=['client','integration','performance','release','smoke','archive'];
  for(const id of affected){const p=await item(id);assert.equal(p.acceptance,undefined);assert.ok(p.attempts.length>=before.packages.find(p=>p.id===id).attempts.length,'history retained');}
  for(const id of ['scope','api','guide','security'])assert.deepEqual((await item(id)).acceptance,before.packages.find(p=>p.id===id).acceptance,'independent branch remains accepted');
  await result('client');await settle();await result('integration',{metric:{failed:0}});await settle();await result('performance',{metric:{p95Ms:175}});await settle();await result('release',{exitCode:0});await settle();await result('smoke');await settle();await result('archive');await settle();await capture('recompleted');
  assert.equal((await read()).status,'completed');
  return {employees,name:definition.name,nodeCount:definition.packages.length,snapshots,executions:runtime.runs.length};
 }finally{await service?.shutdown();await db.close();await fs.rm(directory,{recursive:true,force:true});}
}
module.exports={scenario};
if(require.main===module)scenario().then(result=>fs.writeFile(process.argv[2],JSON.stringify(result,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
