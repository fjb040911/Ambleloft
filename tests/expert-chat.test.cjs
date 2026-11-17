const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Database}=require('../electron/database.cjs');
const {SpaceService}=require('../core/workforce/spaces.cjs');
const {ContinuityService}=require('../core/continuity/service.cjs');
const {ExpertChatService}=require('../core/continuity/expert-chat.cjs');
const {randomUUID}=require('node:crypto');
async function fixture(t,infer){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-chat-')),db=new Database(root);await db.call('ready');
 const employees=[{id:'pm',name:'产品经理',responsibilities:'分析需求',methods:'验证假设',modelChoice:{providerId:'expert-provider',model:'expert-model'}},{id:'arch',name:'架构师'}];
 await db.call('writeSetting',{key:'workforce.roles.v1',value:{employees}});
 const workforce={read:()=>db.call('readSetting',{key:'workforce.roles.v1'})};
 const spaces=new SpaceService({directory:root,database:db,workspace:{read:()=>db.call('readWorkspace')},workforce,runtime:{runs:[],stop:async()=>{},changed(){},persist:async()=>{}}});await spaces.initialize();
 const space=await spaces.save({value:{name:'库存业务',projectIds:[],members:[{employeeId:'pm',projectIds:[]}]}});
 const continuity=new ContinuityService({database:db});
 const object=(kind,value,expectedRevision=null)=>continuity.putObject({commandId:randomUUID(),kind,value,expectedRevision});
 await object('domain',{id:'inventory',name:'库存业务',aliases:['Inventory'],status:'active'});
 await object('link',{id:'link',domainId:'inventory',target:{kind:'space',id:space.id},state:'confirmed',origin:'user'});
 const doc=await spaces.saveDocument({spaceId:space.id,title:'库存合同',body:'库存变更使用乐观锁。',adopted:true});
 const calls=[],configs=[];
 const service=new ExpertChatService({database:db,continuity,workforce,providers:{secret:async(...args)=>{configs.push(args);return {model:'expert-model'};}},infer:async(config,job,signal)=>{calls.push(job);return {unresolvedQuestions:[],...(infer?await infer(config,job,signal):{text:'建议保持版本检查。',citations:job.input.background.map(s=>s.sourceId)})};}});await service.initialize();
 const send=(extra={})=>service.submit({commandId:randomUUID(),text:'库存业务如何避免冲突？',selectedEmployeeIds:['pm'],...extra});
 const settle=()=>Promise.all([...service.active.values()].map(j=>j.promise));
 t.after(async()=>{await service.shutdown();await spaces.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,db,service,spaces,space,doc,continuity,object,calls,configs,send,settle,employees};
}
test('new @expert chat persists a draft identity, uses expert model, injects only authorized context and shows citations',async t=>{
 const f=await fixture(t),result=await f.send();await f.settle();
 const s=await f.service.read(result);assert.equal(s.turns[0].status,'completed');assert.equal(s.turns[0].references.length,1);assert.equal(s.turns[0].references[0].cited,true);
 assert.equal(f.calls[0].input.background[0].body,'库存变更使用乐观锁。');assert.deepEqual(f.configs[0],['expert-provider','expert-model']);assert.equal(f.calls[0].input.expert.methods,'验证假设');
 assert.equal(f.calls[0].input.threadId,undefined);assert.equal(f.calls[0].tools,undefined);assert.equal((await f.db.call('readRuns')).length,0);
 assert.equal((await f.db.call('readWorkspace')).tasks[0].conversationId,result.conversationId);
 assert.match(await f.service.export(result),/库存合同/);
 assert.match((await f.service.searchable())[result.conversationId],/版本检查/);
});
test('pasted @ text, duplicate recipients and oversized groups cannot impersonate experts',async t=>{
 const f=await fixture(t);await assert.rejects(f.send({text:'@产品经理 hi',selectedEmployeeIds:[]}),/请选择/);
 await assert.rejects(f.send({selectedEmployeeIds:['pm','pm']}),/请选择/);await assert.rejects(f.send({selectedEmployeeIds:['pm','arch','x','y','z']}),/请选择/);await assert.rejects(f.send({selectedEmployeeIds:['missing']}),/EXPERT_UNAVAILABLE/);assert.equal(f.calls.length,0);
});
test('nonmember cannot retrieve the same domain background, forged destination is ignored',async t=>{
 const f=await fixture(t);const r=await f.send({selectedEmployeeIds:['arch'],context:{employeeId:'pm'}});await f.settle();assert.deepEqual(f.calls[0].input.background,[]);assert.equal((await f.service.read(r)).turns[0].status,'completed');
});
test('exclude removes both source and contaminated previous answer from the next clean call',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();const first=(await f.service.read(r)).turns[0];
 await f.service.exclude({...r,sourceKey:first.references[0].ref.sourceKey});
 await assert.rejects(f.service.source({...r,sourceId:first.references[0].ref.id}),/失效/);
 await f.send({conversationId:r.conversationId,text:'继续说明'});await f.settle();
 assert.deepEqual(f.calls[1].input.background,[]);assert.deepEqual(f.calls[1].input.history,[]);
 const state=await f.service.read(r);assert.equal(state.turns[0].answer,undefined);assert.equal(state.turns[0].contextUnavailable,true);assert.equal(state.turns[1].status,'completed');
});
test('same expert followup reuses valid discussion but a different expert does not',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();await f.send({conversationId:r.conversationId,text:'继续说明'});await f.settle();assert.equal(f.calls[1].input.history.length,1);
 await f.send({conversationId:r.conversationId,selectedEmployeeIds:['arch']});await f.settle();assert.deepEqual(f.calls[2].input.history,[]);
});
test('unrelated domain changes do not destroy still-authorized historical answers',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();await f.object('domain',{id:'other',name:'其他',status:'active'});
 assert.equal((await f.service.read(r)).turns[0].contextUnavailable,false);
 await f.send({conversationId:r.conversationId,text:'继续说明'});await f.settle();assert.equal(f.calls[1].input.history.length,1);
});
test('withdrawal during inference rejects a late completed reply',async t=>{
 let release,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const f=await fixture(t,async(c,j)=>{started();await gate;return {text:'late secret',citations:j.input.background.map(s=>s.sourceId)};});const r=await f.send();await entered;
 await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});release();await f.settle();const turn=(await f.service.read(r)).turns[0];assert.equal(turn.status,'failed');assert.equal(turn.answer,undefined);
});
test('exclusion cancels in-flight answer and late completions cannot revive it',async t=>{
 let release,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const f=await fixture(t,async(c,j)=>{started();await gate;return {text:'late',citations:[]};}),r=await f.send();await entered;
 const turn=(await f.service.read(r)).turns[0];await f.service.exclude({...r,sourceKey:turn.references[0].ref.sourceKey});release();await f.settle();assert.equal((await f.service.read(r)).turns[0].status,'cancelled');
});
test('duplicate command is idempotent, another active turn and runtime start are rejected',async t=>{
 let release;const gate=new Promise(r=>release=r),f=await fixture(t,async()=>{await gate;return {text:'done',citations:[]};});const commandId=randomUUID(),r=await f.send({commandId});
 const duplicate=await f.send({commandId});assert.equal(duplicate.turnId,r.turnId);await assert.rejects(f.send({commandId,text:'different'}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(f.send({conversationId:r.conversationId}),/CHAT_BUSY/);const state=await f.service.read(r);await assert.rejects(f.service.call('checkRun',{draftId:state.anchor.recordId}),/专家正在回复/);
 release();await f.settle();assert.equal(f.calls.length,1);
});
test('unknown model citation fails closed',async t=>{
 const f=await fixture(t,async()=>({text:'fake',citations:['invented-source']})),r=await f.send();await f.settle();const turn=(await f.service.read(r)).turns[0];assert.equal(turn.status,'failed');assert.equal(turn.answer,undefined);
});
test('ambiguous aliases require user domain choice before any request or draft is created',async t=>{
 const f=await fixture(t);await f.object('domain',{id:'other',name:'Other',aliases:['Inventory'],status:'active'});
 await assert.rejects(f.send({text:'Inventory 的边界'}),/多个业务领域/);assert.equal((await f.db.call('readWorkspace')).tasks.length,0);
 await f.send({text:'Inventory 的边界',domainId:'inventory'});await f.settle();assert.equal(f.calls.length,1);
});
test('project destination never inherits private-chat sharing',async t=>{
 const f=await fixture(t);await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'p',expectedRevision:null,value:{id:'p',name:'项目',path:'/tmp',createdAt:''}}]});
 await f.send({projectId:'p'});await f.settle();assert.deepEqual(f.calls[0].input.background,[]);
});
test('recovery marks active turns interrupted instead of replaying model calls',async t=>{
 const f=await fixture(t);const result=await f.service.call('begin',{commandId:randomUUID(),request:{text:'recovery',projectId:null},turn:{employee:{id:'pm',name:'产品经理'}}});
 await f.service.initialize();const state=await f.service.read({conversationId:result.state.id});assert.equal(state.turns[0].status,'interrupted');assert.equal(f.calls.length,0);
});
test('draft to run migration retains expert transcript without modifying runtime actor or messages',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();const draft=(await f.db.call('readWorkspace')).tasks[0];
 const run={id:'run',draftId:draft.id,title:'test',projectId:null,status:'completed',employee:{id:'arch'},createdAt:new Date().toISOString(),messages:[{id:'u',role:'user',text:'普通任务'},{id:'a',role:'assistant',text:'原助手回答',phase:'final_answer'}]};
 await f.db.call('commitRunStart',{runs:[run],draftId:draft.id,expectedRevision:draft.revision});const state=await f.service.read(r);assert.equal(state.anchor.kind,'run');assert.equal(state.turns.length,1);
 await f.send({conversationId:r.conversationId,text:'继续'});await f.settle();assert.deepEqual(f.calls[1].input.taskContext.items.filter(i=>i.kind==='user-instruction').map(i=>i.body),['普通任务']);assert.ok(!JSON.stringify(f.calls[1].input).includes('原助手回答'));
 const saved=(await f.db.call('readRuns'))[0];assert.equal(saved.employee.id,'arch');assert.deepEqual(saved.messages,run.messages);
});
test('deleted chat cannot be read, exported, or resurrected by a late reply',async t=>{
 const commandId=randomUUID();
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r),f=await fixture(t,async()=>{started();await gate;return {text:'late',citations:[]};}),r=await f.send({commandId});await entered;
 const draft=(await f.db.call('readWorkspace')).tasks[0];await f.db.call('patchWorkspace',{changes:[{kind:'draft',id:draft.id,action:'delete',expectedRevision:draft.revision}]});release();await f.settle();await assert.rejects(f.service.read(r),/CHAT_UNAVAILABLE/);await assert.rejects(f.service.export(r),/CHAT_UNAVAILABLE/);assert.deepEqual(await f.service.searchable(),{});await assert.rejects(f.send({commandId}),/CHAT_UNAVAILABLE/);assert.equal((await f.db.call('readWorkspace')).tasks.length,0);
});
test('no domain still permits discussion with an explicit absence-of-background notice',async t=>{
 const f=await fixture(t);await f.send({text:'请解释乐观锁'});await f.settle();assert.deepEqual(f.calls[0].input.background,[]);assert.match(f.calls[0].input.backgroundNotice,/尚未关联/);await f.send({text:'Inventorying is only a word example'});await f.settle();assert.deepEqual(f.calls[1].input.background,[]);
});
test('confirmed project domain is selected automatically but requires a matching destination grant',async t=>{
 const f=await fixture(t);await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'p',expectedRevision:null,value:{id:'p',name:'项目',path:'/tmp',createdAt:''}}]});
 await f.object('link',{id:'project-link',domainId:'inventory',target:{kind:'project',id:'p'},state:'confirmed',origin:'user'});
 await f.object('sharing',{id:'grant',domainId:'inventory',sourceSelectors:[{kind:'space',id:f.space.id}],readerEmployeeIds:['pm'],destination:{kind:'project',id:'p'},includeFutureSources:true,status:'active'});
 await f.send({projectId:'p',text:'请补充背景'});await f.settle();assert.equal(f.calls[0].input.background.length,1);
});
test('Chinese keyword retrieval prioritizes relevant documents before the candidate limit',async t=>{
 const {rank}=require('../core/continuity/retrieval.cjs');const docs=Array.from({length:70},(_,i)=>({id:String(i),title:'常规说明',body:'无关背景'}));docs.push({id:'wanted',title:'库存并发冲突',body:'乐观锁'});assert.equal(rank(docs,'如何解决库存并发冲突？')[0].id,'wanted');
 const f=await fixture(t);await f.spaces.saveDocument({spaceId:f.space.id,title:'并发冲突',body:'使用版本号',adopted:true});await f.send({text:'库存业务如何处理并发冲突？'});await f.settle();assert.equal(f.calls[0].input.background[0].title,'并发冲突');
});
test('archived chats remain readable and exportable but cannot accept new turns',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();const draft=(await f.db.call('readWorkspace')).tasks[0];await f.db.call('patchWorkspace',{changes:[{kind:'draft',action:'put',id:draft.id,expectedRevision:draft.revision,value:{...draft,archivedAt:new Date().toISOString()}}]});
 assert.match(await f.service.export(r),/版本检查/);await assert.rejects(f.send({conversationId:r.conversationId}),/CHAT_ARCHIVED/);
});
test('existing execution draft expert identity survives workspace persistence without selecting a discussion recipient',async t=>{
 const f=await fixture(t);const value={id:'draft',title:'draft',prompt:'question',status:'draft',modelId:'',projectId:null,createdAt:'',employeeId:'pm',employeeName:'产品经理'};
 const state=await f.db.call('patchWorkspace',{changes:[{kind:'draft',action:'put',id:'draft',expectedRevision:null,value}]});assert.equal(state.tasks[0].employeeId,'pm');assert.equal((await f.service.read({conversationId:state.tasks[0].conversationId})).turns.length,0);
 await assert.rejects(f.db.call('patchWorkspace',{changes:[{kind:'draft',action:'put',id:'draft',expectedRevision:state.tasks[0].revision,value:{...value,employeeId:42}}]}),/Invalid draft expert/);
});
test('membership revocation removes answer, source detail, search and export content',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();const first=(await f.service.read(r)).turns[0];
 await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[]}});
 const state=await f.service.read(r);assert.equal(state.turns[0].answer,undefined);await assert.rejects(f.service.source({...r,sourceId:first.references[0].ref.id}),/失效/);assert.ok(!(await f.service.export(r)).includes('版本检查'));assert.ok(!(await f.service.searchable())[r.conversationId].includes('版本检查'));
});
test('shared knowledge dependencies are injected and invalidated with their original source',async t=>{
 const f=await fixture(t),context={employeeId:'pm',domainIds:['inventory'],destination:{kind:'profile-private-chat'}};
 const source=(await f.continuity.search(context))[0],epoch=(await f.continuity.initialize()).epoch;
 await f.continuity.publishKnowledge({commandId:randomUUID(),context,expectedEpoch:epoch,expectedRevision:null,value:{id:'knowledge',domainId:'inventory',claimType:'fact',body:'版本冲突需要重试。',sourceRefs:[source.ref],knowledgeRefs:[]}});
 const r=await f.send();await f.settle();assert.equal(f.calls[0].input.sharedKnowledge[0].body,'版本冲突需要重试。');
 await f.service.exclude({...r,sourceKey:source.ref.sourceKey});await f.send({conversationId:r.conversationId,text:'继续'});await f.settle();assert.deepEqual(f.calls[1].input.sharedKnowledge,[]);assert.deepEqual(f.calls[1].input.history,[]);
});
test('expert turns survive a database worker restart with the same anchor',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();await f.db.close();const reopened=new Database(f.root);
 try{await reopened.call('ready');const state=await reopened.call('expertChat',{action:'read',conversationId:r.conversationId});assert.equal(state.turns[0].status,'completed');assert.equal(state.turns[0].employee.id,'pm');assert.equal(state.anchor.kind,'draft');}finally{await reopened.close();}
});
test('runtime entry point blocks original execution while expert reply is reserved',async()=>{
 const {AgentRuntime}=require('../electron/agent-runtime.cjs');const runtime=new AgentRuntime({directory:'/unused',publish(){}});let checked=false;
 runtime.expertChat={call:async(action,input)=>{assert.equal(action,'checkRun');assert.equal(input.runId,'run');checked=true;throw Error('EXPERT_BUSY');}};
 await assert.rejects(runtime.start({runId:'run',prompt:'execute'}),/EXPERT_BUSY/);assert.equal(checked,true);assert.equal(runtime.contexts.size,0);
});
test('expert submission checks runtime reservations before a preparing execution has been saved',async t=>{
 const f=await fixture(t),r=await f.send();await f.settle();const state=await f.service.read(r);f.service.runtime={contexts:new Map([['reserved',{draftId:state.anchor.recordId}]])};await assert.rejects(f.send({conversationId:r.conversationId}),/CHAT_BUSY/);assert.equal(f.calls.length,1);
});
test('persistent policy events cancel active inference before the provider returns',async t=>{
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const f=await fixture(t,async()=>{started();await gate;return {text:'late secret',citations:[]};}),r=await f.send();await entered;
 await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});await f.service.watch();assert.equal((await f.service.read(r)).turns[0].status,'cancelled');release();await f.settle();assert.equal((await f.service.read(r)).turns[0].answer,undefined);
});
test('authorization is rechecked after model configuration and before network dispatch',async t=>{
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r),f=await fixture(t);
 f.service.providers.secret=async()=>{started();await gate;return {model:'test'};};const r=await f.send();await entered;await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});release();await f.settle();assert.equal(f.calls.length,0);assert.equal((await f.service.read(r)).turns[0].status,'failed');
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const abortable=require('../core/automation/inference-deadline.cjs').abortable;
test('P4 runs both experts concurrently with stable slots and individually authorized contexts',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();let count=0;
 const f=await fixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();await abortable(release.promise,signal);return {text:j.input.expert.id+' answer',citations:j.input.background.map(s=>s.sourceId)};});
 const result=await f.send({selectedEmployeeIds:['pm','arch']});await entered.promise;
 let state=await f.service.read(result);assert.deepEqual(state.turns.map(t=>t.employee.id),['pm','arch']);assert.equal(new Set(state.turns.map(t=>t.roundId)).size,1);assert.equal(result.turnIds.length,2);
 const pm=f.calls.find(j=>j.input.expert.id==='pm').input,arch=f.calls.find(j=>j.input.expert.id==='arch').input;assert.equal(pm.background.length,1);assert.equal(arch.background.length,0);assert.equal(pm.question,arch.question);assert.deepEqual(pm.history,arch.history);assert.ok(f.calls.every(j=>!j.tools&&!j.input.threadId));
 release.resolve();await f.settle();state=await f.service.read(result);assert.deepEqual(state.turns.map(t=>t.status),['completed','completed']);assert.equal((await f.db.call('readRuns')).length,0);
});
test('P4 a fast completion neither invalidates nor leaks into a slower peer',{timeout:5000},async t=>{
 const entered=deferred(),slow=deferred();let count=0;
 const f=await fixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();if(j.input.expert.id==='arch')await abortable(slow.promise,signal);return {text:j.input.expert.id+' private answer',citations:j.input.background.map(s=>s.sourceId)};});
 const result=await f.send({selectedEmployeeIds:['pm','arch']});await entered.promise;await f.service.active.get(result.turnIds[0]).promise;
 assert.equal((await f.service.read(result)).turns[0].status,'completed');await f.continuity.initialize();await f.service.watch();assert.equal((await f.service.read(result)).turns[1].status,'responding');slow.resolve();await f.settle();
 assert.deepEqual((await f.service.read(result)).turns.map(t=>t.status),['completed','completed']);assert.ok(!JSON.stringify(f.calls.find(j=>j.input.expert.id==='arch').input).includes('pm private answer'));
});
test('P4 preparation barrier fixes source versions before any expert inference starts',{timeout:5000},async t=>{
 const preparing=deferred(),release=deferred();const f=await fixture(t);const secret=f.service.providers.secret;f.service.providers.secret=async(...args)=>{if(!args[0]){preparing.resolve();await release.promise;}return secret(...args);};
 const result=await f.send({selectedEmployeeIds:['pm','arch']});await preparing.promise;assert.equal(f.calls.length,0);release.resolve();await f.settle();assert.equal((await f.service.read(result)).turns.length,2);
});
test('P4 failed provider preparation does not prevent another expert from answering',{timeout:5000},async t=>{
 const f=await fixture(t);const secret=f.service.providers.secret;f.service.providers.secret=async(...args)=>{if(!args[0])throw Error('missing model');return secret(...args);};const result=await f.send({selectedEmployeeIds:['pm','arch']});await f.settle();assert.deepEqual((await f.service.read(result)).turns.map(t=>t.status),['completed','failed']);assert.equal(f.calls.length,1);
});
test('P4 cancel affects only the selected contribution and a sibling can still finish',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();let count=0;const f=await fixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();await abortable(release.promise,signal);return {text:j.input.expert.id,citations:[]};});const result=await f.send({selectedEmployeeIds:['pm','arch']});await entered.promise;await f.service.cancel({conversationId:result.conversationId,turnId:result.turnIds[0],attempt:1});release.resolve();await f.settle();assert.deepEqual((await f.service.read(result)).turns.map(t=>t.status),['cancelled','completed']);
});
test('P4 exclusion cancels affected context but preserves an independent peer',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();let count=0;const f=await fixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();await abortable(release.promise,signal);return {text:j.input.expert.id,citations:[]};});const result=await f.send({selectedEmployeeIds:['pm','arch']});await entered.promise;const state=await f.service.read(result);await f.service.exclude({conversationId:result.conversationId,sourceKey:state.turns[0].references[0].ref.sourceKey});release.resolve();await f.settle();assert.deepEqual((await f.service.read(result)).turns.map(t=>t.status),['cancelled','completed']);
});
test('P4 revoking one member does not cancel an expert who still has access to the same source',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();let count=0;const f=await fixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();await abortable(release.promise,signal);return {text:j.input.expert.id,citations:j.input.background.map(s=>s.sourceId)};});
 const space=await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'pm',projectIds:[]},{employeeId:'arch',projectIds:[]}]}});const result=await f.send({selectedEmployeeIds:['pm','arch']});await entered.promise;
 await f.spaces.save({id:space.id,expectedRevision:space.revision,value:{...space,members:[{employeeId:'arch',projectIds:[]}]}});await f.service.watch();release.resolve();await f.settle();assert.deepEqual((await f.service.read(result)).turns.map(t=>t.status),['cancelled','completed']);
});
test('P4 retry stays in the original slot and excludes successful same-round peers even after explicit sharing',{timeout:5000},async t=>{
 let fail=true;const f=await fixture(t,async(c,j)=>{if(j.input.expert.id==='arch'&&fail)throw Error('offline');return {text:j.input.expert.id+' response',citations:j.input.background.map(s=>s.sourceId)};});const result=await f.send({selectedEmployeeIds:['pm','arch']});await f.settle();const before=await f.service.read(result);assert.equal(before.turns[1].status,'failed');
 const {key}=require('../core/continuity/sources.cjs');await f.object('sharing',{id:'share-peer',domainId:'inventory',sourceSelectors:[{kind:'source',id:key('expert-contribution',result.conversationId,before.turns[0].id)}],readerEmployeeIds:['arch'],destination:{kind:'profile-private-chat'},includeFutureSources:true,status:'active'});
 fail=false;const commandId=randomUUID(),input={conversationId:result.conversationId,turnId:before.turns[1].id,expectedAttempt:1,commandId};await f.service.retry(input);await f.settle();await f.service.retry(input);const after=await f.service.read(result);assert.equal(after.turns.length,2);assert.deepEqual(after.turns.map(t=>t.id),before.turns.map(t=>t.id));assert.deepEqual(after.turns.map(t=>t.status),['completed','completed']);assert.equal(after.turns[1].attempt,2);assert.ok(!JSON.stringify(f.calls.at(-1).input).includes('pm response'));assert.equal(f.calls.length,3);
 await assert.rejects(f.service.call('finish',{conversationId:result.conversationId,turnId:before.turns[1].id,attempt:1,result:{status:'completed',answer:'late overwrite'}}),/STALE_ATTEMPT/);
});
test('P4 shared facts have identical versions while personal understanding remains per-expert',{timeout:5000},async t=>{
 const f=await fixture(t);await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'pm',projectIds:[]},{employeeId:'arch',projectIds:[]}]}});
 const {GrowthService}=require('../core/continuity/growth.cjs');const growth=new GrowthService({continuity:f.continuity,providers:f.service.providers,infer:async(c,j)=>({quote:'库存变更使用乐观锁。',segments:[{type:'interpretation',body:j.input.expert.id+' perspective'}]})});await growth.initialize();t.after(()=>growth.shutdown());await growth.tick();await growth.tick();
 await f.send({selectedEmployeeIds:['pm','arch']});await f.settle();const a=f.calls.find(j=>j.input.expert.id==='pm').input,b=f.calls.find(j=>j.input.expert.id==='arch').input;assert.deepEqual(a.background.map(s=>s.sourceId),b.background.map(s=>s.sourceId));assert.equal(a.personalUnderstanding[0].body,'pm perspective');assert.equal(b.personalUnderstanding[0].body,'arch perspective');
});
test('P4 explicit cross-expert response fails closed until both contribution and dependencies are authorized',{timeout:5000},async t=>{
 const f=await fixture(t);const first=await f.send();await f.settle();const reply={conversationId:first.conversationId,selectedEmployeeIds:['arch'],text:'请回应前面的建议',replyToContributionId:first.turnId};await f.send(reply);await f.settle();assert.equal(f.calls.length,1);assert.equal((await f.service.read(first)).turns.at(-1).status,'failed');
 const {key}=require('../core/continuity/sources.cjs');await f.object('sharing',{id:'reply-sharing',domainId:'inventory',sourceSelectors:[{kind:'source',id:key('expert-contribution',first.conversationId,first.turnId)}],readerEmployeeIds:['arch'],destination:{kind:'profile-private-chat'},includeFutureSources:true,status:'active'});await f.send(reply);await f.settle();assert.equal(f.calls.length,1);
 await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'pm',projectIds:[]},{employeeId:'arch',projectIds:[]}]}});await f.send(reply);await f.settle();assert.equal(f.calls.length,2);assert.ok(f.calls.at(-1).input.replyTo.body.includes('建议保持版本检查'));assert.ok(f.calls.at(-1).input.background.some(s=>s.sourceId===f.calls.at(-1).input.replyTo.sourceId));
});
test('P4 batch idempotency persists all recipients and rejects reordered identity under the same command',{timeout:5000},async t=>{
 const f=await fixture(t),commandId=randomUUID();const first=await f.send({commandId,selectedEmployeeIds:['pm','arch']});await f.settle();const duplicate=await f.send({commandId,selectedEmployeeIds:['pm','arch']});assert.deepEqual(duplicate.turnIds,first.turnIds);assert.equal((await f.service.read(first)).turns.length,2);assert.equal(f.calls.length,2);await assert.rejects(f.send({commandId,selectedEmployeeIds:['arch','pm']}),/IDEMPOTENCY_CONFLICT/);
});

