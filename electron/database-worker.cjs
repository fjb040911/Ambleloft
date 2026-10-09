const {parentPort,workerData}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');const path=require('node:path');
const {createWorkspaceResources}=require('../core/workspace-state.cjs');
const {schema:extensionSchema,extensionPersistence}=require('../core/extensions/persistence.cjs');
const {schema:messageSchema,createMessageStore}=require('../core/extensions/messages.cjs');
const {schema:actionSchema,createActionJournal}=require('../core/extensions/action-journal.cjs');
let db;let resources;
try{
 fs.mkdirSync(path.dirname(workerData.file),{recursive:true});
 db=new DatabaseSync(workerData.file,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>6)throw new Error('数据库版本高于当前应用，请升级应用');
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
 ${actionSchema}
 PRAGMA user_version=6;
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
function saveRunRows(runs){
 const existing=new Map(db.prepare('SELECT id,data FROM runs').all().map(r=>[r.id,r.data]));
 const put=db.prepare('INSERT INTO runs(id,project_id,updated_at,archived_at,data) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,archived_at=excluded.archived_at,data=excluded.data');
 for(const run of runs){
  const conversationId=resources.identify('run',run.id,run.projectId);
  const meta={...run,conversationId};for(const key of collections)delete meta[key];const data=JSON.stringify(meta);
  if(existing.get(run.id)!==data)put.run(run.id,run.projectId||null,run.updatedAt||run.createdAt||'',run.archivedAt||null,data);existing.delete(run.id);
  const old=new Map(db.prepare('SELECT collection,item_key,position,data FROM run_items WHERE run_id=?').all(run.id).map(r=>[r.collection+'\0'+r.item_key,r]));
  const itemPut=db.prepare('INSERT INTO run_items(run_id,collection,item_key,position,turn_key,data) VALUES (?,?,?,?,?,?) ON CONFLICT(run_id,collection,item_key) DO UPDATE SET position=excluded.position,turn_key=excluded.turn_key,data=excluded.data');
  let turnKey=null;
  for(const collection of collections){for(const [index,item] of (run[collection]||[]).entries()){
   if(collection==='messages'&&item.role==='user')turnKey=item.id;
   const key=String(item.id||item.turnKey||index),lookup=collection+'\0'+key,json=JSON.stringify(item),prior=old.get(lookup);
   if(prior?.data!==json||prior?.position!==index)itemPut.run(run.id,collection,key,index,item.turnKey||(collection==='messages'?turnKey:null),json);
   old.delete(lookup);
  }}
  const del=db.prepare('DELETE FROM run_items WHERE run_id=? AND collection=? AND item_key=?');for(const item of old.values())del.run(run.id,item.collection,item.item_key);
 }
 const del=db.prepare('DELETE FROM runs WHERE id=?');for(const id of existing.keys()){del.run(id);db.prepare("DELETE FROM form_instances WHERE run_id=?").run(id);db.prepare("UPDATE conversation_identities SET kind='deleted-run' WHERE kind='run' AND record_id=?").run(id);}
}
function saveRuns(runs){return transaction(()=>saveRunRows(runs));}
const messages=db?createMessageStore(db,transaction):null;
const actions=db?createActionJournal(db,transaction):null;
if(actions)actions.recover();
const handlers={
 formData({action,runId,flow,revision}){if(action==='list')return db.prepare('SELECT data FROM form_instances WHERE run_id=? ORDER BY rowid').all(runId).map(r=>JSON.parse(r.data));if(action!=='put')throw Error('Invalid form action');return transaction(()=>{const old=db.prepare('SELECT revision FROM form_instances WHERE id=?').get(flow.id);if(old?old.revision!==revision:revision!==null)throw Error('CONFLICT');const saved={...flow,revision:(revision??-1)+1};db.prepare('INSERT INTO form_instances(id,run_id,revision,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(saved.id,saved.runId,saved.revision,JSON.stringify(saved));return saved;});},
 ...require('../core/auth/connections.cjs').connectionHandlers(db,transaction),
 ...require('../core/extensions/message-handlers.cjs').createMessageHandlers(db,messages,actions,transaction),
 // Internal host worker channel only; never expose caller-supplied scope to renderer IPC.
 messageStore({method,scope,args=[]}){if(!Object.hasOwn(messages,method)||!Array.isArray(args))throw Error('INVALID_ARGUMENT');return messages[method](scope,...args);},
 ...extensionPersistence(db,transaction),
 listSkills(){return db.prepare("SELECT data FROM skills ORDER BY rowid DESC").all().map(row=>JSON.parse(row.data));},
 putSkill(record){db.prepare("INSERT INTO skills(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(record.id,JSON.stringify(record));},
 deleteSkill({id}){db.prepare("DELETE FROM skills WHERE id=?").run(id);},
 ready(){return {version:4};},
 readSetting({key}){const row=db.prepare('SELECT data FROM settings WHERE key=?').get(key);return row?JSON.parse(row.data):null;},
 writeSetting({key,value}){db.prepare('INSERT INTO settings(key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(value));},
 readWorkspace(){return resources.read();},
 patchWorkspace(input){return transaction(()=>resources.patch(input));},
 writeWorkspace(value){return transaction(()=>{
  if(!Number.isSafeInteger(value.revision)||value.revision!==resources.revision('workspace','all'))throw new Error('CONFLICT: Workspace changed; refresh and retry');
  const current=resources.read(),changes=[];
  for(const [kind,key] of [['project','projects'],['draft','tasks']]) {
   for(const item of value[key]) {const previous=current[key].find(p=>p.id===item.id);changes.push({kind,action:'put',id:item.id,value:item,expectedRevision:previous?.revision??null});}
   for(const item of current[key])if(!value[key].some(p=>p.id===item.id))changes.push({kind,action:'delete',id:item.id,expectedRevision:item.revision});
  }
  const settings={};for(const key of ['theme','language','fontScale','layoutMode'])if(value[key]!==undefined)settings[key]=value[key];
  changes.push({kind:'settings',action:'patch',expectedRevision:current.settingsRevision,value:settings});
  return resources.patch({changes});
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
 saveRuns,
 close(){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();return true;}
};
if(db)parentPort.on('message',({id,method,args})=>{try{if(!Object.hasOwn(handlers,method))throw new Error('未知数据库操作');parentPort.postMessage({id,value:handlers[method](args)});if(method==='close')parentPort.close();}catch(e){parentPort.postMessage({id,error:e.message,code:e.code});}});
