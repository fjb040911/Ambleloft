const {parentPort,workerData}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');const path=require('node:path');
const {createWorkspaceResources}=require('../core/workspace-state.cjs');
const {schema:extensionSchema,extensionPersistence}=require('../core/extensions/persistence.cjs');
const {schema:messageSchema,createMessageStore}=require('../core/extensions/messages.cjs');
const {schema:chatInputSchema,handlers:chatInputHandlers}=require('../core/forms/chat-inputs.cjs');
const {schema:inputRequestSchema,handlers:inputRequestHandlers}=require('../core/inputs/store.cjs');
const {schema:automationSchema,automationPersistence}=require('../core/automation/persistence.cjs');
const insightsModule=require('../core/project-insights/persistence.cjs');
const expertChatModule=require('../core/continuity/expert-chat-store.cjs');
const investigationModule=require('../core/continuity/investigation-store.cjs');
const taskContextModule=require('../core/continuity/task-context.cjs');
const continuityModule=require('../core/continuity/persistence.cjs');
const {schema:actionSchema,createActionJournal}=require('../core/extensions/action-journal.cjs');
const {schema:localizationSchema,createLocalizationStore}=require('../core/localization/store.cjs');
let db;let resources;
try{
 fs.mkdirSync(path.dirname(workerData.file),{recursive:true});
 db=new DatabaseSync(workerData.file,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>15)throw new Error('数据库版本高于当前应用，请升级应用');
 db.exec(`BEGIN;
 CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS form_instances(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS form_instances_run ON form_instances(run_id);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, project_id TEXT, updated_at TEXT NOT NULL, archived_at TEXT, data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS runs_project_recent ON runs(project_id,updated_at DESC,id);
 CREATE TABLE IF NOT EXISTS run_items(run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, collection TEXT NOT NULL, item_key TEXT NOT NULL, position INTEGER NOT NULL, turn_key TEXT, data TEXT NOT NULL, PRIMARY KEY(run_id,collection,item_key));
 CREATE INDEX IF NOT EXISTS run_items_order ON run_items(run_id,collection,position);
 CREATE INDEX IF NOT EXISTS run_items_turn ON run_items(run_id,turn_key);
 CREATE TABLE IF NOT EXISTS workspace_revisions(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS conversation_identities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,record_id TEXT NOT NULL,project_id TEXT,UNIQUE(kind,record_id));
 ${extensionSchema}
 ${messageSchema}
 ${localizationSchema}
 ${actionSchema}
 ${automationSchema}
 ${insightsModule.schema}
 ${chatInputSchema}
 ${inputRequestSchema}
 ${continuityModule.schema}
 ${expertChatModule.schema}
 ${taskContextModule.schema}
 ${investigationModule.schema}
 PRAGMA user_version=15;
 COMMIT;`);
 resources=createWorkspaceResources(db);
 db.exec('BEGIN IMMEDIATE');
 try {for(const [kind,table] of [['draft','drafts'],['run','runs']])for(const row of db.prepare(`SELECT id,data FROM ${table}`).all()){const item=JSON.parse(row.data);resources.identify(kind,row.id,item.projectId);}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}catch(e){parentPort.postMessage({fatal:e.message});try{db?.close();}catch{};db=null;parentPort.close();process.exitCode=1;}
const collections=['messages','tools','plans','fileChanges','artifacts','taskApps','approvals','questions'];
function transaction(fn){if(db.isTransaction)return fn();db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
function syncTable(table,values){
 const existing=new Map(db.prepare(`SELECT id,data FROM ${table}`).all().map(r=>[r.id,r.data]));
 const put=db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
 for(const v of values){const data=JSON.stringify(v);if(existing.get(v.id)!==data)put.run(v.id,data);existing.delete(v.id);}
 const del=db.prepare(`DELETE FROM ${table} WHERE id=?`);for(const id of existing.keys())del.run(id);
}
function saveRunRows(runs,{replace=true}={}){
 let continuityDirty=false;
 const existing=new Map((replace?db.prepare('SELECT id,data FROM runs').all():runs.flatMap(run=>{const row=db.prepare('SELECT id,data FROM runs WHERE id=?').get(run.id);return row?[row]:[];})).map(r=>[r.id,r.data]));
 const put=db.prepare('INSERT INTO runs(id,project_id,updated_at,archived_at,data) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,archived_at=excluded.archived_at,data=excluded.data');
 for(const run of runs){
  if(existing.get(run.id)&&JSON.parse(existing.get(run.id)).originHandoff){existing.delete(run.id);continue;}
  if(run.originHandoff)throw Error('HOST_MANAGED_RUN');
  taskContextModule.recordRun(db,run);
  const previous=existing.get(run.id)?JSON.parse(existing.get(run.id)):null;
  const sourceMeta=r=>JSON.stringify(r&&[r.status,r.terminalTurnId,r.employee?.id,r.collaboration,r.projectId,r.title,r.workEvidence]);
  if(sourceMeta(previous)!==sourceMeta(run))continuityDirty=true;
  const conversationId=resources.identify('run',run.id,run.projectId);
  const meta={...run,conversationId};for(const key of collections)delete meta[key];const data=JSON.stringify(meta);
  if(existing.get(run.id)!==data)put.run(run.id,run.projectId||null,run.updatedAt||run.createdAt||'',run.archivedAt||null,data);existing.delete(run.id);
  const old=new Map(db.prepare('SELECT collection,item_key,position,data FROM run_items WHERE run_id=?').all(run.id).map(r=>[r.collection+'\0'+r.item_key,r]));
  const itemPut=db.prepare('INSERT INTO run_items(run_id,collection,item_key,position,turn_key,data) VALUES (?,?,?,?,?,?) ON CONFLICT(run_id,collection,item_key) DO UPDATE SET position=excluded.position,turn_key=excluded.turn_key,data=excluded.data');
  let turnKey=null;
  for(const collection of collections){for(const [index,item] of (run[collection]||[]).entries()){
   if(collection==='messages'&&item.role==='user'&&!item.turnKey)turnKey=item.id;
   const key=String(item.id||item.turnKey||index),lookup=collection+'\0'+key,json=JSON.stringify(item),prior=old.get(lookup);
   if(['messages','tools','fileChanges'].includes(collection)&&prior?.data!==json&&!['preparing','running','waiting','stopping'].includes(run.status))continuityDirty=true;
   if(prior?.data!==json||prior?.position!==index)itemPut.run(run.id,collection,key,index,item.turnKey||(collection==='messages'?turnKey:null),json);
   old.delete(lookup);
  }}
  if(run.terminalTurnId&&run.terminalTurnId!==previous?.terminalTurnId)automation.capture({...run,conversationId},run.terminalTurnId);
  if(old.size)continuityDirty=true;
  const del=db.prepare('DELETE FROM run_items WHERE run_id=? AND collection=? AND item_key=?');for(const item of old.values())del.run(run.id,item.collection,item.item_key);
 }
 if(!replace)existing.clear();
 const del=db.prepare('DELETE FROM runs WHERE id=?');for(const id of existing.keys()){if(JSON.parse(existing.get(id)).originHandoff)continue;del.run(id);db.prepare('DELETE FROM task_context_heads WHERE run_id=?').run(id);db.prepare("DELETE FROM form_instances WHERE run_id=?").run(id);db.prepare("DELETE FROM chat_inputs WHERE run_id=?").run(id);db.prepare('DELETE FROM chat_input_policies WHERE run_id=?').run(id);db.prepare('DELETE FROM input_requests WHERE run_id=?').run(id);db.prepare('DELETE FROM input_mutations WHERE run_id=?').run(id);db.prepare("UPDATE conversation_identities SET kind='deleted-run' WHERE kind='run' AND record_id=?").run(id);}
 if(continuityDirty||existing.size)continuity.syncSources();
}
function saveRuns(runs){return transaction(()=>saveRunRows(runs));}
const messages=db?createMessageStore(db,transaction):null;
const chatInputs=chatInputHandlers(db,transaction);
const actions=db?createActionJournal(db,transaction):null;
if(actions)actions.recover();
const extensionHandlers=extensionPersistence(db,transaction);
const automation=automationPersistence(db,transaction,extensionHandlers.extensionCheck);
const continuity=db?continuityModule.createPersistence(db,transaction,path.dirname(workerData.file)):null;
if(continuity)transaction(()=>continuity.syncSources());
function patchResources(input){const value=resources.patch(input);if(input.changes?.some(c=>c.kind==='project')){continuity.invalidate('workspace');for(const row of db.prepare("SELECT id,data FROM task_context_projections WHERE status='active'").all()){const p=JSON.parse(row.data),a=db.prepare('SELECT project_id FROM conversation_identities WHERE id=?').get(p.conversationId);const project=p.projectId?db.prepare('SELECT data FROM projects WHERE id=?').get(p.projectId):null;if(!a||(a.project_id||null)!==p.projectId||p.items.some(i=>i.fileTarget&&(!project||JSON.parse(project.data).type==='ssh'||JSON.parse(project.data).path!==i.fileTarget.configuredPath)))db.prepare("UPDATE task_context_projections SET status='invalidated' WHERE id=?").run(row.id);}continuity.syncSources();}return value;}
const expertChat=expertChatModule.createStore(db,transaction,resources,continuity);
const investigation=investigationModule.createStore(db,transaction,expertChat,continuity,resources);
const handlers={
 investigation,
 expertChat,
 continuity:input=>continuity.dispatch(input),
 localizationSnapshot:createLocalizationStore(db),
 ...automation.handlers,
 ...insightsModule.persistence(db,transaction,extensionHandlers.extensionCheck,automation.handlers),
 ...chatInputs,
 ...inputRequestHandlers(db,transaction,chatInputs.chatInput),
 commitTurn({runs,runId,turnId,partial=false}){return transaction(()=>{saveRunRows(runs,{replace:!partial});const run=runs.find(r=>r.id===runId);if(run)automation.capture({...run,conversationId:resources.identify('run',run.id,run.projectId)},turnId);});},
 uiSubmit({flow,revision,item}){return transaction(()=>{const old=db.prepare('SELECT revision FROM form_instances WHERE id=?').get(flow.id);if(!old||old.revision!==revision)throw Error('CONFLICT');if(item.flowId!==flow.id||item.runId!==flow.runId||!flow.submissions.some(s=>s.id===item.id))throw Error('CONFLICT');const saved={...flow,revision:revision+1};db.prepare('UPDATE form_instances SET revision=?,data=? WHERE id=?').run(saved.revision,JSON.stringify(saved),saved.id);if(handlers.chatInput({action:'get',id:item.id}))throw Error('CONFLICT: input already exists');handlers.chatInput({action:'enqueue',item});return saved;});},
 formData({action,runId,flow,revision}){if(action==='list')return db.prepare('SELECT data FROM form_instances WHERE run_id=? ORDER BY rowid').all(runId).map(r=>JSON.parse(r.data));if(action!=='put')throw Error('Invalid form action');return transaction(()=>{const old=db.prepare('SELECT revision FROM form_instances WHERE id=?').get(flow.id);if(old?old.revision!==revision:revision!==null)throw Error('CONFLICT');const saved={...flow,revision:(revision??-1)+1};db.prepare('INSERT INTO form_instances(id,run_id,revision,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(saved.id,saved.runId,saved.revision,JSON.stringify(saved));return saved;});},
 ...require('../core/auth/connections.cjs').connectionHandlers(db,transaction),
 ...require('../core/extensions/message-handlers.cjs').createMessageHandlers(db,messages,actions,transaction),
 // Internal host worker channel only; never expose caller-supplied scope to renderer IPC.
 messageStore({method,scope,args=[]}){if(!Object.hasOwn(messages,method)||!Array.isArray(args))throw Error('INVALID_ARGUMENT');return messages[method](scope,...args);},
 ...extensionHandlers,
 extensionMutation(input){return transaction(()=>{const result=extensionHandlers.extensionMutation(input);automation.handlers.automationReconcile();if(input.action==='remove'&&input.deleteData){db.prepare('DELETE FROM automation_jobs WHERE extension_id=?').run(input.id);db.prepare('DELETE FROM automation_policy WHERE extension_id=?').run(input.id);}return result;});},
 listSkills(){return db.prepare("SELECT data FROM skills ORDER BY rowid DESC").all().map(row=>JSON.parse(row.data));},
 putSkill(record){db.prepare("INSERT INTO skills(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(record.id,JSON.stringify(record));},
 deleteSkill({id}){db.prepare("DELETE FROM skills WHERE id=?").run(id);},
 ready(){return {version:4};},
 readSetting({key}){const row=db.prepare('SELECT data FROM settings WHERE key=?').get(key);return row?JSON.parse(row.data):null;},
 writeSetting({key,value}){return transaction(()=>{const row=db.prepare('SELECT data FROM settings WHERE key=?').get(key);const before=row?JSON.parse(row.data):null;db.prepare('INSERT INTO settings(key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(value));continuity.onSetting(key,before,value);});},
 readWorkspace(){return resources.read();},
 patchWorkspace(input){return transaction(()=>patchResources(input));},
 writeWorkspace(value){return transaction(()=>{
  if(!Number.isSafeInteger(value.revision)||value.revision!==resources.revision('workspace','all'))throw new Error('CONFLICT: Workspace changed; refresh and retry');
  const current=resources.read(),changes=[];
  for(const [kind,key] of [['project','projects'],['draft','tasks']]) {
   for(const item of value[key]) {const previous=current[key].find(p=>p.id===item.id);changes.push({kind,action:'put',id:item.id,value:item,expectedRevision:previous?.revision??null});}
   for(const item of current[key])if(!value[key].some(p=>p.id===item.id))changes.push({kind,action:'delete',id:item.id,expectedRevision:item.revision});
  }
  const settings={};for(const key of ['theme','language','fontScale','layoutMode'])if(value[key]!==undefined)settings[key]=value[key];
  changes.push({kind:'settings',action:'patch',expectedRevision:current.settingsRevision,value:settings});
  return patchResources({changes});
 });},
 resolveConversation({id}){const row=db.prepare('SELECT * FROM conversation_identities WHERE id=?').get(id);if(!row||row.kind.startsWith('deleted-'))throw new Error('NOT_FOUND: Conversation does not exist');return {id:row.id,kind:row.kind,recordId:row.record_id,projectId:row.project_id};},
 commitRunStart({runs,draftId,expectedRevision}){return transaction(()=>{
  for(const run of runs.slice(0,1))if(run.projectId&&!db.prepare('SELECT id FROM projects WHERE id=?').get(run.projectId))throw new Error('NOT_FOUND: Project was deleted');
  if(draftId){
   const row=db.prepare('SELECT data FROM drafts WHERE id=?').get(draftId);
   if(!row||resources.revision('draft',draftId)!==expectedRevision)throw new Error('CONFLICT: Draft changed before execution');
   const draft=JSON.parse(row.data),run=runs.find(r=>r.draftId===draftId);
   if(!run||run.projectId!==draft.projectId||draft.archivedAt)throw new Error('CONFLICT: Invalid draft transition');
   const id=resources.identify('draft',draftId,draft.projectId);
   db.prepare("UPDATE conversation_identities SET kind='run',record_id=? WHERE id=?").run(run.id,id);
   db.prepare('DELETE FROM drafts WHERE id=?').run(draftId);resources.bump('draft',draftId);resources.bump('workspace','all');
  }
  saveRunRows(runs);
  return runs.map(run=>({id:run.id,conversationId:resources.identify('run',run.id,run.projectId)}));
 });},
 readRuns(){return db.prepare('SELECT id,data FROM runs ORDER BY updated_at DESC,id').all().map(row=>{const run={...JSON.parse(row.data),conversationId:resources.identify('run',row.id,JSON.parse(row.data).projectId)};for(const key of collections)run[key]=[];for(const item of db.prepare('SELECT collection,data FROM run_items WHERE run_id=? ORDER BY position').all(row.id))run[item.collection].push(JSON.parse(item.data));return run;});},
 saveRunUpdates:runs=>transaction(()=>saveRunRows(runs,{replace:false})),
 saveRuns,
 close(){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();return true;}
};
if(db)parentPort.on('message',({id,method,args})=>{try{if(!Object.hasOwn(handlers,method))throw new Error('未知数据库操作');parentPort.postMessage({id,value:handlers[method](args)});if(method==='close')parentPort.close();}catch(e){parentPort.postMessage({id,error:e.message,code:e.code});}});
