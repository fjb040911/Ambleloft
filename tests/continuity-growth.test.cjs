const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs');
const {SpaceService}=require('../core/workforce/spaces.cjs');
const {ContinuityService}=require('../core/continuity/service.cjs');
const {GrowthService}=require('../core/continuity/growth.cjs');
const {ExpertChatService}=require('../core/continuity/expert-chat.cjs');
async function fixture(t,infer){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'continuity-growth-')),db=new Database(root);await db.call('ready');
 const employees=[{id:'pm',name:'产品经理',revision:1,responsibilities:'澄清业务边界',methods:'验证假设',modelChoice:{providerId:'configured',model:'model'}},{id:'arch',name:'架构师',revision:1,responsibilities:'接口设计'}];
 await db.call('writeSetting',{key:'workforce.roles.v1',value:{employees}});
 const workforce={read:()=>db.call('readSetting',{key:'workforce.roles.v1'})},runtime={runs:[],contexts:new Map(),stop:async()=>{},changed(){},persist:async()=>{}};
 const spaces=new SpaceService({directory:root,database:db,workspace:{read:()=>db.call('readWorkspace')},workforce,runtime});await spaces.initialize();
 const space=await spaces.save({value:{name:'库存领域',projectIds:[],members:[{employeeId:'pm',projectIds:[]}]}});
 const continuity=new ContinuityService({database:db}),calls=[],providers={secret:async()=>({model:'model'})};
 const object=(kind,value,expectedRevision=null)=>continuity.putObject({commandId:randomUUID(),kind,value,expectedRevision});
 await object('domain',{id:'inventory',name:'库存领域',status:'active'});await object('link',{id:'link',domainId:'inventory',target:{kind:'space',id:space.id},state:'confirmed',origin:'user'});
 const doc=await spaces.saveDocument({spaceId:space.id,title:'库存规范',body:'库存更新必须校验版本号。冲突时由用户决定是否重试。',conditions:'单仓库',adopted:true});
 const service=new GrowthService({continuity,providers,runtime,infer:async(c,j,s)=>{calls.push(j);return infer?infer(c,j,s):{quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'评审时应关注冲突恢复的用户体验。'},{type:'open-question',body:'冲突提示是否需要明确显示当前版本？'}]};}});
 await service.initialize();
 const context={employeeId:'pm',domainIds:['inventory'],destination:{kind:'profile-private-chat'}};
 t.after(async()=>{await service.shutdown();await spaces.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,db,workforce,runtime,employees,space,spaces,doc,service,continuity,calls,providers,object,context};
}
test('automatic backfill publishes attributed excerpts and owner-scoped interpretations atomically',async t=>{
 const f=await fixture(t);await f.service.tick();const shared=await f.continuity.searchKnowledge(f.context),personal=await f.continuity.searchUnderstandings(f.context);
 assert.equal(shared.length,1);assert.equal(shared[0].kind,'source-excerpt');assert.equal(shared[0].claimType,'suggestion');assert.equal(shared[0].body,'库存更新必须校验版本号。');assert.equal(shared[0].appliesTo.sourceConditions,'单仓库');
 assert.equal(personal.length,2);assert.equal(personal.find(k=>k.segmentType==='interpretation').claimType,'hypothesis');assert.equal(personal[0].employeeId,'pm');assert.deepEqual(personal[0].knowledgeRefs,[{id:shared[0].id,revision:1}]);
 const jobs=await f.service.jobs();assert.equal(jobs.length,1);assert.equal(jobs[0].state,'completed');assert.equal(jobs[0].participation,null);assert.ok(jobs[0].coverage.sourceRef.id);assert.equal(f.calls[0].tools,undefined);
 await f.service.tick();assert.equal(f.calls.length,1);
});
test('unrelated experts cannot discover or inject another expert personal understanding',async t=>{
 const f=await fixture(t);await f.service.tick();const own=(await f.continuity.searchUnderstandings(f.context))[0],other={...f.context,employeeId:'arch'};
 assert.deepEqual(await f.continuity.searchUnderstandings(other),[]);await assert.rejects(f.continuity.readKnowledge(other,{id:own.id,revision:own.revision}),/ACCESS_DENIED/);
 await assert.rejects(f.continuity.snapshot(other,[],[{id:own.id,revision:own.revision}]),/ACCESS_DENIED/);
});
test('role change invalidates only personal understanding and queues a fresh role perspective',async t=>{
 const f=await fixture(t);await f.service.tick();const old=(await f.continuity.searchUnderstandings(f.context))[0];f.employees[0].responsibilities='关注审计追踪';f.employees[0].revision=2;await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees}});
 assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.equal((await f.continuity.searchKnowledge(f.context)).length,1);await assert.rejects(f.continuity.readKnowledge(f.context,{id:old.id,revision:old.revision}),/KNOWLEDGE_UNAVAILABLE/);
 await f.service.tick();assert.equal(f.calls.length,2);assert.equal((await f.continuity.searchUnderstandings(f.context))[0].roleRevision,2);
});
test('model choice changes do not invalidate knowledge or repeat extraction',async t=>{
 const f=await fixture(t);await f.service.tick();f.employees[0].modelChoice={providerId:'other',model:'new'};f.employees[0].revision++;await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees}});await f.service.tick();assert.equal(f.calls.length,1);assert.equal((await f.continuity.searchUnderstandings(f.context)).length,2);
});
test('withdrawal invalidates excerpts and personal understanding, restoration cannot revive them',async t=>{
 const f=await fixture(t);await f.service.tick();await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);
 const state=await f.spaces.snapshot();const doc=state.documents.find(d=>d.id===f.doc.id);await f.spaces.restoreDocument({id:doc.id,expectedRevision:doc.revision});assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);await f.service.tick();assert.equal(f.calls.length,1);
});
test('invalid quotation or malformed segment commits neither shared nor personal revisions',async t=>{
 const f=await fixture(t,async()=>({quote:'模型编造的事实',segments:[{type:'interpretation',body:'x'}]}));await f.service.tick();assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.equal((await f.service.jobs())[0].state,'failed');await f.service.tick();assert.equal(f.calls.length,1);
});
test('source withdrawal while the provider is running rejects the late extraction',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const f=await fixture(t,async()=>{entered();await gate;return {quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'建议'}]};});const running=f.service.tick();await started;await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});release();await running;assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);assert.equal((await f.service.jobs())[0].state,'failed');
});
test('member revocation after queuing prevents any model call',async t=>{
 const f=await fixture(t);await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[]}});await f.service.tick();assert.equal(f.calls.length,0);assert.equal((await f.service.jobs())[0].state,'obsolete');
});
test('dismissal prevents automatic resurrection across role changes, without deleting shared facts',async t=>{
 const f=await fixture(t);await f.service.tick();await f.service.dismiss({id:(await f.service.jobs())[0].id});assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.equal((await f.continuity.searchKnowledge(f.context)).length,1);
 f.employees[0].responsibilities='新的职责';await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees}});await f.service.tick();assert.equal(f.calls.length,1);
});
test('unknown interrupted outcomes are not automatically replayed after recovery',async t=>{
 const f=await fixture(t);const job=await f.continuity.growth('claim');assert.ok(job);await f.continuity.growth('dispatch',job);await f.continuity.growth('recover');await f.service.tick();assert.equal(f.calls.length,0);assert.equal((await f.service.jobs())[0].state,'interrupted');
});
test('foreground reservations and disabled/daily budgets prevent background calls',async t=>{
 const f=await fixture(t);f.runtime.contexts.set('active',{});await f.service.tick();assert.equal(f.calls.length,0);f.runtime.contexts.clear();await f.service.policy({enabled:false,dailyLimit:20});await f.service.tick();assert.equal(f.calls.length,0);await f.service.policy({enabled:true,dailyLimit:0});await f.service.tick();assert.equal(f.calls.length,0);await f.service.policy({enabled:true,dailyLimit:1});await f.service.tick();assert.equal(f.calls.length,1);
});
test('P2 @expert loads personal understanding separately and exclusions remove its dependencies',async t=>{
 const f=await fixture(t);await f.service.tick();const inputs=[];const chat=new ExpertChatService({database:f.db,continuity:f.continuity,workforce:f.workforce,providers:f.providers,infer:async(c,j)=>{inputs.push(j.input);return {text:'专家回答',citations:j.input.background.map(s=>s.sourceId),unresolvedQuestions:[]};}});await chat.initialize();t.after(()=>chat.shutdown());
 const result=await chat.submit({commandId:randomUUID(),text:'库存领域如何设计冲突提示？',selectedEmployeeIds:['pm']});await Promise.all([...chat.active.values()].map(j=>j.promise));assert.equal(inputs[0].personalUnderstanding.length,2);assert.equal(inputs[0].sharedKnowledge.length,1);
 const turn=(await chat.read(result)).turns[0];await chat.exclude({...result,sourceKey:turn.references.find(r=>r.kind==='space-document').ref.sourceKey});await chat.submit({commandId:randomUUID(),conversationId:result.conversationId,text:'继续',selectedEmployeeIds:['pm']});await Promise.all([...chat.active.values()].map(j=>j.promise));assert.deepEqual(inputs[1].personalUnderstanding,[]);assert.deepEqual(inputs[1].sharedKnowledge,[]);
});
test('P2 completed contributions become private historical sources, reading documents is not participation',async t=>{
 const f=await fixture(t);const chat=new ExpertChatService({database:f.db,continuity:f.continuity,workforce:f.workforce,providers:f.providers,infer:async()=>({text:'这次讨论建议先验证库存冲突提示。',citations:[],unresolvedQuestions:[]})});await chat.initialize();t.after(()=>chat.shutdown());
 const result=await chat.submit({commandId:randomUUID(),text:'库存领域的历史合作',selectedEmployeeIds:['pm']});await Promise.all([...chat.active.values()].map(j=>j.promise));
 const sources=await f.continuity.search(f.context);assert.ok(sources.some(s=>s.kind==='expert-contribution'));assert.deepEqual(await f.continuity.search({...f.context,employeeId:'arch'}),[]);
 f.service.infer=async(c,j)=>({quote:j.input.source.body.slice(0,1000),segments:[{type:'interpretation',body:'需要关注冲突提示。'}]});await f.service.tick();await f.service.tick();
 const jobs=await f.service.jobs();assert.ok(jobs.some(j=>j.participation?.kind==='expert-contribution'));assert.ok(jobs.some(j=>j.state==='completed'&&j.participation===null));
 const refs=(await chat.read(result)).turns[0].references;await chat.exclude({...result,sourceKey:refs[0].ref.sourceKey});const after=await f.continuity.searchKnowledge(f.context);assert.equal(after.length,1); // Original document excerpt remains; excluded conversation derivation is denied.
});
test('project-target authorization is rechecked for personal understanding reuse',async t=>{
 const f=await fixture(t);await f.service.tick();await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'p',expectedRevision:null,value:{id:'p',name:'项目',path:'/tmp',createdAt:''}}]});assert.deepEqual(await f.continuity.searchUnderstandings({...f.context,destination:{kind:'project',id:'p'}}),[]);
});
test('unrelated policy changes are fully reauthorized instead of wasting an otherwise valid extraction',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=await fixture(t,async()=>{entered();await gate;return {quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'用户应理解冲突。'}]};});const running=f.service.tick();await started;await f.object('domain',{id:'unrelated',name:'无关',status:'active'});release();await running;assert.equal((await f.continuity.searchUnderstandings(f.context)).length,1);
});
test('a meaningful no-result extraction records coverage without inventing memory',async t=>{
 const f=await fixture(t,async()=>({quote:'',segments:[]}));await f.service.tick();assert.equal((await f.service.jobs())[0].state,'completed');assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);await f.service.tick();assert.equal(f.calls.length,1);
});
test('long sources are chunked durably and all chunks receive distinct coverage without endless tail jobs',async t=>{
 const f=await fixture(t,async(c,j)=>({quote:j.input.source.body.slice(0,30),segments:[]}));
 const body='甲'.repeat(17000)+'尾部规则：按实际库存验收。'+'乙'.repeat(2000);
 await f.spaces.saveDocument({id:f.doc.id,spaceId:f.space.id,expectedRevision:f.doc.revision,title:'长文',body,adopted:true});
 await f.service.tick();await f.service.tick();await f.service.tick();
 const completed=(await f.service.jobs()).filter(j=>j.state==='completed');assert.equal(completed.length,2);assert.equal(f.calls.length,2);assert.ok(f.calls.every(j=>j.input.source.body.length<=16000));assert.ok(f.calls.some(j=>j.input.source.body.includes('尾部规则')));assert.ok(completed.some(j=>j.coverage.inputSlice.endUtf16===body.length));
});
test('a worker restart retains queued chunks and published understandings',async t=>{
 const f=await fixture(t);await f.service.tick();await f.service.shutdown();await f.db.close();const reopened=new Database(f.root);
 try{await reopened.call('ready');const continuity=new ContinuityService({database:reopened});assert.equal((await continuity.searchUnderstandings(f.context)).length,2);await continuity.growth('discover');assert.equal((await continuity.growth('jobs')).length,1);}finally{await reopened.close();}
});
test('pre-dispatch recovery requeues safely and missing provider does not consume the inference budget',async t=>{
 const f=await fixture(t);await f.continuity.growth('claim');await f.continuity.growth('recover');assert.equal((await f.service.jobs())[0].state,'queued');f.providers.secret=async()=>{throw Error('missing provider');};await f.service.tick();assert.equal((await f.service.jobs())[0].state,'blocked');assert.equal(f.calls.length,0);await f.service.tick();assert.equal(f.calls.length,0);
});
test('private runtime history is extracted only for its actual expert and never implies acceptance',async t=>{
 const f=await fixture(t);await f.db.call('saveRuns',[{id:'work',title:'完成的任务',employee:{id:'pm'},status:'completed',terminalTurnId:'u',createdAt:'2026-11-15',messages:[{id:'u',role:'user',text:'处理库存'},{id:'a',role:'assistant',phase:'final_answer',text:'实现了库存冲突提示。'}]}]);
 const source=(await f.continuity.call('status'),await f.continuity.search(f.context)); // unrelated private run has no domain link yet
 assert.ok(!source.some(s=>s.locator.runId==='work'));
 const {key}=require('../core/continuity/sources.cjs');await f.object('link',{id:'run-link',domainId:'inventory',target:{kind:'source',id:key('run-message','work','a')},state:'confirmed',origin:'user'});
 f.service.infer=async(c,j)=>({quote:j.input.source.body.slice(0,1000),segments:[]});await f.service.tick();await f.service.tick();const jobs=await f.service.jobs();const participant=jobs.find(j=>j.participation?.locator.runId==='work');assert.ok(participant);assert.equal(participant.participation.acceptance,'not-established');assert.ok(jobs.every(j=>j.employeeId==='pm'));
});
test('deleting an expert hides personal understanding but leaves shared source knowledge intact',async t=>{
 const f=await fixture(t);await f.service.tick();await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:[f.employees[1]]}});await assert.rejects(f.continuity.searchUnderstandings(f.context),/EXPERT_UNAVAILABLE/);
 await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'arch',projectIds:[]}]}});assert.equal((await f.continuity.searchKnowledge({...f.context,employeeId:'arch'})).length,1);assert.deepEqual(await f.continuity.searchUnderstandings({...f.context,employeeId:'arch'}),[]);
});
test('semantic conditions changing with the same text creates a new evidence version',async t=>{
 const f=await fixture(t);await f.service.tick();await f.spaces.saveDocument({id:f.doc.id,spaceId:f.space.id,expectedRevision:f.doc.revision,title:'库存规范',body:f.doc.body||'库存更新必须校验版本号。冲突时由用户决定是否重试。',conditions:'多仓库',adopted:true});await f.service.tick();assert.equal(f.calls.length,2);const current=await f.continuity.searchUnderstandings(f.context);assert.ok(current.some(k=>k.appliesTo.sourceConditions==='多仓库'));
});
test('withdraw then restore during inference does not let the old in-flight result become valid again',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=await fixture(t,async()=>{entered();await gate;return {quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'旧结果'}]};});const running=f.service.tick();await started;await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});const doc=(await f.spaces.snapshot()).documents.find(d=>d.id===f.doc.id);await f.spaces.restoreDocument({id:doc.id,expectedRevision:doc.revision});release();await running;assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.equal((await f.service.jobs())[0].state,'failed');
});
test('revoking and restoring membership cannot authorize an old background request',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=await fixture(t,async()=>{entered();await gate;return {quote:'库存更新必须校验版本号。',segments:[]};});const running=f.service.tick();await started;const removed=await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[]}});await f.spaces.save({id:removed.id,expectedRevision:removed.revision,value:{...removed,members:[{employeeId:'pm',projectIds:[]}]}});release();await running;assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);
});
test('two authorized experts share identical excerpts but never each other personal interpretations',async t=>{
 const f=await fixture(t);await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'pm',projectIds:[]},{employeeId:'arch',projectIds:[]}]}});await f.service.tick();await f.service.tick();assert.equal((await f.continuity.searchKnowledge(f.context)).length,1);const a=await f.continuity.searchUnderstandings(f.context),b=await f.continuity.searchUnderstandings({...f.context,employeeId:'arch'});assert.equal(a.length,2);assert.equal(b.length,2);assert.ok(a.every(k=>k.employeeId==='pm'));assert.ok(b.every(k=>k.employeeId==='arch'));await assert.rejects(f.continuity.readKnowledge({...f.context,employeeId:'arch'},{id:a[0].id,revision:1}),/ACCESS_DENIED/);
});
test('one invalid segment rejects the whole batch before any excerpt is published',async t=>{
 const f=await fixture(t,async()=>({quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'合法片段'},{type:'decision',body:'擅自升级为决定'}]}));await f.service.tick();assert.deepEqual(await f.continuity.searchKnowledge(f.context),[]);assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);
});
test('project-only sharing can be distilled within that destination without making it private-chat knowledge',async t=>{
 const f=await fixture(t);await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'p',expectedRevision:null,value:{id:'p',name:'项目',path:'/tmp',createdAt:''}}]});
 await f.db.call('saveRuns',[{id:'private',title:'仅分享给项目的历史',employee:{id:'arch'},status:'completed',terminalTurnId:'u',createdAt:'2026-11-15',messages:[{id:'u',role:'user',text:'讨论'},{id:'a',role:'assistant',phase:'final_answer',text:'只在客户项目复用的约定。'}]}]);
 const {key}=require('../core/continuity/sources.cjs'),sourceKey=key('run-message','private','a');await f.object('link',{id:'private-link',domainId:'inventory',target:{kind:'source',id:sourceKey},state:'confirmed',origin:'user'});await f.object('sharing',{id:'project-only',domainId:'inventory',readerEmployeeIds:['pm'],sourceSelectors:[{kind:'source',id:sourceKey}],destination:{kind:'project',id:'p'},includeFutureSources:true,status:'active'});
 f.service.infer=async(c,j)=>({quote:j.input.source.body.slice(0,1000),segments:[{type:'interpretation',body:'客户项目约定需要保留范围。'}]});await f.service.tick();await f.service.tick();await f.service.tick();
 const privateRecords=await f.continuity.searchUnderstandings(f.context),projectRecords=await f.continuity.searchUnderstandings({...f.context,destination:{kind:'project',id:'p'}});assert.ok(projectRecords.some(k=>k.sourceRefs.some(r=>r.sourceKey===sourceKey)));assert.ok(!privateRecords.some(k=>k.sourceRefs.some(r=>r.sourceKey===sourceKey)));
});
test('replaced unadopted document versions stop supplying automatic understanding',async t=>{
 const f=await fixture(t);f.service.infer=async(c,j)=>({quote:j.input.source.body.slice(0,1000),segments:[{type:'interpretation',body:j.input.source.body.slice(0,100)}]});await f.service.tick();const draft=await f.spaces.saveDocument({spaceId:f.space.id,title:'参考文档',body:'旧的参考约定'});await f.service.tick();assert.ok((await f.continuity.searchUnderstandings(f.context)).some(k=>k.body==='旧的参考约定'));
 await f.spaces.saveDocument({id:draft.id,spaceId:f.space.id,expectedRevision:draft.revision,title:'参考文档',body:'新的参考约定'});await f.service.tick();assert.ok(!(await f.continuity.searchUnderstandings(f.context)).some(k=>k.body==='旧的参考约定'));assert.ok((await f.continuity.searchUnderstandings(f.context)).some(k=>k.body==='新的参考约定'));
});
test('shutdown before provider dispatch preserves a queued job without an unknown model outcome',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),f=await fixture(t);f.providers.secret=async()=>{entered();await gate;return {model:'model'};};const running=f.service.tick();await started;const stopped=f.service.shutdown();release();await running;await stopped;assert.equal(f.calls.length,0);assert.equal((await f.service.jobs())[0].state,'queued');
});
test('pausing cancels dispatched extraction and cannot publish a late provider result',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=await fixture(t,async()=>{entered();await gate;return {quote:'库存更新必须校验版本号。',segments:[{type:'interpretation',body:'晚到的结果'}]};});const running=f.service.tick();await started;await f.service.policy({enabled:false,dailyLimit:20});release();await running;assert.deepEqual(await f.continuity.searchUnderstandings(f.context),[]);assert.equal((await f.service.jobs())[0].state,'interrupted');
});
