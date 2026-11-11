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
async function confirmProject(f,d){const v=structuredClone(d.value);for(const p of v.packages)if(p.mode==='work')p.projectBinding={responsibility:'Implement the agreed project scope',relations:[],confirmed:true};const saved=await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:v});return f.service.checkTaskDraft({id:saved.id,expectedRevision:saved.revision});}
const guide=(f,draft,extra={})=>f.service.guideTask({id:draft.id,expectedRevision:draft.revision,requestId:randomUUID(),...extra});
test('generated plan metadata is repaired from discussion without asking the user to fill a form',async t=>{
 const f=await setup(t);let calls=0;
 f.service.workforce.providers.secret=async()=>({model:'test',protocol:'chat',baseUrl:'https://model.example/v1'});
 const source='Review the API contract before implementation';
 await f.service.change(s=>s.requests.push({id:'metadata-source',spaceId:f.space.id,mode:'discussion',prompt:source,documentRefs:[],createdAt:'2026-11-10',participants:[]}));
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'metadata-source',commandId:randomUUID()});
 t.mock.method(global,'fetch',async(_url,options)=>{
  calls++;const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);
  assert.equal(input.source[0].prompt,source);assert.match(body.messages[0].content,/never ask the user to name the plan/i);
  const v=value();v.packages=v.packages.map(({documentRefs,...p})=>({...p,projectId:'',documentIds:[],projectBinding:{responsibility:'',relations:[],reason:''}}));
  if(calls===1){v.name='';v.goal='   ';}else assert.match(body.messages[0].content,/previous response did not satisfy/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response({value:v}))}}]}));
 });
 const result=await guide(f,draft);assert.equal(calls,2);assert.equal(result.status,'ready');assert.equal(result.value.name,value().name);assert.equal(result.value.goal,value().goal);assert.equal(result.assessment.question,null);assert.deepEqual(result.assessment.missing,[]);
 assert.equal((await f.service.read()).plans.length,0);assert.equal(f.runtime.runs.length,0);
});
test('an unknown business outcome can be clarified without fabricating plan metadata',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async(_c,req)=>{
  const proposed=response({ready:false,value:{name:'',goal:'',packages:[]},questions:[{label:'What outcome should this work deliver?',help:'This determines the scope.'}]});
  const validate=new (require('ajv'))({strict:false}).compile(req.outputSchema);assert.equal(validate(proposed),true);
  return proposed;
 };
 const result=await guide(f,f.draft,{message:'Help me work out what to do'});assert.equal(result.status,'needs-input');assert.equal(result.value.packages.length,0);assert.ok(result.assessment.question);assert.equal(f.runtime.runs.length,0);
});
test('progressive clarification keeps the question and submitted answer after inference failure',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async(_c,req)=>{assert.equal(req.outputSchema.properties.questions.maxItems,1);return response({ready:false,questions:[{label:'Which delivery scope?',help:'Choose the first release.'}]});};
 const first=await guide(f,f.draft);const question=first.assessment.question;
 f.service.generateTaskGuide=async()=>{throw Error('PROVIDER_RATE_LIMIT');};
 await assert.rejects(guide(f,first,{message:'First release only'}),/rate-limited/);
 const failed=(await f.service.read()).taskDrafts.find(d=>d.id===first.id);assert.deepEqual(failed.pendingQuestion,question);assert.equal(failed.requirementsPending,true);assert.equal(failed.messages.at(-1).text,'First release only');
 f.service.generateTaskGuide=async(_c,req)=>{assert.ok(req.input.messages.some(m=>m.text==='First release only'));return response();};
 const recovered=await guide(f,failed,{message:'Continue using my saved answer'});assert.equal(recovered.pendingQuestion,null);assert.equal(recovered.requirementsPending,false);assert.equal(recovered.status,'ready');assert.equal(f.runtime.runs.length,0);
});
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
 const checked=await guide(f,f.draft);assert.equal(checked.assessment.ruleVersion,'task-creation-guide-v9');assert.equal(f.runtime.runs.length,0);
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
 const d=await confirmProject(f,await guide(f,draft));assert.equal(d.value.packages[0].documentRefs[0].hash,doc.hash);
 await f.service.saveDocument({id:doc.id,spaceId:f.space.id,expectedRevision:1,title:doc.title,body:'New requirement',adopted:true});
 await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/执行依据/);
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

