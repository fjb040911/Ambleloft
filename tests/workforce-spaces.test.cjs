const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Database}=require('../electron/database.cjs');const {SpaceService,spaceInstructions}=require('../core/workforce/spaces.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-spaces-')),database=new Database(root);await database.call('ready');const runtime={runs:[],async start(input,context){const run={id:'run-'+this.runs.length,employee:{id:input.employeeId},collaboration:context.collaboration,projectId:input.projectId,status:'completed',messages:[{role:'assistant',text:'Evidence from the selected inputs'}]};this.runs.push(run);return run;}};const service=new SpaceService({directory:root,database,workspace:{read:async()=>({projects:[{id:'gateway',path:'/existing/gateway'},{id:'router',path:'/existing/router'}]})},workforce:{read:async()=>({employees:[{id:'product'},{id:'architect'}]})},runtime});await service.initialize();t.after(async()=>{await service.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});const space=await service.save({value:{name:'AI Coding',purpose:'Clarify contracts',projectIds:['gateway','router'],members:[{employeeId:'product',assignment:'Requirements',projectIds:['gateway']},{employeeId:'architect',assignment:'Architecture',projectIds:['router']}]}});return {service,runtime,space};}
test('removed experts do not block saving other members and can be unlinked without deleting history',async t=>{
 const {service,space}=await fixture(t);
 await service.change(state=>{state.requests.push({id:'old-request',spaceId:space.id,mode:'discussion',documentRefs:[],participants:[{employeeId:'product',status:'completed'}]});});
 service.workforce.read=async()=>({employees:[{id:'architect'}]});
 const updated=await service.save({id:space.id,expectedRevision:space.revision,value:{...space,members:space.members.map(m=>m.employeeId==='architect'?{...m,assignment:'Updated assignment'}:m)}});
 assert.equal(updated.members.find(m=>m.employeeId==='architect').assignment,'Updated assignment');
 await assert.rejects(service.save({id:space.id,expectedRevision:updated.revision,value:{...updated,members:updated.members.map(m=>m.employeeId==='product'?{...m,assignment:'Unauthorized change'}:m)}}),/成员已移除/);
 const cleaned=await service.save({id:space.id,expectedRevision:updated.revision,value:{...updated,members:updated.members.filter(m=>m.employeeId!=='product')}});
 assert.deepEqual(cleaned.members.map(m=>m.employeeId),['architect']);
 assert.equal((await service.snapshot()).requests[0].participants[0].employeeId,'product');
 await assert.rejects(service.save({id:space.id,expectedRevision:cleaned.revision,value:{...cleaned,members:[...cleaned.members,space.members[0]]}}),/成员已移除/);
});
test('spaces reference existing project IDs; documents are versioned with explicit conflict and source checks',async t=>{const {service,space}=await fixture(t);assert.equal(space.rootPath,undefined);const d1=await service.saveDocument({spaceId:space.id,title:'Contract',body:'Revision one'});const d2=await service.saveDocument({id:d1.id,spaceId:space.id,expectedRevision:1,title:'Contract',body:'Revision two',adopted:true});assert.equal(d2.revision,2);assert.equal((await service.document({id:d1.id,revision:1})).body,'Revision one');await assert.rejects(service.saveDocument({id:d1.id,spaceId:space.id,expectedRevision:1,title:'Conflict',body:'Must not overwrite'}),/新版本/);await assert.rejects(service.saveDocument({spaceId:space.id,title:'Forged source',body:'Test',sourceRunId:'no-such-run'}),/不属于/);await assert.rejects(service.save({id:space.id,expectedRevision:0,value:space}),/已被修改/);});
test('discussion dispatch is idempotent, per-role and pinned to selected document revisions',async t=>{const {service,runtime,space}=await fixture(t);const doc=await service.saveDocument({spaceId:space.id,title:'Contract',body:'Selected version'});const input={clientRequestId:'request-a',spaceId:space.id,prompt:'Discuss responsibilities',mode:'discussion',employeeIds:['product','architect'],documentIds:[doc.id]};await Promise.all([service.start(input,{}),service.start(input,{})]);await service.start(input,{});assert.equal(runtime.runs.length,2);assert.ok(runtime.runs.every(r=>r.projectId===null));assert.match(spaceInstructions(runtime.runs[0].collaboration),/Do not implement/);await service.saveDocument({id:doc.id,spaceId:space.id,expectedRevision:1,title:'Contract',body:'New version'});assert.equal(runtime.runs[0].collaboration.documents[0].body,'Selected version');const s=await service.snapshot();assert.equal(s.requests[0].participants[0].output,'Evidence from the selected inputs');});
test('scope checks and reservation prevent concurrent writes, and interrupted preparations are not replayed',async t=>{const {service,runtime,space}=await fixture(t);const input={clientRequestId:'work-a',spaceId:space.id,prompt:'Implement',mode:'work',employeeIds:['product'],projectId:'router',documentIds:[]};await assert.rejects(service.start(input,{}),/未获分配/);input.projectId='gateway';let release;runtime.start=async()=>{await new Promise(r=>release=r);throw Error('Model unavailable');};const pending=service.start(input,{});await assert.rejects(service.start({...input,clientRequestId:'work-b'},{}),/正在准备/);await assert.rejects(service.save({id:space.id,expectedRevision:1,value:space}),/活跃任务/);while(!release)await new Promise(r=>setImmediate(r));release();await pending;assert.equal((await service.snapshot()).requests[0].participants[0].status,'failed');await service.change(s=>{s.requests[0].participants[0].status='preparing';});await service.initialize();assert.equal((await service.snapshot()).requests[0].participants[0].status,'interrupted');assert.equal(runtime.runs.length,0);});
test('result provenance keeps frozen role skills and resolves the referenced historical version',async t=>{
 const {service,runtime,space}=await fixture(t);
 const doc=await service.saveDocument({spaceId:space.id,title:'Original contract',body:'Original boundary'});
 await service.start({clientRequestId:'provenance',spaceId:space.id,prompt:'Review',mode:'discussion',employeeIds:['product'],documentIds:[doc.id]},{});
 runtime.runs[0].employee={id:'product',name:'Original product manager',revision:2,skills:[{id:'s1',name:'context',version:3,body:'Private skill body',path:'/private/source'}]};
 const result=await service.saveDocument({spaceId:space.id,title:'Role result',body:'Proposed boundary',sourceRunId:runtime.runs[0].id});
 await service.saveDocument({id:doc.id,spaceId:space.id,expectedRevision:1,title:'Updated contract',body:'Changed boundary'});
 const snapshot=await service.snapshot(),request=snapshot.requests[0];
 assert.deepEqual(request.participants[0].role,{name:'Original product manager',revision:2,skills:[{id:'s1',name:'context',version:3}]});
 const ref=request.documentRefs[0],original=await service.document({id:ref.id,revision:ref.revision});
 assert.equal(original.body,'Original boundary');assert.equal(original.hash,ref.hash);assert.equal(original.title,'Original contract');
 assert.equal((await service.document({id:result.id})).sourceRunId,runtime.runs[0].id);
});

