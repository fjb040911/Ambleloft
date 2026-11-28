const {activityKeys,locate}=require('./run-text-path.cjs');
const schema=`
CREATE TABLE IF NOT EXISTS run_texts(run_id TEXT NOT NULL,collection TEXT NOT NULL,item_key TEXT NOT NULL,field TEXT NOT NULL,length INTEGER NOT NULL,next_seq INTEGER NOT NULL,revision TEXT NOT NULL DEFAULT '',PRIMARY KEY(run_id,collection,item_key,field),FOREIGN KEY(run_id,collection,item_key) REFERENCES run_items(run_id,collection,item_key) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS run_text_chunks(run_id TEXT NOT NULL,collection TEXT NOT NULL,item_key TEXT NOT NULL,field TEXT NOT NULL,seq INTEGER NOT NULL,start INTEGER NOT NULL,text BLOB NOT NULL,PRIMARY KEY(run_id,collection,item_key,field,seq),FOREIGN KEY(run_id,collection,item_key,field) REFERENCES run_texts(run_id,collection,item_key,field) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS run_text_offsets ON run_text_chunks(run_id,collection,item_key,field,start);
CREATE INDEX IF NOT EXISTS task_context_active_run ON task_context_projections(json_extract(data,'$.runId'),status);
CREATE TABLE IF NOT EXISTS composer_start_receipts(id TEXT PRIMARY KEY,digest TEXT NOT NULL,run_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_patch_receipts(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,result TEXT NOT NULL);
`;
// Called inside the schema upgrade transaction. Relink chunks without decoding
// their bodies, preserving every revision and UTF-16 offset.
function migrateActivityFields(db) {
 const rows = db.prepare(`SELECT run_id,collection,item_key,data FROM run_items AS item
   WHERE EXISTS (SELECT 1 FROM run_texts AS text WHERE text.run_id=item.run_id
     AND text.collection=item.collection AND text.item_key=item.item_key AND text.field LIKE '["nativeActivity",%')`);
 const fields = db.prepare('SELECT field FROM run_texts WHERE run_id=? AND collection=? AND item_key=?');
 const insert = db.prepare(`INSERT INTO run_texts(run_id,collection,item_key,field,length,next_seq,revision)
   SELECT run_id,collection,item_key,?,length,next_seq,revision FROM run_texts
   WHERE run_id=? AND collection=? AND item_key=? AND field=?`);
 const move = db.prepare('UPDATE run_text_chunks SET field=? WHERE run_id=? AND collection=? AND item_key=? AND field=?');
 const remove = db.prepare('DELETE FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?');
 for (const row of rows.iterate()) {
  const activities = JSON.parse(row.data).nativeActivity;
  if (!Array.isArray(activities)) continue;
  const keys = activityKeys(activities);
  const identity = [row.run_id, row.collection, row.item_key];
  for (const {field} of fields.all(...identity)) {
   const path = JSON.parse(field);
   if (path[0] !== 'nativeActivity' || !Number.isInteger(path[1])) continue;
   const key = keys[path[1]];
   if (typeof key !== 'string') continue;
   path[1] = key;
   const stableField = JSON.stringify(path);
   insert.run(stableField, ...identity, field);
   move.run(stableField, ...identity, field);
   remove.run(...identity, field);
  }
 }
}
function writeText(db,runId,collection,key,change){
 if(change.source){let at=change.start||0,first=true;for(const text of require('./text-spool.cjs').chunks(change.source,at)){writeText(db,runId,collection,key,{field:change.field,mode:first?change.mode:'append',baseLength:first?change.baseLength:at,text});at+=text.length;first=false;}if(first)writeText(db,runId,collection,key,{...change,source:undefined,text:''});return;}
 const args=[runId,collection,key,change.field];
 if(change.mode==='set')db.prepare('DELETE FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').run(...args);
 else if(change.mode!=='append')throw Error('INVALID_TEXT_PATCH');
 let old=db.prepare('SELECT length,next_seq FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').get(...args);
 if(change.mode==='append'&&(!old||old.length!==change.baseLength))throw Error('TEXT_REVISION_CONFLICT');
 let length=old?.length||0,seq=old?.next_seq||0;
 if(!old)db.prepare('INSERT INTO run_texts(run_id,collection,item_key,field,length,next_seq) VALUES(?,?,?,?,0,0)').run(...args);
 // Store UTF-16 bytes so even a surrogate split across streamed deltas round-trips.
 let offset=0;
 if(seq){const tail=db.prepare('SELECT text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? AND seq=?').get(...args,seq-1);const oldText=Buffer.from(tail.text).toString('utf16le');const count=Math.min(32768-oldText.length,change.text.length);if(count>0){db.prepare('UPDATE run_text_chunks SET text=? WHERE run_id=? AND collection=? AND item_key=? AND field=? AND seq=?').run(Buffer.from(oldText+change.text.slice(0,count),'utf16le'),...args,seq-1);offset=count;length+=count;}}
 const put=db.prepare('INSERT INTO run_text_chunks VALUES(?,?,?,?,?,?,?)');
 for(;offset<change.text.length;){const end=Math.min(offset+32768,change.text.length),chunk=change.text.slice(offset,end);put.run(...args,seq++,length,Buffer.from(chunk,'utf16le'));length+=chunk.length;offset=end;}
 db.prepare('UPDATE run_texts SET length=?,next_seq=?,revision=? WHERE run_id=? AND collection=? AND item_key=? AND field=?').run(length,seq,require('node:crypto').randomUUID(),...args);
}
function hydrateItem(db,runId,collection,row){
 const item=JSON.parse(row.data);
 for(const field of db.prepare('SELECT field FROM run_texts WHERE run_id=? AND collection=? AND item_key=?').all(runId,collection,row.item_key)){
  const target=locate(item,field.field);if(!target)throw Error('INVALID_TEXT_PATH');
  const text=db.prepare('SELECT text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? ORDER BY seq').all(runId,collection,row.item_key,field.field).map(r=>Buffer.from(r.text).toString('utf16le')).join('');Object.defineProperty(target.owner,target.key,{value:text,writable:true,enumerable:true,configurable:true});
 }
 return item;
}
function readItems(db,runId,collection){return db.prepare('SELECT item_key,data FROM run_items WHERE run_id=? AND collection=? ORDER BY position').all(runId,collection).map(row=>hydrateItem(db,runId,collection,row));}
// Indexing and bounded automation snapshots consume these references in chunks;
// fetching metadata must not hydrate reasoning, tools or unrelated message text.
function readRunReferences(db,id){
 const row=db.prepare('SELECT data FROM runs WHERE id=?').get(id);if(!row)return null;const run=JSON.parse(row.data);
 run.messages=db.prepare("SELECT item_key,data FROM run_items WHERE run_id=? AND collection='messages' ORDER BY position").all(id).map(row=>{
  const item=JSON.parse(row.data),field='["text"]';
  if(db.prepare("SELECT 1 FROM run_texts WHERE run_id=? AND collection='messages' AND item_key=? AND field=?").get(id,row.item_key,field))item.text=require('./stored-json.cjs').storedText(db,[id,'messages',row.item_key,field]);
  return item;
 });return run;
}
function readRun(db,id){const row=db.prepare('SELECT data FROM runs WHERE id=?').get(id);if(!row)return null;const run=JSON.parse(row.data);for(const collection of require('./run-patches.cjs').collections){const items=readItems(db,id,collection);if(items.length||!Array.isArray(run[collection]))run[collection]=items;}return run;}
function readToolText(db,{id,toolId,activityId,offset,limit=64000}){
 if(!Number.isInteger(limit)||limit<1||limit>64000||offset!==undefined&&(!Number.isInteger(offset)||offset<0))throw Error('分页位置或大小无效');
 const row=db.prepare("SELECT data FROM run_items WHERE run_id=? AND collection='tools' AND item_key=?").get(id,toolId);if(!row)throw Error('工具记录不存在');
 const tool=JSON.parse(row.data),index=activityId?tool.nativeActivity?.findIndex(a=>a.id===activityId):undefined;
 if(activityId&&!(index>=0))throw Error('工具输出不存在');
 const path=activityId?['nativeActivity',activityKeys(tool.nativeActivity)[index],'text']:['detail'],field=JSON.stringify(path),args=[id,'tools',toolId,field];
 const stored=db.prepare('SELECT length,revision FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').get(...args);
 if(!stored){const text=activityId?tool.nativeActivity[index].text:tool.detail;if(typeof text!=='string')throw Error('工具输出不存在');const start=Math.min(offset??Math.max(0,text.length-limit),text.length);return {text:text.slice(start,start+limit),offset:start,total:text.length,version:require('node:crypto').createHash('sha256').update(text).digest('hex').slice(0,20)};}
 const start=Math.min(offset??Math.max(0,stored.length-limit),stored.length),end=Math.min(stored.length,start+limit);
 const rows=db.prepare('SELECT start,text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? AND start<? AND start+length(text)/2>? ORDER BY seq').all(...args,end,start);
 const text=rows.map(row=>Buffer.from(row.text).subarray(Math.max(0,start-row.start)*2,Math.min(Buffer.byteLength(row.text)/2,end-row.start)*2).toString('utf16le')).join('');
 return {text,offset:start,total:stored.length,version:stored.revision};
}
module.exports={schema,migrateActivityFields,writeText,hydrateItem,readItems,readRun,readRunReferences,readToolText};