async function taskFixture(t,infer,patch={}){
 const f=await fixture(t,infer),run={id:'h1-run',title:'现场任务',projectId:null,status:'completed',terminalTurnId:'u1',createdAt:new Date().toISOString(),messages:[{id:'u1',role:'user',text:'检查恢复路径',timing:{outcome:'completed'}},{id:'a1',role:'assistant',phase:'final_answer',text:'PRIVATE_REPORT 测试全部通过'}],tools:[{id:'tool1',type:'commandExecution',status:'completed',exitCode:1,label:'SECRET_COMMAND',detail:'SECRET_OUTPUT'}],...patch};
 await f.db.call('saveRuns',[run]);const saved=(await f.db.call('readRuns'))[0];return {...f,run,conversationId:saved.conversationId,ask:(extra={})=>f.send({conversationId:saved.conversationId,text:'请评审现场',...extra})};
}
test('H1 no-domain task injects frozen user instructions and recorded outcomes, not unknown reports or tool bodies',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();const input=f.calls[0].input;
 assert.deepEqual(input.taskContext.items.filter(i=>i.kind==='user-instruction').map(i=>i.body),['检查恢复路径']);assert.equal(input.taskContext.revision,1);assert.equal(input.taskContext.items[1].authority,'recorded-observation');assert.deepEqual(JSON.parse(input.taskContext.items[1].body),{status:'completed',exitCode:1});assert.ok(input.taskContext.omissions.some(o=>o.kind==='assistant-report'));
 for(const secret of ['PRIVATE_REPORT','SECRET_COMMAND','SECRET_OUTPUT'])assert.ok(!JSON.stringify(input).includes(secret));assert.equal(input.background.length,0);
 const state=await f.service.read(r);assert.equal(state.turns[0].references.length,2);const ref=state.turns[0].references[0];assert.equal((await f.service.source({...r,sourceId:ref.ref.id})).body,'检查恢复路径');assert.equal(state.turns[0].taskContextInfo.included,2);assert.equal((await f.db.call('readRuns')).length,1);
});
test('H1 queued inputs and attachment paths never cause file reads; long instructions expose truncation',async t=>{
 const f=await taskFixture(t,undefined,{messages:[{id:'u1',role:'user',text:'已交付 '+ 'x'.repeat(4000),inputDeliveryState:'delivered'},{id:'queued',role:'user',text:'QUEUED_SECRET',inputDeliveryState:'queued'}],tools:[],attachments:[{path:'/does/not/exist/secret'}]});const r=await f.ask();await f.settle();const input=f.calls[0].input;assert.equal(input.taskContext.items.length,1);assert.equal(input.taskContext.items[0].body.length,3000);assert.equal(input.taskContext.items[0].truncated,true);assert.ok(!JSON.stringify(input).includes('QUEUED_SECRET'));assert.equal((await f.service.read(r)).turns[0].status,'completed');
});
test('H1 excluding a task item removes raw input and contaminated history on the next call',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();const ref=(await f.service.read(r)).turns[0].references[0];await f.service.exclude({...r,sourceKey:ref.ref.sourceKey});assert.equal((await f.service.read(r)).turns[0].answer,undefined);await assert.rejects(f.service.source({...r,sourceId:ref.ref.id}),/失效/);await f.ask();await f.settle();assert.deepEqual(f.calls[1].input.taskContext.items.filter(i=>i.kind==='user-instruction'),[]);assert.deepEqual(f.calls[1].input.history,[]);assert.ok(!JSON.stringify(f.calls[1].input).includes('检查恢复路径'));
});
test('H1 revoke affects only the delegated expert and survives service recovery',async t=>{
 const entered=deferred(),release=deferred();let count=0;const f=await taskFixture(t,async(c,j,signal)=>{if(++count===2)entered.resolve();await abortable(release.promise,signal);return {text:j.input.expert.id,citations:[]};});const r=await f.ask({selectedEmployeeIds:['pm','arch']});await entered.promise;await f.service.revokeTaskContext({conversationId:r.conversationId,turnId:r.turnIds[0]});release.resolve();await f.settle();await f.service.initialize();const state=await f.service.read(r);assert.deepEqual(state.turns.map(t=>t.status),['cancelled','completed']);assert.equal(state.turns[0].contextUnavailable,true);assert.equal(state.turns[1].contextUnavailable,false);
});
test('H1 revoked inherited task context invalidates later answers and export/search',async t=>{
 const f=await taskFixture(t,async()=>({text:'DERIVED_SECRET',citations:[]})),r=await f.ask();await f.settle();await f.ask();await f.settle();assert.equal(f.calls[1].input.history.length,1);await f.service.revokeTaskContext(r);const state=await f.service.read(r);assert.ok(state.turns.every(t=>!t.answer&&t.contextUnavailable));assert.ok(!(await f.service.export(r)).includes('DERIVED_SECRET'));assert.ok(!JSON.stringify(await f.service.searchable()).includes('DERIVED_SECRET'));
});
test('H1 source edit then restoration does not revive captured projections; fresh submission uses a new revision',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();const original=structuredClone(f.run);f.run.messages[0].text='changed';await f.db.call('saveRuns',[f.run]);await f.db.call('saveRuns',[original]);assert.equal((await f.service.read(r)).turns[0].contextUnavailable,true);await f.ask();await f.settle();assert.equal(f.calls[1].input.taskContext.revision,3);assert.deepEqual(f.calls[1].input.history,[]);
});
test('H1 irrelevant metadata does not increment context revision; delivered changes do',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();f.run.updatedAt='later';await f.db.call('saveRuns',[f.run]);await f.ask();await f.settle();assert.equal(f.calls[1].input.taskContext.revision,1);f.run.messages.push({id:'u2',role:'user',text:'新的明确要求'});await f.db.call('saveRuns',[f.run]);await f.ask();await f.settle();assert.equal(f.calls[2].input.taskContext.revision,2);assert.equal((await f.service.read(r)).turns[0].contextUnavailable,false);
});
test('H1 role revoke/restore permanently invalidates previous task delegation',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees.filter(e=>e.id!=='pm')}});await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees}});assert.equal((await f.service.read(r)).turns[0].contextUnavailable,true);
});
test('H1 persistent task changes cancel inference even without continuity domain events',async t=>{
 const entered=deferred(),release=deferred();const f=await taskFixture(t,async(c,j,signal)=>{entered.resolve();await abortable(release.promise,signal);return {text:'LATE',citations:[]};});const r=await f.ask();await entered.promise;f.run.messages[0].text='corrected';await f.db.call('saveRuns',[f.run]);await f.service.watch();release.resolve();await f.settle();assert.equal((await f.service.read(r)).turns[0].status,'cancelled');
});
test('H1 task-only answers are not published as long-term shared knowledge',async t=>{
 const f=await taskFixture(t),r=await f.ask({text:'库存业务现场'});await f.settle();await f.continuity.initialize();const sources=await f.continuity.search({employeeId:'pm',domainIds:['inventory'],destination:{kind:'profile-private-chat'}},'',{ranked:true});assert.ok(!sources.some(s=>s.kind==='expert-contribution'&&s.locator.conversationId===r.conversationId));
});
test('H1 authorized domain search cannot bypass task provenance omissions through a current-run final answer',async t=>{
 const f=await taskFixture(t,undefined,{employee:{id:'pm'}});await f.object('link',{id:'task-link',domainId:'inventory',target:{kind:'source',id:JSON.stringify(['run-message',f.run.id,'a1'])},state:'confirmed',origin:'user'});await f.ask({text:'库存业务现场'});await f.settle();assert.ok(!JSON.stringify(f.calls[0].input).includes('PRIVATE_REPORT'));
});
test('H1 deletion removes snapshots/delegations and rejects future reads or resurrection',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();await f.db.call('saveRuns',[]);await assert.rejects(f.service.read(r),/CHAT_UNAVAILABLE/);assert.deepEqual(await f.service.searchable(),{});
});
test('H1 withdrawal remains effective after closing and reopening the database worker',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();await f.service.revokeTaskContext(r);await f.service.shutdown();await f.spaces.shutdown();await f.db.close();
 const reopened=new Database(f.root);await reopened.call('ready');try{const state=await reopened.call('expertChat',{action:'read',conversationId:r.conversationId});assert.ok(state.turns[0].taskContextProjectionId);await assert.rejects(reopened.call('expertChat',{action:'taskContext',conversationId:r.conversationId,turnId:r.turnId}),/TASK_CONTEXT_INVALIDATED/);}finally{await reopened.close();}
});
test('H1 tool observation exclusion and later correction invalidate only captured evidence',async t=>{
 const f=await taskFixture(t),r=await f.ask();await f.settle();const ref=(await f.service.read(r)).turns[0].references.find(r=>r.authority==='recorded-observation');await f.service.exclude({...r,sourceKey:ref.ref.sourceKey});await f.ask();await f.settle();assert.ok(!f.calls[1].input.taskContext.items.some(i=>i.kind==='tool-observation'));assert.deepEqual(f.calls[1].input.history,[]);f.run.tools[0].exitCode=0;await f.db.call('saveRuns',[f.run]);assert.equal((await f.service.read(r)).turns[1].contextUnavailable,false);
});
test('H1 projection validates recipient and conversation on the host, not supplied context',async t=>{
 const f=await taskFixture(t),r=await f.ask({context:{employeeId:'arch'}});await f.settle();const raw=await f.service.call('read',r);assert.equal(raw.turns[0].employee.id,'pm');const projections=await f.service.call('taskContext',r);assert.equal(projections[0].employeeId,'pm');assert.equal(projections[0].destination.runId,f.run.id);await assert.rejects(f.service.call('revokeTaskContext',{conversationId:r.conversationId,turnId:'forged'}),/TASK_CONTEXT_UNAVAILABLE/);
});
test('H1 explicit retry creates a fresh delegation with exclusions while preserving the revoked attempt',async t=>{
 let fail=true;const f=await taskFixture(t,async()=>{if(fail)throw Error('offline');return {text:'fresh',citations:[]};}),r=await f.ask();await f.settle();const before=await f.service.call('read',r);await f.service.revokeTaskContext(r);fail=false;await f.service.retry({...r,expectedAttempt:1,commandId:randomUUID()});await f.settle();const after=await f.service.call('read',r);assert.notEqual(after.turns[0].taskContextProjectionId,before.turns[0].taskContextProjectionId);assert.equal(after.turns[0].attempts[0].taskContextProjectionId,before.turns[0].taskContextProjectionId);assert.equal((await f.service.read(r)).turns[0].answer,'fresh');
});
test('H1 delegation retains the full host role fingerprint even when prompt snapshot omits domain and skills',async t=>{
 const f=await taskFixture(t);f.employees[0].domain='业务架构';f.employees[0].skills=[{id:'review',required:true}];await f.db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:f.employees}});const r=await f.ask();await f.settle();assert.equal((await f.service.read(r)).turns[0].status,'completed');assert.equal(f.calls.length,1);
});