test('new drafts preserve the adopted basis; work freezes that basis and reports subsequent adoption changes',async t=>{
 const {service,runtime,space}=await fixture(t);
 const first=await service.saveDocument({spaceId:space.id,title:'Boundary',body:'Gateway owns authentication',adopted:true});
 const second=await service.saveDocument({id:first.id,spaceId:space.id,expectedRevision:1,title:'Boundary draft',body:'Proposed new split'});
 assert.equal(second.adoptedRevision,1);assert.equal(second.state,'draft');
 assert.equal((await service.document({id:first.id,revision:1})).state,'adopted');
 const input={clientRequestId:'adopted-work',spaceId:space.id,prompt:'Implement the agreed boundary',mode:'work',employeeIds:['product'],projectId:'gateway',documentIds:[first.id]};
 await service.start(input,{});
 assert.equal(runtime.runs[0].collaboration.documents[0].revision,1);
 assert.equal(runtime.runs[0].collaboration.documents[0].body,'Gateway owns authentication');
 await assert.rejects(service.start({...input,clientRequestId:'draft-work',documentRefs:[{id:first.id,revision:2}]},{}),/已采纳/);
 await service.adoptDocument({id:first.id,revision:2,expectedRevision:2,expectedAdoptedRevision:1});
 assert.equal((await service.document({id:first.id,revision:1})).state,'superseded');
 assert.equal(runtime.runs[0].collaboration.documents[0].revision,1);
 assert.deepEqual((await service.snapshot()).requests[0].staleReferences,[{id:first.id,revision:1,currentRevision:2}]);
 await assert.rejects(service.adoptDocument({id:first.id,revision:1,expectedRevision:2,expectedAdoptedRevision:1}),/已变更/);
});

