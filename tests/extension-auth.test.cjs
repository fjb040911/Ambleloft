const {test}=require('node:test');const assert=require('node:assert/strict');
const {ExtensionAuthentication}=require('../core/auth/extension-auth.cjs');
function fixture(){
 let rows=[],connections=[{id:'enterprise',name:'Enterprise',issuer:'https://id.example/',clientId:'desktop',tenant:''}],calls=[];
 const resource={id:'pm',title:'PM',baseUrl:'https://pm.example/api/',audience:'https://pm.example/',scopes:['tasks.read']};
 const item={id:'demo.pm',enabled:true,trusted:true,generation:1,active:'digest',manifest:{authentication:{resources:[resource]}}};
 const database={call:async(method,input)=>method==='authConnections'?{connections}:method==='readSetting'?structuredClone(rows):(rows=structuredClone(input.value))};
 const broker=new ExtensionAuthentication({database,extensions:{items:[item],displayName:i=>i.id},encryption:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)},openBrowser:async()=>{},chooseConnection:async()=>connections[0].id,attempt:async()=>({result:Promise.resolve({status:'callback'}),cancel(){}}),protocol:{discover:async connection=>({connection}),authorizationURL:()=>new URL('https://id.example/authorize'),exchange:async()=>({identity:{subject:'user',name:'Alice',issuer:'https://id.example/'},tokens:{access_token:'secret-access',token_type:'Bearer',expires_in:300,scope:'tasks.read'}})},fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return Response.json({ok:true});}});
 const context={id:item.id,generation:1},invocation={caller:'page',owner:{},validate:async()=>{}};
 return {broker,context,invocation,item,calls,rows:()=>rows,changeConnection:()=>{connections[0].clientId='changed';}};
}
test('interactive enterprise grant produces opaque session and HTTPS requests stay resource-bound',async()=>{
 const f=fixture();assert.equal(await f.broker.getSession(f.context,'pm'),null);
 await assert.rejects(f.broker.requestSession(f.context,'pm',{caller:'agent'}),{code:'INTERACTION_REQUIRED'});
 const session=await f.broker.requestSession(f.context,'pm',f.invocation);assert.equal(JSON.stringify(session).includes('secret-access'),false);assert.equal(session.account.name,'Alice');assert.equal(f.rows()[0].secret.includes('secret-access'),false);
 assert.equal((await f.broker.request(f.context,{sessionId:session.id,path:'/tasks'})).status,200);assert.equal(f.calls[0].url,'https://pm.example/api/tasks');assert.equal(f.calls[0].options.headers.authorization,'Bearer secret-access');assert.equal(f.calls[0].options.redirect,'error');
 for(const path of ['//evil.example/a','/../admin','/%2e%2e/admin','/%252e%252e/admin','/a\\b'])await assert.rejects(f.broker.request(f.context,{sessionId:session.id,path}));
 await assert.rejects(f.broker.request({id:'other',generation:1},{sessionId:session.id,path:'/tasks'}),{code:'FORBIDDEN'});
 f.changeConnection();assert.equal(await f.broker.getSession(f.context,'pm'),null);await assert.rejects(f.broker.request(f.context,{sessionId:session.id,path:'/tasks'}),{code:'FORBIDDEN'});
});
test('revocation during HTTP suppresses response, cannot leak tokens through network error',async()=>{
 const f=fixture(),session=await f.broker.requestSession(f.context,'pm',f.invocation);let release;
 f.broker.fetchImpl=()=>new Promise(resolve=>{release=resolve;});const request=f.broker.request(f.context,{sessionId:session.id,path:'/tasks'});
 while(!release)await new Promise(resolve=>setImmediate(resolve));await f.broker.disconnect(f.context,'pm');release(Response.json({private:true}));await assert.rejects(request,{code:'FORBIDDEN'});
 const next=await f.broker.requestSession(f.context,'pm',f.invocation);f.broker.fetchImpl=()=>{throw Error('secret-access');};await assert.rejects(f.broker.request(f.context,{sessionId:next.id,path:'/tasks'}),e=>e.code==='HOST_UNAVAILABLE'&&!e.message.includes('secret-access'));
});
test('missing secure storage and missing scopes cannot commit; update invalidates session',async()=>{
 const f=fixture();f.broker.encryption.isEncryptionAvailable=()=>false;await assert.rejects(f.broker.requestSession(f.context,'pm',f.invocation),{code:'STORAGE_UNAVAILABLE'});assert.equal(f.rows().length,0);
 f.broker.encryption.isEncryptionAvailable=()=>true;await f.broker.requestSession(f.context,'pm',f.invocation);f.item.active='new-digest';assert.equal(await f.broker.getSession(f.context,'pm'),null);
});