async function fileTaskFixture(t,infer){const f=await taskFixture(t,infer);const cwd=path.join(f.root,'project');await fs.mkdir(cwd);await fs.writeFile(path.join(cwd,'module.ts'),'export const capturedVersion = 1;\n');await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'h2-project',expectedRevision:null,value:{id:'h2-project',name:'H2 project',path:cwd,createdAt:''}}]});f.run.projectId='h2-project';f.run.cwd=cwd;f.run.fileChanges=[{turnKey:'u1',files:[{id:'change',path:'module.ts',status:'modified'}]}];await f.db.call('saveRuns',[f.run]);return {...f,cwd};}
test('H2 file snippets are injected with capture-time evidence and source details; no new execution starts',async t=>{const f=await fileTaskFixture(t),r=await f.ask();await f.settle();const input=f.calls[0].input,item=input.taskContext.items.find(i=>i.kind==='file-excerpt');assert.match(item.body,/capturedVersion/);assert.equal(item.fileEvidence.recordedVersionMatch,null);assert.ok(!JSON.stringify(input).includes(f.cwd));const state=await f.service.read(r);assert.equal(state.turns[0].taskContextInfo.files[0].currentState,'unchanged');const ref=state.turns[0].references.find(r=>r.fileEvidence);assert.match((await f.service.source({...r,sourceId:ref.ref.id})).conditions,/SHA-256/);assert.equal((await f.db.call('readRuns')).length,1);});
test('H2 exclusion prevents re-injection of file bytes and contaminated history',async t=>{const f=await fileTaskFixture(t),r=await f.ask();await f.settle();const ref=(await f.service.read(r)).turns[0].references.find(r=>r.fileEvidence);await f.service.exclude({...r,sourceKey:ref.ref.sourceKey});await f.ask();await f.settle();assert.ok(!JSON.stringify(f.calls[1].input).includes('capturedVersion'));assert.deepEqual(f.calls[1].input.history,[]);await assert.rejects(f.service.source({...r,sourceId:ref.ref.id}),/失效/);});
test('H2 changed files display historical versions but cannot enter fresh calls through historical answers',async t=>{const f=await fileTaskFixture(t,async()=>({text:'answer based on v1',citations:[]})),r=await f.ask();await f.settle();await fs.writeFile(path.join(f.cwd,'module.ts'),'export const nextVersion = 2;\n');const old=(await f.service.read(r)).turns[0];assert.equal(old.taskContextInfo.files[0].currentState,'changed');assert.equal(old.answer,'answer based on v1');await f.ask();await f.settle();assert.deepEqual(f.calls[1].input.history,[]);assert.ok(JSON.stringify(f.calls[1].input).includes('nextVersion'));assert.ok(!JSON.stringify(f.calls[1].input).includes('capturedVersion'));});
test('H2 file change after context preparation prevents network dispatch',async t=>{const f=await fileTaskFixture(t);f.service.providers.secret=async()=>{await fs.writeFile(path.join(f.cwd,'module.ts'),'changed before dispatch');return {model:'test'};};const r=await f.ask();await f.settle();assert.equal(f.calls.length,0);assert.equal((await f.service.read(r)).turns[0].status,'failed');});
test('H2 file mutation during model generation prevents a late valid result',async t=>{const entered=deferred(),release=deferred();const f=await fileTaskFixture(t,async()=>{entered.resolve();await release.promise;return {text:'STALE_FILE_RESULT',citations:[]};}),r=await f.ask();await entered.promise;await fs.writeFile(path.join(f.cwd,'module.ts'),'changed during inference');release.resolve();await f.settle();const turn=(await f.service.read(r)).turns[0];assert.equal(turn.status,'failed');assert.equal(turn.answer,undefined);});
test('H2 project target change and restoration cannot revive a file delegation',async t=>{const f=await fileTaskFixture(t),r=await f.ask();await f.settle();const project=(await f.db.call('readWorkspace')).projects[0];let workspace=await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:project.id,expectedRevision:project.revision,value:{...project,path:path.dirname(f.cwd)}}]});const changed=workspace.projects[0];await f.db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:project.id,expectedRevision:changed.revision,value:project}]});assert.equal((await f.service.read(r)).turns[0].contextUnavailable,true);});
test('H2 per-expert withdrawal preserves an independently authorized file discussion',async t=>{const f=await fileTaskFixture(t),r=await f.ask({selectedEmployeeIds:['pm','arch']});await f.settle();await f.service.revokeTaskContext({conversationId:r.conversationId,turnId:r.turnIds[0]});const state=await f.service.read(r);assert.equal(state.turns[0].contextUnavailable,true);assert.equal(state.turns[1].contextUnavailable,false);assert.equal(state.turns[1].taskContextInfo.files.length,1);});

