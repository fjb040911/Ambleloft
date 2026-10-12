const {randomUUID,createHash}=require('node:crypto');
const DAY=86400000,RETENTION=7*DAY;
const fail=code=>{throw Object.assign(Error(code),{code});};
const schema=`
CREATE TABLE IF NOT EXISTS automation_turns(conversation_id TEXT,turn_id TEXT,version INTEGER,project_id TEXT,created INTEGER,data TEXT,PRIMARY KEY(conversation_id,turn_id,version));
CREATE TABLE IF NOT EXISTS automation_events(id TEXT PRIMARY KEY,extension_id TEXT,project_id TEXT,conversation_id TEXT,created INTEGER,due INTEGER,status TEXT,attempts INTEGER,data TEXT);
CREATE INDEX IF NOT EXISTS automation_events_due ON automation_events(status,due);
CREATE TABLE IF NOT EXISTS automation_jobs(id TEXT PRIMARY KEY,extension_id TEXT,event_key TEXT,project_id TEXT,created INTEGER,status TEXT,data TEXT,UNIQUE(extension_id,event_key));
CREATE INDEX IF NOT EXISTS automation_jobs_budget ON automation_jobs(extension_id,json_extract(data,'$.sentAt'));
CREATE INDEX IF NOT EXISTS automation_jobs_status ON automation_jobs(status,created);
CREATE INDEX IF NOT EXISTS automation_events_extension ON automation_events(extension_id,status);
CREATE TABLE IF NOT EXISTS automation_policy(extension_id TEXT PRIMARY KEY,data TEXT);
`;
function automationPersistence(db,transaction,check){
 const parse=row=>row?JSON.parse(row.data):null;
 const policy=id=>parse(db.prepare('SELECT data FROM automation_policy WHERE extension_id=?').get(id))||{paused:true,providerId:'',model:'',dailyLimit:20};
 const items=()=>db.prepare('SELECT data FROM extension_installations').all().map(parse);
 const allowed=(item,capability,projectId)=>{try{check({id:item.id,generation:item.generation,capability,projectId});return true;}catch{return false;}};
 const putEvent=(item,event,now)=>{
  if(!item.manifest?.hooks?.some(h=>h.event===event.type)||!allowed(item,'agent.hooks',event.projectId))return;
  // Capacity exhaustion is visible as one coalesced dead letter, never a chat failure.
  const count=db.prepare("SELECT count(*) n FROM automation_events WHERE extension_id=? AND status IN ('pending','delivering','dead')").get(item.id).n;
  if(count>=1000){const id='overflow:'+item.id;const old=parse(db.prepare('SELECT data FROM automation_events WHERE id=?').get(id));const data={type:'queue.overflow',eventId:id,dropped:(old?.dropped||0)+1,lastEventId:event.eventId};db.prepare("INSERT INTO automation_events VALUES (?,?,?,?,?,?,'dead',0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(id,item.id,event.projectId,null,now,now,JSON.stringify(data));return;}
  db.prepare("INSERT OR IGNORE INTO automation_events VALUES (?,?,?,?,?,?,'pending',0,?)").run(event.eventId+':'+item.id,item.id,event.projectId,event.conversationId||null,now,now,JSON.stringify(event));
 };
 const jobRow=id=>db.prepare('SELECT * FROM automation_jobs WHERE id=?').get(id);
 const saveJob=job=>db.prepare('UPDATE automation_jobs SET status=?,data=? WHERE id=?').run(job.status,JSON.stringify(job),job.id);
 const publicJob=job=>{const {prompt,outputSchema,input,hash,...rest}=job;return rest;};
 const usedCalls=id=>db.prepare("SELECT count(*) n FROM automation_jobs WHERE extension_id=? AND json_extract(data,'$.sentAt')>=?").get(id,Date.now()-DAY).n;
 const resultEvent=job=>{const item=items().find(i=>i.id===job.extensionId);if(item)putEvent(item,{eventId:randomUUID(),type:'background.job.completed',projectId:job.projectId,jobId:job.id,status:job.status,occurredAt:new Date().toISOString()},Date.now());};
 const reconcile=()=>{
  const installed=new Map(items().map(i=>[i.id,i]));
  for(const row of db.prepare("SELECT * FROM automation_events WHERE status IN ('pending','delivering','dead')").all())if(!installed.has(row.extension_id)||!allowed(installed.get(row.extension_id),'agent.hooks',row.project_id))db.prepare('DELETE FROM automation_events WHERE id=?').run(row.id);
  for(const row of db.prepare("SELECT * FROM automation_jobs WHERE status IN ('queued','running')").all()){
   const item=installed.get(row.extension_id),job=parse(row);
   const sourceValid=job.input.every(ref=>{const current=db.prepare("SELECT project_id FROM conversation_identities WHERE id=? AND kind='run'").get(ref.conversationId);return current?.project_id===job.projectId;});
   if(!sourceValid||!item||!allowed(item,'background.jobs',row.project_id)||!allowed(item,'conversations.read',row.project_id)){job.status=job.status==='running'?'unknown':'cancelled';job.error='FORBIDDEN';job.finishedAt=Date.now();saveJob(job);}
  }
 };
 return {
  capture(run,turnId,now=Date.now()){
   if(!turnId||!run.projectId)return;
   const conversationId=run.conversationId;if(!conversationId)return;
   if(db.prepare('SELECT 1 FROM automation_turns WHERE conversation_id=? AND turn_id=?').get(conversationId,turnId))return;
   const start=run.messages.findIndex(m=>m.id===turnId);if(start<0)return;
   const next=run.messages.findIndex((m,i)=>i>start&&m.role==='user'&&(!m.turnKey||m.turnKey!==turnId));
   const messages=run.messages.slice(start,next<0?undefined:next).map(({id,role,text})=>({id,role,text:text||''}));
   const snapshot={conversationId,turnId,version:1,projectId:run.projectId,status:run.status,messages};
   db.prepare('INSERT INTO automation_turns VALUES (?,?,?,?,?,?)').run(conversationId,turnId,1,run.projectId,now,JSON.stringify(snapshot));
   if(run.status==='completed')for(const item of items())putEvent(item,{type:'conversation.turn.completed',eventId:randomUUID(),conversationId,turnId,version:1,projectId:run.projectId,occurredAt:new Date(now).toISOString()},now);
  },
  handlers:{
   automationRead({context,input}){
    if(!input||typeof input.conversationId!=='string'||typeof input.turnId!=='string'||!Number.isSafeInteger(input.version)||input.version<1)fail('INVALID_ARGUMENT');
    const identity=db.prepare("SELECT project_id FROM conversation_identities WHERE id=? AND kind='run'").get(input.conversationId);
    if(!identity)fail('NOT_FOUND');check({...context,capability:'conversations.read',projectId:identity.project_id});
    const row=db.prepare('SELECT * FROM automation_turns WHERE conversation_id=? AND turn_id=? AND version=?').get(input.conversationId,input.turnId,input.version);
    if(!row||row.project_id!==identity.project_id)fail('NOT_FOUND');
    check({...context,capability:'conversations.read',projectId:row.project_id});
    if(Buffer.byteLength(row.data)>256*1024)fail('QUOTA_EXCEEDED');return parse(row);
   },
   automationRecover(){return transaction(()=>{db.prepare("UPDATE automation_events SET status=CASE WHEN attempts>=6 THEN 'dead' ELSE 'pending' END WHERE status='delivering'").run();for(const row of db.prepare("SELECT * FROM automation_jobs WHERE status='running'").all()){const job=parse(row);job.status='unknown';job.error='OUTCOME_UNKNOWN';saveJob(job);resultEvent(job);}reconcile();});},
   automationReconcile(){return transaction(reconcile);},
   automationNextEvent({now=Date.now()}={}){return transaction(()=>{
    reconcile();db.prepare("UPDATE automation_events SET status='dead' WHERE status IN ('pending','delivering') AND created<?").run(now-RETENTION);
    db.prepare("DELETE FROM automation_events WHERE status='acked' AND created<?").run(now-RETENTION);
    db.prepare('DELETE FROM automation_turns WHERE created<?').run(now-RETENTION);
    const row=db.prepare("SELECT e.* FROM automation_events e WHERE e.status='pending' AND e.due<=? AND NOT EXISTS (SELECT 1 FROM automation_events p WHERE p.extension_id=e.extension_id AND p.conversation_id=e.conversation_id AND p.rowid<e.rowid AND p.status IN ('pending','delivering')) ORDER BY e.rowid LIMIT 1").get(now);
    if(!row)return null;db.prepare("UPDATE automation_events SET status='delivering',attempts=attempts+1 WHERE id=?").run(row.id);return {...row,event:parse(row)};
   });},
   automationAck({id,ok,now=Date.now(),jitter=Math.random()}){db.prepare("UPDATE automation_events SET status=?,due=? WHERE id=? AND status='delivering'").run(ok?'acked':((db.prepare('SELECT attempts FROM automation_events WHERE id=?').get(id)?.attempts||0)>=6?'dead':'pending'),now+Math.min(300000,1000*2**(db.prepare('SELECT attempts FROM automation_events WHERE id=?').get(id)?.attempts||0))*(0.8+jitter*0.4),id);},
   automationSubmit({context,input}){return transaction(()=>{
    check({...context,capability:'background.jobs',projectId:input.projectId});check({...context,capability:'conversations.read',projectId:input.projectId});
    const key=input.eventKey,{eventKey,...content}=input,hash=createHash('sha256').update(JSON.stringify(content)).digest('hex');const old=parse(db.prepare('SELECT data FROM automation_jobs WHERE extension_id=? AND event_key=?').get(context.id,key));
    if(old){if(old.hash!==hash)fail('CONFLICT');return publicJob(old);}
    if(db.prepare("SELECT data FROM automation_jobs WHERE extension_id=? AND status='unknown'").all(context.id).some(r=>parse(r).hash===hash))fail('OUTCOME_UNKNOWN');
    const p=policy(context.id);if(p.paused||!p.providerId||!p.model)fail('INTERACTION_REQUIRED');
    if(db.prepare("SELECT count(*) n FROM automation_jobs WHERE extension_id=?").get(context.id).n>=1000)fail('QUOTA_EXCEEDED');
    const job={...input,id:randomUUID(),extensionId:context.id,hash,createdAt:Date.now(),status:'queued',providerId:p.providerId,model:p.model};
    db.prepare('INSERT INTO automation_jobs VALUES (?,?,?,?,?,?,?)').run(job.id,context.id,key,input.projectId,job.createdAt,job.status,JSON.stringify(job));return publicJob(job);
   });},
   automationGetJob({context,id}){const row=jobRow(id);if(!row||row.extension_id!==context.id)fail('NOT_FOUND');check({...context,capability:'background.jobs',projectId:row.project_id});check({...context,capability:'conversations.read',projectId:row.project_id});return publicJob(parse(row));},
   automationNextJob(){return transaction(()=>{
    reconcile();const budgets=new Map();for(const row of db.prepare("SELECT id,extension_id FROM automation_jobs WHERE status='queued' ORDER BY created").iterate()){
     if(!budgets.has(row.extension_id)){const p=policy(row.extension_id);budgets.set(row.extension_id,{...p,used:usedCalls(row.extension_id)});}
     const p=budgets.get(row.extension_id);if(p.paused||p.used>=p.dailyLimit)continue;
     const job=parse(jobRow(row.id));if(p.providerId!==job.providerId||p.model!==job.model)continue;return job;
    }return null;
   });},
   automationReleaseJob({id}){const job=parse(jobRow(id));if(job?.status==='running'){job.status='queued';delete job.sentAt;saveJob(job);}},
   automationStartJob({id}){return transaction(()=>{reconcile();const job=parse(jobRow(id));if(!job||job.status!=='queued')return false;const p=policy(job.extensionId);if(p.paused||p.providerId!==job.providerId||p.model!==job.model||usedCalls(job.extensionId)>=p.dailyLimit)return false;job.status='running';job.sentAt=Date.now();saveJob(job);return true;});},
   automationFinishJob({id,status,result,error}){return transaction(()=>{
    const job=parse(jobRow(id));if(!job||!['queued','running'].includes(job.status))return;
    job.status=status;job.finishedAt=Date.now();if(result!==undefined)job.result=result;if(error)job.error=error;saveJob(job);
    resultEvent(job);
   });},
   automationManage({id,action='get',policy:next,eventId,jobId}){return transaction(()=>{
    if(!items().some(i=>i.id===id))fail('NOT_FOUND');
    if(action==='policy'){
     if(!next||typeof next.paused!=='boolean'||typeof next.providerId!=='string'||typeof next.model!=='string'||!Number.isInteger(next.dailyLimit)||next.dailyLimit<1||next.dailyLimit>100)fail('INVALID_ARGUMENT');
     db.prepare('INSERT INTO automation_policy VALUES (?,?) ON CONFLICT(extension_id) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(next));
    }else if(action==='retry'||action==='discard'){
     const row=db.prepare("SELECT * FROM automation_events WHERE id=? AND extension_id=? AND status='dead'").get(eventId,id);if(!row)fail('NOT_FOUND');
     if(action==='retry'){if(parse(row).type==='queue.overflow'||row.created<Date.now()-RETENTION)fail('NOT_FOUND');db.prepare("UPDATE automation_events SET status='pending',attempts=0,due=? WHERE id=?").run(Date.now(),eventId);}else db.prepare('DELETE FROM automation_events WHERE id=?').run(eventId);
    }else if(action==='retryJob'){
     const original=parse(jobRow(jobId));if(!original||original.extensionId!==id||!['unknown','failed'].includes(original.status))fail('NOT_FOUND');
     if(db.prepare('SELECT data FROM automation_jobs WHERE extension_id=?').all(id).some(r=>parse(r).retryOf===jobId))fail('CONFLICT');
     const item=items().find(i=>i.id===id);check({id,generation:item.generation,capability:'background.jobs',projectId:original.projectId});check({id,generation:item.generation,capability:'conversations.read',projectId:original.projectId});
     if(policy(id).paused)fail('INTERACTION_REQUIRED');
     if(db.prepare('SELECT count(*) n FROM automation_jobs WHERE extension_id=?').get(id).n>=1000)fail('QUOTA_EXCEEDED');
     const retry={...original,id:randomUUID(),eventKey:'manual:'+randomUUID(),createdAt:Date.now(),status:'queued',retryOf:original.id};for(const key of ['sentAt','finishedAt','result','error'])delete retry[key];
     db.prepare('INSERT INTO automation_jobs VALUES (?,?,?,?,?,?,?)').run(retry.id,id,retry.eventKey,retry.projectId,retry.createdAt,retry.status,JSON.stringify(retry));
    }else if(action==='cleanupJobs'){
     db.prepare("DELETE FROM automation_jobs WHERE extension_id=? AND status IN ('succeeded','failed','cancelled') AND coalesce(json_extract(data,'$.finishedAt'),json_extract(data,'$.sentAt'),created)<?").run(id,Date.now()-RETENTION);
    }else if(action==='deleteJob'){
     // Preserve recent attempts and unknown outcomes: deleting them must not reset spend or defeat deduplication.
     db.prepare("DELETE FROM automation_jobs WHERE id=? AND extension_id=? AND status IN ('succeeded','failed','cancelled') AND coalesce(json_extract(data,'$.finishedAt'),json_extract(data,'$.sentAt'),created)<?").run(jobId,id,Date.now()-RETENTION);
    }else if(action!=='get')fail('INVALID_ARGUMENT');
    return {policy:policy(id),events:db.prepare("SELECT id,status,attempts,data FROM automation_events WHERE extension_id=? AND status!='acked' ORDER BY rowid DESC LIMIT 100").all(id).map(r=>({...r,data:JSON.parse(r.data)})),jobs:db.prepare('SELECT data FROM automation_jobs WHERE extension_id=? ORDER BY created DESC LIMIT 100').all(id).map(r=>publicJob(parse(r)))};
   });}
  }
 };
}
module.exports={schema,automationPersistence};
