const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService}=require('../core/workforce/spaces.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-plans-')),db=new Database(root);await db.call('ready');await fs.mkdir(path.join(root,'a'));await fs.mkdir(path.join(root,'b'));
 const projects=[{id:'a',path:path.join(root,'a')},{id:'b',path:path.join(root,'b')},{id:'alias',path:path.join(root,'a')}],runtime={runs:[],async start(input,context){const run={id:randomUUID(),status:'running',projectId:input.projectId,employee:{id:input.employeeId},cwd:projects.find(p=>p.id===input.projectId)?.path,workEvidence:[{output:await require('../core/workforce/evidence.cjs').capture(projects.find(p=>p.id===input.projectId)?.path||root)}],collaboration:context.collaboration,messages:[],tools:[]};this.runs.push(run);return run;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
 const service=new SpaceService({directory:root,database:db,workspace:{read:async()=>({projects})},workforce:{read:async()=>({employees:[{id:'one'},{id:'two'}]})},runtime});await service.initialize();clearInterval(service.plans.timer);
 const space=await service.save({value:{name:'Multi-repo',purpose:'Verify delivery',projectIds:['a','b','alias'],members:['one','two'].map(employeeId=>({employeeId,assignment:'Design and build',projectIds:['a','b','alias']}))}});
 t.after(async()=>{await service.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});return {service,db,runtime,space};}
const unit=(id,projectId,dependencies=[])=>({id,title:id,ownerId:'one',mode:'work',projectId,instruction:'Implement this unit',dependencies,documentRefs:[],deliverables:'Code and checks',acceptance:'Correct tests with evidence'});
const control=(service,plan,action,packageId)=>service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action,packageId},{});
async function accept(f,plan,packageId){const r=f.runtime.runs.find(r=>r.collaboration.requestId===plan.packages.find(p=>p.id===packageId).attempts.at(-1).requestId);r.status='completed';r.messages=[{role:'assistant',text:'Produced implementation'}];r.tools=[{name:'exec',output:'tests passed',exitCode:0}];await f.service.plans.reconcile(plan.id);const current=(await f.service.read()).plans[0],p=current.packages.find(p=>p.id===packageId),a=p.attempts.at(-1);await f.service.reviewPlan({planId:plan.id,packageId,attemptId:a.id,resultHash:a.resultHash,note:'Reviewed the recorded test and diff',accepted:true});return current;}
test('LangGraph waits for accepted dependencies, then runs independent projects; a retry preserves other work',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Delivery',goal:'Contract then parallel modules',packages:[unit('contract','a'),unit('go','a',['contract']),unit('python','b',['contract'])]}});
 await control(f.service,plan,'start');assert.equal(f.runtime.runs.length,1);
 let current=(await f.service.read()).plans[0];assert.equal(current.packages.find(p=>p.id==='go').reason,'等待上游工作包验收');
 await accept(f,current,'contract');await f.service.plans.pulse(plan.id);assert.equal(f.runtime.runs.length,3);
 // Independent packages start concurrently; bind the failure to its request, not array order.
 const goRequest=(await f.service.read()).plans[0].packages.find(p=>p.id==='go').attempts.at(-1).requestId;
 const go=f.runtime.runs.find(r=>r.collaboration.requestId===goRequest);assert.ok(go);go.status='failed';go.error='Check failed';await f.service.plans.reconcile(plan.id);current=(await f.service.read()).plans[0];
 await control(f.service,current,'retry','go');assert.equal(f.runtime.runs.length,4);current=(await f.service.read()).plans[0];assert.equal(current.packages.find(p=>p.id==='go').attempts.length,2);assert.equal(current.packages.find(p=>p.id==='contract').status,'accepted');
 assert.ok(await f.db.call('readSetting',{key:'workforce.graph.v1'}));
});
test('alias paths serialize, cycles fail, and restart never replays unknown side effects',async t=>{
 const f=await fixture(t);await assert.rejects(f.service.savePlan({spaceId:f.space.id,value:{name:'Cycle',goal:'Test',packages:[unit('a','a',['b']),unit('b','b',['a'])]}}),/成环/);
 const plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Aliased directories',goal:'Serialize writes',packages:[unit('first','a'),unit('second','alias')]}});
 await control(f.service,plan,'start');assert.equal(f.runtime.runs.length,1);
 await f.service.plans.initialize();clearInterval(f.service.plans.timer);assert.equal((await f.service.read()).plans[0].status,'paused');assert.equal(f.runtime.runs.length,1);
 await control(f.service,plan,'pause');assert.equal(f.runtime.runs[0].status,'interrupted');assert.equal((await f.service.read()).plans[0].status,'paused');
});
test('finishing execution releases the directory for an independent task, but never unlocks dependent work before acceptance',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Repair workflow',goal:'Contract and environment, then implementation',packages:[unit('contract','a'),unit('environment','alias'),unit('api','b',['contract','environment']),unit('web','b',['contract'])]}});
 await control(f.service,plan,'start');assert.equal(f.runtime.runs.length,1);
 let current=(await f.service.read()).plans[0];assert.equal(current.packages[1].reason,'等待同一工作目录中的任务结束');
 f.runtime.runs[0].status='completed';await f.service.plans.pulse(plan.id);
 current=(await f.service.read()).plans[0];assert.equal(current.packages[0].status,'review');assert.equal(current.packages[0].acceptance,undefined);assert.equal(f.runtime.runs.length,2);
 assert.equal(current.packages[1].attempts.length,1);
 f.runtime.runs[1].status='waiting';await f.service.plans.pulse(plan.id);
 current=(await f.service.read()).plans[0];assert.equal(current.packages[1].status,'waiting');
 for(const pkg of current.packages.slice(2)){assert.equal(pkg.status,'pending');assert.equal(pkg.reason,'等待上游工作包验收');assert.equal(pkg.attempts.length,0);}
 const contract=current.packages[0],attempt=contract.attempts[0];
 await f.service.reviewPlan({planId:plan.id,packageId:contract.id,attemptId:attempt.id,resultHash:attempt.resultHash,note:'Reviewed contract output',accepted:true});await f.service.plans.pulse(plan.id);
 current=(await f.service.read()).plans[0];assert.equal(current.packages[2].attempts.length,0);assert.equal(current.packages[3].attempts.length,1);
 assert.equal(f.runtime.runs.length,3);
});
test('dispatch rechecks prerequisite acceptance after eligibility was computed',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Dispatch gate',goal:'Require current acceptance',packages:[unit('contract','a'),unit('implementation','b',['contract'])]}});
 await control(f.service,plan,'start');await accept(f,(await f.service.read()).plans[0],'contract');
 assert.deepEqual(await f.service.plans.eligible(plan.id),['implementation']);
 for(const status of ['review','rejected','failed','interrupted','pending','stale']){
  await f.service.change(s=>{s.plans[0].packages[0].status=status;});
  await f.service.plans.dispatch(plan.id,'implementation');
  assert.equal((await f.service.read()).plans[0].packages[1].attempts.length,0,status);assert.equal(f.runtime.runs.length,1,status);
 }
 await f.service.change(s=>{Object.assign(s.plans[0].packages[0],{status:'accepted',stale:true});});
 await f.service.plans.dispatch(plan.id,'implementation');assert.equal(f.runtime.runs.length,1);
 await f.service.change(s=>{s.plans[0].packages[0].stale=false;});
 await f.service.plans.dispatch(plan.id,'implementation');assert.equal(f.runtime.runs.length,2);
 const current=(await f.service.read()).plans[0];assert.equal(current.packages[1].reason,'');assert.deepEqual(current.packages[1].attempts[0].dependencies,[{id:'contract',acceptance:current.packages[0].acceptance}]);
});
test('a revised adopted contract invalidates results and downstream acceptance',async t=>{
 const f=await fixture(t),doc=await f.service.saveDocument({spaceId:f.space.id,title:'Contract',body:'Version 1',adopted:true});
 const node=unit('contract','a');node.documentRefs=[{id:doc.id,revision:1,hash:doc.hash}];const plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Versioned work',goal:'Freeze evidence',packages:[node,unit('downstream','b',['contract'])]}});
 await control(f.service,plan,'start');await accept(f,(await f.service.read()).plans[0],'contract');
 await f.service.saveDocument({id:doc.id,spaceId:f.space.id,expectedRevision:1,title:'Contract',body:'Version 2',adopted:true});
 await f.service.plans.pulse(plan.id);const current=(await f.service.read()).plans[0];assert.equal(current.packages[0].status,'stale');assert.equal(current.packages[1].stale,true);assert.equal(f.runtime.runs.length,1);assert.equal(f.runtime.runs[0].collaboration.documents[0].revision,1);
});