async function investigationFixture(t,infer,prepare){const f=await fileTaskFixture(t);if(prepare)await prepare(f);const origin=await f.ask();await f.settle();const {InvestigationService}=require('../core/continuity/investigation.cjs'),runtime={contexts:new Map()},calls=[];const investigation=new InvestigationService({database:f.db,providers:f.service.providers,runtime,infer:async(c,j,s)=>{calls.push(j);return infer?infer(c,j,s):{action:'finish',text:'调查结论，尚未运行测试',citations:[],evidenceId:'',startLine:1,query:''};}});await investigation.initialize();t.after(()=>investigation.shutdown());const start=(commandId=randomUUID())=>investigation.start({conversationId:origin.conversationId,turnId:origin.turnId,commandId});const finish=()=>Promise.all([...investigation.active.values()].map(v=>v.promise));return {...f,origin,investigation,investigationCalls:calls,start,finish,runtime};}
test('H3 independent task and guarded return form a complete read-only investigation loop',async t=>{const f=await investigationFixture(t,async(c,j)=>j.input.observations.length?{action:'finish',text:'已核对文件，未运行测试',citations:[j.input.observations[0].evidenceId],evidenceId:'',startLine:1,query:''}:{action:'read_evidence',evidenceId:j.input.evidence.find(e=>e.kind==='file-excerpt').id,startLine:1,query:'',text:'',citations:[]});const job=await f.start();await f.finish();const result=await f.investigation.read(job);assert.equal(result.status,'completed');assert.equal(result.steps.length,1);assert.match(result.steps[0].result.body,/capturedVersion/);const runs=await f.db.call('readRuns');assert.equal(runs.length,2);const linked=runs.find(r=>r.id===job.runId);assert.equal(linked.employee.id,'pm');assert.equal(linked.originHandoff.id,job.id);assert.notEqual(linked.conversationId,f.origin.conversationId);assert.ok(!JSON.stringify(linked).includes('capturedVersion'));assert.ok(!JSON.stringify(linked).includes('已核对文件'));assert.equal((await f.investigation.list({conversationId:f.origin.conversationId})).length,1);assert.ok(f.investigationCalls.every(c=>!c.tools));assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'export const capturedVersion = 1;\n');});
test('H3 shell, write, MCP and privilege actions are denied by host contract',async t=>{for(const action of ['shell','write_file','mcp','escalate']){const f=await investigationFixture(t,async()=>({action,evidenceId:'',startLine:1,query:'',text:'',citations:[]})),job=await f.start();await f.finish();assert.equal((await f.investigation.read(job)).status,'failed');assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'export const capturedVersion = 1;\n');}});
test('H3 tool dispatch rejects arbitrary paths and unknown evidence IDs',async t=>{const f=await investigationFixture(t),job=await f.investigation.call('create',{conversationId:f.origin.conversationId,turnId:f.origin.turnId,commandId:randomUUID()});await assert.rejects(f.investigation.call('tool',{id:job.id,request:{action:'read_evidence',evidenceId:'/etc/passwd',startLine:1}}),/EVIDENCE_DENIED/);await assert.rejects(f.investigation.call('tool',{id:job.id,request:{action:'read_evidence',evidenceId:'x',startLine:1,path:'../secret'}}),/TOOL_DENIED/);await f.investigation.cancel(job);});
test('H3 repeated command creates exactly one linked run and one return',async t=>{const f=await investigationFixture(t),command=randomUUID(),job=await f.start(command);await f.finish();const duplicate=await f.start(command);assert.equal(duplicate.runId,job.runId);assert.equal((await f.db.call('readRuns')).length,2);assert.equal(f.investigationCalls.length,1);assert.equal((await f.investigation.list({conversationId:f.origin.conversationId})).length,1);await assert.rejects(f.investigation.start({conversationId:f.origin.conversationId,turnId:'other',commandId:command}),/IDEMPOTENCY_CONFLICT/);});
test('H3 active investigation locks root execution and prevents a second investigation',async t=>{const entered=deferred(),release=deferred();const f=await investigationFixture(t,async(c,j,signal)=>{entered.resolve();await abortable(release.promise,signal);return {action:'finish',text:'done',citations:[],evidenceId:'',startLine:1,query:''};}),job=await f.start();await entered.promise;await assert.rejects(f.investigation.guard({runId:f.run.id}),/调查/);await assert.rejects(f.start(),/INVESTIGATION_BUSY/);await f.investigation.cancel(job);release.resolve();await f.finish();await f.investigation.guard({runId:f.run.id});});
test('H3 source withdrawal prevents further tools and hides already completed return',async t=>{const f=await investigationFixture(t),job=await f.start();await f.finish();await f.service.revokeTaskContext(f.origin);const result=await f.investigation.read(job);assert.equal(result.valid,false);assert.equal(result.result,undefined);assert.deepEqual(result.steps,[]);});
test('H3 file version change during inference rejects completion and invalidates result disclosure',async t=>{const entered=deferred(),release=deferred();const f=await investigationFixture(t,async()=>{entered.resolve();await release.promise;return {action:'finish',text:'STALE',citations:[],evidenceId:'',startLine:1,query:''};}),job=await f.start();await entered.promise;await fs.writeFile(path.join(f.cwd,'module.ts'),'changed');release.resolve();await f.finish();const result=await f.investigation.read(job);assert.equal(result.status,'failed');assert.equal(result.valid,false);});
test('H3 stale generic runtime saves cannot overwrite or delete managed investigation rows',async t=>{const f=await investigationFixture(t),job=await f.start();await f.finish();await f.db.call('saveRuns',[f.run]);const rows=await f.db.call('readRuns');assert.equal(rows.find(r=>r.id===job.runId).status,'completed');const stale=structuredClone(rows);stale.find(r=>r.id===job.runId).status='running';await f.db.call('saveRuns',stale);assert.equal((await f.db.call('readRuns')).find(r=>r.id===job.runId).status,'completed');});
test('H3 recovery resumes prepared jobs but never replays an unknown dispatched request',async t=>{const f=await investigationFixture(t),job=await f.investigation.call('create',{conversationId:f.origin.conversationId,turnId:f.origin.turnId,commandId:randomUUID()});assert.deepEqual(await f.investigation.call('recover'),[job.id]);await f.investigation.call('dispatch',{id:job.id,step:0});assert.deepEqual(await f.investigation.call('recover'),[]);assert.equal((await f.investigation.read(job)).status,'interrupted');assert.equal(f.investigationCalls.length,0);assert.equal((await f.investigation.list({conversationId:f.origin.conversationId})).length,1);await f.investigation.call('recover');assert.equal((await f.investigation.list({conversationId:f.origin.conversationId})).length,1);});
test('H3 original chat deletion cancels access without recreating the original conversation',async t=>{const f=await investigationFixture(t),job=await f.start();await f.finish();await f.db.call('saveRuns',[]);const result=await f.investigation.read(job);assert.equal(result.valid,false);assert.equal(result.result,undefined);assert.equal((await f.db.call('readRuns')).length,1);});
test('H3 can investigate beyond the initial excerpt within the same authorized immutable file',async t=>{const f=await investigationFixture(t,async(c,j)=>j.input.observations.length?{action:'finish',text:'已找到第90行依据',citations:[j.input.observations[0].evidenceId],evidenceId:'',startLine:1,query:''}:{action:'read_evidence',evidenceId:j.input.evidence.find(e=>e.kind==='file-excerpt').id,startLine:90,query:'',text:'',citations:[]},async f=>fs.writeFile(path.join(f.cwd,'module.ts'),Array.from({length:180},(_,i)=>'line '+(i+1)).join('\n')));const job=await f.start();await f.finish();assert.ok(!f.investigationCalls[0].input.evidence.find(e=>e.kind==='file-excerpt').body.includes('line 90'));assert.match((await f.investigation.read(job)).steps[0].result.body,/line 90/);});
test('H3 withdrawal while generating cancels the request and blocks late tool dispatch',async t=>{const entered=deferred(),release=deferred();const f=await investigationFixture(t,async(c,j)=>{entered.resolve();await release.promise;return {action:'read_evidence',evidenceId:j.input.evidence[0].id,startLine:1,query:'',text:'',citations:[]};}),job=await f.start();await entered.promise;await f.service.revokeTaskContext(f.origin);await f.investigation.watch();release.resolve();await f.finish();const result=await f.investigation.read(job);assert.equal(result.status,'cancelled');assert.equal(result.valid,false);assert.deepEqual(result.steps,[]);});
test('H3 tool policy blocks unknown fields and caps deterministic searches without regex evaluation',async t=>{const f=await investigationFixture(t),job=await f.investigation.call('create',{conversationId:f.origin.conversationId,turnId:f.origin.turnId,commandId:randomUUID()}),ctx=await f.investigation.call('context',job),evidenceId=ctx.projections[0].items.find(i=>i.fileEvidence).id;await assert.rejects(f.investigation.call('tool',{id:job.id,request:{action:'read_evidence',evidenceId,startLine:1,permission:'full'}}),/TOOL_DENIED/);const result=await f.investigation.call('tool',{id:job.id,request:{action:'search_evidence',evidenceId,query:'capturedVersion'}});assert.equal(result.matches.length,1);await f.investigation.cancel(job);});
test('H3 abrupt database worker exit preserves prepared reservation and never replays dispatched work',async t=>{const f=await investigationFixture(t),job=await f.investigation.call('create',{conversationId:f.origin.conversationId,turnId:f.origin.turnId,commandId:randomUUID()});await f.investigation.shutdown();await f.service.shutdown();await f.spaces.shutdown();f.db.closed=true;await f.db.worker.terminate();let reopened=new Database(f.root);await reopened.call('ready');assert.deepEqual(await reopened.call('investigation',{action:'recover'}),[job.id]);await reopened.call('investigation',{action:'dispatch',id:job.id,step:0});reopened.closed=true;await reopened.worker.terminate();reopened=new Database(f.root);await reopened.call('ready');try{assert.deepEqual(await reopened.call('investigation',{action:'recover'}),[]);const result=await reopened.call('investigation',{action:'read',id:job.id});assert.equal(result.status,'interrupted');assert.equal((await reopened.call('readRuns')).filter(r=>r.id===job.runId).length,1);assert.equal((await reopened.call('investigation',{action:'list',conversationId:f.origin.conversationId})).length,1);}finally{await reopened.close();}});
test('H3 managed investigation cannot be resumed as a generic runtime with full permissions',async()=>{const {AgentRuntime}=require('../electron/agent-runtime.cjs'),runtime={runs:[{id:'managed',originHandoff:{id:'job'}}]};await assert.rejects(AgentRuntime.prototype.start.call(runtime,{runId:'managed',permission:'full',prompt:'write files'}),/受限调查不能转入/);});
test('H3 generic permission/model switches cannot escalate a managed investigation',()=>{const {AgentRuntime}=require('../electron/agent-runtime.cjs'),runtime={runs:[{id:'managed',originHandoff:{id:'job'}}]};assert.throws(()=>AgentRuntime.prototype.switchPermission.call(runtime,{runId:'managed',permission:'full'}),/不能提高权限/);assert.throws(()=>AgentRuntime.prototype.switchModel.call(runtime,{runId:'managed',model:'other'}),/不支持/);});
test('H3 cancellation IPC returns only a guarded view and cannot reveal revoked stored results',async t=>{const f=await investigationFixture(t,async()=>({action:'finish',text:'PRIVATE_INVESTIGATION_RESULT',citations:[],evidenceId:'',startLine:1,query:''})),job=await f.start();await f.finish();await f.service.revokeTaskContext(f.origin);const reply=await f.investigation.cancel(job);assert.equal(reply.valid,false);assert.equal(reply.result,undefined);assert.equal(reply.targetRoot,undefined);assert.equal(reply.delegation,undefined);assert.ok(!JSON.stringify(reply).includes('PRIVATE_INVESTIGATION_RESULT'));});
test('H3 preserves P1 project destination grants and invalidates results when shared background is withdrawn',async t=>{const f=await investigationFixture(t,undefined,async f=>{await f.object('link',{id:'h3-project-domain',domainId:'inventory',target:{kind:'project',id:'h2-project'},state:'confirmed',origin:'user'});await f.object('sharing',{id:'h3-project-grant',domainId:'inventory',sourceSelectors:[{kind:'space',id:f.space.id}],readerEmployeeIds:['pm'],destination:{kind:'project',id:'h2-project'},includeFutureSources:true,status:'active'});}),job=await f.start();await f.finish();assert.ok(f.investigationCalls[0].input.background.some(s=>s.body.includes('乐观锁')));await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});assert.equal((await f.investigation.read(job)).valid,false);});

