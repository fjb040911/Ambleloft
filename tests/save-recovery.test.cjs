const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {Database}=require('../electron/database.cjs');

test('rollback leaves the same turn recoverable; concurrent save retries only commit one record', async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'amble-save-'));
  const db=new Database(dir);await db.call('ready');
  const inspect=new DatabaseSync(path.join(dir,'atelier.sqlite'));
  const runtime=new AgentRuntime({directory:dir,database:db,publish(){}});
  t.after(async()=>{inspect.close();await db.close();await fs.rm(dir,{recursive:true,force:true});});
  const run={id:'one',status:'running',projectId:'p',messages:[{id:'turn',role:'user',text:'Create report'}],tools:[],approvals:[]};
  runtime.runs=[run];await runtime.persist();
  // Abort late, after metadata, messages and the automation snapshot were written.
  inspect.exec("CREATE TRIGGER fail_write BEFORE INSERT ON run_patch_receipts BEGIN SELECT RAISE(ROLLBACK,'write failed'); END;");
  run.messages.push({id:'result',role:'assistant',text:'report.xlsx'});
  const ctx={key:'attempt',run,turnKey:'turn',conversationOnly:true};
  runtime.contexts.set(ctx.key,ctx);await runtime.finish(ctx,'completed');
  assert.equal(ctx.done,true);assert.equal(runtime.contexts.size,0);
  assert.equal(run.status,'running');assert.equal(run.pendingRecord.issue.kind,'write');
  const read=()=>db.call('readRun',{id:'one'});
  assert.equal((await read()).messages.length,1);
  await assert.rejects(runtime.startOnce({runId:'one',prompt:'replay'}),/保存/);
  await assert.rejects(runtime.retrySave('one'),/write failed/);
  assert.equal(inspect.prepare('SELECT count(*) AS n FROM automation_turns').get().n,0);
  inspect.exec('DROP TRIGGER fail_write');
  const before=inspect.prepare('SELECT count(*) AS n FROM run_patch_receipts').get().n;
  const a=runtime.retrySave('one'),b=runtime.retrySave('one');assert.equal(a,b);await Promise.all([a,b]);
  await runtime.retrySave('one');
  const saved=await read();
  assert.equal(saved.status,'completed');assert.equal(saved.terminalTurnId,'turn');
  assert.equal(saved.recoveredSaveTurnId,'turn');assert.equal(saved.messages.length,2);
  assert.equal(saved.messages.at(-1).text,'report.xlsx');assert.equal(saved.pendingRecord,undefined);
  assert.equal(inspect.prepare('SELECT count(*) AS n FROM run_patch_receipts').get().n,before+1);
  assert.equal(inspect.prepare('SELECT count(*) AS n FROM automation_turns').get().n,1);
});

test('SQLite disk full is reported distinctly; retry uses the original terminal outcome',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'amble-quota-'));
  const disk=new DatabaseSync(path.join(dir,'quota.sqlite'));
  t.after(async()=>{disk.close();await fs.rm(dir,{recursive:true,force:true});});
  disk.exec('CREATE TABLE output(data); PRAGMA max_page_count=2');
  const runtime=new AgentRuntime({directory:dir,publish(){},database:{call(method){
    assert.equal(method,'commitTurn');disk.exec('INSERT INTO output VALUES(zeroblob(16000))');
  }}});
  const run={id:'r',status:'running',messages:[],tools:[],approvals:[]};runtime.runs=[run];
  await runtime.finish({run,key:'attempt',turnKey:'turn',conversationOnly:true},'failed','tool failed');
  assert.equal(run.pendingRecord.issue.kind,'space');
  disk.exec('PRAGMA max_page_count=100');
  await runtime.retrySave('r');await runtime.retrySave('r');
  assert.equal(run.status,'failed');assert.equal(run.error,'tool failed');
  assert.equal(disk.prepare('SELECT count(*) AS n FROM output').get().n,1);
});
