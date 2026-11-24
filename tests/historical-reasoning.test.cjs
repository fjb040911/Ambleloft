const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Database}=require('../electron/database.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {SpaceService}=require('../core/workforce/spaces.cjs');
const maintenance=require('../electron/historical-reasoning.cjs');
const acceptance=require('../core/workforce/acceptance.cjs');
const old='2020-01-01T00:00:00.000Z',key='workforce.spaces.v1';
function record(id,extra={}){
 return {id,title:id,archivedAt:old,updatedAt:old,createdAt:old,status:'completed',projectId:'project',threadId:'thread-'+id,terminalTurnId:'u',
  messages:[{id:'u',role:'user',text:'question',attachments:[{name:'input.pdf',path:'input.pdf'}]},
   {id:'r',role:'assistant',kind:'reasoning',text:'history'.repeat(2000),summary:['outline'],content:['detail']},
   {id:'f',role:'assistant',text:'final report'}],tools:[],fileChanges:[],workEvidence:[],artifacts:[{id:'a',path:'report.pdf'}],...extra};
}
async function setup(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-reasoning-'));let db=new Database(directory);
 await db.call('ready');const sql=new DatabaseSync(db.file);
 t.after(async()=>{sql.close();await db.close();await fs.rm(directory,{recursive:true,force:true});});
 return {directory,sql,get db(){return db;},async restart(){await db.close();db=new Database(directory);await db.call('ready');}};
}
test('manual preview protects recent, live, unsaved and inconclusive turns, and rechecks selected records',async t=>{
 const {db,sql}=await setup(t);
 const now=new Date().toISOString(),mixed=record('mixed');
 mixed.messages.push({id:'v',role:'user',text:'another question',timing:{outcome:'interrupted'}},{id:'x',role:'assistant',kind:'reasoning',text:'retain me'},{id:'y',role:'assistant',text:'unfinished'});
 const noFinal=record('no-final');noFinal.messages[2].phase='commentary';
 await db.call('saveRuns',[mixed,noFinal,record('restored'),record('active',{archivedAt:null}),record('recent',{updatedAt:now}),record('failed',{status:'failed'}),record('pending')]);
 const before=await db.call('previewHistoricalReasoning',{exclude:['pending']});
 assert.deepEqual(before.candidates.map(x=>x.id).sort(),['mixed','restored']);
 assert.equal(before.candidates[0].bytes,28013);assert.ok(before.stats.run>before.candidates[0].bytes);
 assert.ok(before.stats.snapshot>0);
 sql.prepare("UPDATE runs SET archived_at=NULL,data=json_set(data,'$.archivedAt',NULL) WHERE id='restored'").run();
 const input={tokens:before.candidates.map(x=>x.token)};
 const rollback=()=>sql.prepare("SELECT count(*) n FROM run_texts WHERE run_id='mixed' AND item_key='r'").get().n;
 sql.exec("CREATE TRIGGER fail_clean BEFORE DELETE ON run_texts BEGIN SELECT RAISE(ABORT,'full'); END");
 await assert.rejects(db.call('cleanHistoricalReasoning',input),/full/);assert.equal(rollback(),1);
 sql.exec('DROP TRIGGER fail_clean');
 const result=await db.call('cleanHistoricalReasoning',input);
 assert.equal(rollback(),0);assert.equal(result.bytes,28013);assert.equal(result.skipped,1);
 assert.equal((await db.call('readRun',{id:'mixed'})).messages[4].text,'retain me');
 assert.equal((await db.call('readRun',{id:'pending'})).messages[1].text.length,14000);
 assert.equal((await db.call('cleanHistoricalReasoning',input)).bytes,0);
 assert.equal((await db.call('previewHistoricalReasoning')).stats.snapshot,before.stats.snapshot);
});
test('accepted archived plan and files survive maintenance, restart and scheduler tick with identical evidence',async t=>{
 const env=await setup(t),{sql,directory}=env;
 const input=path.join(directory,'input.pdf'),output=path.join(directory,'report.pdf');
 await fs.writeFile(input,'attachment');await fs.writeFile(output,'delivered report');
 const run=record('expert',{archivedAt:null,collaboration:{spaceId:'s',requestId:'discussion'}});
 run.messages[0].attachments[0].path=input;run.artifacts[0].path=output;
 const fingerprint=acceptance.resultHash(run);
 const plan={id:'plan',spaceId:'s',status:'completed',source:{discussionId:'discussion'},events:[],packages:[{status:'accepted',acceptance:{accepted:true,resultHash:fingerprint},attempts:[{id:'attempt',status:'completed',runId:run.id,resultHash:fingerprint}]}]};
 const request={id:'discussion',mode:'discussion',spaceId:'s',createdAt:old,prompt:'topic',participants:[],host:{status:'completed',activity:{reasoning:'host history',finishedAt:old},steps:[{text:'host conclusion',at:old}]}};
 const state={spaces:[{id:'s',archivedAt:old}],requests:[request],plans:[plan],documents:[]};
 await env.db.call('saveRuns',[run]);await env.db.call('writeSetting',{key,value:state});
 function counts(){return ['automation_turns','automation_events','automation_jobs'].map(table=>sql.prepare('SELECT count(*) n FROM '+table).get().n);}
 const initial=counts();
 async function start(){
  const runtime=new AgentRuntime({database:env.db,directory,publish(){}});
  await runtime.init();
  const spaces=new SpaceService({database:env.db,directory,runtime});
  runtime.spaces=spaces;await spaces.initialize();return {runtime,spaces};
 }
 let {runtime,spaces}=await start();
 const preview=()=>env.db.call('previewHistoricalReasoning');
 let rows=await preview();assert.equal(rows.candidates.length,2);
 const tokens=rows.candidates.map(c=>c.token);
 await spaces.change(s=>{s.plans[0].status='paused';});
 assert.equal((await maintenance.clean(runtime,spaces,env.db,tokens)).skipped,2);
 await spaces.change(s=>{s.plans[0].status='completed';});
 spaces.plans.dirty=false;
 await maintenance.clean(runtime,spaces,env.db,(await preview()).candidates.map(c=>c.token));
 assert.equal(spaces.plans.dirty,false);assert.deepEqual(counts(),initial);
 assert.equal(acceptance.resultHash(runtime.runs[0]),fingerprint);
 await spaces.shutdown();await runtime.shutdown();await env.restart();
 ({runtime,spaces}=await start());
 try{
  await spaces.plans.tick();const after=await spaces.read();
  assert.deepEqual(after.plans[0],plan);assert.deepEqual(after.requests[0].host.steps,request.host.steps);
  assert.equal(after.requests[0].host.activity.reasoning,'');assert.equal(after.requests[0].host.activity.reasoningCleared,true);
  const saved=runtime.runs[0];assert.equal(acceptance.resultHash(saved),fingerprint);
  assert.deepEqual(saved.messages[0],run.messages[0]);assert.equal(saved.messages[1].reasoningCleared,true);
  assert.deepEqual(saved.messages[2],run.messages[2]);assert.deepEqual(saved.artifacts,run.artifacts);
  assert.equal(await fs.readFile(input,'utf8'),'attachment');assert.equal(await fs.readFile(output,'utf8'),'delivered report');
  assert.deepEqual(counts(),initial);assert.equal((await preview()).candidates.length,0);
  saved.messages[2].text+=' changed';assert.notEqual(acceptance.resultHash(saved),fingerprint);
 }finally{await spaces.shutdown();await runtime.shutdown();}
});
test('restored old chat continues in place with its original conclusion after cleanup and restart',async t=>{
 const env=await setup(t),{directory}=env;
 const {createProviderStore}=require('../electron/provider.cjs');
 const provider=createProviderStore(directory,{});
 const config=await provider.save({create:true,name:'Fixture',baseUrl:'http://127.0.0.1:12345/v1',model:'test',executable:process.execPath});
 const run=record('chat',{projectId:null,cwd:directory,providerId:config.id,model:config.model,baseUrl:config.baseUrl});
 await env.db.call('saveRuns',[run]);
 let requests=0;
 async function launch(){
  const runtime=new AgentRuntime({directory,database:env.db,provider,workspace:{read:async()=>({projects:[],tasks:[]})},publish(){},conversationOptions:{infer:async(_config,{input})=>{
   requests++;assert.deepEqual(input.task.history.map(m=>m.text),['question','final report','What was the conclusion?']);
   return {action:'reply',reply:'The final report.'};
  }}});
  await runtime.init();return runtime;
 }
 let runtime=await launch();
 const {candidates}=await env.db.call('previewHistoricalReasoning');
 assert.equal(candidates.length,1);
 await maintenance.clean(runtime,{queue:Promise.resolve(),publish(){}},env.db,candidates.map(row=>row.token));
 await runtime.shutdown();await env.restart();runtime=await launch();
 try{
  assert.equal(requests,0);assert.equal(runtime.runs.length,1);assert.ok(runtime.runs[0].archivedAt);
  await runtime.edit({id:run.id,archived:false});
  await runtime.start({runId:run.id,prompt:'What was the conclusion?'},{userAuthored:true});
  await runtime.active?.conversationPreparation;
  await runtime.writes;
  assert.equal(requests,1);assert.equal(runtime.runs.length,1);
  const result=await env.db.call('readRun',{id:run.id});
  assert.equal(result.threadId,run.threadId);assert.equal(result.messages.at(-1).text,'The final report.');
  assert.equal(result.messages[1].reasoningCleared,true);assert.deepEqual(result.artifacts,run.artifacts);
 }finally{await runtime.shutdown();}
});
