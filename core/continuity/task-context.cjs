const {randomUUID}=require('node:crypto');
const {hash,key}=require('./sources.cjs');
const {roleFingerprint}=require('./growth-store.cjs');
const {captureFiles,currentFile}=require('./task-files.cjs');
const schema=`
CREATE TABLE IF NOT EXISTS task_context_heads(run_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,fingerprint TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_context_snapshots(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_context_projections(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,employee_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_delegations(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,employee_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS task_context_delete AFTER UPDATE OF kind ON conversation_identities
WHEN NEW.kind IN ('deleted-draft','deleted-run') BEGIN
 DELETE FROM task_context_snapshots WHERE conversation_id=NEW.id;
 DELETE FROM task_context_projections WHERE conversation_id=NEW.id;
 DELETE FROM task_delegations WHERE conversation_id=NEW.id;
END;`;
const delivered=m=>m.role==='user'&&!m.kind&&(!m.inputDeliveryState||m.inputDeliveryState==='delivered');
const toolObservation=t=>({status:['completed','failed','interrupted','cancelled'].includes(t.status)?t.status:'unknown',...(Number.isInteger(t.exitCode)?{exitCode:t.exitCode}:{} )});
function material(run){return {projectId:run.projectId||null,cwd:run.cwd,remote:run.remote,status:run.status,messages:(run.messages||[]).filter(m=>delivered(m)||m.role==='assistant'&&!m.kind&&(!m.phase||m.phase==='final_answer')).map(m=>({id:m.id,role:m.role,text:m.text,phase:m.phase})),tools:run.tools||[],questions:run.questions||[],fileChanges:run.fileChanges||[],workEvidence:run.workEvidence||[]};}
// Called by the sole run writer, never trusting a revision supplied by the renderer/runtime.
function recordRun(db,run){const fingerprint=hash(material(run)),old=db.prepare('SELECT * FROM task_context_heads WHERE run_id=?').get(run.id);if(old?.fingerprint===fingerprint)return;db.prepare('INSERT INTO task_context_heads VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision,fingerprint=excluded.fingerprint').run(run.id,(old?.revision||0)+1,fingerprint);
 // Source removal/replacement permanently invalidates captured projections, even if restored later.
 const messages=new Map((run.messages||[]).map(m=>[m.id,m])),tools=new Map((run.tools||[]).map(t=>[t.id,t]));
 for(const row of db.prepare("SELECT id,data FROM task_context_projections WHERE status='active'").all()){const p=JSON.parse(row.data);if(p.runId!==run.id)continue;if(p.projectId!==(run.projectId||null)||p.items.some(i=>i.fileEvidence?(i.fileTarget.cwd!==run.cwd||!!run.remote||hash((run.fileChanges||[]).find(b=>b.turnKey===i.fileEvidence.recorded.turnKey)?.files?.find(f=>f.path===i.fileEvidence.path)||null)!==i.changeFingerprint):i.toolId?(!tools.has(i.toolId)||hash(toolObservation(tools.get(i.toolId)))!==i.contentHash):i.messageId&&(!messages.has(i.messageId)||hash(messages.get(i.messageId).text||'')!==i.contentHash||i.kind==='user-instruction'&&!delivered(messages.get(i.messageId)))))db.prepare("UPDATE task_context_projections SET status='invalidated' WHERE id=?").run(row.id);}
}
function createTaskContext(db,continuity){
 const readRun=id=>{const row=db.prepare('SELECT data FROM runs WHERE id=?').get(id);if(!row)throw Error('TASK_CONTEXT_UNAVAILABLE');const run=JSON.parse(row.data);for(const c of ['messages','tools','questions','fileChanges'])run[c]=db.prepare('SELECT data FROM run_items WHERE run_id=? AND collection=? ORDER BY position').all(id,c).map(r=>JSON.parse(r.data));return run;};
 const staff=()=>JSON.parse(db.prepare("SELECT data FROM settings WHERE key='workforce.roles.v1'").get()?.data||'{}').employees||[];
 function capture(anchor,excluded=[],question=''){if(anchor.kind!=='run')return null;const run=readRun(anchor.recordId);if(run.remote)throw Error('TASK_CONTEXT_REMOTE_UNSUPPORTED');if(!db.prepare('SELECT run_id FROM task_context_heads WHERE run_id=?').get(run.id))recordRun(db,run);const items=[],omissions=[];
  for(const m of run.messages){if(delivered(m)&&typeof m.text==='string'&&m.text.trim()){items.push({id:hash([run.id,m.id,hash(m.text)]),sourceKey:key('task-context',run.id,m.id),messageId:m.id,kind:'user-instruction',authority:'user-instruction',contentHash:hash(m.text),body:m.text.slice(0,3000),truncated:m.text.length>3000,originalSize:m.text.length,title:'任务用户指令'});}else if(m.role==='assistant'&&!m.kind&&(!m.phase||m.phase==='final_answer')&&!omissions.some(o=>o.kind==='assistant-report'))omissions.push({kind:'assistant-report',reason:'历史回答未提供完整输入依赖证明，未自动转交'});}
  // Never copy raw tool output, pending model questions, attachments or file contents without provenance.
  const observations=run.tools.filter(t=>t.id&&['commandExecution','mcpToolCall'].includes(t.type)).slice(-4).map(t=>{const observed=toolObservation(t),contentHash=hash(observed);return {id:hash([run.id,t.id,contentHash]),sourceKey:key('task-tool-status',run.id,t.id),toolId:t.id,kind:'tool-observation',authority:'recorded-observation',contentHash,body:JSON.stringify(observed),truncated:false,title:'工具执行状态（不含命令和输出）'};});
  if(run.tools.length)omissions.push({kind:'tool-observation',reason:'工具输出缺少完整来源依赖；仅提供最近四项可识别工具的状态和退出码，不代表测试通过'});
  if(run.questions.length)omissions.push({kind:'pending-question',reason:'历史模型问题缺少完整来源依赖，未自动转交'});
  if(items.length>6)omissions.push({kind:'user-instruction',reason:'用户指令较多，仅提供首条目标和最近五条已交付指令'});
  const status=['completed','failed','interrupted','stopped'].includes(run.status)?run.status:'idle';
  const projectRow=run.projectId?db.prepare('SELECT data FROM projects WHERE id=?').get(run.projectId):null;
  const files=captureFiles(run,projectRow?JSON.parse(projectRow.data):null,excluded,question);omissions.push(...files.omissions);
  const snapshot={id:randomUUID(),schemaVersion:1,conversationId:anchor.id,runId:run.id,projectId:run.projectId||null,contextRevision:db.prepare('SELECT revision FROM task_context_heads WHERE run_id=?').get(run.id)?.revision||0,createdAt:new Date().toISOString(),cutoffTurnKey:run.terminalTurnId||null,items:[...(items.length>6?[items[0],...items.slice(-5)]:items),...observations,...files.items],omissions,status};snapshot.manifestHash=hash(snapshot);db.prepare('INSERT INTO task_context_snapshots VALUES(?,?,?)').run(snapshot.id,anchor.id,JSON.stringify(snapshot));return snapshot;
 }
 function project(snapshot,employee,turnId,excluded=[]){if(!snapshot)return null;const delegationId=randomUUID(),id=randomUUID(),items=snapshot.items.filter(i=>!excluded.includes(i.sourceKey));
  const delegation={id:delegationId,originConversationId:snapshot.conversationId,targetEmployeeId:employee.id,purpose:'discuss',recipientScope:{conversationId:snapshot.conversationId,turnId},allowedItemRefs:items.map(i=>({id:i.id,contentHash:i.contentHash})),revision:1,issuedFromUserActionId:turnId};
  db.prepare('INSERT INTO task_delegations VALUES(?,?,?,?,?)').run(delegationId,snapshot.conversationId,employee.id,'active',JSON.stringify(delegation));
  const p={id,destination:{kind:'task',conversationId:snapshot.conversationId,runId:snapshot.runId,projectId:snapshot.projectId},snapshotId:snapshot.id,conversationId:snapshot.conversationId,runId:snapshot.runId,projectId:snapshot.projectId,employeeId:employee.id,roleFingerprint:employee.roleFingerprint||roleFingerprint(employee),delegationId,turnId,items,omissions:snapshot.omissions,contextRevision:snapshot.contextRevision,createdAt:snapshot.createdAt,status:snapshot.status};p.projectionHash=hash(p);db.prepare('INSERT INTO task_context_projections VALUES(?,?,?,?,?)').run(id,p.conversationId,employee.id,'active',JSON.stringify(p));return id;
 }
 function validate(id,{conversationId,employeeId,excludedSourceKeys=[],requireCurrent=false}){const row=db.prepare('SELECT * FROM task_context_projections WHERE id=?').get(id);if(!row||row.status!=='active'||row.conversation_id!==conversationId||row.employee_id!==employeeId)throw Error('TASK_CONTEXT_INVALIDATED');const p=JSON.parse(row.data),delegation=db.prepare('SELECT status FROM task_delegations WHERE id=?').get(p.delegationId),employee=staff().find(e=>e.id===employeeId),a=db.prepare('SELECT * FROM conversation_identities WHERE id=?').get(conversationId);if(delegation?.status!=='active'||!employee||roleFingerprint(employee)!==p.roleFingerprint||a?.kind!=='run'||a.record_id!==p.runId||(a.project_id||null)!==p.projectId||p.items.some(i=>excludedSourceKeys.includes(i.sourceKey)))throw Error('TASK_CONTEXT_INVALIDATED');
  const run=readRun(p.runId),projectRow=p.projectId?db.prepare('SELECT data FROM projects WHERE id=?').get(p.projectId):null,project=projectRow?JSON.parse(projectRow.data):null;
  for(const item of p.items)if(item.fileEvidence){const freshness=currentFile(item,project,run);if(freshness==='unavailable')throw Error('TASK_CONTEXT_INVALIDATED');if(requireCurrent&&freshness!=='unchanged')throw Error('TASK_FILES_CHANGED');item.fileEvidence={...item.fileEvidence,currentState:freshness};}
  return p;}
 function revoke({conversationId,turnId},state){const t=state.turns.find(t=>t.id===turnId);if(!t?.taskContextProjectionId)throw Error('TASK_CONTEXT_UNAVAILABLE');const p=db.prepare('SELECT data FROM task_context_projections WHERE id=? AND conversation_id=?').get(t.taskContextProjectionId,conversationId);if(!p)throw Error('TASK_CONTEXT_UNAVAILABLE');db.prepare("UPDATE task_delegations SET status='revoked' WHERE id=?").run(JSON.parse(p.data).delegationId);continuity.invalidate('task-delegation');}
 return {capture,project,validate,revoke};
}
module.exports={schema,recordRun,createTaskContext};
