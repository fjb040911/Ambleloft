const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService}=require('../core/workforce/spaces.cjs');
const {owned,ended}=require('../core/workforce/topic-task.cjs');

// Fresh SQLite state and production services/graph; only inference and runtime
// execution are controlled, so failure and delayed-stop boundaries are repeatable.
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'topic-serial-')),database=new Database(directory);await database.call('ready');
 const runtime={runs:[],async start(input,context){const r={id:randomUUID(),status:'running',employee:{id:input.employeeId},collaboration:context.collaboration,messages:[],tools:[]};this.runs.push(r);return r;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
 const options={directory,database,runtime,workspace:{read:async()=>({projects:[]})},workforce:{read:async()=>({employees:[{id:'expert',name:'Expert'}]}),providers:{secret:async()=>({})}}};
 let service;const reopen=async()=>{await service?.shutdown();service=new SpaceService(options);await service.initialize();clearInterval(service.plans.timer);return service;};await reopen();
 const space=await service.save({value:{name:'Clean serial test',projectIds:[],members:[{employeeId:'expert',assignment:'Check supplied data',projectIds:[]}]}});
 await service.change(s=>s.requests.push({id:'topic',spaceId:space.id,mode:'discussion',prompt:'Check data',documentRefs:[],participants:[],createdAt:'2026-11-06'}, {id:'reply',replyTo:'topic',spaceId:space.id,mode:'discussion',prompt:'Continue',documentRefs:[],participants:[],createdAt:'2026-11-07'}));
 t.after(async()=>{await service.shutdown();await database.close();await fs.rm(directory,{recursive:true,force:true});});
 const create=(extra={})=>service.createTaskDraft({spaceId:space.id,discussionId:'reply',commandId:randomUUID(),...extra});
 const read=async id=>(await service.read()).plans.find(p=>p.id===id);
 const control=async(id,action,extra={})=>service.controlPlan({id,expectedRevision:(await read(id)).revision,commandId:randomUUID(),action,...extra},{});
 const invariant=async()=>{const s=await service.read(),v=owned(s,space.id,'topic'),active=v.plans.filter(p=>!ended(p));assert.ok(active.length+v.drafts.filter(d=>!d.basePlanId).length<=1,'at most one unfinished top-level task');};
 const blocked=async()=>{await assert.rejects(create({newPlan:true}),/未结束任务/);await invariant();};
 const ready=async(d,count=2)=>{service.generateTaskGuide=async()=>({summary:'Ready',ready:true,questions:[],value:{name:'Serial task',goal:'Check data',packages:Array.from({length:count},(_,i)=>({id:'node-'+i,title:'Check '+i,ownerId:'expert',mode:'discussion',projectId:null,instruction:'Check provided data',dependencies:i?['node-'+(i-1)]:[],documentRefs:[],deliverables:'Verified answer',acceptance:'Answer matches input',verification:'Compare actual output with input',constraints:'No tools'}))}});return service.guideTask({id:d.id,expectedRevision:d.revision,requestId:randomUUID()});};
 const finish=async(id,node,accepted=true)=>{const p=(await read(id)).packages.find(p=>p.id===node),run=runtime.runs.find(r=>r.collaboration.requestId===p.attempts.at(-1).requestId);run.status='completed';run.messages=[{role:'assistant',text:'Verified answer'}];await service.plans.reconcile(id);const a=(await read(id)).packages.find(p=>p.id===node).attempts.at(-1);return service.reviewPlan({planId:id,packageId:node,attemptId:a.id,resultHash:a.resultHash,accepted,note:accepted?'Checked actual output':'Needs correction'});};
 return {get service(){return service;},runtime,space,create,read,control,invariant,blocked,ready,finish,reopen};
}

test('fresh topic: concurrent creation/confirmation, rejection, retry, acceptance and next task stay serial',async t=>{
 const f=await fixture(t),attempts=await Promise.allSettled(Array.from({length:12},()=>f.create({newPlan:true})));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);const d=attempts.find(r=>r.status==='fulfilled').value;await f.blocked();
 const ready=await f.ready(d);await f.blocked();assert.equal(f.runtime.runs.length,0);
 const confirmations=await Promise.all(Array.from({length:8},()=>f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision})));
 const id=confirmations[0].id;assert.equal(new Set(confirmations.map(p=>p.id)).size,1);await f.blocked();assert.equal(f.runtime.runs.length,0);
 await f.control(id,'start');await f.blocked();assert.equal(f.runtime.runs.length,1);
 await f.finish(id,'node-0',false);await f.service.plans.pulse(id);await f.blocked();assert.equal(f.runtime.runs.length,1);assert.equal((await f.read(id)).packages[1].attempts.length,0);
 await f.control(id,'retry',{packageId:'node-0'});await f.blocked();assert.equal(f.runtime.runs.length,2);
 await f.finish(id,'node-0');await f.service.plans.pulse(id);await f.blocked();assert.equal(f.runtime.runs.length,3);
 await f.finish(id,'node-1');await f.service.plans.pulse(id);assert.equal((await f.read(id)).status,'completed');
 const history=await f.read(id),next=await f.create({newPlan:true});assert.notEqual(next.id,d.id);assert.equal(next.basePlanId,undefined);await f.invariant();
 await assert.rejects(f.control(id,'resume'),/未结束任务/);assert.deepEqual(await f.read(id),history);
 assert.equal((await f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision})).id,id);await f.invariant();
});

