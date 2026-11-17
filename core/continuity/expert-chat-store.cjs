const {randomUUID}=require('node:crypto');
const {hash}=require('./sources.cjs');
const {roleFingerprint}=require('./growth-store.cjs');
const schema=`CREATE TABLE IF NOT EXISTS expert_chats(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expert_chat_commands(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,conversation_id TEXT NOT NULL,turn_id TEXT NOT NULL);
DROP TRIGGER IF EXISTS expert_chat_delete;
CREATE TRIGGER expert_chat_delete AFTER UPDATE OF kind ON conversation_identities
WHEN NEW.kind IN ('deleted-draft','deleted-run') BEGIN
 DELETE FROM expert_chats WHERE id=NEW.id;
END;`;
const active=t=>['preparing','responding'].includes(t.status);
function createStore(db,transaction,resources,continuity){
 const taskContext=require('./task-context.cjs').createTaskContext(db,continuity);
 const get=id=>{const r=db.prepare('SELECT data FROM expert_chats WHERE id=?').get(id);return r?JSON.parse(r.data):{id,revision:0,excludedSourceKeys:[],turns:[]};};
 const put=s=>{db.prepare('INSERT INTO expert_chats VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id,JSON.stringify(s));return s;};
 const anchor=id=>{
  const a=db.prepare('SELECT * FROM conversation_identities WHERE id=?').get(id);
  if(!a||!['draft','run'].includes(a.kind))throw Error('CHAT_UNAVAILABLE');
  const r=db.prepare(`SELECT data FROM ${a.kind==='draft'?'drafts':'runs'} WHERE id=?`).get(a.record_id);
  if(!r)throw Error('CHAT_UNAVAILABLE');const value=JSON.parse(r.data);
  if(value.collaboration||value.originHandoff)throw Error('CHAT_UNAVAILABLE');
  return {id,kind:a.kind,recordId:a.record_id,projectId:value.projectId||null,value};
 };
 return input=>{
  // Commit source revocations even when the requested completion fails.
  if(input.action==='finish')continuity.dispatch({action:'status'});
  return transaction(()=>{
   if(input.action==='checkRun'){
    const a=db.prepare('SELECT id FROM conversation_identities WHERE kind=? AND record_id=?').get(input.draftId?'draft':'run',input.draftId||input.runId||'');
    if(a&&get(a.id).turns.some(active))throw Error('专家正在回复，请先停止或等待完成');return;
   }
   if(input.action==='recover'){
    for(const r of db.prepare('SELECT data FROM expert_chats').all()){const s=JSON.parse(r.data);for(const t of s.turns)if(active(t)){t.status='interrupted';t.error='应用退出中断了回复，请重新发送。';}put(s);}return;
   }
   if(input.action==='list')return db.prepare('SELECT id FROM expert_chats').all().map(r=>r.id);
   if(input.action==='begin'){
    if(typeof input.commandId!=='string'||input.commandId.length>120||!input.commandId)throw Error('INVALID_ARGUMENT');
    const fingerprint=hash(input.request),old=db.prepare('SELECT * FROM expert_chat_commands WHERE id=?').get(input.commandId);
    if(old){if(old.fingerprint!==fingerprint)throw Error('IDEMPOTENCY_CONFLICT');anchor(old.conversation_id);const saved=get(old.conversation_id),first=saved.turns.find(t=>t.id===old.turn_id);return {state:saved,turnId:old.turn_id,turnIds:saved.turns.filter(t=>first?.roundId?t.roundId===first.roundId:t.id===old.turn_id).map(t=>t.id),reused:true};}
    let id=input.request.conversationId;
    if(!id){const draftId=randomUUID();const workspace=resources.patch({changes:[{kind:'draft',action:'put',id:draftId,expectedRevision:null,value:{id:draftId,title:input.request.text.slice(0,80),prompt:'',modelId:'',projectId:input.request.projectId||null,status:'draft',createdAt:new Date().toISOString()}}]});id=workspace.tasks.find(t=>t.id===draftId).conversationId;}
    if(db.prepare("SELECT id FROM investigation_jobs WHERE origin_id=? AND status IN ('prepared','dispatched')").get(id))throw Error('INVESTIGATION_BUSY');
    const a=anchor(id),s=get(id);if(a.value.archivedAt)throw Error('CHAT_ARCHIVED');if(['preparing','running','waiting','stopping'].includes(a.value.status)||s.turns.some(active))throw Error('CHAT_BUSY');
    const definitions=input.turns||[input.turn];if(!definitions.length||definitions.length>4)throw Error('INVALID_ARGUMENT');
    if(s.turns.length+definitions.length>500)throw Error('CHAT_CAPACITY');
    if(input.request.replyToContributionId&&!s.turns.some(t=>t.id===input.request.replyToContributionId&&t.status==='completed'))throw Error('REPLY_UNAVAILABLE');
    const historyCut=s.turns.map(t=>t.id),roundId=randomUUID(),createdAt=new Date().toISOString();
    const rootQuestions=a.kind==='run'?require('../../electron/run-text-store.cjs').readItems(db,a.recordId,'messages').filter(m=>m.role==='user'&&!m.kind).slice(-6).map(m=>({id:m.id,text:(m.text||'').slice(0,3000)})):[];
    const taskSnapshot=taskContext.capture(a,s.excludedSourceKeys,input.request.text);
    const turns=definitions.map((definition,ordinal)=>({...definition,id:randomUUID(),roundId,ordinal,attempt:1,historyCut,rootQuestions,replyToContributionId:input.request.replyToContributionId||null,createdAt,status:'preparing',text:input.request.text,projectId:a.projectId,guard:s.revision}));for(const t of turns)t.taskContextProjectionId=taskContext.project(taskSnapshot,t.employee,t.id,s.excludedSourceKeys);s.turns.push(...turns);put(s);
    db.prepare('INSERT INTO expert_chat_commands VALUES(?,?,?,?)').run(input.commandId,fingerprint,id,turns[0].id);return {state:s,turnId:turns[0].id,turnIds:turns.map(t=>t.id)};
   }
   const a=anchor(input.conversationId),s=get(a.id);
   if(input.action==='read')return {...s,anchor:{id:a.id,kind:a.kind,recordId:a.recordId,projectId:a.projectId},rootMessages:a.kind==='run'?require('../../electron/run-text-store.cjs').readItems(db,a.recordId,'messages'):[]};
   if(a.value.archivedAt&&['exclude','prepare','retry'].includes(input.action))throw Error('CHAT_ARCHIVED');
   if(input.action==='taskContext'){const t=s.turns.find(t=>t.id===input.turnId);if(!t)throw Error('TURN_UNAVAILABLE');return [t.taskContextProjectionId,...(t.inheritedTaskProjectionIds||[])].filter(Boolean).map(id=>taskContext.validate(id,{conversationId:s.id,employeeId:t.employee.id,excludedSourceKeys:s.excludedSourceKeys,requireCurrent:input.requireCurrent===true}));}
   if(input.action==='revokeTaskContext'){taskContext.revoke(input,s);for(const t of s.turns)if(active(t))try{for(const id of [t.taskContextProjectionId,...(t.inheritedTaskProjectionIds||[])].filter(Boolean))taskContext.validate(id,{conversationId:s.id,employeeId:t.employee.id,excludedSourceKeys:s.excludedSourceKeys});}catch{t.status='cancelled';t.error='任务内委托已撤回';}put(s);return s;}
   if(input.action==='exclude'){
    if(!s.turns.some(t=>t.references?.some(r=>r.ref.sourceKey===input.sourceKey)))throw Error('SOURCE_UNAVAILABLE');
    if(!s.excludedSourceKeys.includes(input.sourceKey)){if(s.excludedSourceKeys.length>=100)throw Error('EXCLUSION_CAPACITY');s.excludedSourceKeys.push(input.sourceKey);s.revision++;}
    for(const t of s.turns)if(active(t)){if(!t.context||t.references?.some(r=>r.ref.sourceKey===input.sourceKey)){t.status='cancelled';t.error='背景已排除，请重试此专家。';}else t.guard=s.revision;}return put(s);
   }
   const t=s.turns.find(t=>t.id===input.turnId);if(!t)throw Error('TURN_UNAVAILABLE');
   if(input.action==='retry'){
    if(typeof input.commandId!=='string'||!input.commandId||input.commandId.length>120)throw Error('INVALID_ARGUMENT');
    const fingerprint=hash({conversationId:input.conversationId,turnId:input.turnId,attempt:input.expectedAttempt}),old=db.prepare('SELECT * FROM expert_chat_commands WHERE id=?').get(input.commandId);
    if(old){if(old.fingerprint!==fingerprint)throw Error('IDEMPOTENCY_CONFLICT');return {state:s,turnId:t.id,reused:true};}
    if(!['failed','cancelled','interrupted'].includes(t.status)||(t.attempt||1)!==input.expectedAttempt||(t.roundId||t.id)!==(s.turns.at(-1).roundId||s.turns.at(-1).id)||['preparing','running','waiting','stopping'].includes(a.value.status))throw Error('RETRY_UNAVAILABLE');
    t.historyCut ||= s.turns.slice(0,s.turns.indexOf(t)).map(value=>value.id);t.rootQuestions ||= [];
    t.attempts=[...(t.attempts||[]),{attempt:t.attempt||1,status:t.status,error:t.error,model:t.model,snapshotId:t.snapshotId,taskContextProjectionId:t.taskContextProjectionId}];if(t.attempts.length>10)throw Error('RETRY_LIMIT');
    Object.assign(t,{employee:input.employee,attempt:(t.attempt||1)+1,status:'preparing',guard:s.revision,error:null,answer:null,context:null,phase:null,snapshotId:null,references:[],knowledgeRefs:[],unresolvedQuestions:[],inheritedTaskProjectionIds:[]});t.taskContextProjectionId=taskContext.project(taskContext.capture(a,s.excludedSourceKeys,t.text),input.employee,t.id,s.excludedSourceKeys);put(s);
    db.prepare('INSERT INTO expert_chat_commands VALUES(?,?,?,?)').run(input.commandId,fingerprint,s.id,t.id);return {state:s,turnId:t.id};
   }
   if(input.attempt!==undefined&&input.attempt!==(t.attempt||1))throw Error('STALE_ATTEMPT');
   if(!active(t))return s;
   if(input.action==='cancel'){t.status='cancelled';return put(s);}
   if(input.action==='prepare'){
    if(t.guard!==s.revision||t.projectId!==a.projectId)throw Error('CONTEXT_CHANGED');
    Object.assign(t,input.patch,{status:'preparing'});return put(s);
   }
   if(input.action==='dispatch'){
    if(a.value.archivedAt||t.guard!==s.revision||t.projectId!==a.projectId)throw Error('CONTEXT_CHANGED');
    const employees=JSON.parse(db.prepare('SELECT data FROM settings WHERE key=?').get('workforce.roles.v1')?.data||'{}').employees||[],employee=employees.find(e=>e.id===t.employee.id);
    if(!employee||t.employee.roleFingerprint&&roleFingerprint(employee)!==t.employee.roleFingerprint)throw Error('EXPERT_UNAVAILABLE');
    for(const id of [t.taskContextProjectionId,...(t.inheritedTaskProjectionIds||[])].filter(Boolean))taskContext.validate(id,{conversationId:s.id,employeeId:t.employee.id,excludedSourceKeys:s.excludedSourceKeys,requireCurrent:true});
    if(t.snapshotId)continuity.dispatch({action:'validateChatSnapshot',id:t.snapshotId});
    t.status='responding';t.phase='generating';return put(s);
   }
   if(input.action==='finish'){
    if(a.value.archivedAt&&input.result.status==='completed')throw Error('CHAT_ARCHIVED');
    if(input.result.status==='completed'&&(t.guard!==s.revision||t.projectId!==a.projectId))throw Error('CONTEXT_CHANGED');
    const employees=JSON.parse(db.prepare('SELECT data FROM settings WHERE key=?').get('workforce.roles.v1')?.data||'{}').employees||[];
    const employee=employees.find(e=>e.id===t.employee.id);if(input.result.status==='completed'&&(!employee||t.employee.roleFingerprint&&roleFingerprint(employee)!==t.employee.roleFingerprint))throw Error('EXPERT_UNAVAILABLE');
    if(input.result.status==='completed')for(const id of [t.taskContextProjectionId,...(t.inheritedTaskProjectionIds||[])].filter(Boolean))taskContext.validate(id,{conversationId:s.id,employeeId:t.employee.id,excludedSourceKeys:s.excludedSourceKeys,requireCurrent:true});
    if(input.result.status==='completed'&&t.snapshotId)continuity.dispatch({action:'validateChatSnapshot',id:t.snapshotId});
    Object.assign(t,input.result);return put(s);
   }
   throw Error('INVALID_ARGUMENT');
  });
 };
}
module.exports={schema,createStore,active};
