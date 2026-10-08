const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {resource,CSP}=require('../electron/extensions/assets.cjs');const {WindowRegistry}=require('../electron/window-registry.cjs');const {Interactions}=require('../electron/extensions/interactions.cjs');const {PageHost}=require('../electron/extensions/page-host.cjs');
function windowFixture(id=1){const w=new EventEmitter();w.id=id;w.webContents={id,mainFrame:{url:'file:///app/index.html'},send(){},focus(){}};w.isDestroyed=()=>false;w.isFocused=()=>true;return w;}
test('host window registry rejects child frames, unknown windows and changed origins; broadcast isolates profiles',()=>{
 const registry=new WindowRegistry('file:///app/index.html'),a=windowFixture(),b=windowFixture(2);let deliveries=0;a.webContents.send=()=>deliveries++;b.webContents.send=()=>assert.fail('cross-profile broadcast');registry.add(a,'one');registry.add(b,'two');
 assert.equal(registry.authorize({sender:a.webContents,senderFrame:a.webContents.mainFrame}).window,a);
 assert.throws(()=>registry.authorize({sender:a.webContents,senderFrame:{url:'file:///app/index.html'}}),/FORBIDDEN/);assert.throws(()=>registry.authorize({sender:{id:4},senderFrame:{}}),/FORBIDDEN/);
 a.webContents.mainFrame.url='https://untrusted.invalid';assert.throws(()=>registry.authorize({sender:a.webContents,senderFrame:a.webContents.mainFrame}),/FORBIDDEN/);registry.broadcast('one','test');assert.equal(deliveries,1);a.emit('closed');assert.equal(registry.records.size,1);
});
test('asset protocol serves only declared web root and blocks encoded traversal, symlinks, unsafe types and foreign origins',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-page-assets-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const web=path.join(root,'web');await fs.mkdir(web);await fs.writeFile(path.join(web,'index.html'),'<h1>safe</h1>');await fs.writeFile(path.join(root,'secret.txt'),'secret');await fs.symlink(path.join(root,'secret.txt'),path.join(web,'link.txt'));await fs.writeFile(path.join(web,'code.cjs'),'private');
 const origin='amble-extension://fixture',request=async url=>resource(await fs.realpath(web),origin,{url,method:'GET'});const good=await request(origin+'/index.html');assert.equal(good.status,200);assert.equal(await good.text(),'<h1>safe</h1>');assert.equal(good.headers.get('content-security-policy'),CSP);
 for(const suffix of ['/..%2fsecret.txt','/link.txt','/code.cjs','/..%5csecret.txt'])assert.equal((await request(origin+suffix)).status,403);
 assert.equal((await request('amble-extension://other/index.html')).status,403);assert.equal((await request(origin+'/secret.txt')).status,404);
});
test('host consent is owned by one window and cancellation releases native view suppression',async()=>{
 const registry=new WindowRegistry('file:///app/index.html'),w=windowFixture(),other=windowFixture(2);const owner=registry.add(w,'one');registry.add(other,'one');let hidden=0,payload;w.webContents.send=(channel,data)=>{if(channel==='extension:interaction')payload=data;};const interactions=new Interactions(registry,()=>{hidden++;return()=>hidden--;});
 const controller=new AbortController(),pending=interactions.request(owner,{kind:'selectProject'},controller.signal),rejection=assert.rejects(pending,/CANCELLED/);assert.equal(hidden,1);
 assert.throws(()=>interactions.respond({sender:other.webContents,senderFrame:other.webContents.mainFrame},{id:payload.id}),/FORBIDDEN/);controller.abort();await rejection;assert.equal(hidden,0);assert.equal(interactions.pending.size,0);
});
test('page RPC denies foreign frame, wrong version, duplicate IDs, arbitrary project and unsupported invocation',async()=>{
 const registry=new WindowRegistry('file:///app/index.html'),owner=registry.add(windowFixture(),'one'),item={id:'demo.page',kind:'package',active:'digest',generation:1,enabled:true,trusted:true,manifest:{contributes:{home:{}},permissions:[{capability:'projects.read',scope:'project'}]}};
 const manager=new PageHost({electron:{nativeTheme:{shouldUseDarkColors:false}},registry,service:{items:[item]},workspace:{read:async()=>({projects:[{id:'hidden',name:'hidden',path:'/private'}]})},locale:'en'});
 const wc={id:99,mainFrame:{url:'amble-extension://page/index.html'}},p={id:'page',owner,extensionId:item.id,revision:'digest',generation:1,origin:'amble-extension://page',view:{webContents:wc},pending:new Map(),lastRequest:0,selected:new Set()};manager.pages.set(99,p);manager.owners.set(owner.id,p);const event={sender:wc,senderFrame:wc.mainFrame};const call=(id,method,params={},protocolVersion='1')=>manager.rpc(event,{id,method,params,protocolVersion});
 assert.equal((await call('1','initialize')).value.extensionId,item.id);assert.equal((await call('1','initialize')).error.code,'INVALID_ARGUMENT');assert.equal((await call('2','initialize',{},'2')).error.code,'INVALID_ARGUMENT');
 assert.equal((await call('3','invoke')).error.code,'UNSUPPORTED');assert.equal((await call('4','requestGrant',{projectId:'hidden',capabilities:['projects.read']})).error.code,'FORBIDDEN');
 assert.equal((await manager.rpc({...event,senderFrame:{url:wc.mainFrame.url}},{id:'5',method:'initialize'})).error.code,'FORBIDDEN');item.generation=2;assert.equal((await call('6','initialize')).error.code,'FORBIDDEN');
});
