const {parentPort,workerData}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');const path=require('node:path');
let db;
try{
 fs.mkdirSync(path.dirname(workerData.file),{recursive:true});
 db=new DatabaseSync(workerData.file,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>2)throw new Error('数据库版本高于当前应用，请升级应用');
 db.exec(`BEGIN;
 CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, project_id TEXT, updated_at TEXT NOT NULL, archived_at TEXT, data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS runs_project_recent ON runs(project_id,updated_at DESC,id);
 CREATE TABLE IF NOT EXISTS run_items(run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, collection TEXT NOT NULL, item_key TEXT NOT NULL, position INTEGER NOT NULL, turn_key TEXT, data TEXT NOT NULL, PRIMARY KEY(run_id,collection,item_key));
 CREATE INDEX IF NOT EXISTS run_items_order ON run_items(run_id,collection,position);
 CREATE INDEX IF NOT EXISTS run_items_turn ON run_items(run_id,turn_key);
 PRAGMA user_version=2;
 COMMIT;`);
}catch(e){parentPort.postMessage({fatal:e.message});try{db?.close();}catch{};db=null;parentPort.close();process.exitCode=1;}
const collections=['messages','tools','plans','fileChanges','artifacts','approvals','questions'];
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
function syncTable(table,values){
 const existing=new Map(db.prepare(`SELECT id,data FROM ${table}`).all().map(r=>[r.id,r.data]));
 const put=db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
 for(const v of values){const data=JSON.stringify(v);if(existing.get(v.id)!==data)put.run(v.id,data);existing.delete(v.id);}
 const del=db.prepare(`DELETE FROM ${table} WHERE id=?`);for(const id of existing.keys())del.run(id);
}
function saveRuns(runs){return transaction(()=>{
 const existing=new Map(db.prepare('SELECT id,data FROM runs').all().map(r=>[r.id,r.data]));
 const put=db.prepare('INSERT INTO runs(id,project_id,updated_at,archived_at,data) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,archived_at=excluded.archived_at,data=excluded.data');
 for(const run of runs){
  const meta={...run};for(const key of collections)delete meta[key];const data=JSON.stringify(meta);
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
 const del=db.prepare('DELETE FROM runs WHERE id=?');for(const id of existing.keys())del.run(id);
});}
const handlers={
 listSkills(){return db.prepare("SELECT data FROM skills ORDER BY rowid DESC").all().map(row=>JSON.parse(row.data));},
 putSkill(record){db.prepare("INSERT INTO skills(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(record.id,JSON.stringify(record));},
 deleteSkill({id}){db.prepare("DELETE FROM skills WHERE id=?").run(id);},
 ready(){return {version:2};},
 readSetting({key}){const row=db.prepare('SELECT data FROM settings WHERE key=?').get(key);return row?JSON.parse(row.data):null;},
 writeSetting({key,value}){db.prepare('INSERT INTO settings(key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(value));},
 readWorkspace(){const settings=handlers.readSetting({key:'workspace'})||{theme:'system'};return {...settings,projects:db.prepare('SELECT data FROM projects ORDER BY rowid').all().map(r=>JSON.parse(r.data)),tasks:db.prepare('SELECT data FROM drafts ORDER BY rowid').all().map(r=>JSON.parse(r.data))};},
 writeWorkspace(value){return transaction(()=>{const {projects,tasks,...settings}=value;syncTable('projects',projects);syncTable('drafts',tasks);handlers.writeSetting({key:'workspace',value:settings});});},
 readRuns(){return db.prepare('SELECT id,data FROM runs ORDER BY updated_at DESC,id').all().map(row=>{const run=JSON.parse(row.data);for(const key of collections)run[key]=[];for(const item of db.prepare('SELECT collection,data FROM run_items WHERE run_id=? ORDER BY position').all(row.id))run[item.collection].push(JSON.parse(item.data));return run;});},
 saveRuns,
 close(){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();return true;}
};
if(db)parentPort.on('message',({id,method,args})=>{try{if(!Object.hasOwn(handlers,method))throw new Error('未知数据库操作');parentPort.postMessage({id,value:handlers[method](args)});if(method==='close')parentPort.close();}catch(e){parentPort.postMessage({id,error:e.message});}});