async function implementationFixture(t,infer,prepare){
 const f=await investigationFixture(t,infer||(async(c,j)=>{
  if(j.input.question)return {text:'原任务核对：内容断言通过，项目测试未运行。'};
  const action=!j.input.writes?.length?'replace_evidence':!j.input.verification?'verify':'finish';
  return {action,evidenceId:j.input.writeEvidenceIds[0],text:action==='replace_evidence'?'export const capturedVersion = 2;\n':'已修改并完成内容断言；项目测试未运行。',citations:[],startLine:1,query:'export const capturedVersion = 1;\n'};
 }),prepare);
 const state=await f.service.read(f.origin),file=state.turns[0].references.find(r=>r.fileEvidence);
 const request={conversationId:f.origin.conversationId,turnId:f.origin.turnId,commandId:randomUUID(),mode:'implement',goal:'将版本改为 2',authorizeWrite:true,writeEvidenceIds:[file.ref.id],checks:[{evidenceId:file.ref.id,includes:'capturedVersion = 2'}]};
 return {...f,file,request,implement:()=>f.investigation.start(request)};
}
test('H4 explicit scoped write creates linked implementation, real changes and host verification',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();const result=await f.investigation.read(job);
 assert.equal(result.status,'completed');assert.equal(result.mode,'implement');assert.equal(result.valid,true);assert.equal(result.writes[0].state,'applied');assert.match(result.writes[0].diff,/\+export const capturedVersion = 2/);assert.equal(result.verification.checks[0].outcome,'passed');assert.equal(result.verification.projectTests,'not-run');assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'export const capturedVersion = 2;\n');assert.equal((await f.db.call('readRuns')).find(r=>r.id===job.runId).originHandoff.mode,'implement');assert.ok(!JSON.stringify(result).includes(f.cwd));
});
test('H4 read delegation never implies write and arbitrary file IDs cannot be authorized',async t=>{
 const f=await implementationFixture(t);for(const patch of [{authorizeWrite:false},{writeEvidenceIds:['/etc/passwd']},{writeEvidenceIds:[]},{checks:[]},{mode:'remote'},{checks:[{evidenceId:f.file.ref.id,includes:'x',command:'npm test'}]}])await assert.rejects(f.investigation.start({...f.request,...patch}),/PERMISSION|ACCEPTANCE|MODE/);assert.equal((await f.db.call('readRuns')).length,1);
});
test('H4 duplicate launch is idempotent and changed write intent conflicts',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();assert.equal((await f.implement()).id,job.id);await assert.rejects(f.investigation.start({...f.request,goal:'different'}),/IDEMPOTENCY_CONFLICT/);assert.equal(f.investigationCalls.length,3);
});
test('H4 drift after preparation prevents side effects even if Git HEAD is unchanged',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await fs.writeFile(path.join(f.cwd,'module.ts'),'external edit');await assert.rejects(f.investigation.call('dispatch',{id:job.id,step:0}),/BASELINE_DRIFT/);assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'external edit');
});
test('H4 all writes pass a durable intent and per-file authority barrier',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await assert.rejects(f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'export const capturedVersion = 1;\n',replacement:'x'}),/WRITE_DENIED/);await f.investigation.call('dispatch',{id:job.id,step:0});await assert.rejects(f.investigation.call('writeIntent',{id:job.id,evidenceId:'other',search:'export const capturedVersion = 1;\n',replacement:'x'}),/WRITE_DENIED/);const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'export const capturedVersion = 1;\n',replacement:'x'});await f.investigation.revokeWrite(job);await assert.rejects(f.investigation.call('applyWrite',{id:job.id,writeId:w.id}),/WRITE_DENIED/);assert.match(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),/= 1/);
});
test('H4 in-flight exclusion blocks a late write and hides dependent result',async t=>{
 const entered=deferred(),release=deferred();const f=await implementationFixture(t,async(c,j)=>{entered.resolve();await release.promise;return {action:'replace_evidence',evidenceId:j.input.writeEvidenceIds[0],text:'bad',citations:[],startLine:1,query:''};});const job=await f.implement();await entered.promise;await f.service.exclude({...f.origin,sourceKey:f.file.ref.sourceKey});release.resolve();await f.finish();assert.equal((await f.investigation.read(job)).valid,false);assert.match(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),/= 1/);
});
test('H4 failed acceptance cannot become a completed implementation',async t=>{
 const f=await implementationFixture(t);f.request.checks[0].includes='never-present';const job=await f.implement();await f.finish();const result=await f.investigation.read(job);assert.equal(result.status,'failed');assert.equal(result.verification.checks[0].outcome,'failed');assert.equal(result.writes[0].state,'applied');assert.equal(result.sideEffects,true);
});
test('H4 overlapping implementation and original execution reservations conflict',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await assert.rejects(f.investigation.guard({cwd:path.join(f.cwd,'child')}),/调查/);await assert.rejects(f.investigation.start({...f.request,commandId:randomUUID()}),/BUSY/);await f.investigation.cancel(job);await f.investigation.guard({cwd:f.cwd});
});
test('H4 crash recovery reconciles durable pending writes without replaying them',async t=>{
 for(const phase of ['before','after','partial']){const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await f.investigation.call('dispatch',{id:job.id,step:0});const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'export const capturedVersion = 1;\n',replacement:'replacement'});if(phase==='after')require('../core/continuity/task-write.cjs').applyWrite(w);if(phase==='partial')await fs.writeFile(path.join(f.cwd,'module.ts'),'partial');await f.investigation.call('recover');const r=await f.investigation.read(job);assert.equal(r.status,'interrupted');assert.equal(r.writes[0].state,{before:'not-applied',after:'applied',partial:'uncertain'}[phase]);await f.investigation.call('recover');assert.equal((await f.investigation.list({conversationId:f.origin.conversationId})).length,1);assert.equal(f.investigationCalls.length,0);}
});
test('H4 original actor can explicitly analyze a guarded return in a clean no-tool call',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();const request={...job,commandId:randomUUID(),question:'是否可以验收？',authorizeReturn:true};await f.investigation.resume(request);await Promise.all([...f.investigation.resuming.values()].map(j=>j.promise));const r=await f.investigation.read(job);assert.equal(r.continuations[0].status,'completed');assert.equal(r.continuations[0].actorName,'原任务助手');assert.match(r.continuations[0].answer,/项目测试未运行/);const call=f.investigationCalls.at(-1);assert.equal(call.input.actor.name,'原任务助手');assert.equal(call.tools,undefined);assert.equal(call.input.discussion,undefined);await f.investigation.resume(request);assert.equal(f.investigationCalls.length,4);await f.service.revokeTaskContext(f.origin);const hidden=await f.investigation.read(job);assert.equal(hidden.result,undefined);assert.equal(hidden.continuations[0].answer,undefined);assert.ok(!JSON.stringify(await f.db.call('readRuns')).includes('内容断言通过'));
});
test('H4 return grants require user action and can be independently withdrawn',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();const request={...job,commandId:randomUUID(),question:'review',authorizeReturn:false};await assert.rejects(f.investigation.resume(request),/RETURN_GRANT_REQUIRED/);await f.investigation.resume({...request,authorizeReturn:true});await Promise.all([...f.investigation.resuming.values()].map(j=>j.promise));await f.investigation.revokeResume({id:job.id,resumeId:request.commandId});const r=await f.investigation.read(job);assert.equal(r.continuations[0].answer,undefined);assert.equal(r.valid,true);assert.equal(r.continuations[0].status,'revoked');
});
test('H4 original actor must independently hold shared-source access; anonymous is not privileged',async t=>{
 for(const actor of [null,'arch','pm']){const f=await implementationFixture(t,undefined,async f=>{if(actor){f.run.employee={id:actor,name:actor};await f.db.call('saveRuns',[f.run]);}await f.object('link',{id:'h4-domain',domainId:'inventory',target:{kind:'project',id:'h2-project'},state:'confirmed',origin:'user'});await f.object('sharing',{id:'h4-share',domainId:'inventory',sourceSelectors:[{kind:'space',id:f.space.id}],readerEmployeeIds:['pm'],destination:{kind:'project',id:'h2-project'},includeFutureSources:true,status:'active'});});const job=await f.implement();await f.finish();assert.equal((await f.investigation.read(job)).status,'completed');const request={...job,commandId:randomUUID(),question:'review',authorizeReturn:true};if(actor==='pm'){await f.investigation.resume(request);await Promise.all([...f.investigation.resuming.values()].map(j=>j.promise));assert.equal((await f.investigation.read(job)).continuations[0].status,'completed');await f.spaces.withdrawDocument({id:f.doc.id,expectedRevision:f.doc.revision});assert.equal((await f.investigation.read(job)).continuations[0].answer,undefined);}else await assert.rejects(f.investigation.resume(request),/UNAUTHORIZED|ACCESS_DENIED/);}
});
test('H4 process loss between write and receipt reconciles bytes and never repeats the write',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await f.investigation.call('dispatch',{id:job.id,step:0});const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'export const capturedVersion = 1;\n',replacement:'after-crash'});require('../core/continuity/task-write.cjs').applyWrite(w);await f.investigation.shutdown();await f.service.shutdown();await f.spaces.shutdown();f.db.closed=true;await f.db.worker.terminate();const reopened=new Database(f.root);await reopened.call('ready');try{await reopened.call('investigation',{action:'recover'});const r=await reopened.call('investigation',{action:'read',id:job.id});assert.equal(r.status,'interrupted');assert.equal(r.writes[0].state,'applied');assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'after-crash');assert.equal((await reopened.call('readRuns')).filter(r=>r.id===job.runId).length,1);}finally{await reopened.close();}
});
test('H4 unknown result-review dispatch is interrupted on recovery and cannot be replayed',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();const request={...job,commandId:randomUUID(),question:'review',authorizeReturn:true};const r=await f.investigation.call('resumePrepare',request);await f.investigation.call('resumeDispatch',{id:job.id,resumeId:r.id});await f.investigation.call('recover');assert.equal((await f.investigation.read(job)).continuations[0].status,'interrupted');await f.investigation.resume(request);assert.equal(f.investigationCalls.length,3);
});
test('H4 patches preserve unselected text and reject ambiguous original fragments',async t=>{
 const f=await implementationFixture(t,undefined,async f=>fs.writeFile(path.join(f.cwd,'module.ts'),'// keep this\nexport const capturedVersion = 1;\n// keep this\n'));const job=await f.investigation.call('create',f.request);await f.investigation.call('dispatch',{id:job.id,step:0});await assert.rejects(f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'keep this',replacement:'lost'}),/PATCH_NOT_UNIQUE/);const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'capturedVersion = 1',replacement:'capturedVersion = 2'});await f.investigation.call('applyWrite',{id:job.id,writeId:w.id});assert.equal(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),'// keep this\nexport const capturedVersion = 2;\n// keep this\n');await assert.rejects(f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'capturedVersion = 2',replacement:'capturedVersion = 3'}),/WRITE_DENIED/);
});
test('H4 withdrawal after a real write hides the return but does not pretend to undo side effects',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();await f.service.revokeTaskContext(f.origin);const r=await f.investigation.read(job);assert.equal(r.valid,false);assert.deepEqual(r.writes,[]);assert.equal(r.verification,undefined);assert.equal(r.sideEffects,true);assert.match(await fs.readFile(path.join(f.cwd,'module.ts'),'utf8'),/= 2/);assert.ok(!JSON.stringify(await f.db.call('readRuns')).includes('capturedVersion'));
});
test('H4 verification evidence cannot outlive later external changes',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await f.investigation.call('dispatch',{id:job.id,step:0});const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'capturedVersion = 1',replacement:'capturedVersion = 2'});await f.investigation.call('applyWrite',{id:job.id,writeId:w.id});await f.investigation.call('verify',{id:job.id});await fs.writeFile(path.join(f.cwd,'module.ts'),'external edit');await assert.rejects(f.investigation.call('finish',{id:job.id,status:'completed',result:{text:'passed',citations:[]}}),/BASELINE_DRIFT/);
});
test('H4 restoring the original recipient role does not revive a withdrawn result grant',async t=>{
 const f=await implementationFixture(t,undefined,async f=>{f.run.employee={id:'arch',name:'架构师'};await f.db.call('saveRuns',[f.run]);}),job=await f.implement();await f.finish();const r={...job,commandId:randomUUID(),question:'review',authorizeReturn:true};await f.investigation.resume(r);await Promise.all([...f.investigation.resuming.values()].map(j=>j.promise));assert.equal((await f.investigation.read(job)).continuations[0].status,'completed');const staff=await f.db.call('readSetting',{key:'workforce.roles.v1'}),changed=structuredClone(staff);changed.employees.find(e=>e.id==='arch').methods='changed role';await f.db.call('writeSetting',{key:'workforce.roles.v1',value:changed});await f.db.call('writeSetting',{key:'workforce.roles.v1',value:staff});const result=await f.investigation.read(job);assert.equal(result.valid,true);assert.equal(result.continuations[0].answer,undefined);assert.equal(result.continuations[0].valid,false);
});
test('H4 original model changes between review preparation and dispatch require a new grant',async t=>{
 const f=await implementationFixture(t),job=await f.implement();await f.finish();const r=await f.investigation.call('resumePrepare',{...job,commandId:randomUUID(),question:'review',authorizeReturn:true});f.run.model='new-model';await f.db.call('saveRuns',[f.run]);await assert.rejects(f.investigation.call('resumeDispatch',{id:job.id,resumeId:r.id}),/RETURN_RECIPIENT_CHANGED/);
});
test('H4 recipient-specific shared access withdrawal and restoration never revive old review',async t=>{
 const f=await implementationFixture(t,undefined,async f=>{await f.spaces.save({id:f.space.id,expectedRevision:f.space.revision,value:{...f.space,members:[{employeeId:'pm',projectIds:[]},{employeeId:'arch',projectIds:[]}]}});f.run.employee={id:'arch',name:'架构师'};await f.db.call('saveRuns',[f.run]);await f.object('link',{id:'h4-domain',domainId:'inventory',target:{kind:'project',id:'h2-project'},state:'confirmed',origin:'user'});for(const actor of ['pm','arch'])await f.object('sharing',{id:'h4-share-'+actor,domainId:'inventory',sourceSelectors:[{kind:'space',id:f.space.id}],readerEmployeeIds:[actor],destination:{kind:'project',id:'h2-project'},includeFutureSources:true,status:'active'});});const job=await f.implement();await f.finish();await f.investigation.resume({...job,commandId:randomUUID(),question:'review',authorizeReturn:true});await Promise.all([...f.investigation.resuming.values()].map(j=>j.promise));assert.equal((await f.investigation.read(job)).continuations[0].status,'completed');const grant={id:'h4-share-arch',domainId:'inventory',sourceSelectors:[{kind:'space',id:f.space.id}],readerEmployeeIds:['arch'],destination:{kind:'project',id:'h2-project'},includeFutureSources:true,status:'revoked'};await f.object('sharing',grant,1);await f.object('sharing',{...grant,status:'active'},2);const result=await f.investigation.read(job);assert.equal(result.valid,true);assert.equal(result.continuations[0].answer,undefined);
});
test('H4 changed content has a separate traceable citation identity from its immutable baseline',async t=>{
 const f=await implementationFixture(t),job=await f.investigation.call('create',f.request);await f.investigation.call('dispatch',{id:job.id,step:0});const w=await f.investigation.call('writeIntent',{id:job.id,evidenceId:f.file.ref.id,search:'capturedVersion = 1',replacement:'capturedVersion = 2'});await f.investigation.call('applyWrite',{id:job.id,writeId:w.id});const read=await f.investigation.call('tool',{id:job.id,request:{action:'read_evidence',evidenceId:f.file.ref.id,startLine:1}});assert.equal(read.sourceId,w.id);assert.equal(read.contentHash,w.afterHash);assert.notEqual(read.sourceId,f.file.ref.id);await f.investigation.call('verify',{id:job.id});await f.investigation.call('finish',{id:job.id,status:'completed',result:{text:'修改后的版本',citations:[w.id,f.file.ref.id]}});const result=await f.investigation.read(job);assert.equal(result.references.find(r=>r.id===w.id).contentHash,w.afterHash);assert.equal(result.references.find(r=>r.id===f.file.ref.id).contentHash,w.beforeHash);
});