test('pause, failure, waiting, restart and a delayed stop never release the topic early',async t=>{
 const f=await fixture(t),d=await f.ready(await f.create(),1),p=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 await f.control(p.id,'start');await f.control(p.id,'pause');assert.equal((await f.read(p.id)).status,'paused');await f.blocked();
 await f.control(p.id,'resume');let run=f.runtime.runs.at(-1);run.status='failed';run.error='Simulated provider outage';await f.service.plans.reconcile(p.id);await f.blocked();
 await f.control(p.id,'retry',{packageId:'node-0'});run=f.runtime.runs.at(-1);run.status='waiting';await f.service.plans.reconcile(p.id);await f.blocked();
 const runCount=f.runtime.runs.length;await f.reopen();assert.equal((await f.read(p.id)).status,'paused');assert.equal(f.runtime.runs.length,runCount);await f.blocked();
 f.runtime.stop=async id=>{f.runtime.runs.find(r=>r.id===id).status='stopping';};await f.control(p.id,'stop');
 assert.equal((await f.read(p.id)).status,'stopped');assert.equal((await f.read(p.id)).packages[0].status,'stopping');await f.blocked();
 run.status='interrupted';await f.service.plans.reconcile(p.id);const next=await f.create({newPlan:true});assert.ok(next.id);await f.invariant();
 await assert.rejects(f.control(p.id,'resume'),/未结束任务/);assert.equal(f.runtime.runs.length,runCount);
});

test('revision keeps the task identity and discarded drafts cannot return after persistence reload',async t=>{
 const f=await fixture(t),d=await f.ready(await f.create(),1),p=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 const revision=await f.create({basePlanId:p.id,basePlanRevision:p.revision});await f.invariant();await f.blocked();
 const ready=await f.ready(revision,1),updated=await f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision});assert.equal(updated.id,p.id);assert.equal((await f.service.read()).plans.length,1);
 await f.control(p.id,'stop');const next=await f.create({newPlan:true});await f.service.discardTaskDraft({id:next.id,expectedRevision:next.revision});await f.reopen();
 await assert.rejects(f.service.createGuidedPlan({id:next.id,expectedRevision:next.revision+1}),/已结束/);
 const third=await f.create({newPlan:true});assert.notEqual(third.id,next.id);await f.invariant();
});