async function basisDraft(t){
 const f=await setup(t),doc=await f.service.saveDocument({spaceId:f.space.id,title:'Basis draft',body:'Verified scope'});
 await f.service.change(s=>s.requests.push({id:'basis-discussion',spaceId:f.space.id,mode:'discussion',prompt:'Implement this basis',documentRefs:[{id:doc.id,revision:1,hash:doc.hash}],createdAt:'2026-11-03',participants:[]}));
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'basis-discussion',commandId:randomUUID()});
 f.service.generateTaskGuide=async()=>{const v=value();Object.assign(v.packages[0],{mode:'work',projectId:'project',documentIds:[doc.id]});return response({value:v});};
 const d=await confirmProject(f,await guide(f,draft));assert.equal(d.status,'ready');
 return {...f,doc,d,basisConfirmation:{context:JSON.stringify([[],[]]),documents:[{id:doc.id,revision:1,hash:doc.hash,expectedRevision:1,expectedAdoptedRevision:null}]}};
}
test('unadopted references require explicit confirmation and commit atomically with the plan',async t=>{
 const f=await basisDraft(t),input={id:f.d.id,expectedRevision:f.d.revision};
 await assert.rejects(f.service.createGuidedPlan(input),/执行依据/);
 assert.equal((await f.service.read()).documents[0].adoptedRevision,null);
 const p=await f.service.createGuidedPlan({...input,basisConfirmation:f.basisConfirmation});
 assert.equal((await f.service.read()).documents[0].adoptedRevision,1);assert.equal(p.packages[0].definition.documentRefs[0].hash,f.doc.hash);
 const again=await f.service.createGuidedPlan({...input,basisConfirmation:f.basisConfirmation});assert.equal(again.id,p.id);assert.equal((await f.service.read()).documents[0].adoptions.length,1);assert.equal(f.runtime.runs.length,0);
});
test('changed document or impact context rejects confirmation without partial adoption',async t=>{
 const f=await basisDraft(t),input={id:f.d.id,expectedRevision:f.d.revision,basisConfirmation:f.basisConfirmation};
 await assert.rejects(f.service.createGuidedPlan({...input,basisConfirmation:{...f.basisConfirmation,context:'stale'}}),/关联任务已变化/);
 await f.service.saveDocument({id:f.doc.id,spaceId:f.space.id,expectedRevision:1,title:'Changed',body:'New version'});
 await assert.rejects(f.service.createGuidedPlan(input),/执行依据/);
 const s=await f.service.read();assert.equal(s.plans.length,0);assert.equal(s.documents[0].adoptedRevision,null);
});
test('confirmed reference replacement retains old task inputs and marks the old basis stale',async t=>{
 const f=await basisDraft(t),first=await f.service.createGuidedPlan({id:f.d.id,expectedRevision:f.d.revision,basisConfirmation:f.basisConfirmation});
 const doc=await f.service.saveDocument({id:f.doc.id,spaceId:f.space.id,expectedRevision:1,title:'Basis v2',body:'Updated scope'});
 await f.service.change(s=>s.requests.push({id:'new-discussion',spaceId:f.space.id,mode:'discussion',prompt:'Use v2',documentRefs:[{id:doc.id,revision:2,hash:doc.hash}],createdAt:'2026-11-03',participants:[]}));
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'new-discussion',commandId:randomUUID()}),d=await confirmProject(f,await guide(f,draft));
 const confirmation={context:JSON.stringify([[[first.id,first.revision]],[]]),documents:[{id:doc.id,revision:2,hash:doc.hash,expectedRevision:2,expectedAdoptedRevision:1}]};
 await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/执行依据/);
 const second=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision,basisConfirmation:confirmation});await f.service.plans.reconcile(first.id);
 const s=await f.service.read(),old=s.plans.find(p=>p.id===first.id);assert.equal(s.documents[0].adoptedRevision,2);assert.equal(second.packages[0].definition.documentRefs[0].revision,2);assert.equal(old.packages[0].definition.documentRefs[0].revision,1);assert.ok(old.packages[0].stale);assert.equal(f.runtime.runs.length,0);
});

