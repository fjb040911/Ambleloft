// Host-only credential broker. Extension RPC receives identity and bounded HTTP
// responses, never token sets. Interactive login requires a live Operation owner.
const {randomUUID,createHash}=require('node:crypto');
const {LoginService}=require('./login-service.cjs');
const {failure}=require('../extensions/errors.cjs');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
class ExtensionAuthentication {
 constructor({database,extensions,encryption,openBrowser,chooseConnection,publish=()=>{},fetchImpl=fetch,protocol,attempt}){Object.assign(this,{database,extensions,encryption,openBrowser,chooseConnection,publish,fetchImpl,protocol,attempt});this.tail=Promise.resolve();this.logins=new Map();this.closed=false;this.epoch=0;}
 serial(fn){const p=this.tail.then(fn);this.tail=p.catch(()=>{});return p;}
 async read(){return await this.database.call('readSetting',{key:'authentication.extension-sessions.v1'})||[];}
 async save(rows){await this.database.call('writeSetting',{key:'authentication.extension-sessions.v1',value:rows});this.publish();}
 binding(context,resourceId){const item=this.extensions.items.find(i=>i.id===context.id);if(this.closed||!item||!item.enabled||!item.trusted||item.generation!==context.generation)throw failure('FORBIDDEN');const resource=item.manifest.authentication?.resources?.find(r=>r.id===resourceId);if(!resource)throw failure('FORBIDDEN');return {item,resource,fingerprint:digest([item.active,item.generation,resource])};}
 async connection(id){return (await this.database.call('authConnections')).connections.find(c=>c.id===id);}
 public(s){return {id:s.id,resourceId:s.resourceId,connectionId:s.connectionId,account:{id:s.identity.subject,name:s.identity.name},scopes:s.scopes,expiresAt:s.expiresAt};}
 async valid(context,s){if(!s||s.extensionId!==context.id)return false;try{const b=this.binding(context,s.resourceId),c=await this.connection(s.connectionId);return b.fingerprint===s.binding&&!!c&&digest(c)===s.connectionFingerprint;}catch{return false;}}
 async getSession(context,resourceId){this.binding(context,resourceId);for(const s of await this.read())if(s.resourceId===resourceId&&s.extensionId===context.id&&await this.valid(context,s)&&s.expiresAt>Date.now())return this.public(s);return null;}
 async requestSession(context,resourceId,invocation){
  if(!invocation||invocation.caller!=='page'||!invocation.owner)throw failure('INTERACTION_REQUIRED');
  const epoch=this.epoch;await invocation.validate?.();const binding=this.binding(context,resourceId),catalog=await this.database.call('authConnections');
  const connectionId=await this.chooseConnection(invocation.owner,{extensionName:this.extensions.displayName(binding.item),resource:{...binding.resource,title:this.extensions.localized?.(binding.item,binding.resource.title)||binding.resource.title},connections:catalog.connections,defaultId:catalog.defaultId});
  if(!connectionId)throw failure('CANCELLED');await invocation.validate?.();this.binding(context,resourceId);
  const selected=await this.connection(connectionId);if(!selected)throw failure('NOT_FOUND');
  const key=context.id+':'+resourceId;if(this.logins.has(key))throw failure('BUSY');
  const login=new LoginService({protocol:this.protocol,attempt:this.attempt,openBrowser:this.openBrowser,
   readConnection:async id=>{const c=await this.connection(id);return c?{...c,authorization:{resource:binding.resource.audience,scopes:binding.resource.scopes}}:null;},
   commit:({connection,verified})=>this.serial(async()=>{
    if(this.epoch!==epoch||invocation.signal?.aborted)throw failure('CANCELLED');await invocation.validate?.();const current=this.binding(context,resourceId),c=await this.connection(connection.id);
    if(current.fingerprint!==binding.fingerprint||!c||digest({...c,authorization:connection.authorization})!==digest(connection))throw failure('CONFLICT');
    if(!this.encryption?.isEncryptionAvailable())throw failure('STORAGE_UNAVAILABLE');
    const tokens=verified.tokens;if(typeof tokens.access_token!=='string'||!tokens.access_token||tokens.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw failure('INVALID_OUTPUT');
    const granted=typeof tokens.scope==='string'?tokens.scope.split(' '):connection.authorization.scopes;
    if(!binding.resource.scopes.every(scope=>granted.includes(scope)))throw failure('FORBIDDEN');
    const s={id:randomUUID(),extensionId:context.id,resourceId,connectionId:c.id,identity:verified.identity,scopes:binding.resource.scopes,binding:binding.fingerprint,connectionFingerprint:digest(c),expiresAt:Date.now()+tokens.expires_in*1000,secret:this.encryption.encryptString(JSON.stringify({access_token:tokens.access_token})).toString('base64')};
    const rows=await this.read();await this.save([...rows.filter(r=>r.extensionId!==context.id||r.resourceId!==resourceId),s]);return this.public(s);
   })});
  this.logins.set(key,login);const cancel=()=>login.cancel(connectionId);invocation.signal?.addEventListener('abort',cancel,{once:true});
  try{return await login.login(connectionId);}catch(e){if(e.code)throw e;if(String(e.message).includes('CANCEL'))throw failure('CANCELLED');throw failure('HOST_UNAVAILABLE');}finally{invocation.signal?.removeEventListener('abort',cancel);this.logins.delete(key);login.close();}
 }
 async disconnect(context,resourceId){this.epoch++;this.binding(context,resourceId);this.logins.get(context.id+':'+resourceId)?.close();return this.serial(async()=>{await this.save((await this.read()).filter(s=>s.extensionId!==context.id||s.resourceId!==resourceId));return null;});}
 async connectionsChanged(){this.epoch++;for(const login of this.logins.values())login.close();return this.serial(async()=>{const keep=[];for(const s of await this.read()){const c=await this.connection(s.connectionId);if(c&&digest(c)===s.connectionFingerprint)keep.push(s);}await this.save(keep);});}
 async list(){const result=[];for(const s of await this.read()){const item=this.extensions.items.find(i=>i.id===s.extensionId);if(item&&await this.valid({id:item.id,generation:item.generation},s))result.push({...this.public(s),extensionId:s.extensionId,extensionName:this.extensions.displayName(item)});}return result;}
 async remove(id){this.epoch++;for(const login of this.logins.values())login.close();return this.serial(async()=>{await this.save((await this.read()).filter(s=>s.id!==id));return null;});}
 async request(context,input){
  if(!input||typeof input.sessionId!=='string'||typeof input.path!=='string'||!input.path.startsWith('/')||input.path.startsWith('//')||input.path.includes('\\')||input.path.includes('#')||input.path.length>4096)throw failure('INVALID_ARGUMENT');
  let decoded;try{decoded=decodeURIComponent(input.path.split('?')[0]);}catch{throw failure('INVALID_ARGUMENT');}if(decoded.includes('\\')||decoded.split('/').some(v=>v==='.'||v==='..')||/%(?:2f|5c|2e|25)/i.test(input.path.split('?')[0]))throw failure('INVALID_ARGUMENT');
  const s=(await this.read()).find(s=>s.id===input.sessionId);if(!await this.valid(context,s))throw failure('FORBIDDEN');if(s.expiresAt<=Date.now())throw failure('INTERACTION_REQUIRED');
  const {resource}=this.binding(context,s.resourceId),base=new URL(resource.baseUrl),url=new URL(input.path.slice(1),base);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.username||url.password)throw failure('FORBIDDEN');
  const method=input.method||'GET';if(!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(method)||input.body!==undefined&&(typeof input.body!=='string'||Buffer.byteLength(input.body)>256*1024)||['GET','HEAD'].includes(method)&&input.body!==undefined)throw failure('INVALID_ARGUMENT');
  if(!this.encryption?.isEncryptionAvailable())throw failure('STORAGE_UNAVAILABLE');
  const tokens=JSON.parse(this.encryption.decryptString(Buffer.from(s.secret,'base64')));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await this.fetchImpl(url,{method,body:input.body,headers:{authorization:'Bearer '+tokens.access_token,accept:'application/json',...(input.body!==undefined?{'content-type':'application/json'}:{})},redirect:'error',credentials:'omit',signal:controller.signal});
   if(response.status>=300&&response.status<400)throw failure('FORBIDDEN');
   const chunks=[];let size=0;for await(const chunk of response.body||[]){size+=chunk.length;if(size>1024*1024){controller.abort();throw failure('QUOTA_EXCEEDED');}chunks.push(Buffer.from(chunk));}
   // Revocation/config changes during the request suppress its response. Remote
   // side effects cannot be undone and must be reconciled by the extension.
   const current=(await this.read()).find(row=>row.id===s.id);if(!await this.valid(context,current))throw failure('FORBIDDEN');
   if(response.status===401){await this.remove(s.id);throw failure('INTERACTION_REQUIRED');}
   return {status:response.status,body:Buffer.concat(chunks).toString('utf8'),contentType:response.headers.get('content-type')||''};
  }catch(e){if(e.code&&['FORBIDDEN','INTERACTION_REQUIRED','QUOTA_EXCEEDED'].includes(e.code))throw e;throw failure(controller.signal.aborted?'TIMEOUT':'HOST_UNAVAILABLE');}finally{clearTimeout(timer);}
 }
 async forExtension(context,method,input={}){if(method==='getSession')return this.getSession(context,input.resourceId);if(method==='disconnect')return this.disconnect(context,input.resourceId);if(method==='request')return this.request(context,input);throw failure('UNSUPPORTED');}
 close(){this.epoch++;this.closed=true;for(const login of this.logins.values())login.close();}
}
module.exports={ExtensionAuthentication};
