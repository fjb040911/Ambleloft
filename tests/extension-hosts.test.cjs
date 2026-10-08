const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {fork}=require('node:child_process');const {EventEmitter}=require('node:events');
const {Database}=require('../electron/database.cjs');const {ExtensionService}=require('../core/extensions/service.cjs');const {HostManager}=require('../core/extensions/hosts.cjs');const {environment}=require('../electron/extensions/process-adapter.cjs');
const schema={type:'object',properties:{value:{type:'string'}},additionalProperties:false};
function manifest(name='host'){return {specVersion:'1.0-draft',publisher:'fixture',name,version:'1.0.0',displayName:'Host fixture',engines:{api:'1'},main:'main.cjs',permissions:[{capability:'storage',scope:'self'}],operations:[{id:`fixture.${name}.echo`,title:'Echo',description:'Echo fixture',handler:'echo',exposeTo:['page'],effect:'read',projectScoped:false,inputSchema:schema,outputSchema:schema}]};}
const code=`exports.activate=ctx=>{ctx.operations.register('echo',async(input,c)=>{if(input.value==='wait')return new Promise(resolve=>setTimeout(()=>resolve({value:'late'}),300));if(input.value==='hang')return new Promise(()=>{});if(input.value==='abort')return new Promise(resolve=>c.signal.addEventListener('abort',()=>resolve({value:'aborted'})));if(input.value==='crash')process.exit(2);if(input.value==='store'){const item=await ctx.storage.get('key');await ctx.storage.set('key','saved',item?.revision??null);return {value:(await ctx.storage.get('key')).value};}if(input.value==='invalid')return {wrong:true};return {value:input.value||String(process.pid)};});};`;
async function fixture(t,{source=code,name='host',limits={},startup=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-a4-')),db=new Database(root);await db.call('ready');const service=new ExtensionService(db,{directory:root});await service.initialize();
 const children=[];const adapter={spawn(directory){const child=fork(path.join(__dirname,'../core/extensions/bootstrap.cjs'),[],{cwd:directory,env:environment(),execArgv:[],stdio:['ignore','pipe','pipe','ipc']});children.push(child);const channel=new EventEmitter();channel.send=m=>child.send(m);channel.kill=()=>child.kill('SIGKILL');child.on('message',m=>channel.emit('message',m));child.on('exit',c=>channel.emit('exit',c));child.on('error',e=>channel.emit('error',e));child.stdout.on('data',d=>channel.emit('log',d));child.stderr.on('data',d=>channel.emit('log',d));return channel;}};
 const hosts=new HostManager({service,adapter,limits:{activation:1000,deactivation:80,heartbeat:100,stable:5000,retry:[],...limits}});service.attachHosts(hosts);
 t.after(async()=>{await service.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 const dir=path.join(root,'source');await fs.mkdir(dir);const m=manifest(name);if(startup)m.activationEvents=['onStartupFinished'];await fs.writeFile(path.join(dir,'extension.json'),JSON.stringify(m));await fs.writeFile(path.join(dir,'main.cjs'),source);await service.installPackage(dir,'directory',async()=>true);
 return {root,dir,db,service,hosts,children,id:'fixture.'+name};
}
async function until(predicate,timeout=4000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw Error('condition timeout');await new Promise(r=>setTimeout(r,10));}}
test('activation deduplicates, validates handlers, calls bundled dependency and keeps environment allowlisted',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.dir,'node_modules','fixture'),{recursive:true});await fs.writeFile(path.join(f.dir,'node_modules','fixture','index.js'),'module.exports="bundled"');await fs.writeFile(path.join(f.dir,'main.cjs'),`exports.activate=c=>c.operations.register('echo',async()=>({value:require('fixture')}));`);await f.service.installPackage(f.dir,'directory',async()=>true);
 await Promise.all(Array.from({length:8},()=>f.hosts.activate(f.id)));assert.equal(f.children.length,1);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'bundled'});
 assert.deepEqual(environment({PATH:'/danger',NODE_OPTIONS:'--require attacker',OPENAI_API_KEY:'secret',HTTP_PROXY:'proxy',LANG:'en'}),{LANG:'en',HTTP_PROXY:'proxy'});
 await f.service.setEnabled(f.id,false);assert.equal(f.hosts.snapshot(f.id).state,'stopped');await assert.rejects(f.hosts.activate(f.id),/停用/);
});
test('private storage crosses the bound host channel and revoke stops the generation',async t=>{
 const f=await fixture(t);await f.service.setGrants(f.id,[{capability:'storage',resource:'self'}]);await f.hosts.activate(f.id);
 assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{value:'store'}),{value:'saved'});await f.service.setGrants(f.id,[]);assert.equal(f.hosts.snapshot(f.id).state,'stopped');
 await f.hosts.activate(f.id);await assert.rejects(f.hosts.invoke(f.id,f.id+'.echo',{value:'store'}),e=>e.code==='FORBIDDEN'&&e.effectStatus==='unknown');
});
test('cancelled running calls retain capacity, queued calls cancel before start, late results cannot settle twice',async t=>{
 const f=await fixture(t,{limits:{concurrency:1,queue:1}});await f.hosts.activate(f.id);
 const first=f.hosts.invoke(f.id,f.id+'.echo',{value:'wait'},{timeout:180});const rejected=assert.rejects(first,e=>e.code==='TIMEOUT'&&e.effectStatus==='unknown');await until(()=>f.hosts.snapshot(f.id).activeCalls===1);
 const controller=new AbortController();const next=f.hosts.invoke(f.id,f.id+'.echo',{}, {signal:controller.signal});const cancelled=assert.rejects(next,e=>e.code==='CANCELLED'&&e.effectStatus==='notStarted');await until(()=>f.hosts.snapshot(f.id).queuedCalls===1);
 await assert.rejects(f.hosts.invoke(f.id,f.id+'.echo',{}),e=>e.code==='BUSY');controller.abort();await cancelled;await rejected;assert.equal(f.hosts.snapshot(f.id).activeCalls,1);
 await until(()=>f.hosts.snapshot(f.id).activeCalls===0);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{value:'ok'}),{value:'ok'});
});
test('bad activation pauses; crashes isolate other extensions and bounded recovery eventually pauses',async t=>{
 const bad=await fixture(t,{source:'exports.activate=()=>{};'});await assert.rejects(bad.hosts.activate(bad.id));await until(()=>bad.hosts.snapshot(bad.id).state==='paused');
 const f=await fixture(t,{name:'crasher',source:`exports.activate=()=>process.exit(2);`,limits:{retry:[10,20]}});await assert.rejects(f.hosts.activate(f.id));await until(()=>f.hosts.snapshot(f.id).state==='paused');assert.equal(f.children.length,3);
 const good=await fixture(t,{name:'healthy'});await good.hosts.activate(good.id);assert.deepEqual(await good.hosts.invoke(good.id,good.id+'.echo',{value:'alive'}),{value:'alive'});
});
test('hung activation and event-loop blocking handler are terminated; stop forces uncooperative deactivate',async t=>{
 const hung=await fixture(t,{source:'exports.activate=()=>new Promise(()=>{});',limits:{activation:100}});await assert.rejects(hung.hosts.activate(hung.id));await until(()=>hung.hosts.snapshot(hung.id).state==='paused');
 const blocked=await fixture(t,{source:`exports.activate=c=>c.operations.register('echo',()=>{while(true){}});`,limits:{heartbeat:30,missedHeartbeats:2}});await blocked.hosts.activate(blocked.id);await assert.rejects(blocked.hosts.invoke(blocked.id,blocked.id+'.echo',{}),e=>e.code==='HOST_UNAVAILABLE');
 const stubborn=await fixture(t,{source:code+';exports.deactivate=()=>new Promise(()=>{});'});await stubborn.hosts.activate(stubborn.id);await stubborn.service.setEnabled(stubborn.id,false);assert.equal(stubborn.hosts.snapshot(stubborn.id).state,'stopped');assert.notEqual(stubborn.children[0].signalCode,null);
});
test('running update cancels old calls, keeps one process and starts the exact new revision',async t=>{
 const f=await fixture(t,{startup:true});await until(()=>f.hosts.snapshot(f.id).state==='active');const call=f.hosts.invoke(f.id,f.id+'.echo',{value:'hang'});const rejected=assert.rejects(call,e=>e.code==='CANCELLED');await until(()=>f.hosts.snapshot(f.id).activeCalls===1);
 await fs.writeFile(path.join(f.dir,'main.cjs'),`exports.activate=c=>c.operations.register('echo',async()=>({value:'new'}));`);await f.service.installPackage(f.dir,'directory',async()=>true);await rejected;await until(()=>f.hosts.snapshot(f.id).state==='active');
 assert.notEqual(f.children[0].exitCode,null);assert.equal(f.children.length,2);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'new'});
});
test('input/output schema errors are distinct and pre-aborted invocations do not run',async t=>{
 const f=await fixture(t);await assert.rejects(f.hosts.invoke(f.id,f.id+'.echo',{value:42}),e=>e.code==='INVALID_ARGUMENT');await assert.rejects(f.hosts.invoke(f.id,f.id+'.echo',{value:'invalid'}),e=>e.code==='INVALID_OUTPUT'&&e.effectStatus==='unknown');
 await assert.rejects(f.hosts.invoke(f.id,f.id+'.echo',{}, {signal:AbortSignal.abort()}),e=>e.code==='CANCELLED'&&e.effectStatus==='notStarted');
});
test('same profile isolates extension processes and rejects a late registration after await',async t=>{
 const f=await fixture(t);await f.hosts.activate(f.id);const pid=f.children[0].pid;
 const dir=path.join(f.root,'second');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'extension.json'),JSON.stringify(manifest('second')));await fs.writeFile(path.join(dir,'main.cjs'),`exports.activate=async c=>{await Promise.resolve();c.operations.register('echo',async()=>({}));};`);
 await f.service.installPackage(dir,'directory',async()=>true);await assert.rejects(f.hosts.activate('fixture.second'));await until(()=>f.hosts.snapshot('fixture.second').state==='paused');assert.equal(f.hosts.snapshot(f.id).state,'active');assert.equal(f.children[0].pid,pid);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{value:'alive'}),{value:'alive'});
});
test('stopping activation prevents late readiness, and manual recovery can start after re-enable',async t=>{
 const f=await fixture(t,{source:`exports.activate=async c=>{c.operations.register('echo',async()=>({value:'ok'}));await new Promise(r=>setTimeout(r,200));};`});
 const activation=f.hosts.activate(f.id);const rejected=assert.rejects(activation,e=>e.code==='CANCELLED');await until(()=>f.children.length===1);await f.service.setEnabled(f.id,false);await rejected;assert.equal(f.hosts.snapshot(f.id).state,'stopped');
 await f.service.setEnabled(f.id,true);await f.service.startHost(f.id);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'ok'});
});
test('configuration events and JSON null storage use the process bridge without exposing write config',async t=>{
 const f=await fixture(t,{source:`exports.activate=c=>{let changed='initial';c.configuration.onDidChange(v=>{changed=v.server;});c.operations.register('echo',async input=>{if(input.value==='null'){await c.storage.set('null',null,null);return {value:JSON.stringify(await c.storage.get('null'))};}return {value:changed};});};`});
 const m=manifest();m.permissions.push({capability:'configuration',scope:'self'});m.configuration={type:'object',properties:{server:{type:'string'}},required:['server'],additionalProperties:false};await fs.writeFile(path.join(f.dir,'extension.json'),JSON.stringify(m));await f.service.installPackage(f.dir,'directory',async()=>true);
 await f.service.setGrants(f.id,[{capability:'storage',resource:'self'},{capability:'configuration',resource:'self'}]);await f.hosts.activate(f.id);
 assert.deepEqual(JSON.parse((await f.hosts.invoke(f.id,f.id+'.echo',{value:'null'})).value),{value:null,revision:1});
 await f.service.storage({id:f.id,generation:f.service.items[0].generation},'settings',{kind:'configuration',write:true,value:{server:'updated'},expectedRevision:0});assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'updated'});
});
test('SDK storage treats JSON null as a value and allows create-only after deletion without resetting revisions',async t=>{
 const f=await fixture(t,{source:`exports.activate=c=>{c.operations.register('echo',async()=>{const a=await c.storage.set('item',null,null);const stored=await c.storage.get('item');await c.storage.delete('item',a);const absent=await c.storage.get('item');const b=await c.storage.set('item','new',null);let conflict=false;try{await c.storage.set('item','stale',a);}catch(e){conflict=e.code==='CONFLICT';}return {value:JSON.stringify({a,stored,absent,b,conflict})};});};`});await f.service.setGrants(f.id,[{capability:'storage',resource:'self'}]);const result=JSON.parse((await f.hosts.invoke(f.id,f.id+'.echo',{})).value);assert.deepEqual(result,{a:1,stored:{value:null,revision:1},absent:null,b:3,conflict:true});
});
test('message publication crosses real extension process and preserves host-bound identity',async t=>{
 const f=await fixture(t,{source:`exports.activate=c=>c.operations.register('echo',async()=>{const r=await c.messages.publish({eventKey:'ready',title:'Ready',body:'From isolated host',category:'notice'});return {value:r.status};});`});
 f.service.messages=new (require('../core/extensions/message-service.cjs').MessageService)(f.db);
 await f.hosts.activate(f.id);assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'published'});
 const list=await f.service.messages.list();assert.equal(list.items.length,1);assert.equal(list.items[0].source,'extension:'+f.id);
 await f.service.messages.setPreferences({source:'extension:'+f.id,preferences:{receive:false,muted:false}});
 assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'duplicate'});
});
test('message conflicts retain structured code across database and extension RPC',async t=>{
 const f=await fixture(t,{source:`exports.activate=c=>c.operations.register('echo',async()=>{const r=await c.messages.publish({eventKey:'conflict',title:'Title',body:'Original',category:'notice'});await c.messages.update(r.id,{body:'Saved'},1);try{await c.messages.update(r.id,{body:'Stale'},1);}catch(e){return {value:e.code};}return {value:'unexpected'};});`});
 f.service.messages=new (require('../core/extensions/message-service.cjs').MessageService)(f.db);
 assert.deepEqual(await f.hosts.invoke(f.id,f.id+'.echo',{}),{value:'CONFLICT'});assert.equal((await f.service.messages.list()).items[0].body,'Saved');
});
test('real backend preserves only public error codes through router; effects remain host-owned',async t=>{
 const source=`let calls=0;exports.activate=ctx=>ctx.operations.register('echo',async(input,c)=>{if(input.value==='probe')return {value:String(calls)+':'+String(c.form)};calls++;if(input.value==='resource')return c.resources.getProjectPath('p');if(input.value==='UNSUPPORTED'&&!c.form)throw Object.assign(Error('private-token'),{code:'UNSUPPORTED',effectStatus:'notStarted',details:{token:'private-token'}});if(input.value==='getter')throw {get code(){throw Error('private-token')}};if(input.value==='text')throw Error('FORBIDDEN: private-token');throw Object.assign(Error('private-token'),{code:input.value,effectStatus:'completed',stack:'private-token',input:{token:'private-token'}});});`;
 const f=await fixture(t,{source});const {OperationRouter}=require('../core/extensions/operations.cjs');const router=new OperationRouter({service:f.service,workspace:{read:async()=>({projects:[]})},confirm:async()=>({cancel:false})});const invoke=value=>router.invoke(f.id+'.echo',{value},{caller:'page'});
 assert.deepEqual(await invoke('probe'),{ok:true,value:{value:'0:undefined'}});
 for(const code of ['UNSUPPORTED','OUTCOME_UNKNOWN','FORBIDDEN','STORAGE_UNAVAILABLE','GRANT_REQUIRED','INTERACTION_REQUIRED','INVALID_OUTPUT','ACTIVATION_FAILED','CANCELLED']){const r=await invoke(code);assert.equal(r.error.code,code);assert.equal(r.error.effectStatus,'unknown');assert.equal(JSON.stringify(r).includes('private-token'),false);}
 const denied=await invoke('resource');assert.equal(denied.error.code,'FORBIDDEN');assert.equal(denied.error.effectStatus,'unknown');
 for(const value of ['unknown-code','getter','text']){const r=await invoke(value);assert.equal(r.error.code,'INTERNAL');assert.equal(r.error.message,'Operation failed');assert.equal(JSON.stringify(r).includes('private-token'),false);}
 assert.equal((await invoke('probe')).value.value,'13:undefined','one execution per call; no automatic replay');
});
test('real extension process completes notification action and enterprise authentication resource bridge',async t=>{
 const f=await fixture(t);const {MessageService}=require('../core/extensions/message-service.cjs');const {OperationRouter}=require('../core/extensions/operations.cjs');const {ExtensionAuthentication}=require('../core/auth/extension-auth.cjs');
 const messages=new MessageService(f.db);f.service.messages=messages;
 await f.service.installPackage(path.resolve(__dirname,'../examples/extensions/notification-auth'),'directory',async()=>true);
 await f.db.call('authConnections',{action:'save',expectedRevision:0,value:{name:'Fixture enterprise',issuer:'https://identity.example/',clientId:'desktop'}});
 const connection=(await f.db.call('authConnections')).connections[0];let requests=0;
 f.service.authentication=new ExtensionAuthentication({database:f.db,extensions:f.service,encryption:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},openBrowser:async()=>{},chooseConnection:async()=>connection.id,attempt:async()=>({result:Promise.resolve({status:'callback'}),cancel(){}}),protocol:{discover:async()=>({}),authorizationURL:()=>new URL('https://identity.example/login'),exchange:async()=>({identity:{subject:'alice',name:'Alice'},tokens:{access_token:'private-token',token_type:'Bearer',expires_in:600,scope:'tasks.read'}})},fetchImpl:async(_url,options)=>{assert.equal(options.headers.authorization,'Bearer private-token');requests++;return Response.json({tasks:[]});}});
 const router=new OperationRouter({service:f.service,workspace:{read:async()=>({projects:[]})},confirm:async()=>({})});messages.router=router;t.after(()=>{messages.close();f.service.authentication.close();});
 const context={caller:'page',owner:{}},prefix='example.notification-auth.';
 const connected=await router.invoke(prefix+'connect',{},context);assert.equal(connected.ok,true,JSON.stringify(connected));assert.match(connected.value.message,/Alice/);assert.equal(JSON.stringify(connected).includes('private-token'),false);
 const request=await router.invoke(prefix+'request',{},context);assert.equal(request.ok,true);assert.equal(requests,1);
 const published=await router.invoke(prefix+'publish',{},context);assert.equal(published.ok,true,JSON.stringify(published));const message=(await messages.list()).items.find(m=>m.source==='extension:example.notification-auth');
 const result=await messages.execute({messageId:message.id,actionId:'complete',expectedRevision:message.revision},{});assert.equal(result.ok,true,JSON.stringify(result));
 const after=(await messages.list()).items.find(m=>m.id===message.id);assert.equal(after.businessState,'resolved');assert.equal(after.executions[0].state,'completed');
 await assert.rejects(messages.execute({messageId:message.id,actionId:'complete',expectedRevision:after.revision},{}),/FORBIDDEN/);
});