test('document commands survive retries and migration does not invent old adoptions',async t=>{
 const {service,space}=await fixture(t);
 const input={commandId:'document-command',spaceId:space.id,title:'Draft',body:'Keep this body'};
 const first=await service.saveDocument(input);assert.equal((await service.saveDocument(input)).id,first.id);
 assert.equal((await service.snapshot()).documents.length,1);
 await assert.rejects(service.saveDocument({...input,body:'Different command'}),/其他内容/);
 await assert.rejects(service.start({clientRequestId:'no-adoption',spaceId:space.id,prompt:'Work',mode:'work',employeeIds:['product'],projectId:'gateway',documentIds:[first.id]},{}),/已采纳/);
 await service.change(s=>{const d=s.documents[0];delete d.adoptedRevision;delete d.adoptions;d.state='draft';});
 const migrated=await service.read();assert.equal(migrated.documents[0].adoptedRevision,null);assert.equal(migrated.documents[0].versions[0].state,'unknown');
});

test('knowledge retrieval checks membership before and after the provider; tools are bound to the employee',async t=>{
 const {service,runtime,space}=await fixture(t),history=await service.save({value:{name:'Earlier project',purpose:'Reuse experience',projectIds:[],members:[{employeeId:'product',assignment:'Review',projectIds:[]}]}});
 const source=await service.saveDocument({spaceId:history.id,title:'Historical contract',body:'Gateway owns authentication',conditions:'Only for the single-instance topology',kind:'experience',adopted:true});
 assert.equal((await service.knowledge({employeeId:'architect'})).length,0);
 await service.start({clientRequestId:'history-query',spaceId:space.id,prompt:'Compare',mode:'discussion',employeeIds:['product'],historySpaceIds:[history.id]},{});
 const run=runtime.runs[0],tools=service.bindTools(run,()=>{});
 const results=await tools.call('space_search_knowledge',{query:'Gateway'});assert.equal(results[0].conditions,'Only for the single-instance topology');assert.equal(run.collaboration.retrievedRefs[0].hash,source.hash);
 const draft=await tools.call('space_propose_document',{commandId:'proposal',title:'New recommendation',body:'Review this proposal'});assert.equal(draft.adoptedRevision,null);assert.equal((await service.document({id:draft.id})).sourceRefs[0].id,source.id);
 await assert.rejects(tools.call('space_propose_document',{commandId:'invalid',id:source.id,expectedRevision:1,title:'No',body:'No'}),/其他空间/);
 service.memoryProvider={search:async({candidates})=>{await service.save({id:history.id,expectedRevision:1,value:{...history,members:[]}});return candidates;}};
 assert.equal((await service.knowledge({employeeId:'product'})).length,0);
 await assert.rejects(tools.call('space_read_document',{id:source.id,revision:1}),/授权已撤回/);
});

test('withdrawal invalidates derived sources and old contexts; restore requires fresh review',async t=>{
 const {service,runtime,space}=await fixture(t),source=await service.saveDocument({spaceId:space.id,title:'Basis',body:'Selected basis',adopted:true});
 await service.start({clientRequestId:'withdrawal',spaceId:space.id,prompt:'Review',mode:'discussion',employeeIds:['product'],documentIds:[source.id]},{});
 const run=runtime.runs[0],derived=await service.saveDocument({spaceId:space.id,title:'Derived',body:'Summary',sourceRunId:run.id,adopted:true});
 const withdrawn=await service.withdrawDocument({id:source.id,expectedRevision:1});assert.deepEqual(new Set(withdrawn.documentIds),new Set([source.id,derived.id]));
 assert.equal((await service.knowledge()).length,0);assert.equal(run.collaboration.documents[0].body,undefined);
 await assert.rejects(service.document({id:source.id}),/已撤回/);await assert.rejects(service.authorizeRun(run),/已撤回/);
 await assert.rejects(service.restoreDocument({id:derived.id,expectedRevision:1}),/先恢复来源/);
 await service.restoreDocument({id:source.id,expectedRevision:1});assert.equal((await service.document({id:source.id})).adoptedRevision,null);
 await assert.rejects(service.authorizeRun(run),/已撤回/);
});

