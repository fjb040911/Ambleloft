const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{FormService}=require('../core/forms/service.cjs'),{ChatInputs}=require('../core/forms/chat-inputs.cjs'),{AgentRuntime}=require('../electron/agent-runtime.cjs');
const Repair=require('../core/ui/managed-repair.cjs'),U=require('../core/ui/template.cjs'),T=require('../core/forms/template.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
async function flush(queue){for(let i=0;i<3;i++){queue.tick();await queue.poll;await Promise.all(queue.inflight.values());}}
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'managed-repair-')),root=path.join(directory,'project');await fs.mkdir(path.join(root,'src'),{recursive:true});
 const files=[{kind:'report',path:'report.json',data:'{"reportId":"one"}'},{kind:'rules',path:'rules.json',data:'{"enabled":true}'},{kind:'source',path:'src/中文.ts',data:'const oldValue=1;'}];
 for(const file of files)await fs.writeFile(path.join(root,file.path),file.data);
 const baseline={version:1,scope:'enumerated-files',refs:files.map(({kind,path,data})=>({kind,path,sha256:hash(data)}))};
 const database=new Database(directory);await database.call('ready');const runs=['a','b'].map(id=>({id,projectId:'p',status:'completed',messages:[]}));
 const runtime={runs,contexts:new Map(),workspace:{read:async()=>({projects:[{id:'p',path:root}]})},sent:[],async deliverFormInput(item,{dispatch}){
  const run=runs.find(value=>value.id===item.runId),turnKey='turn-'+item.id;
  const sent=await dispatch({turnKey,mode:'start'},()=>{runtime.sent.push(item.id);run.status='running';runtime.contexts.set(run.id,{run,turnKey});return Promise.resolve();});await sent.receipt;
 }};
 const forms=new FormService({database,runtime,publish:()=>{}});
 const template=U.normalize({version:1,id:'repair',type:'collection',title:'Review',rows:{key:'id',fields:[{name:'id',label:'Issue',type:'text'}]},actions:[{id:'fix',label:'Fix',kind:'chat',scope:'all',prompt:'Repair selected issues, then review again',managedRepair:true}]});
 forms.ui.catalog=async()=>({entries:[{key:'review',template,digest:T.hash(template),revision:1}],errors:[]});
 const queue=new ChatInputs({database,runtime,validate:item=>forms.validateInput(item),publish:()=>{}});forms.chatInputs=queue;
 const present=(run=runs[0],value=baseline)=>forms.ui.present(run,'review-turn',{key:'review',data:{rows:[{id:'reused-issue-id'}],baseline:value,coverage:'Only enumerated files; additions are not watched'}});
 const submit=flow=>forms.ui.action({runId:flow.runId,id:flow.id,revision:flow.revision,action:'submit',actionId:'fix'},{});
 const finish=(run,status='completed')=>{const context=runtime.contexts.get(run.id);run.terminalTurnId=context.turnKey;run.status=status;runtime.contexts.delete(run.id);};
 t.after(async()=>{await queue.shutdown();await database.close();await fs.rm(directory,{recursive:true,force:true});});
 return {directory,root,files,baseline,database,runs,runtime,forms,template,queue,present,submit,finish};
}
test('managed template requires explicit safe report/rules/source refs; ordinary actions remain valid',async t=>{
 const f=await fixture(t);assert.deepEqual(U.validateData(f.template,{rows:[],baseline:f.baseline}),{});
 for(const baseline of [{...f.baseline,scope:'whole-project'},{...f.baseline,refs:f.baseline.refs.slice(1)},{...f.baseline,refs:[...f.baseline.refs,f.baseline.refs[0]]},{...f.baseline,refs:f.baseline.refs.map((ref,i)=>i?ref:{...ref,path:'../private'})}])assert.throws(()=>Repair.normalizeBaseline(baseline));
 assert.throws(()=>U.validateData(f.template,{rows:[]}),/baseline/);assert.throws(()=>U.normalize({...f.template,actions:[{...f.template.actions[0],managedRepair:false}]}));
 const ordinary=U.normalize({...f.template,actions:[{...f.template.actions[0],managedRepair:undefined}]});assert.deepEqual(U.validateData(ordinary,{rows:[]}),{});
});
test('host rejects stale bytes, symlinks and remote opt-in without sending',async t=>{
 const f=await fixture(t),flow=await f.present();await fs.writeFile(path.join(f.root,'rules.json'),'changed rules');await assert.rejects(f.submit(flow),{code:'MANAGED_REPAIR_CONFLICT'});assert.equal(f.runtime.sent.length,0);
 await fs.writeFile(path.join(f.root,'rules.json'),f.files[1].data);await fs.unlink(path.join(f.root,'src/中文.ts'));await fs.symlink(path.join(f.root,'rules.json'),path.join(f.root,'src/中文.ts'));await assert.rejects(f.present(),{code:'MANAGED_REPAIR_CONFLICT'});
 f.runtime.workspace.read=async()=>({projects:[{id:'p',type:'ssh',path:'/remote'}]});await assert.rejects(f.present(),{code:'UNSUPPORTED'});
});
test('same-instance dedup and cross-chat project lease lasts until actual turn termination, not delivery',async t=>{
 const f=await fixture(t);let first=await f.submit(await f.present());await flush(f.queue);first=(await f.forms.rows('a'))[0];await f.submit(first);await flush(f.queue);assert.equal(f.runtime.sent.length,1);
 const second=await f.submit(await f.present(f.runs[1]));await flush(f.queue);const secondId=second.submissions[0].id;assert.equal((await f.queue.get(secondId)).state,'queued');assert.equal(f.runtime.sent.length,1);
 const firstId=first.submissions[0].id;assert.equal((await f.queue.get(firstId)).state,'delivered');assert.equal((await f.queue.get(firstId)).repairStatus,'executing');
 f.finish(f.runs[0]);await flush(f.queue);assert.equal(f.runtime.sent.length,2);assert.equal((await f.queue.get(firstId)).repairStatus,'finished');assert.equal((await f.forms.ui.read(f.runs[1],secondId)).repairExecution.status,'executing');
});
test('queued work rechecks source after earlier repair; stale input does not start a model turn',async t=>{
 const f=await fixture(t);await f.submit(await f.present());await flush(f.queue);const second=await f.submit(await f.present(f.runs[1]));await flush(f.queue);
 await fs.writeFile(path.join(f.root,'src/中文.ts'),'new code from first repair');f.finish(f.runs[0]);await flush(f.queue);const item=await f.queue.get(second.submissions[0].id);
 assert.equal(item.state,'failed');assert.equal(item.repairStatus,'conflict');assert.equal(f.runtime.sent.length,1);assert.match(item.error,/重新审查/);
});
test('restart holds queued repairs and quarantines lease; only new verified review linked to old submission replaces uncertainty',async t=>{
 const f=await fixture(t),first=await f.submit(await f.present());await flush(f.queue);const firstId=first.submissions[0].id,second=await f.submit(await f.present(f.runs[1]));await flush(f.queue);
 await f.queue.shutdown();f.runtime.contexts.clear();f.runs[0].status='interrupted';const queue=new ChatInputs({database:f.database,runtime:f.runtime,validate:item=>f.forms.validateInput(item),publish:()=>{}});f.forms.chatInputs=queue;
 try{
  await queue.initialize();await flush(queue);assert.equal(f.runtime.sent.length,1);assert.equal((await queue.get(firstId)).repairStatus,'reviewRequired');assert.equal((await queue.get(second.submissions[0].id)).held,true);
  const policy=await queue.snapshot('b');await queue.resume({runId:'b',clientMutationId:'resume',expectedPolicyGeneration:policy.policy.generation,deliveryIds:[second.submissions[0].id]});await flush(queue);assert.equal(f.runtime.sent.length,1);assert.equal((await queue.get(second.submissions[0].id)).state,'failed');
  const report='{"reportId":"two","reviewedPreviousExecution":true}';await fs.writeFile(path.join(f.root,'report.json'),report);const baseline={...f.baseline,reviewOf:firstId,refs:f.baseline.refs.map(ref=>ref.kind==='report'?{...ref,sha256:hash(report)}:ref)};
  const fresh=await f.submit(await f.present(f.runs[1],baseline));await flush(queue);assert.equal(f.runtime.sent.length,2);assert.equal((await queue.get(firstId)).repairStatus,'reviewed');assert.equal((await queue.get(fresh.submissions[0].id)).repairStatus,'executing');
 }finally{await queue.shutdown();}
});
test('pause before dispatch prevents sending; managed runtime never steers an existing turn',async t=>{
 const f=await fixture(t);await f.queue.pause('a');const flow=await f.submit(await f.present());await flush(f.queue);assert.equal(f.runtime.sent.length,0);
 const snapshot=await f.queue.snapshot('a');await f.queue.resume({runId:'a',expectedPolicyGeneration:snapshot.policy.generation,clientMutationId:'continue',deliveryIds:[flow.submissions[0].id]});await flush(f.queue);assert.equal(f.runtime.sent.length,1);
 const runtime=new AgentRuntime({directory:f.directory,publish:()=>{}});runtime.runs=[f.runs[0]];runtime.contexts.set('active',{run:f.runs[0],rpc:{call:()=>assert.fail('must not steer')}});await assert.rejects(runtime.deliverFormInput({runId:'a',managedRepair:{}},{onDispatch:()=>assert.fail()}),{code:'BUSY'});
});
test('final baseline check prevents dispatch if files change while the runtime prepares a turn',async t=>{
 const f=await fixture(t);f.runtime.deliverFormInput=async(item,{dispatch})=>{await fs.writeFile(path.join(f.root,'rules.json'),'changed during preparation');await dispatch({turnKey:'never-sent',mode:'start'},()=>assert.fail('must not send stale repair'));};
 const flow=await f.submit(await f.present());await flush(f.queue);const item=await f.queue.get(flow.submissions[0].id);assert.equal(item.state,'failed');assert.equal(item.repairStatus,'conflict');assert.equal((await f.database.call('chatInput',{action:'repairLeases'})).length,0);
});
test('failed or interrupted turns retain uncertain project leases instead of letting queued repairs execute',async t=>{
 for(const status of ['failed','interrupted']){
  const f=await fixture(t),first=await f.submit(await f.present());await flush(f.queue);const second=await f.submit(await f.present(f.runs[1]));await flush(f.queue);f.finish(f.runs[0],status);await flush(f.queue);
  assert.equal(f.runtime.sent.length,1);assert.equal((await f.queue.get(first.submissions[0].id)).repairStatus,'reviewRequired');assert.equal((await f.queue.get(second.submissions[0].id)).repairStatus,'reviewRequired');assert.equal((await f.database.call('chatInput',{action:'repairLeases'}))[0].state,'unknown');
 }
});
test('fresh review must change report bytes; copying or reordering old report refs cannot clear uncertainty',async t=>{
 const f=await fixture(t),previous={id:'old',managedRepair:{baseline:f.baseline}},same={baseline:{...f.baseline,reviewOf:'old'}};assert.equal(Repair.canReplaceUnknown(same,previous),false);
 same.baseline.refs=same.baseline.refs.map(ref=>ref.kind==='report'?{...ref,path:'copied-report.json'}:ref).reverse();assert.equal(Repair.canReplaceUnknown(same,previous),false);
});
test('separate local projects may execute managed repairs concurrently',async t=>{
 const f=await fixture(t),other=path.join(f.directory,'other');await fs.cp(f.root,other,{recursive:true});f.runs[1].projectId='p2';f.runtime.workspace.read=async()=>({projects:[{id:'p',path:f.root},{id:'p2',path:other}]});
 await f.submit(await f.present());await f.submit(await f.present(f.runs[1]));await flush(f.queue);assert.equal(f.runtime.sent.length,2);assert.equal((await f.database.call('chatInput',{action:'repairLeases'})).length,2);
});
test('published UI schema accepts managed actions and all three baseline ref kinds without widening template keys',async t=>{
 const f=await fixture(t),Ajv=require('ajv/dist/2020'),schema=JSON.parse(await fs.readFile(path.join(__dirname,'../specs/extensions/contracts/ui.schema.json'),'utf8')),ajv=new Ajv({strict:false});ajv.addSchema(schema);const template=ajv.getSchema(schema.$id),baseline=ajv.compile({$ref:schema.$id+'#/$defs/managedRepairBaseline'}),data=ajv.compile({$ref:schema.$id+'#/$defs/data'});
 assert.equal(template(f.template),true,JSON.stringify(template.errors));assert.equal(baseline(f.baseline),true);assert.equal(data({rows:[],baseline:f.baseline}),true);assert.equal(baseline({...f.baseline,refs:f.baseline.refs.slice(1)}),false);assert.equal(template({...f.template,baseline:f.baseline}),false);assert.equal(template({...f.template,actions:[{...f.template.actions[0],managedRepair:false}]}),false);
});
test('dedup identity includes chosen issue IDs even when the action has no interpolation bindings',async t=>{
 const f=await fixture(t),template=U.normalize({...f.template,actions:[{...f.template.actions[0],scope:'row'}]});f.forms.ui.catalog=async()=>({entries:[{key:'review',template,digest:T.hash(template),revision:1}],errors:[]});
 let flow=await f.forms.ui.present(f.runs[0],'turn',{key:'review',data:{rows:[{id:'first'},{id:'second'}],baseline:f.baseline}});
 flow=await f.forms.ui.action({runId:flow.runId,id:flow.id,revision:flow.revision,action:'submit',actionId:'fix',rowKeys:['first']},{});await flush(f.queue);
 flow=await f.forms.ui.action({runId:flow.runId,id:flow.id,revision:flow.revision,action:'submit',actionId:'fix',rowKeys:['second']},{});
 assert.equal(flow.submissions.length,2);assert.deepEqual(flow.submissions.map(s=>s.payload.rowKeys),[['first'],['second']]);
});
test('later ordinary terminal marker cannot strand the old repair lease as permanently active',async t=>{
 const f=await fixture(t),first=await f.submit(await f.present());await flush(f.queue);const firstId=first.submissions[0].id;
 f.finish(f.runs[0]);f.runs[0].terminalTurnId='later-ordinary-turn';f.runtime.contexts.set('ordinary',{run:f.runs[0],turnKey:'later-ordinary-turn'});f.runs[0].status='running';await flush(f.queue);
 assert.equal((await f.database.call('chatInput',{action:'repairLeases'}))[0].state,'active');
 f.runtime.contexts.clear();f.runs[0].status='completed';await flush(f.queue);assert.equal((await f.database.call('chatInput',{action:'repairLeases'}))[0].state,'unknown');assert.equal((await f.queue.get(firstId)).repairStatus,'reviewRequired');
 const report='{"review":"after the later ordinary turn"}';await fs.writeFile(path.join(f.root,'report.json'),report);const baseline={...f.baseline,reviewOf:firstId,refs:f.baseline.refs.map(ref=>ref.kind==='report'?{...ref,sha256:hash(report)}:ref)};
 await f.submit(await f.present(f.runs[1],baseline));await flush(f.queue);assert.equal(f.runtime.sent.length,2);assert.equal((await f.queue.get(firstId)).repairStatus,'reviewed');
});
