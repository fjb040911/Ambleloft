const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {SshService,validateConnection,quote}=require('../core/ssh/service.cjs');
const {createRemoteTools}=require('../core/ssh/agent-tools.cjs');
const {configurationArgs}=require('../electron/codex-rpc.cjs');
const base={host:'example.test',port:22,username:'developer',authType:'password'};
function setup(){
 const settings=new Map(),secrets=new Map(),clients=[];let prompts=0;
 class Client extends EventEmitter{connect(config){this.config=config;queueMicrotask(()=>config.hostVerifier(Buffer.from('host-key'),allowed=>{if(allowed)this.emit('ready');else{this.emit('error',Object.assign(Error('key rejected'),{level:'handshake'}));this.emit('close');}}));}end(){this.emit('close');}}
 const ssh=new SshService({database:{call:async(method,{key,value})=>{if(method==='readSetting')return settings.get(key);settings.set(key,structuredClone(value));}},encryption:{isEncryptionAvailable:()=>true,encryptString:value=>{const id='encrypted-'+secrets.size;secrets.set(id,value);return Buffer.from(id);},decryptString:value=>secrets.get(value.toString())},confirmHost:async()=>{prompts++;return true;},clientFactory:()=>{const c=new Client();clients.push(c);return c;}});
 return {ssh,settings,clients,prompts:()=>prompts};
}
test('credentials never appear in connection listings or plaintext persisted settings',async()=>{
 const {ssh,settings}=setup();const a=await ssh.save({...base,password:'sensitive-test-password'});
 assert.equal(JSON.stringify([...settings]).includes('sensitive-test-password'),false);assert.equal(JSON.stringify(await ssh.list()).includes('sensitive-test-password'),false);
 await ssh.save({...base,id:a.id,password:'different-secret',remember:true});assert.equal(JSON.stringify([...settings]).includes('different-secret'),false);
 ssh.secrets.clear();await ssh.connect(a.id);assert.equal(ssh.clients.get(a.id).config.password,'different-secret');ssh.shutdown();
});
test('host identity is pinned and a changed host key is rejected before authentication',async()=>{
 const {ssh,settings,prompts}=setup();const a=await ssh.save({...base,password:'test'});const first=await ssh.connect(a.id);assert.equal(prompts(),1);assert.equal(await ssh.connect(a.id),first);
 ssh.disconnect(a.id);await ssh.connect(a.id);assert.equal(prompts(),1);ssh.disconnect(a.id);
 settings.set('sshHost:'+JSON.stringify([base.host,base.port]),'SHA256:different');await assert.rejects(ssh.connect(a.id),/指纹/);assert.equal(prompts(),1);ssh.shutdown();
});
test('invalid connection fields and shell quoting cannot inject local or remote commands',()=>{
 for(const input of [{...base,port:0},{...base,host:'host\ncommand'},{...base,authType:'invalid'},{...base,username:'a\0b'}])assert.throws(()=>validateConnection(input));
 assert.equal(quote("a'b;$(touch /tmp/no)"),"'a'\\''b;$(touch /tmp/no)'");
});
test('remote agent writes and exec require host approval; rejection and cancellation do not execute',async()=>{
 const project={id:'p',type:'ssh',connectionId:'c',path:'/work'};let executed=0;
 const runtime={workspace:{read:async()=>({projects:[project]})},ssh:{list:async()=>[{id:'c',host:'example.test',username:'dev',port:22}],execute:async()=>{executed++;return {exitCode:0};}},changed:()=>{},remoteFiles:{}};
 const context={run:{id:'r',permission:'default',approvals:[],status:'running'}};const remote=createRemoteTools(runtime,context,project);
 const rejected=remote.call('remote_exec',{command:'echo safe'},new AbortController().signal);await new Promise(r=>setImmediate(r));assert.equal(context.run.approvals.length,1);assert.ok(context.run.approvals[0].detail.includes('dev@example.test:22'));context.remoteApprovals.values().next().value(false);await assert.rejects(rejected,/批准/);assert.equal(executed,0);
 const controller=new AbortController(),cancelled=remote.call('remote_exec',{command:'echo safe'},controller.signal);await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(cancelled,/批准/);assert.equal(executed,0);
 const allowed=remote.call('remote_exec',{command:'echo safe'},new AbortController().signal);await new Promise(r=>setImmediate(r));context.remoteApprovals.values().next().value(true);assert.deepEqual(await allowed,{exitCode:0});assert.equal(executed,1);
});
test('SSH engine configuration disables local shell even in full remote access mode',()=>{
 const args=configurationArgs({model:'test',baseUrl:'http://127.0.0.1:1/v1',remoteOnly:true},'/tmp/engine');assert.ok(args.includes('features.shell_tool=false'));assert.ok(args.includes('features.unified_exec=false'));
});