test('space lifecycle archives read-only, restores, and deletes only space-owned records',async t=>{
 const {service,runtime,space}=await fixture(t);
 const doc=await service.saveDocument({spaceId:space.id,title:'Shared source',body:'Space content',adopted:true});
 const archived=await service.lifecycle({id:space.id,expectedRevision:1,action:'archive'});
 assert.ok(archived.archivedAt);assert.equal(archived.revision,2);
 assert.equal((await service.document({id:doc.id})).body,'Space content');
 await assert.rejects(service.save({id:space.id,expectedRevision:2,value:space}),/已归档/);
 await assert.rejects(service.saveDocument({spaceId:space.id,title:'Blocked',body:'No write'}),/已归档/);
 await assert.rejects(service.adoptDocument({id:doc.id,revision:1,expectedRevision:1,expectedAdoptedRevision:1}),/已归档/);
 await assert.rejects(service.withdrawDocument({id:doc.id,expectedRevision:1}),/已归档/);
 await assert.rejects(service.start({spaceId:space.id,clientRequestId:'archived-start',mode:'discussion',prompt:'No dispatch',employeeIds:['product']}),/已归档/);
 await assert.rejects(service.lifecycle({id:space.id,expectedRevision:1,action:'restore'}),/已变化/);
 const restored=await service.lifecycle({id:space.id,expectedRevision:2,action:'restore'});assert.equal(restored.archivedAt,null);
 await assert.rejects(service.lifecycle({id:space.id,expectedRevision:3,action:'delete'}),/先归档/);
 await service.start({spaceId:space.id,clientRequestId:'preserved-run',mode:'discussion',prompt:'Discuss',employeeIds:['product']});
 const run=runtime.runs[0];run.status='completed';
 const projects=await service.workspace.read();
 await service.lifecycle({id:space.id,expectedRevision:3,action:'archive'});
 await service.lifecycle({id:space.id,expectedRevision:4,action:'delete'});
 const snapshot=await service.snapshot();assert.equal(snapshot.spaces.length,0);assert.equal(snapshot.documents.length,0);assert.equal(snapshot.requests.length,0);
 assert.equal(runtime.runs[0],run);assert.deepEqual(await service.workspace.read(),projects);
 await assert.rejects(service.document({id:doc.id}),/不存在/);
 await assert.rejects(fs.stat(require('node:path').join(service.root,space.id)),{code:'ENOENT'});
});
test('space lifecycle refuses running plans, pending dispatch and external active references',async t=>{
 const {service,runtime,space}=await fixture(t),input={id:space.id,expectedRevision:1,action:'archive'};
 service.spaceLocks.set(space.id,1);await assert.rejects(service.lifecycle(input),/执行中/);service.spaceLocks.clear();
 await service.change(s=>{s.plans.push({id:'running-plan',spaceId:space.id,status:'running'});});
 await assert.rejects(service.lifecycle(input),/执行中/);
 await service.change(s=>{s.plans=[];});
 runtime.runs.push({id:'foreign',status:'waiting',collaboration:{historySpaceIds:[space.id]}});
 await assert.rejects(service.lifecycle(input),/执行中/);runtime.runs=[];
 await assert.rejects(service.lifecycle({...input,id:'../outside'}),/无效/);
 assert.equal((await service.read()).spaces[0].archivedAt,undefined);
});
test('archiving persists, blocks plan dispatch and preserves documents referenced by another space',async t=>{
 const {service,space}=await fixture(t);
 const source=await service.saveDocument({spaceId:space.id,title:'Basis',body:'Pinned source'});
 await service.change(s=>s.plans.push({id:'draft-plan',spaceId:space.id,revision:1,status:'draft',packages:[]}));
 await service.lifecycle({id:space.id,expectedRevision:1,action:'archive'});
 await service.initialize();assert.ok((await service.read()).spaces[0].archivedAt);
 await assert.rejects(service.controlPlan({id:'draft-plan',expectedRevision:1,commandId:'start-archived',action:'start'}),/已归档/);
 await service.change(s=>s.documents.push({id:'derived',spaceId:'other-space',adoptedRevision:null,adoptions:[],revision:1,versions:[{revision:1,sourceRefs:[{id:source.id,revision:1,hash:source.hash}]}]}));
 await assert.rejects(service.lifecycle({id:space.id,expectedRevision:2,action:'delete'}),/其他空间/);
 assert.equal((await service.document({id:source.id})).body,'Pinned source');
});

