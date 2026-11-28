const {createHash}=require('node:crypto');
const references=new WeakMap(),previews=new WeakMap(),projectionVersions=new WeakMap();
const projectionVersion=run=>projectionVersions.get(run)||0;
// V8 substring views can retain the entire original buffer. Copy bounded tails.
const tail=(text,limit)=>Buffer.from(text.slice(-limit),'utf16le').toString('utf16le');
const digest=text=>createHash('sha256').update(text,'utf16le').digest('hex');
function reference(owner,key){const spool=require('./text-spool.cjs').reference(owner,key);if(spool)return spool;const value=references.get(Object.getOwnPropertyDescriptor(owner,key)?.get);if(!value)return;const {cache,...ref}=value;return ref;}
const {locate}=require('./run-text-path.cjs');
function install(item,ref,cache){
 const target=locate(item,ref.field);if(!target)throw Error('INVALID_TEXT_PATH');
 const {owner,key}=target,get=()=>cache.read(ref);previews.delete(owner);references.set(get,{...ref,cache});
 Object.defineProperty(owner,key,{enumerable:true,configurable:true,get,set(value){Object.defineProperty(this,key,{value,writable:true,enumerable:true,configurable:true});}});
}
// Full text is a bounded, disposable cache. Durable references never contain it.
// Synchronous readers preserve the existing context/review contracts; IPC detail
// pagination stays on the worker. Large one-off reads are deliberately not cached.
class RuntimeTextCache {
 constructor(file,{maxBytes=8*1024*1024,maxEntryBytes=1024*1024,maxEntries=128}={}){this.file=file;this.maxBytes=maxBytes;this.maxEntryBytes=maxEntryBytes;this.maxEntries=maxEntries;this.values=new Map();this.bytes=0;this.loads=0;}
 database(){if(!this.db){this.db=new(require('node:sqlite').DatabaseSync)(this.file,{readOnly:true,timeout:5000});this.db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-2048;');}return this.db;}
 read(ref){
  const key=JSON.stringify([ref.runId,ref.collection,ref.itemKey,ref.field,ref.revision]);const cached=this.values.get(key);
  if(cached!==undefined){this.values.delete(key);this.values.set(key,cached);return cached;}
  const db=this.database(),args=[ref.runId,ref.collection,ref.itemKey,ref.field];let text;
  db.exec('BEGIN');try{
   const current=db.prepare('SELECT revision,length FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').get(...args);
   if(!current||current.revision!==ref.revision||current.length!==ref.length)throw Error('TEXT_REFERENCE_CHANGED');
   text=db.prepare('SELECT text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? ORDER BY seq').all(...args).map(r=>Buffer.from(r.text).toString('utf16le')).join('');
  }finally{db.exec('ROLLBACK');}
  this.loads++;const size=text.length*2;
  if(size<=this.maxEntryBytes&&size<=this.maxBytes){while(this.values.size&&(this.bytes+size>this.maxBytes||this.values.size>=this.maxEntries)){const first=this.values.keys().next().value;this.bytes-=this.values.get(first).length*2;this.values.delete(first);}this.values.set(key,text);this.bytes+=size;}
  return text;
 }
 attach(state){const runs=new Map(state.runs.map(r=>[r.id,r]));for(const entry of state.textReferences||[]){const run=runs.get(entry.runId),item=run?.[entry.collection]?.[entry.position];if(item)install(item,entry,this);}return state.runs;}
 compact(captured){
  for(const run of captured)for(const entry of run.entries||[]){
   const live=['preparing','running','waiting','stopping'].includes(run.source?.status);
   if(live&&((entry.collection==='tools'&&!['completed','failed','interrupted','cancelled','stopped'].includes(entry.source.status))||(entry.collection==='messages'&&entry.source.role==='assistant'&&entry.source.status!=='completed'&&entry.turnKey===run.source.messages?.findLast(m=>m.role==='user'&&!m.turnKey)?.id)))continue;
   previews.delete(entry.source);for(const activity of entry.source.nativeActivity||[])previews.delete(activity);
   // Only detach the exact acknowledged value. A newer streamed delta must stay
   // live until its own transaction succeeds.
   for(const [field,text] of entry.value.texts){if(typeof text!=='string'&&!['spool','joined'].includes(text.kind))continue;const target=locate(entry.source,field);if(!target)continue;const property=Object.getOwnPropertyDescriptor(target.owner,target.key);if(typeof text==='string'?(!('value'in property)||property.value!==text):reference(target.owner,target.key)?.revision!==text.revision)continue;
    const row=this.database().prepare('SELECT length,revision FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').get(run.id,entry.collection,entry.key,field);if(!row)continue;
    install(entry.source,{runId:run.id,collection:entry.collection,itemKey:entry.key,field,...row,preview:typeof text==='string'?tail(text,2048):text.preview,hash:typeof text==='string'?digest(text):text.hash},this);
    if(run.source)projectionVersions.set(run.source,projectionVersion(run.source)+1);
   }
  }
 }
 stats(){return {bytes:this.bytes,entries:this.values.size,loads:this.loads,maxBytes:this.maxBytes};}
 close(){this.values.clear();this.bytes=0;this.db?.close();this.db=null;}
}
function range(owner,key,offset,limit=64000){
 if(!Number.isInteger(limit)||limit<1||limit>64000||offset!==undefined&&(!Number.isInteger(offset)||offset<0))throw Error('分页位置或大小无效');
 const ref=reference(owner,key);if(ref&&['spool','joined'].includes(ref.kind)){const start=Math.min(offset??Math.max(0,ref.length-limit),ref.length);return {text:require('./text-spool.cjs').read(ref,start,Math.min(ref.length,start+limit)),offset:start,total:ref.length,version:ref.revision};}
 if(ref){const cache=references.get(Object.getOwnPropertyDescriptor(owner,key)?.get)?.cache;if(cache){const start=Math.min(offset??Math.max(0,ref.length-limit),ref.length),end=Math.min(ref.length,start+limit),db=cache.database(),args=[ref.runId,ref.collection,ref.itemKey,ref.field];db.exec('BEGIN');try{const current=db.prepare('SELECT revision,length FROM run_texts WHERE run_id=? AND collection=? AND item_key=? AND field=?').get(...args);if(!current||current.revision!==ref.revision||current.length!==ref.length)throw Error('TEXT_REFERENCE_CHANGED');const rows=db.prepare('SELECT start,text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? AND start<? AND start+length(text)/2>? ORDER BY seq').all(...args,end,start);return {text:rows.map(row=>Buffer.from(row.text).subarray(Math.max(0,start-row.start)*2,Math.min(row.text.length/2,end-row.start)*2).toString('utf16le')).join(''),offset:start,total:ref.length,version:ref.revision};}finally{db.exec('ROLLBACK');}}}
 const text=owner[key]||'',start=Math.min(offset??Math.max(0,text.length-limit),text.length);return {text:text.slice(start,start+limit),offset:start,total:text.length,version:createHash('sha256').update(text).digest('hex').slice(0,20)};
}
function preview(owner,key,limit){
 const ref=reference(owner,key);if(ref)return {text:tail(ref.preview,limit),length:ref.length,version:ref.revision};
 const text=owner[key]||'',old=previews.get(owner);if(old?.source===text&&old.limit===limit)return old.value;
 const value={text:tail(text,limit),length:text.length,version:createHash('sha256').update(text).digest('hex').slice(0,20)};
 // While a field is live, this avoids rehashing on unrelated control updates.
 // install() removes this source reference as soon as the body becomes disk backed.
 previews.set(owner,{source:text,limit,value});return value;
}
module.exports={RuntimeTextCache,reference,install,locate,digest,preview,range,projectionVersion};
