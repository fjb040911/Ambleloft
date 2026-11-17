const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {Database}=require('../electron/database.cjs');
const {SpaceService}=require('../core/workforce/spaces.cjs');
const {ContinuityService}=require('../core/continuity/service.cjs');
const {hash}=require('../core/continuity/sources.cjs');
let serial=0;const cmd=()=>`cmd-${++serial}`;
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-continuity-'));
 let db=new Database(root);await db.call('ready');
 await db.call('writeSetting',{key:'workforce.roles.v1',value:{employees:[{id:'product'},{id:'architect'}]}});
 const runtime={runs:[],stop:async()=>{},changed(){},persist:async()=>{}};
 const workforce={read:()=>db.call('readSetting',{key:'workforce.roles.v1'})};
 const spaces=new SpaceService({directory:root,database:db,workspace:{read:async()=>({projects:[]})},workforce,runtime});await spaces.initialize();
 const a=await spaces.save({value:{name:'Inventory',projectIds:[],members:[{employeeId:'product',projectIds:[]},{employeeId:'architect',projectIds:[]}]}});
 const b=await spaces.save({value:{name:'Imaging',projectIds:[],members:[{employeeId:'product',projectIds:[]}]}});
 let service=new ContinuityService({database:db});
 const object=(kind,value,expectedRevision=null)=>service.putObject({commandId:cmd(),kind,value,expectedRevision});
 await object('domain',{id:'domain-a',name:'Inventory',aliases:['platform'],status:'active'});
 await object('domain',{id:'domain-b',name:'Imaging',aliases:['platform'],status:'active'});
 await object('link',{id:'link-a',domainId:'domain-a',target:{kind:'space',id:a.id},state:'confirmed',origin:'user'});
 await object('link',{id:'link-b',domainId:'domain-b',target:{kind:'space',id:b.id},state:'confirmed',origin:'user'});
 const context={employeeId:'product',domainIds:['domain-a','domain-b'],destination:{kind:'profile-private-chat'},operation:'read'};
 const doc=(space=a,extra={})=>spaces.saveDocument({spaceId:space.id,title:'Contract',body:'Shared contract',...extra});
 const status=()=>service.call('status');
 const publish=async(value,expectedRevision=null,ctx=context)=>service.publishKnowledge({commandId:cmd(),context:ctx,expectedEpoch:(await status()).epoch,expectedRevision,value});
 t.after(async()=>{await spaces.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,get db(){return db;},get service(){return service;},spaces,a,b,runtime,object,context,doc,publish,status,
  async restart(){await db.close();db=new Database(root);await db.call('ready');spaces.database=db;service=new ContinuityService({database:db});}};
}
test('document identity distinguishes same-body conditions and adoption-only changes',async t=>{
 const f=await fixture(t),d1=await f.doc(f.a,{conditions:'single location',adopted:true});
 const first=(await f.service.search(f.context))[0];
 const d2=await f.spaces.saveDocument({id:d1.id,spaceId:f.a.id,expectedRevision:1,title:'Contract',body:'Shared contract',conditions:'multiple locations'});
 let all=await f.service.search(f.context,'',{currentOnly:false});assert.equal(all.length,2);
 const second=all.find(s=>s.locator.revision===2);assert.notEqual(first.ref.semanticHash,second.ref.semanticHash);
 assert.equal((await f.service.readSource(f.context,first.ref)).contentHash,(await f.service.readSource(f.context,second.ref)).contentHash);
 const before=await f.status();await f.spaces.adoptDocument({id:d2.id,revision:2,expectedRevision:2,expectedAdoptedRevision:1});
 assert.ok((await f.status()).epoch>before.epoch);
 await assert.rejects(f.service.readSource(f.context,first.ref),/SOURCE_CHANGED/);
 all=await f.service.search(f.context);assert.equal(all.length,1);assert.equal(all[0].authority,'adopted');
});
test('membership and domain linkage do not grant cross-space or cross-destination access',async t=>{
 const f=await fixture(t);await f.doc();await f.doc(f.b,{body:'Customer B only'});
 assert.equal((await f.service.search({...f.context,employeeId:'architect'})).length,1);
 assert.equal((await f.service.search({...f.context,destination:{kind:'space',id:f.a.id}})).length,0);
 await f.object('sharing',{id:'share-a',domainId:'domain-a',sourceSelectors:[{kind:'space',id:f.a.id}],readerEmployeeIds:['product'],destination:{kind:'space',id:f.a.id},includeFutureSources:true,status:'active'});
 assert.equal((await f.service.search({...f.context,destination:{kind:'space',id:f.a.id}})).length,1);
 await assert.rejects(f.service.search({...f.context,destination:{kind:'shared-chat',id:'x'}}),/UNSUPPORTED_DESTINATION/);
});
test('grants cannot bypass space revocation; held snapshots fail after membership changes',async t=>{
 const f=await fixture(t);await f.doc();const refs=(await f.service.search(f.context)).map(r=>r.ref),snapshot=await f.service.snapshot(f.context,refs);
 await f.object('sharing',{id:'share',domainId:'domain-a',sourceSelectors:[{kind:'space',id:f.a.id}],readerEmployeeIds:['product'],destination:{kind:'profile-private-chat'},includeFutureSources:true,status:'active'});
 const current=await f.service.snapshot(f.context,refs);
 await f.spaces.save({id:f.a.id,expectedRevision:1,value:{...f.a,members:[{employeeId:'architect',projectIds:[]}]}});
 assert.deepEqual(await f.service.search(f.context),[]);
 await assert.rejects(f.service.validateSnapshot(current.id),/SNAPSHOT_INVALIDATED/);
 await assert.rejects(f.service.validateSnapshot(snapshot.id),/SNAPSHOT_INVALIDATED/);
});
test('flattened mixed-source dependencies are invalidated on withdrawal and never auto-restored',async t=>{
 const f=await fixture(t),a=await f.doc(),b=await f.doc(f.b);const refs=(await f.service.search(f.context)).map(x=>x.ref);
 const parent=await f.publish({id:'k',domainId:'domain-a',claimType:'fact',body:'Combined understanding',sourceRefs:refs});
 const child=await f.publish({id:'child',domainId:'domain-a',claimType:'suggestion',body:'Derived interpretation',sourceRefs:[],knowledgeRefs:[{id:'k',revision:1}]});
 const snap=await f.service.snapshot(f.context,[],[{id:child.id,revision:1}]);
 await f.spaces.withdrawDocument({id:b.id,expectedRevision:1});
 await assert.rejects(f.service.readKnowledge(f.context,{id:parent.id,revision:1}),/KNOWLEDGE_UNAVAILABLE/);
 await assert.rejects(f.service.readKnowledge(f.context,{id:child.id,revision:1}),/KNOWLEDGE_UNAVAILABLE/);
 await assert.rejects(f.service.validateSnapshot(snap.id),/SNAPSHOT_INVALIDATED/);
 await f.spaces.restoreDocument({id:b.id,expectedRevision:1});
 await assert.rejects(f.service.readKnowledge(f.context,{id:child.id,revision:1}),/KNOWLEDGE_UNAVAILABLE/);
 assert.equal((await f.service.search(f.context)).length,2);assert.ok(a.id);
});
test('drafts cannot become formal decisions; stale background publication is rejected',async t=>{
 const f=await fixture(t),d=await f.doc();const ref=(await f.service.search(f.context))[0].ref;
 await assert.rejects(f.publish({id:'bad',domainId:'domain-a',claimType:'decision',body:'Unapproved',sourceRefs:[ref]}),/ADOPTION_REQUIRED/);
 const epoch=(await f.status()).epoch;
 await f.spaces.adoptDocument({id:d.id,revision:1,expectedRevision:1,expectedAdoptedRevision:null});
 await assert.rejects(f.service.publishKnowledge({commandId:cmd(),context:f.context,expectedEpoch:epoch,expectedRevision:null,value:{id:'late',domainId:'domain-a',body:'Late',claimType:'fact',sourceRefs:[ref]}}),/POLICY_CHANGED/);
 const fresh=(await f.service.search(f.context))[0].ref;
 assert.equal((await f.publish({id:'good',domainId:'domain-a',claimType:'decision',body:'Approved reference',sourceRefs:[fresh]})).revision,1);
});
test('commands are idempotent and conflicting payloads or revisions are rejected',async t=>{
 const f=await fixture(t),input={commandId:cmd(),kind:'domain',expectedRevision:null,value:{id:'extra',name:'Extra',status:'active'}};
 const a=await f.service.putObject(input);assert.deepEqual(await f.service.putObject(input),a);
 await assert.rejects(f.service.putObject({...input,value:{...input.value,name:'Different'}}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(f.object('domain',{...a,name:'Concurrent'},0),/REVISION_CONFLICT/);
});
test('durable outbox is atomic with source state; restart and lease recovery replay unacknowledged batches',async t=>{
 const f=await fixture(t);await f.doc();
 const batch=await f.service.claimEvents({consumerId:'indexer',limit:100,leaseMs:10});assert.ok(batch.events.some(e=>e.type==='source.registered'));
 await f.restart();await new Promise(r=>setTimeout(r,15));
 const replay=await f.service.claimEvents({consumerId:'indexer',limit:100,leaseMs:1000});assert.deepEqual(replay.events,batch.events);
 await assert.rejects(f.service.ackEvents({consumerId:'indexer',token:batch.token,throughSequence:batch.throughSequence}),/LEASE_CONFLICT/);
 await f.service.ackEvents({consumerId:'indexer',token:replay.token,throughSequence:replay.throughSequence});
 const empty=await f.service.claimEvents({consumerId:'indexer'});assert.equal(empty.events.length,0);
});
test('outbox failure rolls back the original settings mutation and registered source',async t=>{
 const f=await fixture(t),sql=new DatabaseSync(path.join(f.root,'atelier.sqlite'));
 sql.exec("CREATE TRIGGER reject_event BEFORE INSERT ON continuity_events WHEN NEW.type='source.registered' BEGIN SELECT RAISE(ABORT,'outbox failure'); END");
 await assert.rejects(f.doc(),/outbox failure/);
 assert.equal((await f.spaces.read()).documents.length,0);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM continuity_sources').get().n,0);
 sql.exec('DROP TRIGGER reject_event');sql.close();
 await f.doc();assert.equal((await f.service.search(f.context)).length,1);
});
function run(id,extra={}){return {id,projectId:null,employee:{id:'product'},title:'Background',status:'completed',terminalTurnId:'u-'+id,createdAt:new Date().toISOString(),messages:[{id:'u-'+id,role:'user',text:'Remember this context',timing:{outcome:'completed'}},{id:'a-'+id,turnKey:'u-'+id,role:'assistant',phase:'final_answer',text:'Private final background'}],...extra};}
test('private runs require explicit sharing for other experts and one-time grants exclude future messages',async t=>{
 const f=await fixture(t),r=run('private');await f.db.call('saveRuns',[r]);
 await f.object('link',{id:'private-link',domainId:'domain-a',target:{kind:'source',id:JSON.stringify(['run-message',r.id,'a-private'])},state:'confirmed',origin:'user'});
 const own=await f.service.search(f.context);assert.equal(own.length,1);
 const other={...f.context,employeeId:'architect'};assert.equal((await f.service.search(other)).length,0);
 await f.object('sharing',{id:'private-share',domainId:'domain-a',sourceSelectors:[{kind:'source',id:own[0].ref.sourceKey}],readerEmployeeIds:['architect'],destination:{kind:'profile-private-chat'},includeFutureSources:false,status:'active'});
 assert.equal((await f.service.search(other)).length,1);
 r.messages.push({id:'u2',role:'user',text:'New secret',timing:{outcome:'completed'}},{id:'a2',turnKey:'u2',role:'assistant',phase:'final_answer',text:'New secret response'});r.terminalTurnId='u2';await f.db.call('saveRuns',[r]);
 assert.equal((await f.service.search(other)).length,1);
});
test('final messages only; discussion and run evidence share identity and deletion blocks both',async t=>{
 const f=await fixture(t),r=run('discussion',{collaboration:{spaceId:f.a.id,requestId:'request'}});
 r.messages.push({id:'reason',turnKey:'u-discussion',role:'assistant',kind:'reasoning',text:'Never index reasoning'});
 await f.spaces.change(s=>{s.requests.push({id:'request',spaceId:f.a.id,mode:'discussion',participants:[{employeeId:'product',runId:r.id,contribution:{id:'contribution',provenance:'recorded',author:{id:'product'}}}]});});
 await f.db.call('saveRuns',[r]);
 let entries=await f.service.search(f.context);assert.equal(entries.filter(s=>s.kind==='discussion-statement').length,1);
 const statement=entries.find(s=>s.kind==='discussion-statement'),message=entries.find(s=>s.locator.messageId==='a-discussion'&&s.kind==='run-message');assert.equal(statement.evidenceKey,message.evidenceKey);
 assert.equal((await f.service.search(f.context,'reasoning')).length,0);
 await f.spaces.change(s=>{s.discussionStates.request={status:'deleted',requestIds:['request']};s.requests=[];});
 assert.equal((await f.service.search(f.context)).length,0);
});
test('interrupted streaming output never becomes a final source',async t=>{
 const f=await fixture(t),r=run('partial',{status:'interrupted',terminalTurnId:'u-partial'});delete r.messages[0].timing;
 r.collaboration={spaceId:f.a.id};await f.db.call('saveRuns',[r]);assert.equal((await f.service.search(f.context)).length,0);
});
test('plan review adapter preserves completion-policy and attempt identity',async t=>{
 const f=await fixture(t);
 await f.spaces.change(s=>s.plans.push({id:'plan',spaceId:f.a.id,packages:[{id:'node',definition:{title:'Node',employeeId:'product'},attempts:[{id:'attempt',resultHash:'result',review:{attemptId:'attempt',resultHash:'result',accepted:true,source:'completion-policy',at:'then',note:'Completed'}}],acceptance:{attemptId:'attempt',resultHash:'result'}}]}));
 const e=(await f.service.search(f.context,'',{currentOnly:false}))[0],value=await f.service.readSource(f.context,e.ref);assert.equal(value.reviewSource,'completion-policy');assert.equal(value.locator.attemptId,'attempt');assert.equal(value.authority,'historical');assert.equal(value.resultState,'unverifiable');
});
test('source file corruption denies reads, invalidates snapshots and persists the barrier',async t=>{
 const f=await fixture(t),d=await f.doc();const ref=(await f.service.search(f.context))[0].ref,snapshot=await f.service.snapshot(f.context,[ref]);
 await fs.writeFile(path.join(f.root,'workforce','documents',f.a.id,d.id,d.hash+'.md'),'tampered');
 await assert.rejects(f.service.readSource(f.context,ref),/ACCESS_DENIED/);
 await assert.rejects(f.service.validateSnapshot(snapshot.id),/SNAPSHOT_INVALIDATED/);
 await f.restart();assert.equal((await f.service.search(f.context)).length,0);
});
test('knowledge revision replacement invalidates downstream interpretations',async t=>{
 const f=await fixture(t);await f.doc();const refs=(await f.service.search(f.context)).map(s=>s.ref);
 await f.publish({id:'parent',domainId:'domain-a',claimType:'fact',body:'First',sourceRefs:refs});
 await f.publish({id:'child',domainId:'domain-a',claimType:'suggestion',body:'Derived',sourceRefs:[],knowledgeRefs:[{id:'parent',revision:1}]});
 await f.publish({id:'parent',domainId:'domain-a',claimType:'fact',body:'Corrected',sourceRefs:refs},1);
 await assert.rejects(f.service.readKnowledge(f.context,{id:'child',revision:1}),/KNOWLEDGE_UNAVAILABLE/);
});
test('archived sources stay read-only searchable; source exclusions propagate through knowledge',async t=>{
 const f=await fixture(t);await f.doc();const ref=(await f.service.search(f.context))[0].ref;
 await f.publish({id:'k',domainId:'domain-a',claimType:'fact',body:'Background',sourceRefs:[ref]});
 await f.spaces.lifecycle({id:f.a.id,expectedRevision:1,action:'archive'});
 assert.equal((await f.service.search(f.context)).length,1);
 await assert.rejects(f.service.readKnowledge({...f.context,excludedSourceKeys:[ref.sourceKey]},{id:'k',revision:1}),/ACCESS_DENIED/);
 await assert.rejects(f.service.search({...f.context,employeeId:'missing'}),/EXPERT_UNAVAILABLE/);
});
test('profile stores are isolated and profile overrides are rejected',async t=>{
 const f=await fixture(t),g=await fixture(t);await f.doc();assert.equal((await g.service.search(g.context)).length,0);
 await assert.rejects(f.service.call('status',{profileId:'other'}),/INVALID_ARGUMENT/);
});
test('source slices bind UTF-16 offsets and hashes to the immutable revision',async t=>{
 const f=await fixture(t);await f.doc(f.a,{body:'前缀😀正文'});const ref=(await f.service.search(f.context))[0].ref;
 const slice={textField:'body',startUtf16:2,endUtf16:4,quoteHash:hash('😀')};
 assert.equal((await f.service.readSource(f.context,ref,slice)).body,'😀');
 await assert.rejects(f.service.readSource(f.context,ref,{...slice,endUtf16:5}),/SOURCE_SLICE_MISMATCH/);
});
test('same-name domains stay ambiguous; suggested links do not make sources discoverable',async t=>{
 const f=await fixture(t);assert.equal((await f.service.resolveDomains('platform')).status,'ambiguous');
 assert.equal((await f.service.resolveDomains('unknown')).status,'unknown');await f.doc();
 await f.object('link',{id:'link-a',domainId:'domain-a',target:{kind:'space',id:f.a.id},state:'suggested',origin:'model'},1);
 assert.equal((await f.service.search(f.context)).length,0);
});
test('one-time space sharing freezes scope and destination grants do not leak into private chats',async t=>{
 const f=await fixture(t);await f.doc();
 await f.object('sharing',{id:'once',domainId:'domain-a',sourceSelectors:[{kind:'space',id:f.a.id}],readerEmployeeIds:['product'],destination:{kind:'space',id:f.a.id},includeFutureSources:false,status:'active'});
 await f.doc(f.a,{body:'New document after sharing'});
 assert.equal((await f.service.search({...f.context,destination:{kind:'space',id:f.a.id}})).length,1);
 const r=run('only-target');await f.db.call('saveRuns',[r]);const sourceKey=JSON.stringify(['run-message',r.id,'a-only-target']);
 await f.object('link',{id:'private-target-link',domainId:'domain-a',target:{kind:'source',id:sourceKey},state:'confirmed',origin:'user'});
 await f.object('sharing',{id:'target-only',domainId:'domain-a',sourceSelectors:[{kind:'source',id:sourceKey}],readerEmployeeIds:['architect'],destination:{kind:'space',id:f.a.id},includeFutureSources:false,status:'active'});
 assert.equal((await f.service.search({...f.context,employeeId:'architect'},'Private final')).length,0);
 assert.equal((await f.service.search({...f.context,employeeId:'architect',destination:{kind:'space',id:f.a.id}},'Private final')).length,1);
});
test('registered source bodies are not duplicated and repeated reconciliation creates no events',async t=>{
 const f=await fixture(t);await f.doc();const before=await f.status();await f.service.search(f.context);assert.deepEqual(await f.status(),before);
 const sql=new DatabaseSync(path.join(f.root,'atelier.sqlite'));
 assert.ok(sql.prepare('SELECT data FROM continuity_sources').all().every(r=>!Object.hasOwn(JSON.parse(r.data),'body')));sql.close();
});
test('knowledge search respects dependencies and failed stale publication leaves no record',async t=>{
 const f=await fixture(t);await f.doc();const refs=(await f.service.search(f.context)).map(x=>x.ref);
 await f.publish({id:'searchable',domainId:'domain-a',claimType:'hypothesis',body:'中文接口 ABC',sourceRefs:refs});
 assert.equal((await f.service.searchKnowledge(f.context,'中文接口'))[0].claimType,'hypothesis');
 assert.equal((await f.service.searchKnowledge({...f.context,excludedSourceKeys:[refs[0].sourceKey]},'ABC')).length,0);
});
test('version 10 databases upgrade without rewriting existing workspace and reject future schemas',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-continuity-migration-'));let db;
 t.after(async()=>{await db?.close();await fs.rm(root,{recursive:true,force:true});});
 const sql=new DatabaseSync(path.join(root,'atelier.sqlite'));
 sql.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,data TEXT NOT NULL); INSERT INTO settings VALUES('workspace','{\"theme\":\"dark\"}'); PRAGMA user_version=10;");sql.close();
 db=new Database(root);await db.call('ready');assert.equal((await db.call('readWorkspace')).theme,'dark');await db.close();db=null;
 const check=new DatabaseSync(path.join(root,'atelier.sqlite'));assert.equal(check.prepare('PRAGMA user_version').get().user_version,16);check.exec('PRAGMA user_version=17');check.close();
 db=new Database(root);await assert.rejects(db.call('ready'),/数据库版本高于/);await db.close().catch(()=>{});db=null;
});
test('discussion projections preserve underlying document and historical-space restrictions',async t=>{
 const f=await fixture(t),doc=await f.doc(f.b);
 const r=run('derived',{collaboration:{spaceId:f.a.id,requestId:'derived-request',historySpaceIds:[f.b.id],documents:[{id:doc.id,revision:1,hash:doc.hash}]}});
 await f.spaces.change(s=>s.requests.push({id:'derived-request',spaceId:f.a.id,mode:'discussion',participants:[{employeeId:'product',runId:r.id,contribution:{id:'derived-contribution',provenance:'recorded',author:{id:'product'}}}]}));
 await f.db.call('saveRuns',[r]);
 assert.equal((await f.service.search({...f.context,employeeId:'architect'},'Private final')).length,0);
 assert.equal((await f.service.search(f.context,'Private final')).length,2);
 await f.spaces.withdrawDocument({id:doc.id,expectedRevision:1});
 assert.equal((await f.service.search(f.context,'Private final')).length,0);
});
test('changed accepted result invalidates review snapshots in the same run transaction',async t=>{
 const f=await fixture(t),r=run('accepted',{tools:[],fileChanges:[],collaboration:{spaceId:f.a.id}});await f.db.call('saveRuns',[r]);
 const resultHash=hash(JSON.stringify({messages:r.messages,tools:r.tools,fileChanges:r.fileChanges,workEvidence:r.workEvidence}));
 const review={attemptId:'attempt',resultHash,accepted:true,source:'user-review',at:'then',note:'Verified'};
 await f.spaces.change(s=>s.plans.push({id:'verified-plan',spaceId:f.a.id,packages:[{id:'node',definition:{title:'Verified'},attempts:[{id:'attempt',runId:r.id,resultHash,review}],acceptance:review}]}));
 const ref=(await f.service.search(f.context)).find(s=>s.kind==='plan-review').ref;
 const snapshot=await f.service.snapshot(f.context,[ref]);
 r.tools.push({id:'changed',status:'failed'});await f.db.call('saveRuns',[r]);
 await assert.rejects(f.service.validateSnapshot(snapshot.id),/SNAPSHOT_INVALIDATED/);
 const changed=(await f.service.search(f.context,'',{currentOnly:false})).find(s=>s.kind==='plan-review');
 assert.equal((await f.service.readSource(f.context,changed.ref)).resultState,'changed');
});