test('AI project suggestions remain unconfirmed; node editing and deterministic check create without regenerating',async t=>{
 const f=await setup(t);let calls=0;
 await f.service.saveProjectContext({id:f.space.id,expectedRevision:1,value:{roles:[{projectId:'project',responsibility:'API implementation'}],relations:[]}});
 f.service.generateTaskGuide=async(_c,request)=>{calls++;assert.equal(request.input.projectContext.roles[0].responsibility,'API implementation');const v=value();Object.assign(v.packages[0],{mode:'work',projectId:'',projectBinding:{responsibility:'API implementation',relations:[],confirmed:true}});return response({value:v});};
 let d=await guide(f,f.draft);assert.equal(d.status,'needs-input');assert.equal(d.value.packages[0].projectId,'');assert.equal(d.value.packages[0].projectBinding.confirmed,false);
 const v=structuredClone(d.value);Object.assign(v.packages[0],{projectId:'project',projectBinding:{responsibility:'API implementation',relations:[],confirmed:true}});
 d=await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:v});d=await f.service.checkTaskDraft({id:d.id,expectedRevision:d.revision});
 assert.equal(d.status,'ready');assert.equal(calls,1);
 const plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});assert.equal(plan.packages[0].definition.projectBinding.confirmed,true);assert.equal(f.runtime.runs.length,0);
});
test('deterministic checking cannot discard unanswered requirements or stale space revisions',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({ready:false,questions:[{label:'Which API version?',help:'Affects compatibility'}]});
 let d=await guide(f,f.draft);d=await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:d.value});d=await f.service.checkTaskDraft({id:d.id,expectedRevision:d.revision});assert.equal(d.status,'needs-input');assert.ok(d.assessment.question);assert.match(d.assessment.missing.join(' '),/需求问题/);
 f.service.generateTaskGuide=async()=>response();d=await guide(f,d,{message:'Use v2'});assert.equal(d.status,'ready');
 await f.service.saveProjectContext({id:f.space.id,expectedRevision:1,value:{roles:[],relations:[]}});
 await assert.rejects(f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision}),/重新检查/);
 d=await f.service.checkTaskDraft({id:d.id,expectedRevision:d.revision});assert.equal(d.status,'ready');
});

test('legacy pending questions survive deterministic checks without migration fields',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({ready:false,questions:[{label:'Which target?',help:''}]});
 const generated=await guide(f,f.draft);
 await f.service.change(s=>{const d=s.taskDrafts[0];delete d.requirementsPending;delete d.pendingQuestion;});
 const checked=await f.service.checkTaskDraft({id:generated.id,expectedRevision:generated.revision});assert.equal(checked.status,'needs-input');assert.ok(checked.assessment.question);assert.match(checked.assessment.missing.join(' '),/需求问题/);
});