test('discussion lifecycle protects active runs and keeps conclusion versions independent',async t=>{
 const {service,runtime,space}=await fixture(t);
 const input={clientRequestId:'discussion-root',spaceId:space.id,prompt:'Discuss the goal',mode:'discussion',employeeIds:['product']};
 await service.start(input,{});const run=runtime.runs[0];
 const conclusion=await service.saveDocument({spaceId:space.id,sourceDiscussionId:'discussion-root',title:'Conclusion',body:'First draft'});
 await service.submitDocumentReview({id:conclusion.id,revision:1,expectedRevision:1});assert.equal((await service.document({id:conclusion.id})).state,'review');
 await service.adoptDocument({id:conclusion.id,revision:1,expectedRevision:1,expectedAdoptedRevision:null});
 run.status='running';await assert.rejects(service.discussionLifecycle({requestId:'discussion-root',expectedRevision:0,action:'close'}),/正在工作/);
 run.status='completed';const closed=await service.discussionLifecycle({requestId:'discussion-root',expectedRevision:0,action:'close'});assert.equal(closed.status,'closed');
 await assert.rejects(service.start({...input,clientRequestId:'blocked-followup',replyTo:'discussion-root'},{}),/已关闭/);
 await assert.rejects(service.authorizeRun(run),/已关闭/);
 await assert.rejects(service.discussionLifecycle({requestId:'discussion-root',expectedRevision:0,action:'reopen'}),/已变化/);
 await service.discussionLifecycle({requestId:'discussion-root',expectedRevision:1,action:'reopen'});
 await service.start({...input,clientRequestId:'followup',replyTo:'discussion-root'},{});
 const next=await service.saveDocument({id:conclusion.id,spaceId:space.id,expectedRevision:1,title:'Conclusion',body:'Updated draft'});
 assert.equal(next.sourceDiscussionId,'discussion-root');assert.equal(next.adoptedRevision,1);assert.equal(next.state,'draft');
 assert.equal((await service.document({id:conclusion.id,revision:1})).state,'adopted');
 await service.discussionLifecycle({requestId:'followup',expectedRevision:2,action:'close'});
 assert.equal((await service.snapshot()).discussionStates['discussion-root'].status,'closed');
});

test('discussion forwards explicit composer settings to every expert without expanding project scope',async t=>{
 const {service,runtime,space}=await fixture(t),calls=[];const start=runtime.start.bind(runtime);runtime.start=async(input,context)=>{calls.push(structuredClone(input));return start(input,context);};
 const input={clientRequestId:'composer-full',spaceId:space.id,prompt:'Discuss the attached brief',mode:'discussion',employeeIds:['product','architect'],permission:'full',attachments:[{name:'brief.md',path:'/tmp/brief.md'}],selectedSkillIds:['review'],providerId:'provider-b',model:'model-b'};
 await service.start(input,{});
 assert.equal(calls.length,2);for(const call of calls){assert.equal(call.permission,'full');assert.deepEqual(call.attachments,input.attachments);assert.deepEqual(call.selectedSkillIds,['review']);assert.equal(call.providerId,'provider-b');assert.equal(call.projectId,null);}
 await service.start({...input,clientRequestId:'composer-default',permission:undefined,attachments:undefined,selectedSkillIds:undefined},{});assert.equal(calls[2].permission,'default');
 await assert.rejects(service.start({...input,clientRequestId:'composer-invalid',permission:'invalid'},{}),/权限模式无效/);assert.equal(calls.length,4);
});

test('archived space knowledge stays traceable until the space is permanently deleted',async t=>{
 const {service,space}=await fixture(t);
 const doc=await service.saveDocument({spaceId:space.id,title:'Archived agreement',body:'Keep the original evidence',adopted:true});
 const before=(await service.snapshot()).spaces.find(s=>s.id===space.id);
 await service.lifecycle({id:space.id,expectedRevision:before.revision,action:'archive'});
 assert.equal((await service.knowledge({employeeId:'product'}))[0].id,doc.id);
 assert.equal((await service.document({id:doc.id,revision:1})).body,'Keep the original evidence');
 const archived=(await service.snapshot()).spaces.find(s=>s.id===space.id);
 await service.lifecycle({id:space.id,expectedRevision:archived.revision,action:'delete'});
 assert.deepEqual(await service.knowledge({employeeId:'product'}),[]);
});

