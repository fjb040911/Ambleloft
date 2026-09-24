const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {createStore}=require('../electron/store.cjs');
const {createProviderStore}=require('../electron/provider.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');

test('SQLite persists workspace and turns across restart, ignores legacy JSON, and deletes atomically',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-db-'));
 let db;
 try{
  await fs.writeFile(path.join(dir,'workspace.json'),'invalid legacy data');
  await fs.writeFile(path.join(dir,'conversations.json'),'invalid legacy data');
  await fs.writeFile(path.join(dir,'provider.json'),'invalid legacy data');
  db=new Database(dir);await db.call('ready');
  const store=createStore(dir,db);
  assert.deepEqual(await store.read(),{theme:'system',projects:[],tasks:[]});
  const provider=createProviderStore(dir,{},db);
  assert.equal((await provider.list()).providers.length,0);
  const state={theme:'dark',projects:[{id:'p',name:'设计',path:dir,createdAt:'2026-09-15'}],tasks:[]};
  await store.write(state);
  const run={id:'r',modelSessionId:'session-fixture',status:'running',projectId:'p',messages:[{id:'u',role:'user',text:'hello',timing:{}},{id:'a',role:'assistant',text:'partial'}],tools:[],fileChanges:[{turnKey:'u',files:[{id:'f',path:'README.md',status:'modified',hunks:[{lines:['-before','+after']}]}]}],updatedAt:'2026-09-15'};
  await db.call('saveRuns',[run]);
  run.messages[1].text='complete';await db.call('saveRuns',[run]);
  await assert.rejects(db.call('saveRuns',[{id:'broken',messages:[{id:'x',value:1n}]}]));
  assert.equal((await db.call('readRuns'))[0].id,'r');
  await db.close();db=new Database(dir);
  assert.deepEqual(await createStore(dir,db).read(),state);
  const runtime=new AgentRuntime({directory:dir,database:db,workspace:createStore(dir,db),provider,publish:()=>{}});
  await runtime.init();
  assert.deepEqual(runtime.runs[0].fileChanges,run.fileChanges);
  assert.equal(runtime.runs[0].modelSessionId,'session-fixture');
  assert.equal(runtime.runs[0].status,'interrupted');
  assert.equal(runtime.runs[0].messages[1].text,'complete');
  await runtime.edit({id:'r',archived:true});
  await runtime.edit({id:'r',remove:true});
  assert.deepEqual(await db.call('readRuns'),[]);
  assert.equal(await fs.readFile(path.join(dir,'conversations.json'),'utf8'),'invalid legacy data');
 }finally{await db?.close();await fs.rm(dir,{recursive:true,force:true});}
});
