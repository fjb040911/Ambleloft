// Runs only in the dedicated extension process. The package never enters the app process.
const {pathToFileURL}=require('node:url');const path=require('node:path');
const port=process.parentPort;const send=message=>port?port.postMessage(message):process.send?.(message);
const listen=callback=>port?port.on('message',event=>callback(event.data)):process.on('message',callback);
const L=require('../localization/index.cjs');let dictionaries={},locale='en';const localeListeners=new Set();
let token,initialized=false,active=false,registering=false,moduleExports,context;const handlers=new Map(),calls=new Map(),pending=new Map(),configurationListeners=new Set(),authenticationListeners=new Set();let sequence=0;
function rpc(method,params){if(!initialized)return Promise.reject(Error('HOST_UNAVAILABLE'));if(pending.size>=32)return Promise.reject(Error('BUSY'));return new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('TIMEOUT'));},method==='resource'&&params.method==='requestSession'?125000:30000);pending.set(id,{resolve,reject,timer});send({type:'rpc',token,id,method,params});});}
async function initialize(m){
 token=m.token;initialized=true;const expected=new Set([...(m.manifest.operations||[]),...(m.manifest.hooks||[])].map(o=>o.handler));
 const storage=(key,options={})=>rpc('storage',{kind:'kv',key,...options});
 const secret=(key,options={})=>rpc('storage',{kind:'secret',key,...options});
 dictionaries=m.dictionaries||{};locale=L.canonical(m.locale||'en');
 context={capabilities:Object.freeze({notificationLocalization:1,liveLocalization:1,skillLocalization:1,templateLocalization:1}),extensionId:m.id,packageRevision:m.revision,subscriptions:[],
  operations:{register(name,callback){if(!registering||!expected.has(name)||handlers.has(name)||typeof callback!=='function')throw Error('Invalid handler registration');handlers.set(name,callback);return {dispose(){if(active)throw Error('Handlers are bound for this generation');handlers.delete(name);}};}},
  hooks:{register(name,callback){if(!(m.manifest.hooks||[]).some(h=>h.handler===name))throw Error('Undeclared hook');return context.operations.register(name,async(event,invocation)=>{await callback(event,invocation);return null;});}},
  conversations:{getTurn:input=>rpc('automation',{method:'getTurn',input})},
  jobs:{submit:input=>rpc('automation',{method:'submit',input}),get:id=>rpc('automation',{method:'getJob',input:{id}})},
  storage:{async get(key){const item=await storage(key);return item.exists?{value:item.value,revision:item.revision}:null;},async set(key,value,expectedRevision){return (await storage(key,{write:true,value,expectedRevision})).revision;},async delete(key,expectedRevision){await storage(key,{write:true,value:null,remove:true,expectedRevision});}},
  secrets:{async get(key){return (await secret(key)).value;},async set(key,value){const prior=await secret(key);await secret(key,{write:true,value,expectedRevision:prior.revision});},async delete(key){const prior=await secret(key);await secret(key,{write:true,value:null,remove:true,expectedRevision:prior.revision});}},
  authentication:{onDidChangeSessions:listener=>{authenticationListeners.add(listener);return {dispose:()=>authenticationListeners.delete(listener)};},getSession:resourceId=>rpc('authentication',{method:'getSession',input:{resourceId}}),disconnect:resourceId=>rpc('authentication',{method:'disconnect',input:{resourceId}}),request:input=>rpc('authentication',{method:'request',input})},
  messages:{listActionInvocations:()=>rpc('messages',{method:'listActionInvocations',input:{}}),reportActionResult:input=>rpc('messages',{method:'reportActionResult',input}),publish:input=>rpc('messages',{method:'publish',input}),getByEventKey:eventKey=>rpc('messages',{method:'getByEventKey',input:{eventKey}}),update:(id,patch,expectedRevision)=>rpc('messages',{method:'update',input:{id,patch,expectedRevision}}),withdraw:(id,expectedRevision)=>rpc('messages',{method:'withdraw',input:{id,expectedRevision}}),getPreferences:()=>rpc('messages',{method:'getPreferences',input:{}})},
  configuration:{async get(){return (await rpc('storage',{kind:'configuration',key:'settings'})).value||{};},onDidChange(listener){if(typeof listener!=='function')throw Error('Invalid listener');configurationListeners.add(listener);return {dispose(){configurationListeners.delete(listener);}};}},
  context:{set(key,value){return rpc('context',{key,value});}},
  l10n:{get locale(){return locale;},onDidChangeLocale(listener){if(typeof listener!=='function')throw Error('Invalid listener');localeListeners.add(listener);return {dispose:()=>localeListeners.delete(listener)};},t(key,args={}){return Object.hasOwn(dictionaries.default||{},key)?L.format(dictionaries,key,args,locale):key;}}
 };
 try{
  const namespace=await import(pathToFileURL(path.join(m.directory,m.manifest.main)).href);moduleExports=typeof namespace.activate==='function'?namespace:namespace.default;
  if(typeof moduleExports?.activate!=='function')throw Error('activate export required');
  registering=true;const activation=moduleExports.activate(context);registering=false;await activation;
  if(handlers.size!==expected.size||![...expected].every(name=>handlers.has(name)))throw Error('Missing handlers');
  active=true;send({type:'ready',token,handlers:[...handlers.keys()]});
 }catch(error){registering=false;console.error('Extension activation failed:',error?.stack||error);send({type:'activationError',token});}
}
listen(async m=>{
 if(!m||typeof m!=='object')return;if(m.type==='initialize'){if(!initialized)await initialize(m);return;}if(!initialized||m.token!==token)return;
 if(m.type==='localeChanged'){locale=L.canonical(m.locale);for(const listener of localeListeners)try{listener(locale);}catch{}return;}
 if(m.type==='ping'){send({type:'pong',token});return;}
 if(m.type==='rpcResult'){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Object.assign(Error(m.error),{code:m.error})):p.resolve(m.value);}return;}
 if(m.type==='authenticationChanged'){for(const listener of authenticationListeners)try{listener();}catch{}return;}
 if(m.type==='configurationChanged'){for(const listener of configurationListeners)try{listener(m.value);}catch{}return;}
 if(m.type==='cancel'){calls.get(m.id)?.abort();return;}
 if(m.type==='invoke'&&active){const handler=handlers.get(m.handler);if(!handler||calls.has(m.id))return;const abort=new AbortController();calls.set(m.id,abort);
  try{const value=await handler(m.input,{requestId:m.id,locale:m.locale||locale,...(m.form?{form:m.form}:{}),...(m.message?{message:m.message}:{}),caller:m.caller,projectId:m.projectId,signal:abort.signal,authentication:{requestSession:resourceId=>rpc('resource',{invocationId:m.id,method:'requestSession',input:{resourceId}})},resources:{getProject:projectId=>rpc('resource',{invocationId:m.id,method:'getProject',input:{projectId}}),getProjectPath:projectId=>rpc('resource',{invocationId:m.id,method:'getProjectPath',input:{projectId}}),createConversation:input=>rpc('resource',{invocationId:m.id,method:'createConversation',input}),openConversation:conversationId=>rpc('resource',{invocationId:m.id,method:'openConversation',input:{conversationId}})}});
   const encoded=JSON.stringify(value);if(!encoded||Buffer.byteLength(encoded)>256*1024)throw Error('Output limit');send({type:'result',token,id:m.id,value});
  }catch(error){send({type:'result',token,id:m.id,error:{code:require('./errors.cjs').publicCode(error)}});}finally{calls.delete(m.id);}return;
 }
 if(m.type==='shutdown'){
  active=false;localeListeners.clear();for(const c of calls.values())c.abort();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CANCELLED'));}pending.clear();
  try{await moduleExports?.deactivate?.();}catch{}
  for(const disposable of context?.subscriptions||[])try{await disposable.dispose();}catch{}
  process.exit(0);
 }
});
if(!port)process.on('disconnect',()=>process.exit(0));
