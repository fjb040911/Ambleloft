const test=require('node:test'),assert=require('node:assert/strict');
const {McpApps,VERSION,CSP}=require('../core/extensions/mcp-apps.cjs');
const {OperationRouter}=require('../core/extensions/operations.cjs');
const {validateManifest}=require('../core/extensions/manifest.cjs');
function fixture(){
 let dispatched=0,confirmed=0,persisted=0;
 const op={id:'test.app.render',title:'Render',description:'Render',handler:'render',exposeTo:['agent','page'],effect:'read',projectScoped:true,inputSchema:{},outputSchema:{},requiredPermissions:['projects.read'],_meta:{ui:{resourceUri:'ui://test.app/card'}}};
 const write={...op,id:'test.app.save',effect:'write',_meta:undefined};
 const item={id:'test.app',kind:'package',enabled:true,trusted:true,active:'digest',generation:1,manifest:{operations:[op,write],contributes:{mcpApps:[{uri:'ui://test.app/card',title:'Card'}]}}};
 const service={items:[item],localized:(_i,s)=>s,displayName:()=> 'App',check:async()=>{},packages:{validateValue:async(_schema,value)=>!!value&&typeof value==='object'&&!Array.isArray(value)},hosts:{entries:new Map(),async invoke(_id,_op,input,options){await options.guard();options.onDispatch();dispatched++;return {value:42};}}};
 const router=new OperationRouter({service,workspace:{read:async()=>({projects:[{id:'p'},{id:'q'}]})},confirm:async()=>{confirmed++;return {};}});
 const run={id:'run',conversationId:'conversation',projectId:'p'},runtime={runs:[run],changed(){},async persist(){persisted++;}};
 const apps=new McpApps({service,router,runtime});apps.readResource=async()=>({contents:[{text:'<h1>app</h1>'}]});
 const owner={id:'window',window:{isDestroyed:()=>false,webContents:{send(){}}}};
 const capture=()=>apps.invokeTask(op.id,{projectId:'p'},{caller:'agent',projectId:'p'},run,'turn');
 const open=()=>apps.open(owner,{runId:'run',appId:run.taskApps[0].id});
 const rpc=(sessionId,id,method,params)=>apps.rpc(owner,sessionId,{jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params});
 const init=async sessionId=>{await rpc(sessionId,1,'ui/initialize',{protocolVersion:VERSION,appInfo:{name:'test',version:'1'},appCapabilities:{}});return rpc(sessionId,undefined,'ui/notifications/initialized');};
 return {apps,router,service,item,op,write,run,runtime,owner,capture,open,rpc,init,counts:()=>({dispatched,confirmed,persisted})};
}
test('MCP UI declarations are local, namespaced, localized and linked to declared resources',()=>{
 const m=structuredClone(require('../examples/extensions/project-card/extension.json'));
 m.contributes.mcpApps=[{uri:'ui://example.project-card/card',title:'Card',entry:'web/card.html',mimeType:'text/html;profile=mcp-app'}];m.operations[0]._meta={ui:{resourceUri:m.contributes.mcpApps[0].uri}};
 const defaults=require('../examples/extensions/project-card/extension.nls.json');const check=value=>validateManifest(value,{defaultMessages:defaults});assert.equal(check(m).ok,true);
 for(const mutate of [v=>v.contributes.mcpApps[0].entry='../outside.html',v=>v.contributes.mcpApps[0].uri='ui://other/card',v=>v.operations[0]._meta.ui.resourceUri='ui://missing',v=>v.contributes.mcpApps.push(v.contributes.mcpApps[0]),v=>v.contributes.mcpApps[0].csp={connectDomains:['*']}]){const copy=structuredClone(m);mutate(copy);assert.equal(check(copy).ok,false);}
});
test('capture persists UI snapshot, mounting and reopening never replay producer, handshake sends input/result',async()=>{
 const f=fixture();await f.capture();assert.equal(f.run.taskApps[0].conversationId,'conversation');assert.equal(f.counts().persisted,1);
 const a=await f.open();assert.equal((await f.rpc(a.sessionId,0,'tools/call',{name:f.write.id,arguments:{projectId:'p'}})).error.message,'FORBIDDEN');
 const init=await f.init(a.sessionId);assert.equal(init.notifications[0].params.arguments.projectId,'p');assert.equal(init.notifications[1].params.structuredContent.value,42);
 f.apps.close(f.owner,a.sessionId);await f.open();assert.equal(f.counts().dispatched,1);
});
test('app operations keep confirmation, same extension/project binding, exposure and duplicate protection',async()=>{
 const f=fixture();await f.capture();const {sessionId}=await f.open();await f.init(sessionId);
 assert.equal((await f.rpc(sessionId,2,'tools/call',{name:f.write.id,arguments:{projectId:'p'}})).result.structuredContent.value,42);assert.equal(f.counts().confirmed,1);
 assert.equal((await f.rpc(sessionId,2,'tools/call',{name:f.write.id,arguments:{projectId:'p'}})).error.code,-32600);assert.equal(f.counts().dispatched,2);
 assert.equal((await f.rpc(sessionId,3,'tools/call',{name:f.write.id,arguments:{projectId:'q'}})).error.message,'FORBIDDEN');
 f.write.exposeTo=['agent'];assert.equal((await f.rpc(sessionId,4,'tools/call',{name:f.write.id,arguments:{projectId:'p'}})).result.isError,true);
 const foreign={...f.item,id:'other.app',manifest:{operations:[{...f.write,id:'other.app.write',exposeTo:['page']}]}};f.service.items.push(foreign);
 assert.equal((await f.rpc(sessionId,5,'tools/call',{name:'other.app.write',arguments:{projectId:'p'}})).result.isError,true);
 assert.equal((await f.apps.rpc({...f.owner,id:'foreign'},sessionId,{jsonrpc:'2.0',id:6,method:'ping'})).error.message,'FORBIDDEN');
 assert.equal((await f.rpc(sessionId,7,'ui/message',{})).error.code,-32601);
 assert.equal(f.counts().dispatched,2);
});
test('archival, project movement, update, revocation and window teardown expire UI access',async()=>{
 for(const change of [f=>f.run.archivedAt='now',f=>f.run.projectId='q',f=>f.item.active='new',f=>f.item.generation++,f=>f.item.enabled=false,f=>f.apps.closeOwner(f.owner)]){
  const f=fixture();await f.capture();const {sessionId,url}=await f.open();await f.init(sessionId);change(f);
  assert.ok((await f.rpc(sessionId,2,'tools/call',{name:f.write.id,arguments:{projectId:'p'}})).error);assert.equal((await f.apps.document(url)).status,403);assert.equal(f.counts().dispatched,1);
 }
});
test('isolated document only returns HTML for live exact resource URL with restrictive CSP',async()=>{
 const f=fixture();await f.capture();const {url}=await f.open();const doc=await f.apps.document(url);assert.equal(doc.status,200);assert.equal(doc.headers.get('content-security-policy'),CSP);assert.match(CSP,/sandbox allow-scripts/);assert.match(CSP,/connect-src 'none'/);
 assert.equal((await f.apps.document(url+'?other')).status,403);assert.equal((await f.apps.document(url.replace('index.html','main.cjs'))).status,403);
});
test('task history includes cards only in their turn and summary excludes payloads',()=>{
 const {pageRun,summary}=require('../electron/history-pages.cjs');const run={messages:[{id:'a',role:'user'},{id:'b',role:'user'}],tools:[],taskApps:[{id:'x',turnKey:'a'},{id:'y',turnKey:'b'}]};assert.deepEqual(pageRun(run,undefined,1).taskApps,[run.taskApps[1]]);assert.equal(summary(run).taskApps,undefined);
});
test('closing a card aborts an in-flight write and reports unknown outcome without replay',async()=>{
 const f=fixture();await f.capture();const {sessionId}=await f.open();await f.init(sessionId);
 let resolveStarted;const started=new Promise(resolve=>resolveStarted=resolve);let calls=0;
 f.service.hosts.invoke=async(_i,_op,_input,options)=>{await options.guard();options.onDispatch();calls++;resolveStarted();await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));return {value:42};};
 const pending=f.rpc(sessionId,2,'tools/call',{name:f.write.id,arguments:{projectId:'p'}});await started;f.apps.closeOwner(f.owner);
 const result=await pending;assert.equal(result.error.data.effectStatus,'unknown');assert.equal(calls,1);assert.equal(f.apps.sessions.size,0);
});
test('standard tools/call may omit arguments for a no-input operation',async()=>{
 const f=fixture();await f.capture();f.write.projectScoped=false;f.write.requiredPermissions=[];const {sessionId}=await f.open();await f.init(sessionId);
 assert.equal((await f.rpc(sessionId,2,'tools/call',{name:f.write.id})).result.structuredContent.value,42);
 assert.equal((await f.rpc(sessionId,3,'tools/call',{name:f.write.id,arguments:null})).error.message,'INVALID_ARGUMENT');
});
