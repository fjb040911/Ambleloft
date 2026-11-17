const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {Database}=require('../electron/database.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const run=id=>({id,status:'running',messages:[{id:id+'-u',role:'user',text:'initial'}],tools:[]});
function runtime(t,call){const r=new AgentRuntime({directory:'/unused',database:{call},publish:()=>{}});t.after(()=>clearTimeout(r.saveTimer));return r;}
test('ordinary saves clone only dirty runs and coalesce the waiting save to latest content',async t=>{
 const calls=[];let release;const r=runtime(t,async(method,runs)=>{calls.push({method,runs});if(calls.length===1)await new Promise(resolve=>release=resolve);});
 const active=run('active');r.runs=[active,{...run('idle'),uncloneable:()=>{}}];r.changed(active);
 const first=r.persistChanged();await new Promise(resolve=>setImmediate(resolve));
 active.messages[0].text='second';r.changed(active);const next=r.persistChanged();
 for(let i=0;i<20;i++){active.messages[0].text='latest '+i;r.changed(active);assert.equal(r.persistChanged(),next);}
 assert.equal(calls.length,1);assert.equal(calls[0].method,'saveRunUpdates');assert.deepEqual(calls[0].runs.map(r=>r.id),['active']);assert.equal(calls[0].runs[0].messages[0].text,'initial');
 release();await first;await next;assert.equal(calls.length,2);assert.equal(calls[1].runs[0].messages[0].text,'latest 19');assert.equal(r.dirtyRuns.size,0);
});
test('failed incremental saves retain dirty state and terminal checkpoints remain ordered and durable',async t=>{
 const calls=[];let fail=true;const r=runtime(t,async(method,data)=>{calls.push({method,data});if(fail){fail=false;throw Error('disk busy');}});const active=run('a');r.runs=[active];r.changed(active);
 await assert.rejects(r.persistChanged(),/disk busy/);assert.equal(r.dirtyRuns.size,1);await r.persistChanged();assert.equal(r.dirtyRuns.size,0);
 active.status='completed';r.changed(active);await r.persist({runId:'a',turnId:'a-u'});
 assert.equal(calls.at(-1).method,'commitTurn');assert.equal(calls.at(-1).data.runs[0].status,'completed');assert.equal(r.dirtyRuns.size,0);
});
test('incremental database updates preserve unrelated runs and requests, rollback atomically and survive restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'incremental-runs-'));let db=new Database(dir);
 try{
  await db.call('ready');await db.call('saveRuns',[run('a'),run('b')]);
  await db.call('formData',{action:'put',revision:null,flow:{id:'b-form',runId:'b',status:'editing',drafts:{main:{answer:'preserved'}}}});
  const a=run('a');a.messages[0].text='updated';await db.call('saveRunUpdates',[a]);
  await db.call('commitTurn',{runs:[a],runId:'a',turnId:'a-u',partial:true});
  let rows=await db.call('readRuns');assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='b').messages[0].text,'initial');
  await assert.rejects(db.call('saveRunUpdates',[{...a,messages:[{id:'bad',value:1n}]}]));
  await db.close();db=new Database(dir);await db.call('ready');rows=await db.call('readRuns');assert.equal(rows.find(r=>r.id==='a').messages[0].text,'updated');assert.equal(rows.length,2);
  assert.equal((await db.call('formData',{action:'list',runId:'b'}))[0].drafts.main.answer,'preserved');
  await db.call('saveRuns',[a]);assert.deepEqual((await db.call('readRuns')).map(r=>r.id),['a']);
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
