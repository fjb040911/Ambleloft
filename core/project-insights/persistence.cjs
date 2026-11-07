const {createHash,randomUUID}=require('node:crypto');
const {record}=require('./usage.cjs');
const DAY=86400000,RAW_RETENTION=7*DAY,METADATA_RETENTION=90*DAY,CACHE_RETENTION=30*DAY;
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const schema=`
CREATE TABLE IF NOT EXISTS project_activity(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE,project_id TEXT,occurred INTEGER,data TEXT);
CREATE INDEX IF NOT EXISTS project_activity_range ON project_activity(project_id,occurred,seq);
CREATE TABLE IF NOT EXISTS project_usage(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE,project_id TEXT,occurred INTEGER,data TEXT);
CREATE INDEX IF NOT EXISTS project_usage_range ON project_usage(project_id,occurred,seq);
CREATE TABLE IF NOT EXISTS project_usage_gaps(project_id TEXT PRIMARY KEY,occurred INTEGER);
CREATE TABLE IF NOT EXISTS project_summaries(id TEXT PRIMARY KEY,extension_id TEXT,project_id TEXT,request_key TEXT,cache_key TEXT,created INTEGER,data TEXT,UNIQUE(extension_id,request_key));
`;
function captureActivity(db,snapshot,now=Date.now()){
 const {conversationId,turnId,version,projectId,status}=snapshot;
 const ref={conversationId,turnId,version},id=hash([projectId,ref]);
 const data={id,projectId,type:'conversation.turn.terminal',status,occurredAt:new Date(now).toISOString(),sourceRef:ref};
 db.prepare('INSERT OR IGNORE INTO project_activity(id,project_id,occurred,data) VALUES (?,?,?,?)').run(id,projectId,now,JSON.stringify(data));
}
function persistence(db,transaction,check,automation){
 const parse=row=>row?JSON.parse(row.data):null;
 let lastCleanup=0;
 let cursorKey=parse(db.prepare("SELECT data FROM settings WHERE key='insights.cursor-key'").get());if(!cursorKey){cursorKey=randomUUID();db.prepare('INSERT INTO settings VALUES (?,?)').run('insights.cursor-key',JSON.stringify(cursorKey));}
 const cursorTag=c=>hash([cursorKey,c.binding,c.watermark,c.after]);
 const auth=(context,projectId,capability)=>check({...context,projectId,capability});
 const source=(projectId,ref,now=Date.now())=>{
  const current=db.prepare("SELECT project_id FROM conversation_identities WHERE id=? AND kind='run'").get(ref.conversationId);
  if(current?.project_id!==projectId)return 'unavailable';
  const row=db.prepare('SELECT created FROM automation_turns WHERE conversation_id=? AND turn_id=? AND version=? AND project_id=?').get(ref.conversationId,ref.turnId,ref.version,projectId);
  return row&&row.created>=now-RAW_RETENTION?'available':'expired';
 };
 const cleanup=()=>{const now=Date.now();lastCleanup=now;db.prepare('DELETE FROM project_activity WHERE occurred<?').run(now-METADATA_RETENTION);db.prepare('DELETE FROM project_usage WHERE occurred<?').run(now-METADATA_RETENTION);db.prepare('DELETE FROM project_summaries WHERE created<?').run(now-CACHE_RETENTION);};
 const coverage=(projectId,from)=>({measurement:'client-observed',since:parse(db.prepare("SELECT data FROM settings WHERE key='insights.since'").get()),reasons:[...(from<Date.now()-RAW_RETENTION?['SOURCE_RETENTION_7_DAYS']:[]),...(db.prepare('SELECT 1 FROM project_usage_gaps WHERE project_id IN (?,?)').get(projectId,'*')?['LEDGER_WRITE_FAILED']:[])],excludedOrigins:['external-tools','server-billing','unassigned-workspace-inference'],metadataRetentionDays:90,sourceRetentionDays:7});
 if(!db.prepare("SELECT 1 FROM settings WHERE key='insights.since'").get())db.prepare('INSERT INTO settings VALUES (?,?)').run('insights.since',JSON.stringify(new Date().toISOString()));
 // Preserve existing frozen sources without fabricating historical usage.
 for(const row of db.prepare('SELECT data,created FROM automation_turns').all())captureActivity(db,parse(row),row.created);
 db.prepare("UPDATE project_usage SET data=json_set(data,'$.status','unknown') WHERE json_extract(data,'$.status')='running'").run();
 const summaryRead=(context,id)=>{
  const row=db.prepare('SELECT * FROM project_summaries WHERE id=? AND extension_id=?').get(id,context.id);if(!row)fail('NOT_FOUND');
  auth(context,row.project_id,'project.summaries.generate');auth(context,row.project_id,'conversations.read');
  const job=parse(row);if(job.generation!==context.generation)fail('FORBIDDEN');
  if(row.created<Date.now()-CACHE_RETENTION)fail('SOURCE_EXPIRED');
  if(job.refs.some(ref=>source(row.project_id,ref)!=='available'))fail('SOURCE_EXPIRED');
  return job;
 };
 return {
  insightsProjects({context}){return db.prepare('SELECT id,data FROM projects ORDER BY rowid').all().flatMap(row=>{try{auth(context,row.id,'project.activity.read');const p=parse(row);return [{id:row.id,name:p.name,description:p.description||''}];}catch{return [];}});},
  insightsRecordUsage(input){
   if(Date.now()-lastCleanup>3600000)cleanup();
   if(!input||typeof input.id!=='string'||input.id.length>200||!Number.isFinite(Date.parse(input.startedAt)))fail('INVALID_ARGUMENT');
   const prior=parse(db.prepare('SELECT data FROM project_usage WHERE id=?').get(input.id));
   const clean=record(input);
   // record() accepts provider units; internal callers may already normalize.
   if(input.counts)clean.counts=Object.fromEntries(['input','output','total','cachedInput','reasoningOutput'].map(k=>[k,Number.isSafeInteger(input.counts[k])&&input.counts[k]>=0?input.counts[k]:null]));
   clean.quality=clean.counts.input!==null&&clean.counts.output!==null?'reported':'unknown';
   if(prior){if(prior.projectId!==clean.projectId||prior.hostRequestId!==clean.hostRequestId)fail('CONFLICT');if(prior.status!=='running'&&clean.status==='running')return prior;}
   if(prior&&JSON.stringify({...prior,revision:undefined})===JSON.stringify({...clean,revision:undefined}))return prior;
   clean.revision=(prior?.revision||0)+1;
   db.prepare('INSERT INTO project_usage(id,project_id,occurred,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(clean.id,clean.projectId,Date.parse(clean.startedAt),JSON.stringify(clean));return clean;
  },
  insightsUsageGap({projectId}){db.prepare('INSERT INTO project_usage_gaps VALUES (?,?) ON CONFLICT(project_id) DO UPDATE SET occurred=excluded.occurred').run(projectId||'*',Date.now());},
  insightsList({context,kind,input}){
   if(!['activity','usage'].includes(kind)||!input||typeof input.projectId!=='string')fail('INVALID_ARGUMENT');
   auth(context,input.projectId,kind==='activity'?'project.activity.read':'project.usage.read');
   if(input.cursor&&(typeof input.cursor!=='string'||input.cursor.length>2000)||input.purpose&&!['development','summary','other'].includes(input.purpose)||input.model&&(typeof input.model!=='string'||input.model.length>200))fail('INVALID_ARGUMENT');
   const from=Date.parse(input.from),to=Date.parse(input.to),limit=input.limit??50;
   if(!Number.isFinite(from)||!Number.isFinite(to)||!String(input.from).endsWith('Z')||!String(input.to).endsWith('Z')||from>=to||to-from>90*DAY||!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_ARGUMENT');
   try{new Intl.DateTimeFormat('en',{timeZone:input.timezone}).format();}catch{fail('INVALID_ARGUMENT');}
   if(typeof input.timezone!=='string')fail('INVALID_ARGUMENT');cleanup();
   const table=kind==='activity'?'project_activity':'project_usage',binding=hash([context.id,context.generation,kind,input.projectId,from,to,input.timezone,input.purpose||null,input.model||null]);
   let cursor;try{cursor=input.cursor?JSON.parse(Buffer.from(input.cursor,'base64url').toString()):null;}catch{fail('INVALID_ARGUMENT');}
   const watermark=cursor?.watermark??db.prepare(`SELECT coalesce(max(seq),0) n FROM ${table}`).get().n;
   if(cursor&&(cursor.tag!==cursorTag(cursor)||cursor.binding!==binding||!Number.isSafeInteger(cursor.after)||!Number.isSafeInteger(watermark)))fail('INVALID_ARGUMENT');
   const rows=db.prepare(`SELECT seq,data FROM ${table} WHERE project_id=? AND occurred>=? AND occurred<? AND seq>? AND seq<=? ${kind==='usage'?"AND (? IS NULL OR json_extract(data,'$.purpose')=?) AND (? IS NULL OR json_extract(data,'$.model')=?)":''} ORDER BY seq LIMIT ?`).all(input.projectId,from,to,cursor?.after||0,watermark,...(kind==='usage'?[input.purpose||null,input.purpose||null,input.model||null,input.model||null]:[]),limit+1);
   const page=rows.slice(0,limit),items=page.map(r=>{const value=parse(r);return kind==='activity'?{...value,sourceAvailability:source(input.projectId,value.sourceRef)}:value;});
   return {items,nextCursor:rows.length>limit?Buffer.from(JSON.stringify({binding,watermark,after:page.at(-1).seq,tag:cursorTag({binding,watermark,after:page.at(-1).seq})})).toString('base64url'):null,watermark:String(watermark),coverage:coverage(input.projectId,from)};
  },
  insightsSummaryPolicy({context,projectId}){auth(context,projectId,'project.summaries.generate');auth(context,projectId,'conversations.read');auth(context,projectId,'background.jobs');const {policy}=automation.automationManage({id:context.id});return {...policy};},
  insightsSummaryCreate({context,input}){return transaction(()=>{
   auth(context,input.projectId,'project.summaries.generate');auth(context,input.projectId,'conversations.read');cleanup();
   const old=parse(db.prepare('SELECT data FROM project_summaries WHERE extension_id=? AND request_key=?').get(context.id,input.requestKey));
   if(old){if(old.cacheKey!==input.cacheKey)fail('CONFLICT');return summaryRead(context,old.id);}
   const cached=parse(db.prepare('SELECT data FROM project_summaries WHERE extension_id=? AND cache_key=? AND created>=? ORDER BY created DESC LIMIT 1').get(context.id,input.cacheKey,Date.now()-CACHE_RETENTION));
   if(cached){const jobs=cached.children.map(id=>parse(db.prepare('SELECT data FROM automation_jobs WHERE id=?').get(id)));const retryable=cached.status==='cancelled'||jobs.length===cached.batches.length&&jobs.every(j=>j&&['failed','cancelled'].includes(j.status));if(!retryable)return summaryRead(context,cached.id);}
   if(db.prepare('SELECT count(*) n FROM project_summaries WHERE extension_id=?').get(context.id).n>=500)fail('QUOTA_EXCEEDED');
   if(input.refs.some(ref=>source(input.projectId,ref)!=='available'))fail('SOURCE_EXPIRED');
   const job={...input,id:randomUUID(),extensionId:context.id,generation:context.generation,createdAt:Date.now(),children:[],status:'preparing'};
   db.prepare('INSERT INTO project_summaries VALUES (?,?,?,?,?,?,?)').run(job.id,context.id,job.projectId,job.requestKey,job.cacheKey,job.createdAt,JSON.stringify(job));return job;
  });},
  insightsSummaryUsage({context,id}){const root=summaryRead(context,id);return root.children.flatMap(jobId=>db.prepare("SELECT data FROM project_usage WHERE project_id=? AND json_extract(data,'$.jobId')=? ORDER BY seq").all(root.projectId,jobId).map(parse));},
  insightsSummaryGet({context,id}){return summaryRead(context,id);},
  insightsSummaryUpdate({context,id,children,status,error}){return transaction(()=>{const job=summaryRead(context,id);if(['cancelled','unknown'].includes(job.status))return job;if(children)job.children=children;if(status)job.status=status;if(error)job.error=error;db.prepare('UPDATE project_summaries SET data=? WHERE id=?').run(JSON.stringify(job),id);return job;});},
  insightsCleanup(){cleanup();}
 };
}
module.exports={schema,persistence,captureActivity,hash};
