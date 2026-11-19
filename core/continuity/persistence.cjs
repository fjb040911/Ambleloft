const growthModule=require('./growth-store.cjs');
const {randomUUID}=require('node:crypto');
const {hash,canonical,documentSources,runSources,reviewSources,expertChatSources}=require('./sources.cjs');
const schema=`
${growthModule.schema}
CREATE TABLE IF NOT EXISTS continuity_source_scans(run_id TEXT PRIMARY KEY,signature TEXT NOT NULL,source_ids TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS continuity_meta(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL);
INSERT OR IGNORE INTO continuity_meta VALUES(1,0);
CREATE TABLE IF NOT EXISTS continuity_objects(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS continuity_sources(id TEXT PRIMARY KEY,source_key TEXT NOT NULL,revision_key TEXT NOT NULL,state_hash TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS continuity_source_key ON continuity_sources(source_key);
CREATE TABLE IF NOT EXISTS continuity_knowledge(id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,revision));
CREATE TABLE IF NOT EXISTS continuity_dependencies(item_id TEXT NOT NULL,item_revision INTEGER NOT NULL,source_id TEXT NOT NULL,state_hash TEXT NOT NULL,PRIMARY KEY(item_id,item_revision,source_id));
CREATE INDEX IF NOT EXISTS continuity_dependency_source ON continuity_dependencies(source_id);
CREATE TABLE IF NOT EXISTS continuity_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,type TEXT NOT NULL,subject TEXT NOT NULL,epoch INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS continuity_consumers(id TEXT PRIMARY KEY,cursor INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER,batch_end INTEGER);
CREATE TABLE IF NOT EXISTS continuity_commands(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS continuity_snapshots(id TEXT PRIMARY KEY,epoch INTEGER NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
`;
const fail=(code)=>{throw Object.assign(Error(code),{code});};
const id=v=>{if(typeof v!=='string'||!v||v.length>180)fail('INVALID_ARGUMENT');return v;};
const array=v=>{if(!Array.isArray(v)||v.length>100)fail('INVALID_ARGUMENT');return v;};
const text=(v,max=10000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('INVALID_ARGUMENT');return v;};
function createPersistence(db,transaction,root){
 const readRun=(id,collections=['messages'])=>{const row=db.prepare('SELECT data FROM runs WHERE id=?').get(id);if(!row)return null;const run=JSON.parse(row.data);for(const collection of collections)run[collection]=require('../../electron/run-text-store.cjs').readItems(db,id,collection);return run;};
 const lookupRuns={find:predicate=>{for(const row of db.prepare('SELECT id FROM runs').iterate()){const meta=db.prepare('SELECT data FROM runs WHERE id=?').get(row.id);if(predicate(JSON.parse(meta.data)))return readRun(row.id,['messages','tools','fileChanges']);}}};
 const hydrate=s=>{
  const current=state(),locator=s.locator;let candidates=[];
  if(s.kind==='run-message'||s.kind==='discussion-statement'){const run=readRun(locator.runId);if(run)candidates=runSources(run,current);}
  else if(s.kind==='space-document')candidates=documentSources({...current,documents:(current.documents||[]).filter(d=>d.id===locator.documentId&&d.spaceId===locator.spaceId).map(d=>({...d,versions:d.versions.filter(v=>v.revision===locator.revision)}))},root);
  else if(s.kind==='plan-review')candidates=reviewSources({...current,plans:(current.plans||[]).filter(p=>p.id===locator.planId)},lookupRuns);
  else if(s.kind==='expert-contribution')candidates=expertChatSources(db,locator.conversationId);
  const value=candidates.find(v=>v.id===s.id);if(!value||value.contentHash!==s.contentHash)fail('SOURCE_CHANGED');
  return {...s,body:value.body};
 };
 const setting=key=>{const row=db.prepare('SELECT data FROM settings WHERE key=?').get(key);return row?JSON.parse(row.data):{};};
 const state=()=>setting('workforce.spaces.v1');
 const epoch=()=>db.prepare('SELECT epoch FROM continuity_meta WHERE id=1').get().epoch;
 const event=(type,subject)=>db.prepare('INSERT INTO continuity_events(event_id,type,subject,epoch,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),type,subject,epoch(),new Date().toISOString());
 const invalidate=reason=>{
  db.prepare('UPDATE continuity_meta SET epoch=epoch+1 WHERE id=1').run();
  db.prepare("UPDATE continuity_snapshots SET status='invalidated' WHERE status='ready'").run();
  event('policy.changed',reason);
 };
 const getObject=(kind,objectId)=>{const r=db.prepare('SELECT data FROM continuity_objects WHERE kind=? AND id=?').get(kind,objectId);return r?JSON.parse(r.data):null;};
 const objects=kind=>db.prepare('SELECT data FROM continuity_objects WHERE kind=? ORDER BY id').all(kind).map(r=>JSON.parse(r.data));
 const sourceById=sourceId=>{const r=db.prepare('SELECT data FROM continuity_sources WHERE id=?').get(sourceId);return r?JSON.parse(r.data):null;};
 const sourceRows=()=>db.prepare('SELECT data FROM continuity_sources ORDER BY id').all().map(r=>JSON.parse(r.data));
 function* sourceValues(s){
  for(const doc of s.documents||[])yield* documentSources({...s,documents:[doc]},root);
  yield* reviewSources(s,lookupRuns);
  const policy=hash(s);
  for(const row of db.prepare('SELECT id,data FROM runs').iterate()){
   const signature=require('node:crypto').createHash('sha256').update(policy).update(row.data);
   for(const item of db.prepare("SELECT item_key,data FROM run_items WHERE run_id=? AND collection='messages' ORDER BY position").iterate(row.id))signature.update(JSON.stringify(item));
   for(const field of db.prepare("SELECT item_key,field,revision FROM run_texts WHERE run_id=? AND collection='messages' ORDER BY item_key,field").iterate(row.id))signature.update(JSON.stringify(field));
   const fingerprint=signature.digest('hex'),old=db.prepare('SELECT signature,source_ids FROM continuity_source_scans WHERE run_id=?').get(row.id);
   if(old?.signature===fingerprint){for(const id of JSON.parse(old.source_ids)){const source=sourceById(id);if(source)yield source;}continue;}
   const sources=runSources(require('../../electron/run-text-store.cjs').readRunReferences(db,row.id),s);yield* sources;
   db.prepare('INSERT INTO continuity_source_scans VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET signature=excluded.signature,source_ids=excluded.source_ids').run(row.id,fingerprint,JSON.stringify(sources.map(v=>v.id)));
  }
  db.exec('DELETE FROM continuity_source_scans WHERE run_id NOT IN (SELECT id FROM runs)');
  for(const row of db.prepare('SELECT id FROM expert_chats').iterate())yield* expertChatSources(db,row.id);
 }
 function syncSources(){return require('../../electron/storage-timing.cjs').measure('databaseIndexMs',syncSourcesNow);}
 function syncSourcesNow(){
  const s=state(),seen=new Set();
  let changed=false;
  function put(value){
   const previous=sourceById(value.id);if(previous?.stateFingerprint===value.stateFingerprint)return;
   if(!changed){invalidate('sources');changed=true;}
   // A source transition invalidates every flattened dependent revision, including
   // revisions derived through another knowledge item. Restoration never revives it.
   db.prepare("UPDATE continuity_knowledge SET status='invalidated' WHERE EXISTS (SELECT 1 FROM continuity_dependencies d WHERE d.item_id=continuity_knowledge.id AND d.item_revision=continuity_knowledge.revision AND d.source_id=?)").run(value.id);
   const stored={...value};delete stored.body; // Originals remain in the document/run stores.
   if(value.availability!=='available'){stored.title='';stored.conditions='';}
   db.prepare('INSERT INTO continuity_sources VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_hash=excluded.state_hash,data=excluded.data').run(value.id,value.sourceKey,value.revisionKey,value.stateFingerprint,JSON.stringify(stored));
   event(previous?'source.changed':'source.registered',value.id);
  }
  for(const value of sourceValues(s)){seen.add(value.id);put(value);}
  for(const old of sourceRows())if(!seen.has(old.id)&&old.availability!=='deleted')put({...old,availability:'deleted',stateFingerprint:hash({previous:old.semanticHash,availability:'deleted'})});
 }
 function onSetting(key,before,after){
  if(key==='workforce.spaces.v1'){
   const permissions=s=>(s?.spaces||[]).map(v=>({id:v.id,members:v.members,projectIds:v.projectIds,archivedAt:v.archivedAt}));
   if(hash(permissions(before))!==hash(permissions(after))){
    invalidate('space-access');
    const a=new Map(permissions(before).map(s=>[s.id,s])),b=new Map(permissions(after).map(s=>[s.id,s]));
    for(const sid of new Set([...a.keys(),...b.keys()]))if(hash(a.get(sid)||null)!==hash(b.get(sid)||null)){event('space-access.changed',sid);const oldMembers=new Map((a.get(sid)?.members||[]).map(m=>[m.employeeId,m])),newMembers=new Map((b.get(sid)?.members||[]).map(m=>[m.employeeId,m]));for(const employeeId of new Set([...oldMembers.keys(),...newMembers.keys()]))if(hash(oldMembers.get(employeeId)||null)!==hash(newMembers.get(employeeId)||null))event('space-member.changed',JSON.stringify([sid,employeeId]));}
   }
   syncSources();
  }
  if(key==='workforce.roles.v1'){
   const signature=value=>(value?.employees||[]).map(e=>[e.id,growthModule.roleFingerprint(e)]).sort();
   if(hash(signature(before))!==hash(signature(after))){
    invalidate('expert-access');
    const old=new Map(signature(before)),next=new Map(signature(after));for(const eid of new Set([...old.keys(),...next.keys()]))if(old.get(eid)!==next.get(eid)){event('expert.changed',eid);db.prepare("UPDATE task_context_projections SET status='invalidated' WHERE employee_id=?").run(eid);}
    for(const row of db.prepare("SELECT id,revision,data FROM continuity_knowledge WHERE status='available'").all()){
     const k=JSON.parse(row.data);if(k.kind!=='expert-understanding')continue;
     const e=(after?.employees||[]).find(e=>e.id===k.employeeId);if(!e||growthModule.roleFingerprint(e)!==k.roleFingerprint)db.prepare("UPDATE continuity_knowledge SET status='invalidated' WHERE id=? AND revision=?").run(row.id,row.revision);
    }
   }
  }
 }
 function command(input,fn){
  id(input.commandId);const fingerprint=hash(input),old=db.prepare('SELECT * FROM continuity_commands WHERE id=?').get(input.commandId);
  if(old){if(old.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return JSON.parse(old.result);}
  const result=fn();db.prepare('INSERT INTO continuity_commands VALUES(?,?,?)').run(input.commandId,fingerprint,JSON.stringify(result));return result;
 }
 function objectPut(input){return command(input,()=>{
  if(!['domain','link','sharing'].includes(input.kind))fail('INVALID_ARGUMENT');
  const v=structuredClone(input.value),objectId=id(v.id),old=getObject(input.kind,objectId);
  if(old?input.expectedRevision!==old.revision:input.expectedRevision!==null)fail('REVISION_CONFLICT');
  if(input.kind==='domain'){
   text(v.name,200);if(!['active','archived'].includes(v.status))fail('INVALID_ARGUMENT');
   if(v.aliases)array(v.aliases).forEach(x=>text(x,200));
  }else{
   const domain=getObject('domain',id(v.domainId));if(!domain||domain.status!=='active')fail('DOMAIN_UNAVAILABLE');
   if(input.kind==='link'){
    if(!['suggested','confirmed','removed'].includes(v.state)||!['space','project','source'].includes(v.target?.kind))fail('INVALID_ARGUMENT');
    id(v.target.id);
    if(v.target.kind==='space'&&!(state().spaces||[]).some(s=>s.id===v.target.id))fail('SOURCE_UNAVAILABLE');
    if(v.target.kind==='project'&&!db.prepare('SELECT id FROM projects WHERE id=?').get(v.target.id))fail('SOURCE_UNAVAILABLE');
    if(v.target.kind==='source'&&!sourceRows().some(s=>s.sourceKey===v.target.id))fail('SOURCE_UNAVAILABLE');
    if(v.state==='confirmed'&&v.origin!=='user'&&v.origin!=='explicit-context')fail('EXPLICIT_ASSOCIATION_REQUIRED');
   }else{
    if(typeof v.includeFutureSources!=='boolean'||!['active','revoked'].includes(v.status))fail('INVALID_ARGUMENT');
    array(v.readerEmployeeIds).forEach(id);array(v.sourceSelectors).forEach(x=>{if(!['source','space'].includes(x.kind))fail('INVALID_ARGUMENT');id(x.id);});
    destination(v.destination);
    // Freeze source identities for one-time sharing; re-saving unchanged selectors
    // cannot silently pick up newly created private messages.
    const unchanged=old&&hash([old.sourceSelectors,old.includeFutureSources])===hash([v.sourceSelectors,v.includeFutureSources]);
    v.frozenSourceKeys=v.includeFutureSources?[]:unchanged?old.frozenSourceKeys:sourceRows().filter(s=>v.sourceSelectors.some(x=>selector(x,s))).map(s=>s.sourceKey);
   }
  }
  const value={...v,revision:(old?.revision||0)+1};
  db.prepare('INSERT INTO continuity_objects VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(input.kind,objectId,value.revision,JSON.stringify(value));
  invalidate(input.kind);event(input.kind+'.changed',objectId);return value;
 });}
 function destination(d){
  if(!d||!['profile-private-chat','project','space'].includes(d.kind))fail('UNSUPPORTED_DESTINATION');
  if(d.kind==='project'&&!db.prepare('SELECT id FROM projects WHERE id=?').get(id(d.id)))fail('DESTINATION_UNAVAILABLE');
  if(d.kind==='space'&&!(state().spaces||[]).some(s=>s.id===id(d.id)))fail('DESTINATION_UNAVAILABLE');
  return d;
 }
 const selector=(x,s)=>x.kind==='source'?x.id===s.sourceKey:x.kind==='space'&&x.id===s.scope.spaceId;
 function linked(domainId,s){if(s.kind==='expert-contribution'&&s.domainId===domainId)return true;return objects('link').some(l=>l.domainId===domainId&&l.state==='confirmed'&&(l.target.kind==='source'?l.target.id===s.sourceKey:l.target.kind==='space'?l.target.id===s.scope.spaceId:l.target.id===s.scope.projectId));}
 function context(input){
  if(!input||!['discover','read','inject'].includes(input.operation||'read'))fail('INVALID_ARGUMENT');
  if(input.excludedRunIds)array(input.excludedRunIds).forEach(id);
  id(input.employeeId);array(input.domainIds).forEach(id);destination(input.destination);
  if(!(setting('workforce.roles.v1').employees||[]).some(e=>e.id===input.employeeId))fail('EXPERT_UNAVAILABLE');
  if(!input.domainIds.length||input.domainIds.some(d=>getObject('domain',d)?.status!=='active'))fail('DOMAIN_UNAVAILABLE');
  if(input.excludedSourceKeys){if(!Array.isArray(input.excludedSourceKeys)||input.excludedSourceKeys.length>128)fail('INVALID_ARGUMENT');input.excludedSourceKeys.forEach(id);}
  return input;
 }
 function permit(s,c,visiting=new Set()){
  if(!s||s.availability!=='available'||c.excludedSourceKeys?.includes(s.sourceKey)||c.excludedRunIds?.includes(s.locator?.runId))return false;
  if(visiting.has(s.id))return false;visiting=new Set(visiting).add(s.id);
  const scopes=state(),space=s.scope.spaceId&&scopes.spaces?.find(x=>x.id===s.scope.spaceId);
  if(s.scope.spaceId&&(!space||!space.members.some(m=>m.employeeId===c.employeeId)))return false;
  if((s.scope.historySpaceIds||[]).some(sid=>!scopes.spaces?.find(x=>x.id===sid)?.members.some(m=>m.employeeId===c.employeeId)))return false;
  const matching=c.domainIds.filter(d=>linked(d,s));if(!matching.length)return false;
  const grants=objects('sharing').filter(g=>g.status==='active'&&matching.includes(g.domainId)&&g.readerEmployeeIds.includes(c.employeeId)&&hash(g.destination)===hash(c.destination)&&g.sourceSelectors.some(x=>selector(x,s))&&(g.includeFutureSources||g.frozenSourceKeys.includes(s.sourceKey)));
  if(!space&&s.scope.employeeId!==c.employeeId&&!grants.length)return false;
  if(c.destination.kind!=='profile-private-chat'&&!grants.some(g=>hash(g.destination)===hash(c.destination)))return false;
  // Underlying document dependencies are part of source permission, not merely
  // of later summaries. A retained run cannot leak a withdrawn document.
  for(const ref of s.continuityRefs||[]){const dep=sourceById(ref.id);if(!dep||hash(refOf(dep))!==hash(ref)||!permit(dep,c,visiting))return false;}
  for(const ref of s.knowledgeRefs||[]){try{if(!knowledgeAllowed(knowledgeRow(ref),c))return false;}catch{return false;}}
  for(const ref of s.sourceRefs||[]){
   const dep=sourceRows().find(x=>x.kind==='space-document'&&x.locator.documentId===ref.id&&x.locator.revision===ref.revision&&x.contentHash===ref.hash);
   if(!permit(dep,c,visiting))return false;
  }
  return true;
 }
 function addSource(s,target,visiting=new Set()){
  if(visiting.has(s.id))fail('EVIDENCE_CYCLE');if(target.has(s.id))return;
  const next=new Set(visiting).add(s.id);target.set(s.id,s);
  const children=(s.continuityRefs||[]).map(r=>sourceById(r.id));
  for(const ref of s.sourceRefs||[])children.push(sourceRows().find(x=>x.kind==='space-document'&&x.locator.documentId===ref.id&&x.locator.revision===ref.revision&&x.contentHash===ref.hash));
  for(const ref of s.knowledgeRefs||[])for(const d of dependencies(knowledgeRow(ref)))children.push(sourceById(d.source_id));
  for(const child of children){if(!child)fail('SOURCE_UNAVAILABLE');addSource(child,target,next);}
 }
 const refOf=s=>({id:s.id,sourceKey:s.sourceKey,revisionKey:s.revisionKey,semanticHash:s.semanticHash,stateFingerprint:s.stateFingerprint});
 function checked(ref,c){const s=sourceById(ref?.id);if(!permit(s,c))fail('ACCESS_DENIED');if(hash(refOf(s))!==hash(ref))fail('SOURCE_CHANGED');return hydrate(s);}
 function knowledgeRow(ref){const row=db.prepare('SELECT * FROM continuity_knowledge WHERE id=? AND revision=?').get(id(ref.id),ref.revision);if(!row||row.status!=='available')fail('KNOWLEDGE_UNAVAILABLE');return {...JSON.parse(row.data),status:row.status};}
 function dependencies(item){return db.prepare('SELECT source_id,state_hash FROM continuity_dependencies WHERE item_id=? AND item_revision=?').all(item.id,item.revision);}
 function knowledgeAllowed(item,c){if(item.kind==='expert-understanding'){const employee=(setting('workforce.roles.v1').employees||[]).find(e=>e.id===item.employeeId);if(c.employeeId!==item.employeeId||!employee||growthModule.roleFingerprint(employee)!==item.roleFingerprint)return false;}return c.domainIds.includes(item.domainId)&&dependencies(item).every(d=>{const s=sourceById(d.source_id);return s?.stateFingerprint===d.state_hash&&permit(s,c);});}
 function knowledgePut(input){const c=context(input.context);if(input.expectedEpoch!==epoch())fail('POLICY_CHANGED');return command(input,()=>{
  const v=input.value;id(v.id);text(v.body,100000);id(v.domainId);
  if(!c.domainIds.includes(v.domainId)||!['fact','decision','suggestion','hypothesis','open-question','method'].includes(v.claimType))fail('INVALID_ARGUMENT');
  const prior=db.prepare('SELECT revision FROM continuity_knowledge WHERE id=? ORDER BY revision DESC LIMIT 1').get(v.id);
  if(prior?input.expectedRevision!==prior.revision:input.expectedRevision!==null)fail('REVISION_CONFLICT');
  const sources=new Map();array(v.sourceRefs).forEach(ref=>{const s=checked(ref,c);addSource(s,sources);});
  for(const ref of array(v.knowledgeRefs||[])){const k=knowledgeRow(ref);if(!knowledgeAllowed(k,c))fail('ACCESS_DENIED');for(const d of dependencies(k)){const s=sourceById(d.source_id);addSource(s,sources);}}
  if(!sources.size)fail('EVIDENCE_REQUIRED');
  if(v.claimType==='decision'&&![...sources.values()].every(s=>s.kind==='space-document'&&s.authority==='adopted'))fail('ADOPTION_REQUIRED');
  if(v.kind&&!['source-excerpt','expert-understanding'].includes(v.kind))fail('INVALID_ARGUMENT');
  const extra={};
  if(v.kind){extra.kind=v.kind;extra.extraction=v.extraction||{};}
  if(v.kind==='expert-understanding'){
   const employee=(setting('workforce.roles.v1').employees||[]).find(e=>e.id===c.employeeId);
   if(v.employeeId!==c.employeeId||v.roleFingerprint!==growthModule.roleFingerprint(employee)||!['focus','interpretation','open-question','method'].includes(v.segmentType))fail('INVALID_ARGUMENT');
   Object.assign(extra,{employeeId:v.employeeId,roleFingerprint:v.roleFingerprint,roleRevision:v.roleRevision,segmentType:v.segmentType});
  }
  // Both automatic and authored revisions use the same dependency graph.
  const value={...extra,id:v.id,revision:(prior?.revision||0)+1,domainId:v.domainId,body:v.body,claimType:v.claimType,appliesTo:v.appliesTo||{},sourceRefs:[...sources.values()].map(refOf),knowledgeRefs:v.knowledgeRefs||[]};
  if(prior){
   db.prepare("UPDATE continuity_knowledge SET status='superseded' WHERE id=? AND status='available'").run(v.id);
   const affected=new Set([v.id]);let progress=true;
   while(progress){progress=false;for(const row of db.prepare("SELECT * FROM continuity_knowledge WHERE status='available'").all()){
    if(JSON.parse(row.data).knowledgeRefs.some(ref=>affected.has(ref.id))){db.prepare("UPDATE continuity_knowledge SET status='invalidated' WHERE id=? AND revision=?").run(row.id,row.revision);affected.add(row.id);progress=true;}
   }}
   invalidate('knowledge-revision');
  }
  db.prepare('INSERT INTO continuity_knowledge VALUES(?,?,?,?)').run(v.id,value.revision,'available',JSON.stringify(value));
  for(const s of sources.values())db.prepare('INSERT INTO continuity_dependencies VALUES(?,?,?,?)').run(v.id,value.revision,s.id,s.stateFingerprint);
  event('knowledge.published',v.id);return {...value,status:'available'};
 });}
 function buildSnapshot(input){
  const c=context(input.context),refs=array(input.sourceRefs||[]),knowledgeRefs=array(input.knowledgeRefs||[]),sources=new Map();
  for(const ref of refs){const s=checked(ref,c);addSource(s,sources);}
  for(const ref of knowledgeRefs){const k=knowledgeRow(ref);if(!knowledgeAllowed(k,c))fail('ACCESS_DENIED');for(const d of dependencies(k)){const s=sourceById(d.source_id);addSource(s,sources);}}
  const value={id:randomUUID(),epoch:epoch(),context:c,sourceRefs:[...sources.values()].map(refOf),knowledgeRefs};
  db.prepare('INSERT INTO continuity_snapshots VALUES(?,?,?,?)').run(value.id,value.epoch,'ready',JSON.stringify(value));return value;
 }
 function readSnapshot(snapshotId,scoped=false){
  const row=db.prepare('SELECT * FROM continuity_snapshots WHERE id=?').get(id(snapshotId));if(!row||!scoped&&(row.status!=='ready'||row.epoch!==epoch()))fail('SNAPSHOT_INVALIDATED');
  const value=JSON.parse(row.data),c=context(value.context),sources=value.sourceRefs.map(ref=>checked(ref,c));
  const knowledge=value.knowledgeRefs.map(ref=>{const k=knowledgeRow(ref);if(!knowledgeAllowed(k,c))fail('ACCESS_DENIED');return k;});
  if(scoped&&value.context.domainIds.some(domainId=>[null,...sources].some(source=>growthBoundaryChanged({expectedEpoch:value.epoch,employeeId:c.employeeId,domainId,preciseAccess:true,destination:c.destination},source))))fail('SNAPSHOT_INVALIDATED');
  return {...value,sources,knowledge};
 }
 function eventsClaim(input){
  id(input.consumerId);const now=Date.now(),ttl=input.leaseMs??30000;if(!Number.isInteger(ttl)||ttl<1||ttl>300000)fail('INVALID_ARGUMENT');
  const limit=input.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_ARGUMENT');
  db.prepare('INSERT OR IGNORE INTO continuity_consumers(id) VALUES(?)').run(input.consumerId);
  const c=db.prepare('SELECT * FROM continuity_consumers WHERE id=?').get(input.consumerId);if(c.lease_token&&c.lease_until>now)fail('LEASE_BUSY');
  const events=db.prepare('SELECT * FROM continuity_events WHERE seq>? ORDER BY seq LIMIT ?').all(c.cursor,limit),token=randomUUID(),end=events.at(-1)?.seq??c.cursor;
  db.prepare('UPDATE continuity_consumers SET lease_token=?,lease_until=?,batch_end=? WHERE id=?').run(token,now+ttl,end,input.consumerId);
  return {token,events,throughSequence:end};
 }
 function eventsAck(input){
  const c=db.prepare('SELECT * FROM continuity_consumers WHERE id=?').get(id(input.consumerId));if(!c||c.lease_token!==input.token||c.lease_until<=Date.now()||c.batch_end!==input.throughSequence)fail('LEASE_CONFLICT');
  db.prepare('UPDATE continuity_consumers SET cursor=batch_end,lease_token=NULL,lease_until=NULL WHERE id=?').run(input.consumerId);return {cursor:c.batch_end};
 }
 function growthBoundaryChanged(job,source){
  if(job.expectedEpoch===undefined)return false;
  const dependencies=new Map();if(source)addSource(source,dependencies);
  const spaces=new Set([...dependencies.values()].flatMap(s=>[s.scope.spaceId,...(s.scope.historySpaceIds||[])].filter(Boolean)));
  return db.prepare("SELECT type,subject FROM continuity_events WHERE epoch>? AND type IN ('source.changed','space-access.changed','space-member.changed','expert.changed','domain.changed','link.changed','sharing.changed')").all(job.expectedEpoch).some(e=>{
   if(e.type==='source.changed')return dependencies.has(e.subject);
   if(e.type==='space-access.changed')return !job.preciseAccess&&spaces.has(e.subject);
   if(e.type==='space-member.changed'){const [spaceId,employeeId]=JSON.parse(e.subject);return spaces.has(spaceId)&&employeeId===job.employeeId;}
   if(e.type==='expert.changed')return e.subject===job.employeeId;
   if(e.type==='domain.changed')return e.subject===job.domainId;
   const object=getObject(e.type==='link.changed'?'link':'sharing',e.subject);if(object?.domainId!==job.domainId)return false;
   if(!job.preciseAccess)return true;
   if(e.type==='sharing.changed')return object.readerEmployeeIds.includes(job.employeeId)&&hash(object.destination)===hash(job.destination)&&[...dependencies.values()].some(s=>object.sourceSelectors.some(x=>selector(x,s)));
   return [...dependencies.values()].some(s=>object.target.kind==='source'?object.target.id===s.sourceKey:object.target.kind==='space'?object.target.id===s.scope.spaceId:object.target.id===s.scope.projectId);
  });
 }
 const growth=growthModule.createGrowth({db,setting,objects,sourceRows,hydrate,permit,refOf,checked,context,epoch,knowledgePut,knowledgeRow,knowledgeAllowed,invalidate,event,growthBoundaryChanged});
 function dispatch(input){
  if(!input||input.profileId!==undefined)fail('INVALID_ARGUMENT');
  // Reconciliation commits even if the subsequent command is rejected.
  transaction(()=>syncSources());
  return transaction(()=>{
   // Recheck filesystem source integrity at each read/mutation boundary, not just
   // on lifecycle notifications. This also reconciles interrupted migrations.
   switch(input.action){
    case 'growth':return growth.dispatch(input);
    case 'putObject':return objectPut(input);
    case 'listDomains':return objects('domain');
    case 'projectDomains':{
     const projectId=id(input.projectId);if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))fail('DESTINATION_UNAVAILABLE');
     const linkedIds=new Set(objects('link').filter(l=>l.state==='confirmed'&&(l.target.kind==='project'&&l.target.id===projectId||l.target.kind==='space'&&(state().spaces||[]).some(s=>s.id===l.target.id&&s.projectIds?.includes(projectId)))).map(l=>l.domainId));
     return objects('domain').filter(d=>d.status==='active'&&linkedIds.has(d.id));
    }
    case 'resolveDomains':{
     const q=text(input.query,200).normalize('NFKC').toLocaleLowerCase();
     const matches=objects('domain').filter(d=>d.status==='active'&&[d.name,...(d.aliases||[])].some(x=>x.normalize('NFKC').toLocaleLowerCase()===q));
     return {status:matches.length>1?'ambiguous':matches.length?'resolved':'unknown',domains:matches};
    }
    case 'status':return {epoch:epoch(),sourceCount:db.prepare('SELECT count(*) AS n FROM continuity_sources').get().n,eventCount:db.prepare('SELECT count(*) AS n FROM continuity_events').get().n};
    case 'search':{
     const c=context(input.context),query=String(input.query||'').normalize('NFKC').toLocaleLowerCase();if(query.length>500)fail('INVALID_ARGUMENT');
     const permitted=sourceRows().filter(s=>permit(s,c)).map(hydrate).filter(s=>(!input.currentOnly||s.authority!=='historical')&&(input.ranked||!query||(s.title+' '+s.body).normalize('NFKC').toLocaleLowerCase().includes(query)));
     return (input.ranked?require('./retrieval.cjs').rank(permitted,query):permitted).slice(0,50).map(s=>({ref:refOf(s),kind:s.kind,locator:s.locator,title:s.title,excerpt:s.body.slice(0,1000),authority:s.authority,evidenceKey:s.evidenceKey}));
    }
    case 'searchUnderstandings':
    case 'searchKnowledge':{
     const c=context(input.context),q=String(input.query||'').normalize('NFKC').toLocaleLowerCase();if(q.length>500)fail('INVALID_ARGUMENT');
     const allowed=db.prepare("SELECT data FROM continuity_knowledge WHERE status='available' ORDER BY id,revision DESC").all().map(r=>JSON.parse(r.data)).filter(k=>(input.action==='searchUnderstandings'?k.kind==='expert-understanding':k.kind!=='expert-understanding')&&knowledgeAllowed(k,c)&&(input.ranked||!q||k.body.normalize('NFKC').toLocaleLowerCase().includes(q)));
     return (input.ranked?require('./retrieval.cjs').rank(allowed,q):allowed).slice(0,50).map(k=>({...k,status:'available'}));
    }
    case 'checkContext':{const c=context(input.context);for(const ref of array(input.sourceRefs||[]))checked(ref,c);for(const ref of array(input.knowledgeRefs||[])){const k=knowledgeRow(ref);if(!knowledgeAllowed(k,c))fail('ACCESS_DENIED');}return {valid:true};}
    case 'readSource':{
     const c=context(input.context),s=checked(input.ref,c);if(!input.slice)return s;
     const {startUtf16:a,endUtf16:b,quoteHash}=input.slice;
     if(input.slice.textField!=='body'||!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<a||b>s.body.length||hash(s.body.slice(a,b))!==quoteHash)fail('SOURCE_SLICE_MISMATCH');
     return {...s,body:s.body.slice(a,b),slice:input.slice};
    }
    case 'publishKnowledge':return knowledgePut(input);
    case 'readKnowledge':{const c=context(input.context),k=knowledgeRow(input.ref);if(!knowledgeAllowed(k,c))fail('ACCESS_DENIED');return k;}
    case 'snapshot':return buildSnapshot(input);
    case 'validateSnapshot':return readSnapshot(input.id);
    case 'validateChatSnapshot':return readSnapshot(input.id,true);
    case 'resolveSource':{const c=context(input.context),s=sourceRows().find(s=>s.sourceKey===input.sourceKey&&permit(s,c));if(!s)fail('ACCESS_DENIED');return refOf(s);}
    case 'claimEvents':return eventsClaim(input);
    case 'ackEvents':return eventsAck(input);
    default:fail('INVALID_ARGUMENT');
   }
  });
 }
 return {schema,syncSources,onSetting,invalidate,dispatch};
}
module.exports={schema,createPersistence};