test('discussion identity is durable, independently scoped and does not manufacture same-round exchanges',async t=>{
 const {service,runtime,space}=await fixture(t);
 const doc=await service.saveDocument({spaceId:space.id,title:'Brief',body:'Frozen brief'});
 const input={clientRequestId:'identity-first',spaceId:space.id,prompt:'Analyze the goal',mode:'discussion',employeeIds:['product','architect'],documentIds:[doc.id]};
 const first=(await service.start(input,{})).requests[0];
 assert.deepEqual(first.discussion,{schemaVersion:1,id:first.id,mode:'consultation',provenance:'recorded'});
 assert.equal(runtime.runs.length,2);
 assert.equal(new Set(first.participants.map(p=>p.contribution.id)).size,2);
 for(const [index,p] of first.participants.entries()){
  const c=p.contribution;assert.equal(c.author.id,p.employeeId);assert.equal(c.stage,'analysis');assert.equal(c.replyToContributionId,null);
  assert.deepEqual(c.context.priorRequestIds,[]);assert.equal(c.context.documents[0].revision,1);
  assert.equal(runtime.runs[index].collaboration.contributionId,c.id);assert.equal(c.runId,runtime.runs[index].id);
  assert.equal(runtime.runs[index].collaboration.priorDiscussion,null);
 }
 assert.notEqual(first.participants[0].contribution.context.version,first.participants[1].contribution.context.version);
 const persisted=(await service.read()).requests[0];assert.equal(persisted.participants[0].contribution.id,first.participants[0].contribution.id);
 await service.start(input,{});assert.equal(runtime.runs.length,2);
 await service.saveDocument({id:doc.id,spaceId:space.id,expectedRevision:1,title:'Changed',body:'Different brief'});
 const second=(await service.start({...input,clientRequestId:'identity-second',replyTo:first.id},{})).requests[0];
 assert.equal(second.discussion.id,first.id);assert.equal(second.round,2);
 for(const p of second.participants){assert.deepEqual(p.contribution.context.priorRequestIds,[first.id]);assert.equal(p.contribution.replyToContributionId,null);assert.equal(p.contribution.context.documents[0].revision,2);}
 assert.equal((await service.snapshot()).requests.find(r=>r.id===first.id).participants[0].contribution.context.documents[0].revision,1);
});
test('legacy discussion projections are stable, read-only and explicitly lack context evidence',async t=>{
 const {service,space}=await fixture(t);
 await service.change(s=>s.requests.push({id:'legacy-round',spaceId:space.id,mode:'discussion',documentRefs:[],participants:[{employeeId:'product',status:'completed'}]}));
 const before=await service.read(),one=(await service.snapshot()).requests[0],two=(await service.snapshot()).requests[0];
 assert.equal(one.discussion.provenance,'legacy');assert.deepEqual(one.participants[0].contribution,two.participants[0].contribution);
 assert.equal(one.participants[0].contribution.context,null);assert.equal(one.participants[0].contribution.stage,null);assert.equal(one.participants[0].contribution.replyToContributionId,null);
 assert.deepEqual(await service.read(),before);
});
test('a failed expert retains attribution and successful siblings keep their own model and run',async t=>{
 const {service,runtime,space}=await fixture(t);const start=runtime.start.bind(runtime);
 service.workforce.read=async()=>({employees:[{id:'product',name:'Product manager'},{id:'architect',name:'Architect'}]});
 runtime.start=async(input,context)=>{if(input.employeeId==='architect')throw Error('Provider unavailable');const run=await start(input,context);run.model='Model A';run.employee.name='Product manager';return run;};
 const r=(await service.start({clientRequestId:'identity-failed',spaceId:space.id,prompt:'Analyze',mode:'discussion',employeeIds:['product','architect']},{})).requests[0];
 assert.equal(r.participants[0].contribution.model,'Model A');assert.equal(r.participants[0].contribution.author.name,'Product manager');
 assert.equal(r.participants[1].status,'failed');assert.equal(r.participants[1].contribution.author.name,'Architect');assert.equal(r.participants[1].contribution.runId,null);assert.equal(r.participants[1].contribution.model,null);
 assert.equal(runtime.runs.length,1);
});

