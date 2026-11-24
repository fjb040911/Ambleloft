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
  assert.deepEqual(await store.read(),{theme:'system',projects:[],tasks:[],revision:0,settingsRevision:0});
  const provider=createProviderStore(dir,{},db);
  assert.equal((await provider.list()).providers.length,0);
  let state={revision:0,theme:'dark',projects:[{id:'p',name:'设计',path:dir,createdAt:'2026-09-15'}],tasks:[]};
  state=await store.write(state);
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

test('flushing independently committed runs preserves only the failed save for retry',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-flush-'));
 const database=new Database(directory);
 const runtime=new AgentRuntime({directory,database,publish(){}});
 try{
  await runtime.init();
  for(const id of ['first','second']){
   const run={id,status:'completed',messages:[{id:'message',role:'user',text:id}]};
   runtime.runs.push(run);runtime.changed(run);
  }
  const call=database.call.bind(database);
  database.call=(method,args,options)=>method==='saveRunUpdates'&&args[0].id==='second'?Promise.reject(Error('simulated write failure')):call(method,args,options);
  await assert.rejects(runtime.flushPendingWrites(),/simulated write failure/);
  assert.deepEqual([...runtime.dirtyRuns.keys()],['second']);
  assert.deepEqual((await database.call('readRuns')).map(run=>run.id),['first']);
  database.call=call;
  await runtime.shutdown();
  assert.equal(runtime.dirtyRuns.size,0);
  assert.deepEqual((await database.call('readRuns')).map(run=>run.id).sort(),['first','second']);
 }finally{await database.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('large saved history stays intact through update preparation, recovery and task edits',async()=>{
 const {prepareUpdate}=require('../electron/update-preparation.cjs');
 const storage=require('../electron/storage-management.cjs');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-large-update-'));
 let database;
 try{
  database=new Database(directory);
  const body='x'.repeat(4096);
  for(let index=0;index<9;index++){
   const messages=Array.from({length:1000},(_,i)=>({id:`m${i}`,role:'user',text:body,timing:{outcome:'completed'}}));
   await database.call('saveRunUpdates',[{id:`history-${index}`,status:'completed',messages,questions:[],storageBackpressure:false}]);
  }
  await database.call('saveRunUpdates',[{id:'recovery',status:'running',questions:[{id:'q'}],approvals:[{id:'a'}],tools:[{id:'t',type:'analysis',status:'running'}],messages:[{id:'u',role:'user',text:'unfinished',timing:{}}]}]);
  await database.close();database=new Database(directory);
  const runs=await database.call('readRuntimeRuns');
  assert.equal(database.pendingBytes,0);
  assert.equal(database.runPatches.prepare(runs,{replace:true}).input.patches.length,0);
  await assert.rejects(database.call('saveRuns',runs),{code:'DATABASE_BACKPRESSURE',oversized:true});
  const runtime=new AgentRuntime({directory,database,publish(){}});
  await runtime.init();
  const restored=runtime.runs.find(run=>run.id==='recovery');
  assert.equal(restored.status,'interrupted');
  assert.equal(restored.tools[0].status,'interrupted');
  assert.equal(restored.messages[0].timing.outcome,'interrupted');
  await runtime.edit({id:'history-0',title:'仍可编辑'});
  const results=[];
  const call=database.call.bind(database);
  database.call=(method,...args)=>{results.push(method);return call(method,...args);};
  await runtime.flushPendingWrites();
  assert.deepEqual(results,[]);
  runtime.chatInputs={async shutdown(){
   restored.messages.push({id:'late',role:'assistant',turnKey:'u',text:'saved at shutdown'});
   runtime.changed(restored,{stream:true,items:[['messages','late']]});
  }};
  await fs.mkdir(path.join(directory,'updates'));
  await prepareUpdate({flush:()=>runtime.flushPendingWrites(),async shutdown(){await runtime.shutdown();await database.close();},backup:()=>storage.createBackup(directory,'backup-1700000000000',{from:'0.9.17',target:'0.9.18'})});
  assert.deepEqual(results,['saveRunUpdates','close']);
  database=new Database(directory);
  const after=await database.call('readRuntimeRuns');
  const history=after.filter(run=>run.id.startsWith('history-'));
  assert.equal(history.length,9);
  assert.equal(history.find(run=>run.id==='history-0').title,'仍可编辑');
  for(const run of history){assert.equal(run.messages.length,1000);assert.ok(run.messages.every(message=>message.text===body));}
  const resumed=after.find(run=>run.id==='recovery');
  assert.deepEqual(resumed.questions,[]);assert.deepEqual(resumed.approvals,[]);
  assert.equal(resumed.messages.at(-1).text,'saved at shutdown');
 }finally{await database?.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('startup surfaces recovery write failures separately from history read failures',async()=>{
 const writeError=Object.assign(Error('数据库保存队列暂满'),{code:'DATABASE_BACKPRESSURE'});
 const runtime=new AgentRuntime({directory:'/unused',publish(){},database:{incrementalRuns:true,async call(method){
  if(method==='readRuntimeRuns')return [{id:'interrupted-run',status:'running'}];
  throw writeError;
 }}});
 await assert.rejects(runtime.init(),error=>{
  assert.match(error.message,/未能保存恢复后的任务状态.*数据库保存队列暂满/);
  assert.equal(error.cause,writeError);
  return true;
 });
 assert.equal(runtime.initialized,undefined);
});
