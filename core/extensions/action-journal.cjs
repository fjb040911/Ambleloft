// Private host journal. Callers must validate identity, message revision and grants
// before preparing an invocation. Never expose these methods directly over IPC.
const {randomUUID}=require('node:crypto');
const {failure}=require('./errors.cjs');
const schema=`CREATE TABLE IF NOT EXISTS message_invocations(
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, message_id TEXT NOT NULL,
 state TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_action_reports(invocation_id TEXT NOT NULL,report_id TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(invocation_id,report_id));
DROP INDEX IF EXISTS message_submission_lock;
CREATE UNIQUE INDEX message_submission_lock
 ON message_invocations(scope,message_id) WHERE state IN ('prepared','dispatching','accepted','unknown','completed') AND COALESCE(json_extract(data,'$.snapshot.effect'),'write')='write';`;
function createActionJournal(db,transaction,{now=()=>Date.now()}={}){
 const read=id=>{const r=db.prepare('SELECT data FROM message_invocations WHERE id=?').get(id);if(!r)throw failure('NOT_FOUND');return JSON.parse(r.data);};
 const write=m=>db.prepare('UPDATE message_invocations SET state=?,data=? WHERE id=?').run(m.state,JSON.stringify(m),m.id);
 const change=(id,revision,from,to)=>{const m=read(id);if(m.revision!==revision||!from.includes(m.state))throw failure('CONFLICT');m.state=to;m.revision++;m.updatedAt=now();write(m);return m;};
 return {
  prepare({scope,messageId,snapshot}){return transaction(()=>{
   if(typeof scope!=='string'||!scope||typeof messageId!=='string'||!messageId||!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw failure('INVALID_ARGUMENT');
   if(snapshot.effect!=='read'&&db.prepare("SELECT id FROM message_invocations WHERE scope=? AND message_id=? AND state IN ('prepared','dispatching','accepted','unknown','completed') AND COALESCE(json_extract(data,'$.snapshot.effect'),'write')='write'").get(scope,messageId))throw failure('BUSY');
   const t=now(),m={id:randomUUID(),scope,messageId,snapshot:JSON.parse(JSON.stringify(snapshot)),state:'prepared',revision:1,createdAt:t,updatedAt:t};
   db.prepare('INSERT INTO message_invocations VALUES (?,?,?,?,?)').run(m.id,scope,messageId,m.state,JSON.stringify(m));return m;
  });},
  // Commit BEFORE sending anything to the extension. A crash after this point
  // cannot prove the remote business operation did not execute.
  dispatch(id,revision){return transaction(()=>change(id,revision,['prepared'],'dispatching'));},
  unknown(id,revision){return transaction(()=>change(id,revision,['dispatching'],'unknown'));},
  cancelBeforeDispatch(id,revision){return transaction(()=>change(id,revision,['prepared'],'notExecuted'));},
  get:read,
  list(scope){return db.prepare("SELECT data FROM message_invocations WHERE scope=? ORDER BY rowid").all(scope).map(r=>JSON.parse(r.data));},
  report(scope,input,applyUpdate=()=>null){return transaction(()=>{
   const {invocationId,reportId,expectedRevision,outcome,remoteTaskId,messageUpdate}=input||{};
   if(typeof reportId!=='string'||!reportId||reportId.length>256||!['accepted','completed','failed','unknown'].includes(outcome)||!Number.isSafeInteger(expectedRevision)||remoteTaskId!==undefined&&(typeof remoteTaskId!=='string'||remoteTaskId.length>1024))throw failure('INVALID_ARGUMENT');
   const m=read(invocationId);if(m.scope!==scope)throw failure('FORBIDDEN');
   // Canonical object ordering makes retries independent of JSON key order.
   const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
   const encoded=JSON.stringify(canonical(input));
   const prior=db.prepare('SELECT input,result FROM message_action_reports WHERE invocation_id=? AND report_id=?').get(invocationId,reportId);
   if(prior){if(prior.input!==encoded)throw failure('CONFLICT');return JSON.parse(prior.result);}
   if(m.revision!==expectedRevision||!['dispatching','accepted','unknown'].includes(m.state)||m.state===outcome)throw failure('CONFLICT');
   const message=messageUpdate===undefined?null:applyUpdate(m,messageUpdate);
   m.state=outcome;m.revision++;m.updatedAt=now();if(remoteTaskId!==undefined)m.remoteTaskId=remoteTaskId;write(m);
   const result={invocation:m,message};
   db.prepare('INSERT INTO message_action_reports VALUES (?,?,?,?)').run(invocationId,reportId,encoded,JSON.stringify(result));return result;
  });},
  recover(){return transaction(()=>{let count=0;for(const r of db.prepare("SELECT data FROM message_invocations WHERE state IN ('prepared','dispatching')").all()){const m=JSON.parse(r.data);change(m.id,m.revision,[m.state],m.state==='prepared'?'notExecuted':'unknown');count++;}return count;});}
 };
}
module.exports={schema,createActionJournal};