const workValue=()=>{const v=value();Object.assign(v.packages[0],{mode:'work',projectId:'project',projectBinding:{responsibility:'API implementation',relations:[],confirmed:false}});return v;};
const relationAnswer=(f,d,answers=d.relationGuide.nodes[0].prefill)=>f.service.answerTaskRelations({id:d.id,expectedRevision:d.revision,requestKey:d.relationGuide.requestKey,packageId:d.relationGuide.nodes[0].packageId,answers});
test('relationship declarations confirm atomically, persist in space, and carry into a new discussion',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({value:workValue()});
 let d=await guide(f,f.draft);assert.equal(d.status,'needs-input');assert.equal(d.relationGuide.nodes.length,1);
 const before=structuredClone(d.value);d=await relationAnswer(f,d);
 assert.equal(d.status,'ready');assert.equal(d.relationGuide,null);assert.equal(d.value.packages[0].instruction,before.packages[0].instruction);
 assert.equal((await f.service.read()).spaces[0].projectContext.roles[0].responsibility,'API implementation');
 await f.service.change(s=>s.requests.push({id:'next-discussion',spaceId:f.space.id,mode:'discussion',prompt:'Another delivery',documentRefs:[],participants:[],createdAt:new Date().toISOString()}));
 const next=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'next-discussion',commandId:randomUUID()});
 f.service.generateTaskGuide=async(_c,req)=>{assert.equal(req.input.knownBindings.bindings[0].source,'space');const v=workValue();v.packages[0].id='new-work';return response({value:v});};
 const inherited=await guide(f,next);assert.equal(inherited.status,'ready');assert.equal(inherited.relationGuide,null);assert.equal(inherited.value.packages[0].projectBinding.reusedFrom,'space');assert.equal(f.runtime.runs.length,0);
});
test('relation-only model patches preserve task content and cannot clear semantic questions',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({value:workValue(),ready:false,questions:[{label:'Which API version?',help:'Select the delivery version'}]});
 let d=await guide(f,f.draft),original=structuredClone(d.value);
 f.service.generateTaskGuide=async(_c,req)=>{assert.deepEqual(req.input.gaps,['review']);assert.ok(req.outputSchema.properties.nodes);return {summary:'Clarify responsibility',nodes:[{packageId:'review',projectId:'project',responsibility:'Maintain API',relations:[],reason:'Review the proposed project responsibility',instruction:'Must be ignored'}]};};
 d=await guide(f,d,{phase:'relations',message:'Use the existing API project'});
 assert.equal(d.value.packages[0].instruction,original.packages[0].instruction);assert.equal(d.assessment.question.source.definition.fields[0].label,'Which API version?');
 d=await relationAnswer(f,d);assert.equal(d.status,'needs-input');assert.ok(d.assessment.question);assert.equal(d.relationGuide,null);
});
test('relationship answers validate authoritative options and reject stale space revisions without writes',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({value:workValue()});const d=await guide(f,f.draft);
 await assert.rejects(relationAnswer(f,d,{...d.relationGuide.nodes[0].prefill,projectId:'outside'}));
 assert.deepEqual((await f.service.read()).spaces[0].projectContext,{roles:[],relations:[]});
 await f.service.change(s=>s.spaces[0].revision++);
 await assert.rejects(relationAnswer(f,d),/更新/);assert.equal((await f.service.read()).taskDrafts[0].revision,d.revision);
});
test('targeted relation inference cannot modify confirmed nodes and stale answers cannot replay',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response({value:workValue()});const pending=await guide(f,f.draft),d=await relationAnswer(f,pending);
 await assert.rejects(relationAnswer(f,pending),/更新/);
 f.service.generateTaskGuide=async()=>({summary:'Rewrite',nodes:[{packageId:'review',projectId:'project',responsibility:'Different',relations:[],reason:'Changed'}]});
 await assert.rejects(guide(f,d,{phase:'relations'}),/已确认/);
 assert.equal((await f.service.read()).taskDrafts[0].value.packages[0].projectBinding.responsibility,'API implementation');
});
test('cross-project prerequisite requires a handoff; switching a project invalidates dependent confirmations',async t=>{
 const f=await setup(t);f.service.workspace.read=async()=>({projects:[{id:'project',name:'API'},{id:'web',name:'Web'}]});
 await f.service.change(s=>{const sp=s.spaces[0];sp.projectIds.push('web');sp.members[0].projectIds.push('web');sp.revision++;});
 const v=workValue();v.packages.push({...v.packages[0],id:'client',projectId:'web',dependencies:['review'],projectBinding:{responsibility:'Web client',relations:[],confirmed:false}});
 f.service.generateTaskGuide=async()=>response({value:v});let d=await guide(f,f.draft);
 const client=d.relationGuide.nodes.find(n=>n.packageId==='client');assert.equal(client.prefill.target0,'project');
 await assert.rejects(f.service.answerTaskRelations({id:d.id,expectedRevision:d.revision,requestKey:d.relationGuide.requestKey,packageId:'client',answers:{...client.prefill,relationshipMode:'independent'}}),/前置/);
 d=await f.service.answerTaskRelations({id:d.id,expectedRevision:d.revision,requestKey:d.relationGuide.requestKey,packageId:'client',answers:{...client.prefill,description0:'Consume API contract and verify endpoints'}});
 assert.equal(d.value.packages[1].projectBinding.confirmed,true);
 d=await relationAnswer(f,d,{...d.relationGuide.nodes[0].prefill,projectId:'web'});
 assert.equal(d.value.packages[1].projectBinding.confirmed,false);assert.ok(d.relationGuide.nodes.some(n=>n.packageId==='client'));
});
test('unambiguous history is reusable, conflicts and new handoffs require confirmation',()=>{
 const R=require('../core/workforce/relation-guide.cjs'),space={id:'space',projectIds:['project','other'],members:[{employeeId:'expert',projectIds:['project','other']}]};
 const p=workValue().packages[0];p.projectBinding.confirmed=true;
 const state={plans:[{spaceId:'space',packages:[{definition:p}]}]};
 let known=R.knownBindings(state,space);assert.equal(known.bindings[0].source,'history');
 assert.equal(R.inherit([p],space,known)[0].projectBinding.confirmed,true);
 const changed={...p,projectBinding:{...p.projectBinding,responsibility:'Changed role'}};state.plans.push({spaceId:'space',packages:[{definition:changed}]});
 known=R.knownBindings(state,space);assert.deepEqual(known.conflicts,['project']);assert.equal(R.inherit([p],space,known)[0].projectBinding.confirmed,false);
 const other={...p,id:'other-task',projectId:'other'},dependent={...p,dependencies:['other-task']};
 assert.equal(R.inherit([other,dependent],space,{bindings:[{projectId:'project',binding:p.projectBinding,source:'history'}]})[1].projectBinding.confirmed,false);
});