test('acceptance rejects a changed workspace even when the model result is unchanged',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Evidence',goal:'Bind acceptance to files',packages:[unit('one','a')]}});
 await control(f.service,plan,'start');const run=f.runtime.runs[0];run.status='completed';
 await f.service.plans.reconcile(plan.id);const p=(await f.service.read()).plans[0].packages[0],attempt=p.attempts[0];
 await fs.writeFile(path.join(run.cwd,'changed.txt'),'Changed after execution');
 await assert.rejects(f.service.reviewPlan({planId:plan.id,packageId:p.id,attemptId:attempt.id,resultHash:attempt.resultHash,accepted:true,note:'Review'}),/工作目录.*变化/);
 assert.equal((await f.service.read()).plans[0].packages[0].status,'review');
});

test('AI plan suggestions cannot invent project scope or mutate a saved plan',async t=>{
 const f=await fixture(t);f.service.workforce.providers={secret:async()=>({})};
 const doc=await f.service.saveDocument({spaceId:f.space.id,title:'Boundary',body:'Use an explicit contract',adopted:true});
 f.service.generatePlan=async(_config,request)=>{assert.equal(request.input.documents[0].body,'Use an explicit contract');assert.ok(request.input.projects.every(p=>!p.path));return {name:'Suggested plan',packages:[{...unit('first','a'),documentIds:[doc.id]}]};};
 const suggestion=await f.service.suggestPlan({spaceId:f.space.id,goal:'Build the contract',documentIds:[doc.id]});
 assert.equal(suggestion.value.packages[0].documentRefs[0].revision,1);assert.equal((await f.service.read()).plans.length,0);
 f.service.generatePlan=async()=>({name:'Invalid scope',packages:[{...unit('first','outside'),documentIds:[]}]});
 await assert.rejects(f.service.suggestPlan({spaceId:f.space.id,goal:'Build',documentIds:[]}),/未分配/);
});
test('node permission applies only to its next execution and validates the mode',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Permission scope',goal:'Keep executions isolated',packages:[unit('first','a'),unit('second','b')]}});
 const update=permission=>f.service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'permission',packageId:'first',permission},{});
 await assert.rejects(update('invalid'),/权限模式无效/);
 await update('full');let current=(await f.service.read()).plans[0];assert.equal(current.packages[0].permission,'full');assert.equal(current.packages[1].permission,undefined);
 const calls=[];const original=f.runtime.start.bind(f.runtime);f.runtime.start=async(input,context)=>{calls.push(input);return original(input,context);};
 await control(f.service,current,'start');assert.equal(calls[0].permission,'full');assert.equal(calls[1].permission,'default');
 await update('default');assert.equal(calls[0].permission,'full');assert.equal(f.runtime.runs.length,2);
});
test('continuing a paused plan resumes only pause-interrupted work and preserves failed nodes',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Pause semantics',goal:'Resume precisely',packages:[unit('first','a'),unit('second','b')]}});
 await control(f.service,plan,'start');f.runtime.runs.find(r=>r.projectId==='b').status='failed';await f.service.plans.reconcile(plan.id);
 await control(f.service,plan,'pause');let current=(await f.service.read()).plans[0];assert.equal(current.packages[0].stopReason,'plan-pause');assert.equal(current.packages[0].status,'interrupted');
 await control(f.service,current,'resume');current=(await f.service.read()).plans[0];assert.equal(f.runtime.runs.length,3);assert.equal(current.packages[0].attempts.length,2);assert.equal(current.packages[1].status,'failed');assert.equal(current.packages[1].attempts.length,1);
});
test('plan permission inherits without stopping active work and node overrides survive',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Inheritance',goal:'No implicit stop',packages:[unit('first','a'),unit('second','b')]}});
 const change=(permission,packageId)=>f.service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'permission',permission,packageId},{});
 await change('default','second');await change('full');const calls=[],original=f.runtime.start.bind(f.runtime);f.runtime.start=async(input,context)=>{calls.push(input);return original(input,context);};
 await control(f.service,plan,'start');assert.equal(calls[0].permission,'full');assert.equal(calls[1].permission,'default');
 let stopped=0;f.runtime.stop=async()=>{stopped++;};await change('default');assert.equal(stopped,0);
 await change('inherit','second');assert.equal((await f.service.read()).plans[0].packages[1].permission,undefined);
});
test('live SSH permission changes do not grant existing requests or change local active policy',async t=>{
 const f=await fixture(t),plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Live permission',goal:'Apply truthfully',packages:[unit('remote','a'),unit('local','b')]}});
 await control(f.service,plan,'start');const remote=f.runtime.runs.find(r=>r.projectId==='a'),local=f.runtime.runs.find(r=>r.projectId==='b');remote.remote={path:'/remote'};remote.permission=local.permission='default';remote.approvals=[{id:'pending'}];f.runtime.changed=()=>{};f.runtime.persist=async()=>{};
 await f.service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'permission',permission:'full'},{});
 assert.equal(remote.permission,'full');assert.equal(local.permission,'default');assert.deepEqual(remote.approvals,[{id:'pending'}]);assert.equal(remote.status,'running');
});
test('failed node retry uses the selected model without changing other nodes',async t=>{
 const f=await fixture(t),inputs=[],start=f.runtime.start.bind(f.runtime);f.runtime.start=async(input,context)=>{inputs.push(input);return start(input,context);};
 const plan=await f.service.savePlan({spaceId:f.space.id,value:{name:'Recovery',goal:'Recover provider outage',packages:[unit('first','a'),unit('second','b',['first'])]}});
 await control(f.service,plan,'start');f.runtime.runs[0].status='failed';await f.service.plans.reconcile(plan.id);
 const current=(await f.service.read()).plans[0];await f.service.controlPlan({id:plan.id,expectedRevision:current.revision,commandId:randomUUID(),action:'retry',packageId:'first',modelChoice:{providerId:'backup',model:'working-model'}},{});
 assert.equal(inputs.at(-1).providerId,'backup');assert.equal(inputs.at(-1).model,'working-model');
 const saved=(await f.service.read()).plans[0];assert.equal(saved.packages[1].modelChoice,undefined);assert.equal(saved.packages[0].attempts.length,2);
});
