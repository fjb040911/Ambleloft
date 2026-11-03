const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService,spaceInstructions}=require('../core/workforce/spaces.cjs');
async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'task-guide-')),db=new Database(root);await db.call('ready');
 const runtime={runs:[],async start(input,ctx){const r={id:randomUUID(),status:'running',employee:{id:input.employeeId},collaboration:ctx.collaboration,messages:[],tools:[]};this.runs.push(r);return r;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
 const employees=[{id:'expert',name:'Expert'}],service=new SpaceService({directory:root,database:db,workspace:{read:async()=>({projects:[{id:'project',name:'Project',path:root}]})},workforce:{read:async()=>({employees}),providers:{secret:async()=>({})}},runtime});
 await service.initialize();clearInterval(service.plans.timer);
 const space=await service.save({value:{name:'Space',purpose:'Delivery',projectIds:['project'],members:[{employeeId:'expert',assignment:'Review designs',projectIds:['project']}]}});
 const draft=await service.createTaskDraft({spaceId:space.id,commandId:randomUUID()});
 t.after(async()=>{await service.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {service,runtime,space,draft,employees};
}
const value=()=>({name:'Review contract',goal:'Verify the API contract before implementation',packages:[{id:'review',title:'Review API',instruction:'Compare documented endpoints and report discrepancies; do not change code',ownerId:'expert',mode:'discussion',projectId:null,dependencies:[],documentRefs:[],deliverables:'Endpoint comparison and discrepancy list',acceptance:'Every documented endpoint is accounted for, with unresolved discrepancies labeled',verification:'Compare each endpoint with the supplied specification and cite the relevant section',constraints:'Do not change project files'}]});
const response=(extra={})=>({summary:'The task is ready for your review.',ready:true,questions:[],value:value(),...extra});
const guide=(f,draft,extra={})=>f.service.guideTask({id:draft.id,expectedRevision:draft.revision,requestId:randomUUID(),...extra});
test('built-in rules are injected only in discussions, not implementation tasks',()=>{
 assert.match(spaceInstructions({mode:'discussion'}),/Task creation guide/);
 assert.doesNotMatch(spaceInstructions({mode:'work'}),/Task creation guide/);
});
test('no document required: assessment never executes; confirmation is atomic and idempotent',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async(_c,req)=>{assert.match(req.prompt,/task-creation-guide/);return response();};
 const d=await guide(f,f.draft,{message:'Review the API contract'});assert.equal(d.status,'ready');assert.equal(f.runtime.runs.length,0);
 const plans=await Promise.all([1,2].map(()=>f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision})));
 assert.equal(plans[0].id,plans[1].id);assert.equal((await f.service.read()).plans.length,1);assert.equal(plans[0].status,'draft');assert.equal(f.runtime.runs.length,0);
 assert.equal(plans[0].source.draftId,d.id);assert.ok(plans[0].packages[0].definition.verification);
 await f.service.controlPlan({id:plans[0].id,expectedRevision:1,commandId:randomUUID(),action:'start'},{});
 assert.equal(f.runtime.runs.length,1);
});
test('task allocation receives real expertise and environment kind without connection details',async t=>{
 const f=await setup(t);
 Object.assign(f.employees[0],{responsibilities:'Verify remote API deployment',methods:['Check health then compare responses'],deliverables:'Evidence with commands',skills:[{name:'API verification',purpose:'Test the contract',path:'/private/skill',secret:'not-for-model'}]});
 f.service.workspace.read=async()=>({projects:[{id:'project',name:'Test API',type:'ssh',path:'/private/project',ssh:{password:'not-for-model'},environment:{kind:'docker',containerId:'private-container'}}]});
 f.service.generateTaskGuide=async(_config,req)=>{
  assert.deepEqual(req.input.members,[{id:'expert',name:'Expert',responsibilities:'Verify remote API deployment',methods:['Check health then compare responses'],deliverables:'Evidence with commands',skills:[{name:'API verification',purpose:'Test the contract'}],assignment:'Review designs',projectIds:['project']}]);
  assert.deepEqual(req.input.projects,[{id:'project',name:'Test API',type:'ssh',environment:'docker'}]);
  assert.doesNotMatch(JSON.stringify(req.input),/not-for-model|private-container|\/private\//);
  return response();
 };
 const checked=await guide(f,f.draft);assert.equal(checked.assessment.ruleVersion,'task-creation-guide-v3');assert.equal(f.runtime.runs.length,0);
});
test('semantic gaps produce valid declarative forms, even with all fields populated',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({ready:false,questions:[{label:'Which specification should be used?',help:'The two revisions conflict.'}]});
 let d=await guide(f,f.draft);assert.equal(d.status,'needs-input');assert.equal(d.assessment.question.source.definition.fields[0].help,'The two revisions conflict.');
 await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/重新检查/);
 f.service.generateTaskGuide=async(_c,req)=>{assert.match(req.input.messages.at(-1).text,/version 2/);return response();};
 d=await guide(f,d,{message:'Use version 2'});assert.equal(d.status,'ready');
});
test('model ready cannot bypass missing verification, authority or cycles',async t=>{
 const f=await setup(t);
 for(const mutate of [v=>v.packages[0].verification='',v=>v.packages[0].ownerId='stranger',v=>Object.assign(v.packages[0],{mode:'work',projectId:'outside'}),v=>v.packages[0].dependencies=['review']]){
  const v=value();mutate(v);f.service.generateTaskGuide=async()=>response({value:v});
  const d=await guide(f,(await f.service.read()).taskDrafts[0]);assert.equal(d.status,'needs-input');assert.ok(d.assessment.missing.length);
 }
});
test('editing after assessment invalidates readiness; removed members invalidate creation',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response();
 const d=await guide(f,f.draft),changed=await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:{...d.value,goal:'A different goal'}});
 assert.equal(changed.status,'needs-input');await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/更新/);
 const checked=await guide(f,changed);f.employees.length=0;
 await assert.rejects(f.service.createGuidedPlan({id:checked.id,expectedRevision:checked.revision}),/负责人/);
});
test('stop interrupts even a provider ignoring abort; late result does not overwrite',async t=>{
 const f=await setup(t);let release,entered;const begun=new Promise(r=>entered=r);f.service.generateTaskGuide=()=>{entered();return new Promise(r=>release=r);};
 const requestId=randomUUID(),job=f.service.guideTask({id:f.draft.id,expectedRevision:1,requestId,message:'Keep this human requirement'});
 await begun;f.service.cancelTaskGuide({id:f.draft.id,requestId});await assert.rejects(job,/停止|abort/i);
 release(response());await new Promise(r=>setImmediate(r));const d=(await f.service.read()).taskDrafts[0];
 assert.equal(d.messages[0].text,'Keep this human requirement');assert.equal(d.status,'needs-input');assert.equal(d.assessment,undefined);
});
test('parallel edits and space revisions reject stale inference',async t=>{
 const f=await setup(t);let release,entered;const begun=new Promise(r=>entered=r);
 f.service.generateTaskGuide=()=>{entered();return new Promise(r=>release=r);};
 const job=guide(f,f.draft);await begun;const d=(await f.service.read()).taskDrafts[0];
 await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:{...value(),goal:'Human edit wins'}});release(response());await assert.rejects(job,/更新/);
 assert.equal((await f.service.read()).taskDrafts[0].value.goal,'Human edit wins');
});
test('cross-space discussion is rejected and source snapshot stays frozen',async t=>{
 const f=await setup(t);
 await f.service.change(s=>s.requests.push({id:'discussion',spaceId:f.space.id,mode:'discussion',prompt:'Original brief',documentRefs:[],createdAt:'2026-10-30',participants:[]}));
 const d=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'discussion',commandId:randomUUID()});
 await f.service.change(s=>s.requests[0].prompt='New brief');
 assert.equal((await f.service.read()).taskDrafts.find(v=>v.id===d.id).source[0].prompt,'Original brief');
 await assert.rejects(f.service.createTaskDraft({spaceId:f.space.id,discussionId:'foreign',commandId:randomUUID()}),/不属于/);
});
test('acceptance optional note, rejection requires reason, paused retry never resumes',async t=>{
 const f=await setup(t),plan=await f.service.savePlan({spaceId:f.space.id,value:value()});
 await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'start'},{});
 f.runtime.runs[0].status='completed';f.runtime.runs[0].messages=[{role:'assistant',text:'Actual review results'}];
 await f.service.plans.reconcile(plan.id);const p=(await f.service.read()).plans[0].packages[0],a=p.attempts[0];
 const review={planId:plan.id,packageId:p.id,attemptId:a.id,resultHash:a.resultHash};
 await assert.rejects(f.service.reviewPlan({...review,accepted:false,note:''}),/验收说明/);
 await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'pause'},{});
 await f.service.reviewPlan({...review,accepted:false,note:'List the missing endpoint'});
 await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'retry',packageId:p.id},{});
 assert.equal((await f.service.read()).plans[0].status,'paused');assert.equal(f.runtime.runs.length,1);
});
test('running plan automatically schedules downstream after acceptance without a manual pulse',async t=>{
 const f=await setup(t),v=value();v.packages.push({...v.packages[0],id:'followup',title:'Resolve findings',dependencies:['review']});
 const plan=await f.service.savePlan({spaceId:f.space.id,value:v});await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'start'},{});
 f.runtime.runs[0].status='completed';f.runtime.runs[0].messages=[{role:'assistant',text:'Evidence for review'}];await f.service.plans.reconcile(plan.id);
 const a=(await f.service.read()).plans[0].packages[0].attempts[0];
 await f.service.reviewPlan({planId:plan.id,packageId:'review',attemptId:a.id,resultHash:a.resultHash,accepted:true,note:''});
 // Exercise the same periodic wake-up the running app uses, not pulse().
 f.service.plans.timer=setInterval(()=>f.service.plans.tick(),10);
 for(let n=0;n<100&&f.runtime.runs.length<2;n++)await new Promise(r=>setTimeout(r,10));
 assert.equal(f.runtime.runs.length,2);assert.equal((await f.service.read()).plans[0].packages[0].attempts[0].review.accepted,true);
});
test('accepted delivery in paused plan is recorded but does not schedule downstream',async t=>{
 const f=await setup(t),v=value();v.packages.push({...v.packages[0],id:'followup',dependencies:['review']});
 const plan=await f.service.savePlan({spaceId:f.space.id,value:v});await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'start'},{});
 f.runtime.runs[0].status='completed';await f.service.plans.reconcile(plan.id);
 await f.service.controlPlan({id:plan.id,expectedRevision:1,commandId:randomUUID(),action:'pause'},{});
 const a=(await f.service.read()).plans[0].packages[0].attempts[0];await f.service.reviewPlan({planId:plan.id,packageId:'review',attemptId:a.id,resultHash:a.resultHash,accepted:true,note:''});f.service.plans.tick();await new Promise(r=>setTimeout(r,25));
 assert.equal(f.runtime.runs.length,1);assert.equal((await f.service.read()).plans[0].status,'paused');
});
test('malformed model output leaves saved human input and never creates tasks',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({questions:[{label:'',help:'Invalid question'}]});
 await assert.rejects(guide(f,f.draft,{message:'Keep this requirement'}),/问题/);
 const state=await f.service.read();assert.equal(state.taskDrafts[0].messages[0].text,'Keep this requirement');assert.equal(state.plans.length,0);
});
test('discussion documents are pinned through guide and task creation; changed adoption blocks work',async t=>{
 const f=await setup(t),doc=await f.service.saveDocument({spaceId:f.space.id,title:'API basis',body:'Fixed requirement',adopted:true});
 await f.service.change(s=>s.requests.push({id:'source',spaceId:f.space.id,mode:'discussion',prompt:'Use the API basis',documentRefs:[{id:doc.id,revision:1,hash:doc.hash}],createdAt:'2026-10-30',participants:[]}));
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'source',commandId:randomUUID()});
 f.service.generateTaskGuide=async(_c,req)=>{assert.equal(req.input.documents[0].body,'Fixed requirement');const v=value();Object.assign(v.packages[0],{mode:'work',projectId:'project',documentIds:[doc.id]});return response({value:v});};
 const d=await guide(f,draft);assert.equal(d.value.packages[0].documentRefs[0].hash,doc.hash);
 await f.service.saveDocument({id:doc.id,spaceId:f.space.id,expectedRevision:1,title:doc.title,body:'New requirement',adopted:true});
 await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/当前已采纳/);
 assert.equal((await f.service.read()).plans.length,0);assert.equal((await f.service.read()).taskDrafts.find(v=>v.id===d.id).sourceDocuments[0].body,'Fixed requirement');
});
test('cancellation during credential loading returns promptly and never calls a model',async t=>{
 const f=await setup(t);let entered,release;const begun=new Promise(r=>entered=r);let called=false;
 f.service.workforce.providers.secret=()=>{entered();return new Promise(r=>release=r);};f.service.generateTaskGuide=async()=>{called=true;return response();};
 const requestId=randomUUID(),job=f.service.guideTask({id:f.draft.id,expectedRevision:1,requestId});await begun;
 f.service.cancelTaskGuide({id:f.draft.id,requestId});await assert.rejects(job,/停止/);assert.equal(called,false);release({});await new Promise(r=>setImmediate(r));assert.equal(called,false);
});
test('timeout persists the draft and allows a new attempt',async t=>{
 const f=await setup(t);f.service.taskGuideTimeoutMs=20;f.service.generateTaskGuide=()=>new Promise(()=>{});
 await assert.rejects(guide(f,f.draft,{message:'Requirement survives timeout'}),/超时/);
 const d=(await f.service.read()).taskDrafts[0];assert.equal(d.messages[0].text,'Requirement survives timeout');assert.equal(f.service.taskGuideControllers.size,0);
 f.service.taskGuideTimeoutMs=90000;f.service.generateTaskGuide=async()=>response();assert.equal((await guide(f,d)).status,'ready');
});
test('output limit preserves input, explains recovery, and does not accept a truncated plan',async t=>{
 const f=await setup(t);
 f.service.generateTaskGuide=async(_config,req)=>{assert.equal(req.maxOutputTokens,16384);throw Error('OUTPUT_LIMIT');};
 await assert.rejects(guide(f,f.draft,{message:'Keep the agreed local and remote scope',locale:'en'}),/output limit.*draft is preserved/);
 const d=(await f.service.read()).taskDrafts[0];assert.equal(d.status,'needs-input');assert.equal(d.assessment,undefined);assert.equal(d.messages[0].text,'Keep the agreed local and remote scope');assert.equal((await f.service.read()).plans.length,0);
 f.service.generateTaskGuide=async()=>response();assert.equal((await guide(f,d)).status,'ready');
});

test('task guidance passes English fallback and explicit Chinese locale to the model and form',async t=>{
 const f=await setup(t);let expected='en';
 f.service.generateTaskGuide=async(_c,req)=>{assert.equal(req.input.locale,expected);return response({ready:false,questions:[{label:expected==='en'?'Which specification?':'使用哪份规范？',help:''}]});};
 let d=await guide(f,f.draft);assert.equal(d.assessment.question.source.definition.title,'Clarify task requirements');
 expected='zh-CN';d=await guide(f,d,{locale:'zh-CN'});assert.equal(d.assessment.question.source.definition.title,'补充任务信息');
 assert.match(spaceInstructions({mode:'discussion'},'en'),/User interface locale: en/);
 assert.match(spaceInstructions({mode:'discussion'},'zh-CN'),/User interface locale: zh-CN/);
});