test('another round in the same discussion creates a new plan draft and reuses the confirmed space agreement',async t=>{
 const f=await setup(t);
 await f.service.change(s=>s.requests.push({id:'conversation',spaceId:f.space.id,mode:'discussion',prompt:'First delivery',documentRefs:[],participants:[],createdAt:'2026-11-01'}));
 let d=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'conversation',commandId:randomUUID()});f.service.generateTaskGuide=async()=>response({value:workValue()});
 d=await relationAnswer(f,await guide(f,d));const plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 await f.service.change(s=>s.requests.push({id:'next-round',replyTo:'conversation',spaceId:f.space.id,mode:'discussion',prompt:'Add the next delivery',documentRefs:[],participants:[],createdAt:'2026-11-02'}));
 await assert.rejects(f.service.createTaskDraft({spaceId:f.space.id,discussionId:'next-round',commandId:randomUUID()}),/未结束任务/);
 await f.service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'stop'});
 const next=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'next-round',commandId:randomUUID()});assert.notEqual(next.id,d.id);assert.equal(next.discussionId,'conversation');assert.equal(next.source.length,2);
 const result=await guide(f,next);assert.equal(result.status,'ready');assert.equal(result.value.packages[0].projectBinding.reusedFrom,'space');assert.equal((await f.service.read()).plans[0].id,plan.id);assert.equal(f.runtime.runs.length,0);
});
test('historical confirmation is rechecked when another draft creates a conflict during inference',async t=>{
 const f=await setup(t),v=workValue();v.packages[0].projectBinding.confirmed=true;
 await f.service.change(s=>s.taskDrafts.push({...structuredClone(f.draft),id:'historical',value:v}));
 f.service.generateTaskGuide=async()=>{const changed=workValue();changed.packages[0].projectBinding={responsibility:'Conflicting responsibility',relations:[],confirmed:true};await f.service.change(s=>s.taskDrafts.push({...structuredClone(f.draft),id:'conflicting',value:changed}));return response({value:workValue()});};
 const result=await guide(f,f.draft);assert.equal(result.status,'needs-input');assert.equal(result.value.packages[0].projectBinding.confirmed,false);assert.equal(result.relationGuide.nodes.length,1);
});

test('discussion planning streams progress without the standalone guide deadline',async t=>{
 const f=await setup(t);f.service.taskGuideTimeoutMs=20;f.service.hostIdleTimeoutMs=100;
 f.service.generateTaskGuide=async(_config,job,_signal,onProgress)=>{
  assert.equal(job.timeoutMs,null);assert.equal(typeof onProgress,'function');
  for(let i=1;i<=8;i++){await new Promise(r=>setTimeout(r,25));onProgress({receivedCharacters:i,phase:'responding'});}
  return response();
 };
 const result=await f.service.guideTask({id:f.draft.id,expectedRevision:f.draft.revision,requestId:randomUUID(),message:'Use the confirmed goal'},{discussion:true});
 assert.equal(result.status,'ready');assert.equal(f.runtime.runs.length,0);assert.equal(f.service.taskGuideControllers.size,0);
});
test('silent discussion planning preserves input and cannot apply a late draft',async t=>{
 const f=await setup(t);f.service.hostIdleTimeoutMs=30;let release;
 f.service.generateTaskGuide=()=>new Promise(resolve=>{release=resolve;});
 await assert.rejects(f.service.guideTask({id:f.draft.id,expectedRevision:f.draft.revision,requestId:randomUUID(),message:'Keep my answer'},{discussion:true}),e=>e.code==='MODEL_RESPONSE_TIMEOUT');
 release(response());await new Promise(r=>setTimeout(r,10));
 const saved=(await f.service.read()).taskDrafts.find(d=>d.id===f.draft.id);
 assert.equal(saved.messages.at(-1).text,'Keep my answer');assert.equal(saved.status,'needs-input');assert.equal(saved.value.packages.length,0);assert.equal(f.service.taskGuideControllers.size,0);
});