test('deleting a legacy discussion removes all rounds but preserves documents and frozen task evidence',async t=>{
 const {service,runtime,space}=await fixture(t);
 const input={clientRequestId:'delete-root',spaceId:space.id,prompt:'Plan repair tickets',mode:'discussion',employeeIds:['product']};
 await service.start(input,{});
 await service.start({...input,clientRequestId:'delete-followup',replyTo:input.clientRequestId,prompt:'Use /api/v1'},{});
 await service.start({...input,clientRequestId:'unrelated'},{});
 // Legacy discussions have no structured discussion metadata.
 await service.change(s=>{for(const r of s.requests)delete r.discussion;});
 const doc=await service.saveDocument({spaceId:space.id,sourceDiscussionId:input.clientRequestId,title:'Confirmed scope',body:'Saved evidence',adopted:true});
 const draft=await service.createTaskDraft({spaceId:space.id,discussionId:input.clientRequestId,commandId:'preserve-draft'});
 const source={discussionId:input.clientRequestId,draftId:draft.id,snapshot:draft.source};
 await service.change(s=>s.plans.push({id:'preserved-plan',spaceId:space.id,status:'draft',packages:[],events:[],source}));
 const expected=await service.snapshot();
 await assert.rejects(service.discussionLifecycle({requestId:input.clientRequestId,action:'delete',expectedRevision:1}),/已变化/);
 const removed=await service.discussionLifecycle({requestId:'delete-followup',action:'delete',expectedRevision:0});
 assert.equal(removed.status,'deleted');assert.deepEqual(new Set(removed.requestIds),new Set(['delete-root','delete-followup']));
 let snapshot=await service.snapshot();assert.deepEqual(snapshot.requests.map(r=>r.id),['unrelated']);
 assert.deepEqual(snapshot.documents,expected.documents);assert.deepEqual(snapshot.taskDrafts,expected.taskDrafts);assert.deepEqual(snapshot.plans,expected.plans);assert.equal(runtime.runs.length,3);
 assert.equal((await service.document({id:doc.id})).body,'Saved evidence');
 const revised=await service.saveDocument({id:doc.id,spaceId:space.id,sourceDiscussionId:input.clientRequestId,title:doc.title,body:'An independent new revision',expectedRevision:1});assert.equal(revised.adoptedRevision,1);
 await assert.rejects(service.saveDocument({spaceId:space.id,sourceDiscussionId:input.clientRequestId,title:'Forged new source',body:'Do not recreate'}),/不属于/);
 await assert.rejects(service.start(input,{}),/已删除/);
 await assert.rejects(service.start({...input,clientRequestId:'new-reply',replyTo:'delete-followup'},{}),/已删除/);
 await assert.rejects(service.coordinateDiscussion({...input,clientRequestId:'delete-followup'},{}),/已删除/);
 await assert.rejects(service.coordinateDiscussion({...input,clientRequestId:'new-host',replyTo:'delete-root'},{}),/已删除/);
 await assert.rejects(service.authorizeRun(runtime.runs[0]),/已删除/);
 await assert.rejects(service.discussionLifecycle({requestId:'delete-root',action:'reopen',expectedRevision:1}),/已删除/);
 const other=await service.save({value:{name:'Other space',projectIds:[],members:[]}});await service.lifecycle({id:other.id,expectedRevision:1,action:'archive'});await service.lifecycle({id:other.id,expectedRevision:2,action:'delete'});
 await service.initialize();snapshot=await service.snapshot();assert.equal(snapshot.discussionStates['delete-root'].status,'deleted');assert.equal(snapshot.requests.length,1);
 await assert.rejects(service.start(input,{}),/已删除/);
});

test('discussion deletion blocks active experts, a running host and pending starts, then accepts stopped or closed discussions',async t=>{
 const {service,runtime,space}=await fixture(t);
 await service.start({clientRequestId:'active-delete',spaceId:space.id,prompt:'Review',mode:'discussion',employeeIds:['product']},{});
 const remove=()=>service.discussionLifecycle({requestId:'active-delete',action:'delete',expectedRevision:0});
 runtime.runs[0].status='running';await assert.rejects(remove(),/停止/);runtime.runs[0].status='completed';
 await service.change(s=>{s.requests[0].host={status:'running'};});await assert.rejects(remove(),/停止/);
 await service.change(s=>{s.requests[0].host.status='interrupted';});
 service.spaceLocks.set(space.id,1);await assert.rejects(remove(),/准备请求/);service.spaceLocks.delete(space.id);
 await service.discussionLifecycle({requestId:'active-delete',action:'close',expectedRevision:0});
 await service.discussionLifecycle({requestId:'active-delete',action:'delete',expectedRevision:1});
 assert.equal((await service.snapshot()).requests.length,0);
});
