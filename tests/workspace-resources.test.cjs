const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Database}=require('../electron/database.cjs');
const {createStore}=require('../electron/store.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const project=(id,root)=>({id,name:id,path:root,createdAt:'2026-09-28'});
const draft=(id,projectId)=>({id,title:id,prompt:'',modelId:'',projectId,status:'draft',createdAt:'2026-09-28'});
const put=(kind,value,expectedRevision=null)=>({kind,action:'put',id:value.id,value,expectedRevision});
async function fixture(t){
 const cleanups=[];const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-resource-'));let db=new Database(root);await db.call('ready');
 t.after(async()=>{for(const cleanup of cleanups)await cleanup();await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,cleanups,get db(){return db;},async restart(){await db.close();db=new Database(root);await db.call('ready');},patch:changes=>db.call('patchWorkspace',{changes}),read:()=>db.call('readWorkspace')};
}
test('resource revisions preserve independent concurrent edits, reject stale writes and roll back batches',async t=>{
 const f=await fixture(t);const first=await f.patch([put('project',project('a',f.root)),put('project',project('b',f.root))]);
 const [a,b]=first.projects;
 await Promise.all([f.patch([put('project',{...a,name:'A'},a.revision)]),f.patch([put('project',{...b,name:'B'},b.revision)])]);
 assert.deepEqual((await f.read()).projects.map(p=>p.name),['A','B']);
 await assert.rejects(f.patch([put('project',{...a,name:'stale'},a.revision)]),/CONFLICT/);
 const state=await f.read();
 await assert.rejects(f.patch([put('project',{...state.projects[0],name:'must roll back'},state.projects[0].revision),put('draft',draft('bad','missing'))]),/NOT_FOUND/);
 assert.deepEqual(await f.read(),state);
 await assert.rejects(f.db.call('writeWorkspace',{...state,revision:undefined}),/CONFLICT/);
 await assert.rejects(f.db.call('writeWorkspace',{...first,projects:[]}),/CONFLICT/);
});
test('draft identity survives updates and restart; copies have new identity and deleted IDs cannot be reused',async t=>{
 const f=await fixture(t);let state=await f.patch([put('project',project('p',f.root)),put('draft',draft('d','p'))]);
 const original=state.tasks[0];assert.ok(original.conversationId);
 state=await f.patch([put('draft',{...original,prompt:'hello'},original.revision),put('draft',{...draft('copy','p'),conversationId:original.conversationId})]);
 assert.notEqual(state.tasks[1].conversationId,original.conversationId);
 await f.restart();const restored=(await f.read()).tasks[0];assert.equal(restored.conversationId,original.conversationId);
 assert.equal((await f.db.call('resolveConversation',{id:original.conversationId})).recordId,'d');
 await f.patch([{kind:'draft',action:'delete',id:'d',expectedRevision:restored.revision}]);
 await assert.rejects(f.db.call('resolveConversation',{id:original.conversationId}),/NOT_FOUND/);
 await assert.rejects(f.patch([put('draft',draft('d','p'))]),/CONFLICT/);
});
test('draft promotion atomically preserves identity and rolls back failed run serialization',async t=>{
 const f=await fixture(t);const state=await f.patch([put('project',project('p',f.root)),put('draft',draft('d','p'))]);
 const d=state.tasks[0];const run={id:'r',draftId:'d',projectId:'p',updatedAt:'today',messages:[],tools:[]};
 await assert.rejects(f.db.call('commitRunStart',{draftId:'d',expectedRevision:d.revision,runs:[{...run,messages:[{id:'m',bad:1n}]}]}));
 assert.deepEqual(await f.read(),state);
 assert.equal((await f.db.call('resolveConversation',{id:d.conversationId})).kind,'draft');
 const result=await f.db.call('commitRunStart',{draftId:'d',expectedRevision:d.revision,runs:[run]});
 assert.equal(result[0].conversationId,d.conversationId);assert.equal((await f.read()).tasks.length,0);
 assert.equal((await f.db.call('resolveConversation',{id:d.conversationId})).recordId,'r');
 await assert.rejects(f.db.call('commitRunStart',{draftId:'d',expectedRevision:d.revision,runs:[run]}),/CONFLICT/);
 await f.restart();assert.equal((await f.db.call('readRuns'))[0].conversationId,d.conversationId);
});
test('project deletion archives drafts and runs in one transaction',async t=>{
 const f=await fixture(t);const state=await f.patch([put('project',project('p',f.root)),put('draft',draft('d','p'))]);
 await f.db.call('saveRuns',[{id:'r',projectId:'p',updatedAt:'today',messages:[]}]);
 const r=(await f.db.call('readRuns'))[0];
 await f.patch([{kind:'project',action:'delete',id:'p',expectedRevision:state.projects[0].revision}]);
 assert.ok((await f.read()).tasks[0].archivedAt);assert.ok((await f.db.call('readRuns'))[0].archivedAt);
 assert.equal((await f.read()).tasks[0].projectId,null);assert.equal((await f.db.call('readRuns'))[0].projectId,null);
 for(const id of [r.conversationId,state.tasks[0].conversationId])assert.equal((await f.db.call('resolveConversation',{id})).projectId,null);
});
test('version 2 data migrates without reassigning identities on subsequent starts',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-v2-'));
 const old=new DatabaseSync(path.join(root,'atelier.sqlite'));
 old.exec('CREATE TABLE drafts(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT,updated_at TEXT NOT NULL,archived_at TEXT,data TEXT NOT NULL);PRAGMA user_version=2;');
 old.prepare('INSERT INTO drafts VALUES (?,?)').run('d',JSON.stringify(draft('d',null)));
 old.prepare('INSERT INTO runs VALUES (?,?,?,?,?)').run('r',null,'today',null,JSON.stringify({id:'r',projectId:null,updatedAt:'today'}));old.close();
 let db=new Database(root);t.after(async()=>{await db.close();await fs.rm(root,{recursive:true,force:true});});
 assert.equal((await db.call('ready')).version,4);
 const first=(await db.call('readWorkspace')).tasks[0].conversationId,second=(await db.call('readRuns'))[0].conversationId;
 await db.close();db=new Database(root);assert.equal((await db.call('readWorkspace')).tasks[0].conversationId,first);assert.equal((await db.call('readRuns'))[0].conversationId,second);
});
test('AgentRuntime starts and continues a draft with one stable ID without automatically running creation',async t=>{
 const f=await fixture(t);const state=await f.patch([put('project',project('p',f.root)),put('draft',{...draft('d','p'),prompt:'hello'})]);
 const workspace=createStore(f.root,f.db);
 const runtime=new AgentRuntime({directory:f.root,database:f.db,workspace,publish(){},provider:{async secret(){return {id:'fixture',model:'fixture',baseUrl:'http://127.0.0.1:1',apiKey:''};}}});
 await runtime.init();runtime.drain=()=>{};f.cleanups.push(()=>runtime.shutdown());
 assert.equal(runtime.runs.length,0);const d=state.tasks[0];
 const first=await runtime.start({draftId:d.id,draftRevision:d.revision,prompt:'hello'});
 assert.equal(first.conversationId,d.conversationId);assert.equal((await f.read()).tasks.length,0);
 await runtime.stop(first.id);
 const next=await runtime.start({runId:first.id,prompt:'continue'});assert.equal(next.conversationId,d.conversationId);
 await runtime.stop(first.id);
 assert.equal((await workspace.resolveConversation(d.conversationId)).recordId,first.id);
});
