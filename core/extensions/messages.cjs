const {failure}=require('./errors.cjs');
// Internal message storage. Callers must bind source and account in the host;
// this module is not an extension-facing IPC API.
const {randomUUID}=require('node:crypto');
const schema=`CREATE TABLE IF NOT EXISTS notification_records(scope TEXT NOT NULL,event_key TEXT NOT NULL,id TEXT NOT NULL UNIQUE,data TEXT NOT NULL,PRIMARY KEY(scope,event_key));
CREATE TABLE IF NOT EXISTS notification_preferences(scope TEXT PRIMARY KEY,data TEXT NOT NULL);`;
function createMessageStore(db,transaction,{now=()=>Date.now()}={}){
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const bounded=(v,max)=>typeof v==='string'&&Buffer.byteLength(v)<=max;
 const key=c=>{if(!c||['profileId','source','accountScope'].some(k=>typeof c[k]!=='string'||!c[k]))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: scope');return JSON.stringify([c.profileId,c.source,c.accountScope]);};
 const preferenceKey=c=>{key(c);return JSON.stringify([c.profileId,c.source]);};
 const prefs=c=>JSON.parse(db.prepare('SELECT data FROM notification_preferences WHERE scope=?').get(preferenceKey(c))?.data||'{"receive":true,"muted":false}');
 const save=(c,m)=>db.prepare('UPDATE notification_records SET data=? WHERE scope=? AND id=?').run(JSON.stringify(m),key(c),m.id);
 const expire=(c,m)=>{if(m.validity==='active'&&m.expiresAt!=null&&m.expiresAt<=now()){m.validity='expired';m.revision++;m.updatedAt=now();save(c,m);}return m;};
 const get=(c,id)=>{const r=db.prepare('SELECT data FROM notification_records WHERE scope=? AND id=?').get(key(c),id);if(!r)throw failure('NOT_FOUND','NOT_FOUND');return expire(c,JSON.parse(r.data));};
 const pending=m=>m.category==='actionRequired'&&m.businessState==='pending'&&m.validity==='active';
 const validate=m=>{if(!bounded(m.title,1024)||!bounded(m.body,64*1024)||m.businessType!=null&&!bounded(m.businessType,256))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: Content size');if(typeof m.title!=='string'||!m.title.trim()||typeof m.body!=='string'||!['notice','actionRequired'].includes(m.category)||!['info','warning','error'].includes(m.severity)||!['active','expired','withdrawn'].includes(m.validity)||!Array.isArray(m.actions)||m.actions.length>2||m.expiresAt!=null&&(!Number.isSafeInteger(m.expiresAt)||m.expiresAt<0))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');
  if(m.category==='notice'?m.businessState!==null:!['pending','resolved'].includes(m.businessState))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: business state');
  const ids=new Set();for(const a of m.actions){if(!a||!bounded(a.id,128)||!bounded(a.label,160)||!bounded(a.commandId,256)||Buffer.byteLength(JSON.stringify(a.arguments??{}))>64*1024||typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.label!=='string'||!a.label||typeof a.commandId!=='string'||!a.commandId)throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: action');ids.add(a.id);}
 };
 return {
  getPreferences:prefs,
  setPreferences(c,p){if(!object(p)||typeof p.receive!=='boolean'||typeof p.muted!=='boolean')throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');return transaction(()=>{db.prepare('INSERT INTO notification_preferences VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET data=excluded.data').run(preferenceKey(c),JSON.stringify({receive:p.receive,muted:p.muted}));return prefs(c);});},
  publish(c,input){return transaction(()=>{if(!object(input)||!bounded(input.eventKey,512)||!input.eventKey)throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: eventKey');const scope=key(c),r=db.prepare('SELECT data FROM notification_records WHERE scope=? AND event_key=?').get(scope,input.eventKey);if(r){const m=expire(c,JSON.parse(r.data));return {status:m.suppressed?'rejected':m.dismissedAt!=null?'dismissed':'duplicate',id:m.suppressed?undefined:m.id};}
   if(db.prepare('SELECT count(*) AS n FROM notification_records WHERE scope=?').get(scope).n>=10000)throw failure('QUOTA_EXCEEDED','QUOTA_EXCEEDED');
   const t=now(),m={id:randomUUID(),eventKey:input.eventKey,title:input.title,body:input.body,category:input.category,severity:input.severity||'info',businessType:input.businessType??null,actions:input.actions||[],expiresAt:input.expiresAt??null,validity:'active',businessState:input.category==='actionRequired'?'pending':null,revision:1,receivedAt:t,updatedAt:t,readAt:null,dismissedAt:null};validate(m);if(m.expiresAt!=null&&m.expiresAt<=t){m.validity='expired';}
   const p=prefs(c);if(!p.receive){m.suppressed=true;m.title='';m.body='';m.actions=[];}
   db.prepare('INSERT INTO notification_records VALUES (?,?,?,?)').run(scope,m.eventKey,m.id,JSON.stringify(m));return p.receive?{status:'published',id:m.id,revision:1,remind:!p.muted&&m.validity==='active'}:{status:'rejected'};});},
  get(c,id){return transaction(()=>get(c,id));},
  update(c,id,patch,expectedRevision){return transaction(()=>{if(!object(patch)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');const m=get(c,id);if(m.suppressed)throw failure('NOT_FOUND','NOT_FOUND');if(m.revision!==expectedRevision)throw failure('CONFLICT','CONFLICT');const allowed=['title','body','severity','actions','expiresAt','businessState','validity'];if(Object.keys(patch).some(k=>!allowed.includes(k)))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT: immutable field');const next={...m,...patch};validate(next);
   if(m.validity!=='active'&&next.validity!==m.validity||m.businessState==='resolved'&&next.businessState!=='resolved'||m.validity!=='active'&&next.businessState==='pending'&&m.businessState!=='pending')throw failure('CONFLICT','CONFLICT: terminal state');
   next.revision++;next.updatedAt=now();save(c,next);return expire(c,next);});},
  list(c,{filter='all'}={}){return transaction(()=>{if(!['all','unread','pending'].includes(filter))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');return db.prepare('SELECT data FROM notification_records WHERE scope=?').all(key(c)).map(r=>expire(c,JSON.parse(r.data))).filter(m=>!m.suppressed&&m.dismissedAt==null&&(filter==='all'||filter==='unread'&&m.readAt==null||filter==='pending'&&pending(m))).sort((a,b)=>b.receivedAt-a.receivedAt||a.id.localeCompare(b.id));});},
  bulk(c,{action,filter='all'}){return transaction(()=>{if(!['read','clearRead'].includes(action)||!['all','unread','pending'].includes(filter))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');let count=0;for(const row of db.prepare('SELECT data FROM notification_records WHERE scope=?').all(key(c))){const m=expire(c,JSON.parse(row.data));if(m.suppressed||m.dismissedAt!=null||filter==='unread'&&m.readAt!=null||filter==='pending'&&!pending(m))continue;if(action==='read'&&m.readAt==null){m.readAt=now();count++;save(c,m);}else if(action==='clearRead'&&m.readAt!=null&&!pending(m)){m.dismissedAt=now();count++;save(c,m);}}return {count};});},
  markRead(c,id){return transaction(()=>{const m=get(c,id);if(!m.suppressed&&m.dismissedAt==null&&m.readAt==null){m.readAt=now();save(c,m);}return m;});},
  dismiss(c,id){return transaction(()=>{const m=get(c,id);m.dismissedAt??=now();save(c,m);return m;});},
 };
}
module.exports={schema,createMessageStore};
