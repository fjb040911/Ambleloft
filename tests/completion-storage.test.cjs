const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),wt=require('node:worker_threads');
const NativeWorker=wt.Worker;
// Fail inside the real database worker if terminal indexing goes back through
// a full collection read. Explicit paged reads use the normal cache connection.
wt.Worker=class extends NativeWorker{
 constructor(file,options){
  const store=path.resolve(__dirname,'../electron/run-text-store.cjs');
  super(`require(${JSON.stringify(store)}).readItems=()=>{throw Error('UNBOUNDED_TERMINAL_READ')};require(${JSON.stringify(file)});`,{...options,eval:true});
 }
};
const {Database}=require('../electron/database.cjs');wt.Worker=NativeWorker;
test('completion and cold load never hydrate long collections while paged text remains exact',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amble-terminal-regression-'));let db;
 t.after(async()=>{await db?.close();fs.rmSync(root,{recursive:true,force:true});});
 db=new Database(root);await db.call('ready');
 const text=('中文😀\n"\\').repeat(200000),run={id:'run',status:'running',terminalTurnId:'u',messages:[{id:'u',role:'user',text:'question'},{id:'a',role:'assistant',text:''},{id:'r',role:'assistant',kind:'reasoning',text:''}],tools:[],approvals:[]};
 for(const item of run.messages.slice(1))require('../electron/text-spool.cjs').append(item,'text',text,db.getSpool());
 await db.call('saveRunUpdates',[run]);run.status='completed';await db.call('commitTurn',{runs:[run],runId:run.id,turnId:'u'});
 await db.close();db=new Database(root);await db.call('ready');const restored=await db.call('readRuntimeRuns');
 assert.equal(db.textCache.stats().loads,0);assert.equal(db.textCache.stats().bytes,0);
 for(const item of restored[0].messages.slice(1)){
  let value='';for(let offset=0;offset<text.length;){const page=require('../electron/runtime-text-cache.cjs').range(item,'text',offset);value+=page.text;offset+=page.text.length;assert.ok(page.text.length);}
  assert.equal(value,text);
 }
});