test('explicit disconnect blocks background operations until manually connected',async()=>{
 const {ssh,clients}=setup();const a=await ssh.save({...base,password:'test'});await ssh.connect(a.id);ssh.disconnect(a.id);
 await assert.rejects(ssh.connect(a.id,{manual:false}),/手动连接/);await assert.rejects(ssh.directory(a.id,'/work'),/手动连接/);assert.equal(clients.length,1);
 await ssh.connect(a.id);assert.equal(clients.length,2);ssh.shutdown();
});

test('startup and passive file access never create an SSH connection',async()=>{
 const {ssh,settings,clients}=setup();settings.set('sshConnections',[{...base,id:'restored'}]);
 assert.equal((await ssh.list())[0].state,'disconnected');
 await assert.rejects(ssh.directory('restored','/work'),/未连接/);
 await assert.rejects(ssh.execute('restored','/work','pwd'),/未连接/);
 assert.equal(clients.length,0);ssh.shutdown();
});
test('concurrent explicit actions share one connection and configure protocol keepalives',async()=>{
 const {ssh,clients}=setup();const a=await ssh.save({...base,password:'test'});
 const [one,two]=await Promise.all([ssh.connect(a.id),ssh.connect(a.id)]);assert.equal(one,two);assert.equal(clients.length,1);
 assert.equal(one.config.keepaliveInterval,15000);assert.equal(one.config.keepaliveCountMax,3);
 ssh.disconnect(a.id);one.emit('error',Error('late socket error'));assert.equal((await ssh.list())[0].state,'disconnected');ssh.shutdown();
});
test('unexpected close reconnects, while explicit disconnect cancels retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {ssh,clients}=setup();const a=await ssh.save({...base,password:'test'});await ssh.connect(a.id);
 clients[0].emit('close');assert.equal((await ssh.list())[0].state,'reconnecting');await assert.rejects(ssh.connected(a.id),/未连接/);
 t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));assert.equal(clients.length,2);assert.equal((await ssh.list())[0].state,'connected');
 clients[1].emit('close');ssh.disconnect(a.id);t.mock.timers.tick(60000);await new Promise(r=>setImmediate(r));assert.equal(clients.length,2);assert.equal((await ssh.list())[0].state,'disconnected');ssh.shutdown();
});
test('reconnection stops after five failed attempts; passive reads cannot bypass the limit',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {ssh,clients}=setup();const a=await ssh.save({...base,password:'test'});await ssh.connect(a.id);
 let tries=0;ssh.clientFactory=()=>{const client=new EventEmitter();client.connect=()=>{tries++;queueMicrotask(()=>{client.emit('error',Object.assign(Error('offline'),{code:'ECONNREFUSED'}));client.emit('close');});};client.end=()=>client.emit('close');return client;};
 clients[0].emit('close');for(const delay of [1000,2000,4000,8000,16000]){t.mock.timers.tick(delay);await new Promise(r=>setImmediate(r));}
 assert.equal(tries,5);assert.match((await ssh.list())[0].error,/重连失败/);await assert.rejects(ssh.directory(a.id,'/work'),/未连接/);t.mock.timers.tick(60000);assert.equal(tries,5);ssh.shutdown();
});

test('cancelling a pending connection remains disconnected after late transport events',async()=>{
 const {ssh}=setup();const client=new EventEmitter();client.connect=()=>{};client.end=()=>client.emit('close');ssh.clientFactory=()=>client;
 const a=await ssh.save({...base,password:'test'});const pending=ssh.connect(a.id);const cancelled=assert.rejects(pending,/已关闭|已取消/);await new Promise(r=>setImmediate(r));assert.equal((await ssh.list())[0].state,'connecting');
 ssh.disconnect(a.id);await cancelled;client.emit('ready');client.emit('error',Error('late failure'));assert.equal((await ssh.list())[0].state,'disconnected');assert.equal(ssh.clients.size,0);ssh.shutdown();
});
