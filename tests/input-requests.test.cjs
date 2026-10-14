const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {ChatInputs}=require('../core/forms/chat-inputs.cjs');
const {InputRequests}=require('../core/inputs/service.cjs');
const definition=(key='one')=>({requestKey:key,originKey:'model',reason:'Plan travel',locale:'en',template:{version:1,id:'travel',title:'Travel',fields:[{name:'city',type:'text',label:'City',required:true},{name:'budget',type:'money',currency:'CNY',label:'Budget'}],submit:{kind:'chat',label:'Send'}}});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'input-request-'));let database=new Database(root),valid=true;
 const runtime={runs:[{id:'run',projectId:null,status:'completed',messages:[],tools:[]},{id:'other',projectId:null,status:'completed',messages:[],tools:[]}]};
 await database.call('saveRuns',runtime.runs);
 const queue=new ChatInputs({database,runtime,publish:()=>{},validate:async()=>{}});queue.tick=()=>{};
 const service=new InputRequests({database,runtime,chatInputs:queue,publish:()=>{},validateSource:async()=>valid});
 t.after(async()=>{await queue.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,service,queue,runtime,get database(){return database;},invalidate:()=>{valid=false;},reenable:()=>{valid=true;},restart:async()=>{await database.close();database=new Database(root);queue.database=database;service.database=database;}};
}
const action=(r,method,values,id=method)=>({runId:r.runId,requestId:r.id,action:method,expectedRevision:r.revision,clientMutationId:id,...(values?{values}:{})});
test('submit and continue atomically releases only the new answer and rolls back on invalid input',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());
 await f.queue.enqueue({id:'older',runId:'run',flowId:'old',text:'Old answer'});await f.queue.pause('run');
 await assert.rejects(f.service.action({...action(r,'submit',{city:''}),resume:{expectedPolicyGeneration:1}}),{code:'INVALID_ARGUMENT'});
 assert.equal((await f.queue.snapshot('run')).policy.paused,true);
 const cmd={...action(r,'submit',{city:'Shanghai'}),resume:{expectedPolicyGeneration:1}};
 const saved=await f.service.action(cmd);assert.deepEqual(await f.service.action(cmd),saved);
 const snapshot=await f.queue.snapshot('run');assert.equal(snapshot.policy.paused,false);assert.equal(snapshot.deliveries.find(d=>d.id==='older').held,true);assert.equal(snapshot.deliveries.find(d=>d.id===saved.deliveryId).held,undefined);
});
test('dynamic definition persists with model identity and submits one structured answer',async t=>{
 const f=await fixture(t),input=require('../specs/extensions/examples/user-input/travel.json');
 const r=await f.service.createDynamic('run',input);assert.equal(r.originKey,'model');assert.equal(r.draft.days,3);
 assert.equal((await f.service.createDynamic('run',input)).id,r.id);
 assert.throws(()=>f.service.createDynamic('run',{...input,originKey:'extension:demo'}),{code:'INVALID_ARGUMENT'});
 await f.restart();assert.equal((await f.service.list('run'))[0].template.title,input.source.definition.title);
 const saved=await f.service.action(action(r,'submit',{...r.draft,destination:'beijing',date:'2026-11-01',budget:'1250.50'}));
 assert.equal(saved.answer.values.destination,'beijing');assert.equal(saved.answer.values.budget,'1250.50');
 assert.equal((await f.queue.snapshot('run')).deliveries.length,1);
});
test('create is durable, source-scoped idempotent and caps pending requests',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());assert.equal(r.state,'pending');
 assert.equal((await f.service.create('run',definition())).id,r.id);
 await assert.rejects(f.service.create('run',{...definition(),reason:'Different'}),{code:'CONFLICT'});
 const other=await f.service.create('other',definition());assert.notEqual(other.id,r.id);
 for(let i=0;i<4;i++)await f.service.create('run',definition('q'+i));
 await assert.rejects(f.service.create('run',definition('overflow')),{code:'QUOTA_EXCEEDED'});
 await f.restart();assert.equal((await f.service.list('run')).length,5);assert.equal((await f.service.create('run',definition())).id,r.id);
});
test('beginEdit and drafts use CAS and retain invalid unfinished input across restart',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());
 const results=await Promise.allSettled([f.service.action(action(r,'beginEdit',undefined,'window1')),f.service.action(action(r,'beginEdit',undefined,'window2'))]);
 assert.equal(results.filter(v=>v.status==='fulfilled').length,1);let edited=results.find(v=>v.status==='fulfilled').value;
 const cmd=action(edited,'saveDraft',{city:'',budget:'not a number'});edited=await f.service.action(cmd);assert.equal(edited.draftTouched,true);
 assert.deepEqual(await f.service.action(cmd),edited);await f.restart();assert.deepEqual((await f.service.list('run'))[0].draft,{city:'',budget:'not a number'});
 await assert.rejects(f.service.action(action(edited,'submit',edited.draft)),{code:'INVALID_ARGUMENT'});
 assert.equal((await f.service.list('run'))[0].state,'pending');
});
test('concurrent submit freezes one answer and one outbox, repeat success remains idempotent',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());
 const cmd=action(r,'submit',{city:'Shanghai',budget:'12.30'});
 const [first,repeat]=await Promise.all([f.service.action(cmd),f.service.action(cmd)]);assert.deepEqual(first,repeat);
 assert.equal(first.answer.values.budget,'12.30');assert.equal(first.answer.source,'form');assert.equal(first.state,'answered');
 const {deliveries}=await f.queue.snapshot('run');assert.equal(deliveries.length,1);assert.equal(deliveries[0].requestId,r.id);
 await f.restart();assert.deepEqual(await f.service.action(cmd),first);
 await assert.rejects(f.service.action({...cmd,values:{city:'Beijing'}}),{code:'CONFLICT'});
 await assert.rejects(f.service.action({...cmd,clientMutationId:'different'}),{code:'CONFLICT'});
});
test('paused submission and full outbox leave answer and revision untouched',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition()),cmd=action(r,'submit',{city:'Shanghai'});
 await f.queue.pause('run');await assert.rejects(f.service.action(cmd),{code:'INTERACTION_REQUIRED'});
 assert.equal((await f.service.list('run'))[0].revision,0);assert.equal((await f.service.list('run'))[0].answer,undefined);
 await f.queue.resume({runId:'run',clientMutationId:'resume',expectedPolicyGeneration:1,deliveryIds:[]});
 for(let i=0;i<32;i++)await f.queue.enqueue({id:'full'+i,runId:'run',text:'Hello',flowId:'legacy'});
 await assert.rejects(f.service.action(cmd),{code:'QUOTA_EXCEEDED'});
 assert.equal((await f.service.list('run'))[0].state,'pending');assert.equal((await f.service.list('run'))[0].answer,undefined);
});
test('source invalidation is permanent; archived or foreign chats cannot mutate requests',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());
 await assert.rejects(f.service.action({...action(r,'beginEdit'),runId:'other'}),{code:'NOT_FOUND'});
 f.runtime.runs[0].archivedAt='now';await f.database.call('saveRuns',f.runtime.runs);
 await assert.rejects(f.service.action(action(r,'beginEdit')),{code:'FORBIDDEN'});assert.equal((await f.service.list('run'))[0].state,'pending');
 delete f.runtime.runs[0].archivedAt;await f.database.call('saveRuns',f.runtime.runs);f.invalidate();assert.equal((await f.service.list('run'))[0].state,'expired');f.reenable();assert.equal((await f.service.list('run'))[0].state,'expired');
 await assert.rejects(f.service.action(action(r,'beginEdit')),{code:'FORBIDDEN'});
});
test('delete cleans requests and mutation receipts; database protects stale runtime resurrection',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());await f.database.call('saveRuns',[f.runtime.runs[1]]);
 assert.deepEqual(await f.database.call('inputRequest',{action:'list',runId:'run'}),[]);
 await assert.rejects(f.service.action(action(r,'beginEdit')),{code:'NOT_FOUND'});
 await assert.rejects(f.service.create('run',definition()),{code:'NOT_FOUND'});
});
test('source loss after acceptance blocks later queue dispatch without rewriting answer',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition()),saved=await f.service.action(action(r,'submit',{city:'Shanghai'}));
 const item=await f.queue.get(saved.deliveryId);await f.service.validateInput(item);f.invalidate();await assert.rejects(f.service.validateInput(item),{code:'FORBIDDEN'});
 const request=(await f.service.list('run'))[0];assert.equal(request.state,'answered');assert.equal(request.sourceInvalid,true);assert.equal(request.answer.values.city,'Shanghai');
});
test('explicit source disable expires pending and accepted records before reenabling',async t=>{
 const f=await fixture(t);const r=await f.service.create('run',{...definition(),originKey:'extension:demo',sourceKey:'extension:demo:travel',sourceRevision:'v1',sourceDigest:'hash'});
 await f.service.invalidateOrigin('extension:demo');assert.equal((await f.service.list('run'))[0].state,'expired');
 await assert.rejects(f.service.action(action(r,'submit',{city:'A'})),{code:'FORBIDDEN'});
 const next=await f.service.create('run',{...definition('next'),originKey:'extension:demo'});assert.equal(next.state,'pending');assert.notEqual(r.id,next.id);
});
test('total request history limit never silently evicts old records',async t=>{
 const f=await fixture(t);
 for(let i=0;i<100;i++){const r=await f.service.create('run',definition('request'+i));await f.database.call('inputRequest',{action:'expire',runId:'run',id:r.id});}
 await assert.rejects(f.service.create('run',definition('overflow')),{code:'QUOTA_EXCEEDED'});assert.equal((await f.service.list('run')).length,100);
});
test('version 9 database upgrades in place and keeps existing chats and form queue',async t=>{
 const f=await fixture(t);await f.queue.enqueue({id:'old-form',runId:'run',flowId:'form',text:'Old answer'});await f.database.close();
 const {DatabaseSync}=require('node:sqlite'),legacy=new DatabaseSync(path.join(f.root,'atelier.sqlite'));
 legacy.exec('DROP TABLE input_requests; DROP TABLE input_mutations; PRAGMA user_version=9');legacy.close();
 await f.restart();assert.equal((await f.database.call('readRuns')).length,2);assert.equal((await f.queue.get('old-form')).text,'Old answer');
 assert.equal((await f.service.create('run',definition())).state,'pending');
});
test('cancel persists pending drafts and held notifications across restart',async t=>{
 const f=await fixture(t);let r=await f.service.create('run',definition());r=await f.service.action(action(r,'saveDraft',{city:'Saved draft'}));
 const cmd=action(r,'cancel');const saved=await f.service.action(cmd);await f.restart();assert.deepEqual(await f.service.action(cmd),saved);assert.equal((await f.service.list('run'))[0].draft.city,'Saved draft');
 const [item]=(await f.queue.snapshot('run')).deliveries;await f.service.validateInput(item);assert.equal(item.held,true);
 await f.queue.resume({runId:'run',clientMutationId:'continue',expectedPolicyGeneration:0,deliveryIds:[item.id]});assert.equal((await f.queue.get(item.id)).allowIdle,true);
});
test('unknown reconciliation is scoped and read-only, never sends or requeues',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition()),saved=await f.service.action(action(r,'submit',{city:'Shanghai'}));
 await f.queue.update(saved.deliveryId,'dispatching');await f.queue.update(saved.deliveryId,'unknown');let reads=0;f.runtime.hasFormInput=async()=>{reads++;return false;};
 const cmd={action:'reconcile',runId:'run',deliveryId:saved.deliveryId};assert.equal((await f.service.reconcile(cmd)).state,'unknown');assert.equal(reads,1);
 await assert.rejects(f.service.reconcile({...cmd,runId:'other'}),{code:'NOT_FOUND'});assert.equal(reads,1);
 f.runtime.hasFormInput=async()=>true;assert.equal((await f.service.reconcile(cmd)).state,'delivered');assert.equal((await f.queue.snapshot('run')).deliveries.length,1);
});
test('disabled origin permanently invalidates terminal notification delivery after reenabling',async t=>{
 const f=await fixture(t),r=await f.service.create('run',definition());await f.service.action(action(r,'cancel'));
 const [item]=(await f.queue.snapshot('run')).deliveries;await f.service.invalidateOrigin('model');f.reenable();await assert.rejects(f.service.validateInput(item),{code:'FORBIDDEN'});
 assert.equal((await f.service.list('run'))[0].state,'cancelled');
});
