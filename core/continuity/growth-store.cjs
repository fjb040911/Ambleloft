const {hash}=require('./sources.cjs');
const {randomUUID}=require('node:crypto');
const RULE='cooperation-v1';
const roleFingerprint=e=>hash({domain:e.domain,responsibilities:e.responsibilities,methods:e.methods,deliverables:e.deliverables,skills:e.skills});
const schema=`CREATE TABLE IF NOT EXISTS continuity_growth_jobs(id TEXT PRIMARY KEY,state TEXT NOT NULL,data TEXT NOT NULL,result TEXT,created_at TEXT NOT NULL,dispatched_at TEXT,error TEXT);
CREATE INDEX IF NOT EXISTS continuity_growth_queue ON continuity_growth_jobs(state,created_at);
CREATE TABLE IF NOT EXISTS continuity_growth_blocks(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS continuity_growth_policy(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,daily_limit INTEGER NOT NULL);
INSERT OR IGNORE INTO continuity_growth_policy VALUES(1,1,20);`;
function createGrowth({db,setting,objects,sourceRows,hydrate,permit,refOf,checked,context,epoch,knowledgePut,knowledgeRow,knowledgeAllowed,invalidate,event,growthBoundaryChanged}){
 const employees=()=>setting('workforce.roles.v1').employees||[];
 const blocked=id=>!!db.prepare('SELECT id FROM continuity_growth_blocks WHERE id=?').get(id);
 const data=row=>row&&({...JSON.parse(row.data),state:row.state,result:row.result?JSON.parse(row.result):null,error:row.error});
 const get=id=>data(db.prepare('SELECT * FROM continuity_growth_jobs WHERE id=?').get(id));
 function check(job){
  if(!db.prepare('SELECT enabled FROM continuity_growth_policy WHERE id=1').get().enabled)throw Error('GROWTH_PAUSED');
  if(!job||blocked(job.family))throw Error('GROWTH_BLOCKED');
  const e=employees().find(e=>e.id===job.employeeId);if(!e||roleFingerprint(e)!==job.roleFingerprint)throw Error('ROLE_CHANGED');
  const c=context(job.context),source=checked(job.sourceRef,c);if(source.authority==='historical'||source.provenance==='legacy')throw Error('SOURCE_CHANGED');if(growthBoundaryChanged(job,source))throw Error('INPUT_REVOKED');return {employee:e,source};
 }
 function discover(){
  const pending=db.prepare("SELECT count(*) AS count FROM continuity_growth_jobs WHERE state IN ('queued','running','blocked')").get().count;if(pending>=100)return {added:0};
  const domains=objects('domain').filter(d=>d.status==='active'),staff=employees();let added=0;
  // Single-source segments keep permissions and corrections independent. Duplicate
  // discussion/run views of the same evidence must not multiply model calls.
  const sources=sourceRows().filter(s=>s.availability==='available'&&s.authority!=='historical'&&s.provenance!=='legacy'&&!(s.kind==='run-message'&&s.role==='user')).sort((a,b)=>Number(b.kind==='space-document')-Number(a.kind==='space-document')||a.id.localeCompare(b.id));
  const seen=new Set();
  for(const s of sources)for(const domain of domains)for(const e of staff){
   let c={employeeId:e.id,domainIds:[domain.id],destination:{kind:'profile-private-chat'},operation:'read'};
   if(!permit(s,c)){
    const granted=objects('sharing').filter(g=>g.status==='active'&&g.domainId===domain.id&&g.readerEmployeeIds.includes(e.id)).map(g=>({...c,destination:g.destination})).find(candidate=>permit(s,candidate));
    if(!granted)continue;c=granted;
   }
   const evidence=hash([s.evidenceKey,s.kind==='space-document'?s.semanticHash:s.contentHash,domain.id,e.id]);if(seen.has(evidence))continue;seen.add(evidence);
   const family=hash([s.sourceKey,domain.id,e.id]),fingerprint=roleFingerprint(e),body=hydrate(s).body;
   if(blocked(family))continue;
   for(let start=0;start<body.length;start+=14000){
    const end=Math.min(start+16000,body.length),inputSlice={startUtf16:start,endUtf16:end,quoteHash:hash(body.slice(start,end)),sourceLength:body.length};
    const id=hash([RULE,s.id,s.stateFingerprint,domain.id,e.id,fingerprint,start,end]);
    if(db.prepare('SELECT id FROM continuity_growth_jobs WHERE id=?').get(id)){if(end===body.length)break;continue;}
    const job={id,family,ruleVersion:RULE,employeeId:e.id,domainId:domain.id,roleFingerprint:fingerprint,roleRevision:e.revision||0,sourceRef:refOf(s),context:c,inputSlice};
    db.prepare("INSERT INTO continuity_growth_jobs(id,state,data,created_at) VALUES(?,'queued',?,?)").run(id,JSON.stringify(job),new Date().toISOString());added++;
    if(pending+added>=100)return {added};if(end===body.length)break;
   }
  }
  return {added};
 }
 function dispatch(input){switch(input.operation){
  case 'discover':return discover();
  case 'recover':db.prepare("UPDATE continuity_growth_jobs SET state=CASE WHEN dispatched_at IS NULL THEN 'queued' ELSE 'interrupted' END,error=CASE WHEN dispatched_at IS NULL THEN NULL ELSE 'UNKNOWN_OUTCOME' END WHERE state='running'").run();return;
  case 'status':return {policy:db.prepare('SELECT enabled,daily_limit AS dailyLimit FROM continuity_growth_policy WHERE id=1').get(),counts:db.prepare('SELECT state,count(*) AS count FROM continuity_growth_jobs GROUP BY state').all()};
  case 'policy':{
   if(typeof input.enabled!=='boolean'||!Number.isInteger(input.dailyLimit)||input.dailyLimit<0||input.dailyLimit>100)throw Error('INVALID_ARGUMENT');
   db.prepare('UPDATE continuity_growth_policy SET enabled=?,daily_limit=? WHERE id=1').run(Number(input.enabled),input.dailyLimit);return dispatch({operation:'status'});
  }
  case 'claim':{
   const policy=db.prepare('SELECT * FROM continuity_growth_policy WHERE id=1').get();if(!policy.enabled)return null;
   const today=new Date().toISOString().slice(0,10),used=db.prepare('SELECT count(*) AS count FROM continuity_growth_jobs WHERE dispatched_at>=?').get(today).count;if(used>=policy.daily_limit||db.prepare("SELECT id FROM continuity_growth_jobs WHERE state='running'").get())return null;
   for(const row of db.prepare("SELECT * FROM continuity_growth_jobs WHERE state IN ('queued','blocked') ORDER BY created_at,id LIMIT 100").all()){
    const job=data(row);if(job.state==='blocked'&&job.retryAfter>Date.now())continue;try{check(job);}catch{db.prepare("UPDATE continuity_growth_jobs SET state='obsolete',error='INPUT_UNAVAILABLE' WHERE id=?").run(job.id);continue;}
    const token=randomUUID();job.token=token;job.expectedEpoch=epoch();db.prepare("UPDATE continuity_growth_jobs SET state='running',data=? WHERE id=?").run(JSON.stringify(job),job.id);return job;
   }return null;
  }
  case 'dispatch':{
   const job=get(input.id);if(job?.state!=='running'||job.token!==input.token||db.prepare('SELECT dispatched_at FROM continuity_growth_jobs WHERE id=?').get(job.id).dispatched_at)throw Error('JOB_UNAVAILABLE');check(job);
   const policy=db.prepare('SELECT daily_limit FROM continuity_growth_policy WHERE id=1').get(),used=db.prepare('SELECT count(*) AS count FROM continuity_growth_jobs WHERE dispatched_at>=?').get(new Date().toISOString().slice(0,10)).count;if(used>=policy.daily_limit)throw Error('DAILY_BUDGET');
   db.prepare('UPDATE continuity_growth_jobs SET dispatched_at=? WHERE id=?').run(new Date().toISOString(),job.id);return;
  }
  case 'input':{
   const job=get(input.id);if(job?.state!=='running'||job.token!==input.token)throw Error('JOB_UNAVAILABLE');const value=check(job);return {...value,job};
  }
  case 'finish':{
   const job=get(input.id);if(!job||job.state!=='running'||job.token!==input.token)throw Error('JOB_UNAVAILABLE');
   if(input.error){const dispatched=db.prepare('SELECT dispatched_at FROM continuity_growth_jobs WHERE id=?').get(job.id).dispatched_at;const state=input.error==='MODEL_UNAVAILABLE'?'blocked':input.error==='INTERRUPTED'?(dispatched?'interrupted':'queued'):'failed';if(state==='blocked')job.retryAfter=Date.now()+60000;db.prepare('UPDATE continuity_growth_jobs SET state=?,data=?,error=? WHERE id=?').run(state,JSON.stringify(job),String(input.error).slice(0,100),job.id);return;}
   if(!db.prepare('SELECT dispatched_at FROM continuity_growth_jobs WHERE id=?').get(job.id).dispatched_at)throw Error('NOT_DISPATCHED');
   const {source,employee}=check(job);
   const value=input.value;if(!value||!Array.isArray(value.segments)||value.segments.length>4||typeof value.quote!=='string'||value.quote.length>2000||value.quote&&!source.body.slice(job.inputSlice.startUtf16,job.inputSlice.endUtf16).includes(value.quote))throw Error('INVALID_EXTRACTION');
   for(const s of value.segments)if(!s||!['focus','interpretation','open-question','method'].includes(s.type)||typeof s.body!=='string'||!s.body.trim()||s.body.length>2000||!value.quote.trim())throw Error('INVALID_EXTRACTION');
   const result={knowledgeRefs:[],understandingRefs:[],coverage:{sourceRef:job.sourceRef,roleFingerprint:job.roleFingerprint,ruleVersion:RULE,inputSlice:job.inputSlice},participation:source.scope.employeeId===employee.id&&['run-message','discussion-statement','expert-contribution'].includes(source.kind)?{kind:source.kind,locator:source.locator,outcome:'completed',acceptance:'not-established'}:null};
   if(value.quote.trim()){
    const sharedId='excerpt-'+hash([RULE,source.id,source.stateFingerprint,job.domainId,hash(value.quote)]);
    const prior=db.prepare('SELECT revision FROM continuity_knowledge WHERE id=? ORDER BY revision DESC LIMIT 1').get(sharedId);
    let shared;
    if(prior){shared=knowledgeRow({id:sharedId,revision:prior.revision});if(!knowledgeAllowed(shared,job.context))throw Error('KNOWLEDGE_UNAVAILABLE');}
    else shared=knowledgePut({commandId:sharedId,expectedEpoch:epoch(),expectedRevision:null,context:job.context,value:{id:sharedId,domainId:job.domainId,claimType:'suggestion',body:value.quote,appliesTo:{sourceConditions:source.conditions||'',sourceAuthority:source.authority,sourceKind:source.kind,sourceProjectId:source.scope.projectId||null,sourceSpaceId:source.scope.spaceId||null,sourceRevision:source.revisionKey},sourceRefs:[job.sourceRef],knowledgeRefs:[],kind:'source-excerpt',extraction:{ruleVersion:RULE,sourceId:source.id}}});
    const ref={id:shared.id,revision:shared.revision};result.knowledgeRefs.push(ref);
    for(const [index,segment] of value.segments.entries()){
     const id='understanding-'+hash([job.id,index]);const saved=knowledgePut({commandId:id,expectedEpoch:epoch(),expectedRevision:null,context:job.context,value:{id,domainId:job.domainId,claimType:segment.type==='open-question'?'open-question':segment.type==='method'?'method':'hypothesis',body:segment.body,appliesTo:shared.appliesTo,sourceRefs:[job.sourceRef],knowledgeRefs:[ref],kind:'expert-understanding',employeeId:employee.id,roleFingerprint:job.roleFingerprint,roleRevision:job.roleRevision,segmentType:segment.type,extraction:{ruleVersion:RULE,jobId:job.id,family:job.family}}});result.understandingRefs.push({id:saved.id,revision:saved.revision});
    }
   }
   db.prepare("UPDATE continuity_growth_jobs SET state='completed',result=? WHERE id=?").run(JSON.stringify(result),job.id);event('growth.completed',job.id);return result;
  }
  case 'dismiss':{
   const job=get(input.id);if(!job)throw Error('JOB_UNAVAILABLE');
   db.prepare('INSERT OR IGNORE INTO continuity_growth_blocks VALUES(?,?)').run(job.family,new Date().toISOString());
   for(const row of db.prepare('SELECT * FROM continuity_growth_jobs').all()){const j=data(row);if(j.family!==job.family)continue;for(const ref of j.result?.understandingRefs||[])db.prepare("UPDATE continuity_knowledge SET status='invalidated' WHERE id=?").run(ref.id);db.prepare("UPDATE continuity_growth_jobs SET state='dismissed' WHERE id=?").run(j.id);}
   invalidate('understanding-dismissed');event('growth.dismissed',job.id);return {family:job.family};
  }
  case 'jobs':return db.prepare('SELECT * FROM continuity_growth_jobs ORDER BY created_at DESC LIMIT 100').all().map(data).map(j=>({id:j.id,state:j.state,employeeId:j.employeeId,domainId:j.domainId,ruleVersion:j.ruleVersion,error:j.error,coverage:j.result?.coverage,participation:j.result?.participation}));
  default:throw Error('INVALID_ARGUMENT');
 }}
 return {dispatch};
}
module.exports={schema,createGrowth,roleFingerprint,RULE};
