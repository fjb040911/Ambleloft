const {randomUUID}=require('node:crypto');
const schema=`
CREATE TABLE IF NOT EXISTS extension_installations(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS extension_revisions(id TEXT NOT NULL,digest TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,digest));
CREATE TABLE IF NOT EXISTS extension_grants(id TEXT NOT NULL,capability TEXT NOT NULL,resource TEXT NOT NULL,PRIMARY KEY(id,capability,resource));
CREATE TABLE IF NOT EXISTS extension_data(id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,value TEXT,revision INTEGER NOT NULL,PRIMARY KEY(id,kind,key));
`;
function extensionPersistence(db,transaction){
 const epoch=()=>{const key='extensions.generation',r=db.prepare('SELECT data FROM settings WHERE key=?').get(key);const n=(r?JSON.parse(r.data):0)+1;db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(n));return n;};
 const get=id=>{const r=db.prepare('SELECT data FROM extension_installations WHERE id=?').get(id);if(!r)throw Error('NOT_FOUND: Extension');return JSON.parse(r.data);};
 const save=item=>db.prepare('INSERT INTO extension_installations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id,JSON.stringify(item));
 const revision=(id,digest)=>{const r=db.prepare('SELECT data FROM extension_revisions WHERE id=? AND digest=?').get(id,digest);if(!r)throw Error('NOT_FOUND: Revision');return JSON.parse(r.data);};
 const list=()=>db.prepare('SELECT data FROM extension_installations ORDER BY rowid').all().map(r=>{const item=JSON.parse(r.data);return {...item,revisions:db.prepare('SELECT data FROM extension_revisions WHERE id=?').all(item.id).map(r=>JSON.parse(r.data)),grants:db.prepare('SELECT capability,resource FROM extension_grants WHERE id=?').all(item.id)};});
 return {extensionState(){return list();},extensionMutation(input){return transaction(()=>{
  const {action,id}=input;
  if(action==='initialize'){
   if(!db.prepare("SELECT key FROM settings WHERE key='extensions.profile'").get())db.prepare('INSERT INTO settings VALUES (?,?)').run('extensions.profile',JSON.stringify(randomUUID()));
   if(!db.prepare("SELECT key FROM settings WHERE key='extensions.migrated'").get()){
    for(const item of input.legacy)if(!db.prepare('SELECT id FROM extension_installations WHERE id=?').get(item.id))save(item);
    db.prepare('INSERT INTO settings VALUES (?,?)').run('extensions.migrated',JSON.stringify({diagnostics:input.diagnostics}));
   }
   for(const item of list())if(item.pending){item.pending=null;item.enabled=false;item.generation=epoch();item.diagnostic='更新被中断，已停用；请重新确认版本。';delete item.revisions;delete item.grants;save(item);}
  }else if(action==='legacy'){
   if(db.prepare('SELECT id FROM extension_installations WHERE id=?').get(id))throw Error('扩展已安装');save(input.item);
  }else if(action==='stage'){
   const r=input.revision;db.prepare('INSERT INTO extension_revisions VALUES (?,?,?) ON CONFLICT(id,digest) DO NOTHING').run(id,r.digest,JSON.stringify(r));
   let item;try{item=get(id);}catch{item={id,enabled:false,generation:0,active:null,kind:'package'};}
   item.pending=r.digest;item.pendingSourceMode=r.sourceMode;save(item);
  }else if(action==='commit'){
   const item=get(id);if(item.pending!==input.digest)throw Error('CONFLICT: Pending revision changed');const r=revision(id,input.digest);
   Object.assign(item,{kind:'package',active:r.digest,sourceMode:item.pendingSourceMode||r.sourceMode,pendingSourceMode:null,pending:null,manifest:r.manifest,icons:r.icons,dictionaries:r.dictionaries,trusted:true,trustedAt:new Date().toISOString(),enabled:true,generation:epoch(),diagnostic:null});
   // Every revision requires fresh host consent; no grant expansion or stale exemptions.
   db.prepare('DELETE FROM extension_grants WHERE id=?').run(id);save(item);
  }else if(action==='enable'){
   const item=get(id);if(input.enabled&&item.kind==='package'&&!item.trusted)throw Error('FORBIDDEN: Trust required');item.enabled=input.enabled;item.generation=epoch();save(item);
  }else if(action==='remove'){
   get(id);for(const table of ['extension_installations','extension_grants','extension_revisions'])db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
   if(input.deleteData)db.prepare('DELETE FROM extension_data WHERE id=?').run(id);
  }else if(action==='grants'){
   const item=get(id);if(input.expectedGeneration!==item.generation)throw Error('CONFLICT: Extension changed');if(item.kind!=='package'||!item.trusted)throw Error('FORBIDDEN: Trust required');
   for(const grant of input.grants){const declaration=item.manifest.permissions?.find(p=>p.capability===grant.capability);if(!declaration)throw Error('FORBIDDEN: Undeclared permission');
    if(declaration.scope==='self'?grant.resource!=='self':!grant.resource.startsWith('project:')||!db.prepare('SELECT id FROM projects WHERE id=?').get(grant.resource.slice(8)))throw Error('NOT_FOUND: Permission scope');
   }
   db.prepare('DELETE FROM extension_grants WHERE id=?').run(id);for(const g of input.grants)db.prepare('INSERT OR IGNORE INTO extension_grants VALUES (?,?,?)').run(id,g.capability,g.resource);item.generation=epoch();save(item);
  }else throw Error('Unknown extension mutation');return list();
 });},extensionData({id,generation,capability,resource='self',key,kind='kv',write=false,value,expectedRevision}){return transaction(()=>{
  const item=get(id);if(!item.enabled||!item.trusted||item.generation!==generation||!db.prepare('SELECT id FROM extension_grants WHERE id=? AND capability=? AND resource=?').get(id,capability,resource))throw Error('FORBIDDEN: Extension grant changed');
  if(!['kv','secret','configuration'].includes(kind)||({kv:'storage',secret:'secrets',configuration:'configuration'})[kind]!==capability||resource!=='self'||typeof key!=='string'||!key.length||key.length>200)throw Error('INVALID_ARGUMENT: Storage');
  const prior=db.prepare('SELECT value,revision FROM extension_data WHERE id=? AND kind=? AND key=?').get(id,kind,key);
  if(!write)return {value:prior?.value??null,revision:prior?.revision??0};
  if(expectedRevision===null?prior?.value!=null:expectedRevision!==(prior?.revision??0))throw Error('CONFLICT: Storage changed');
  if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>256*1024))throw Error('INVALID_ARGUMENT: Value too large');
  const usage=db.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(key AS BLOB))+coalesce(length(CAST(value AS BLOB)),0)),0) AS n FROM extension_data WHERE id=?').get(id);
  if(!prior&&usage.count>=10000)throw Error('QUOTA_EXCEEDED');const used=usage.n+(!prior?Buffer.byteLength(key):0);
  if(used-Buffer.byteLength(prior?.value||'')+Buffer.byteLength(value||'')>10*1024*1024)throw Error('QUOTA_EXCEEDED');
  db.prepare('INSERT INTO extension_data VALUES (?,?,?,?,?) ON CONFLICT(id,kind,key) DO UPDATE SET value=excluded.value,revision=excluded.revision').run(id,kind,key,value,(prior?.revision??0)+1);
  return {revision:(prior?.revision??0)+1};
 });},extensionCheck({id,generation,capability,projectId}){
  const item=get(id),decl=item.manifest.permissions?.find(p=>p.capability===capability);const resource=decl?.scope==='project'?'project:'+projectId:'self';
  if(!item.enabled||!item.trusted||item.generation!==generation||!decl||!db.prepare('SELECT id FROM extension_grants WHERE id=? AND capability=? AND resource=?').get(id,capability,resource)||decl.scope==='project'&&!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw Error('FORBIDDEN: Extension resource access');return true;
 }};
}
module.exports={schema,extensionPersistence};