test('topic task creation is serialized under concurrent requests and preserves explicit termination history',async t=>{
 const f=await setup(t);
 await f.service.change(s=>s.requests.push({id:'topic',spaceId:f.space.id,mode:'discussion',prompt:'Goal',documentRefs:[],participants:[],createdAt:'2026-11-01'}));
 const create=extra=>f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID(),...extra});
 const drafts=await Promise.all([create(),create(),create()]);assert.equal(new Set(drafts.map(d=>d.id)).size,1);
 await assert.rejects(create({newPlan:true}),/未结束任务/);
 const d=drafts[0];await f.service.discardTaskDraft({id:d.id,expectedRevision:d.revision});
 await assert.rejects(f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision+1,value:value()}),/已结束/);
 const next=await create({newPlan:true});assert.notEqual(next.id,d.id);assert.ok((await f.service.read()).taskDrafts.find(x=>x.id===d.id).discardedAt);
});
test('paused, failed, review and waiting plans block new tasks; ended tasks cannot resume across the next draft',async t=>{
 const f=await setup(t);
 await f.service.change(s=>s.requests.push({id:'topic',spaceId:f.space.id,mode:'discussion',prompt:'Goal',documentRefs:[],participants:[],createdAt:'2026-11-01'}));
 const d=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID()});f.service.generateTaskGuide=async()=>response();
 const ready=await guide(f,d),plan=await f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision});
 for(const [status,node] of [['draft','pending'],['paused','interrupted'],['pausing','stopping'],['running','starting'],['running','preparing'],['running','running'],['running','failed'],['running','review'],['running','rejected'],['running','waiting'],['running','blocked'],['running','stale'],['stopped','stopping']]){
  await f.service.change(s=>{s.plans[0].status=status;s.plans[0].packages[0].status=node;});
  await assert.rejects(f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID(),newPlan:true}),/未结束任务/);
 }
 await f.service.change(s=>{s.plans[0].status='completed';s.plans[0].packages[0].status='accepted';});
 const next=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID(),newPlan:true});assert.notEqual(next.id,d.id);
 await assert.rejects(f.service.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:randomUUID(),action:'resume'}),/未结束任务/);
});
test('same-topic legacy drafts cannot both confirm and shared documents do not imply ownership',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response();
 await f.service.change(s=>s.requests.push({id:'topic',spaceId:f.space.id,mode:'discussion',prompt:'Goal',documentRefs:[],participants:[],createdAt:'2026-11-01'}));
 const d=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID()}),ready=await guide(f,d);
 await f.service.change(s=>s.taskDrafts.push({...structuredClone(ready),id:'legacy'}));
 await assert.rejects(f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision}),/未结束任务/);
 await f.service.discardTaskDraft({id:'legacy',expectedRevision:ready.revision});
 const p=await f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision});assert.equal(p.source.discussionId,'topic');
 await f.service.change(s=>s.requests.push({id:'independent',spaceId:f.space.id,mode:'discussion',prompt:'Separate goal',documentRefs:[],participants:[],createdAt:'2026-11-02'}));
 const next=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'independent',commandId:randomUUID()});assert.equal(next.discussionId,'independent');
});

test('terminal plan revision drafts stay historical and are not reused for the next task',async t=>{
 const f=await setup(t);f.service.generateTaskGuide=async()=>response();
 await f.service.change(s=>s.requests.push({id:'topic',spaceId:f.space.id,mode:'discussion',prompt:'Goal',documentRefs:[],participants:[],createdAt:'2026-11-01'}));
 const d=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID()}),ready=await guide(f,d),p=await f.service.createGuidedPlan({id:ready.id,expectedRevision:ready.revision});
 const revision=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID(),basePlanId:p.id,basePlanRevision:p.revision});
 await f.service.controlPlan({id:p.id,expectedRevision:p.revision,commandId:randomUUID(),action:'stop'});
 const next=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID()});assert.notEqual(next.id,revision.id);assert.equal(next.basePlanId,undefined);
 await assert.rejects(f.service.createTaskDraft({spaceId:f.space.id,discussionId:'topic',commandId:randomUUID(),basePlanId:p.id,basePlanRevision:p.revision}),/未结束任务/);
});

test('ending a draft blocks a late model result and survives reopening the service state',async t=>{
 const f=await setup(t);let release,entered;const began=new Promise(r=>entered=r);f.service.generateTaskGuide=()=>{entered();return new Promise(r=>release=r);};
 const job=guide(f,f.draft);await began;const current=(await f.service.read()).taskDrafts.find(d=>d.id===f.draft.id);
 await f.service.discardTaskDraft({id:current.id,expectedRevision:current.revision});release(response());await assert.rejects(job,/更新|已结束/);
 const saved=(await f.service.read()).taskDrafts.find(d=>d.id===f.draft.id);assert.ok(saved.discardedAt);assert.equal(saved.value.packages.length,0);assert.equal(f.runtime.runs.length,0);
});
