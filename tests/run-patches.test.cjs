const {test}=require('node:test'),assert=require('node:assert/strict');
const {Database}=require('../electron/database.cjs'),{DatabaseSync}=require('node:sqlite');
const {createRunPatches}=require('../electron/run-patches.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'run-patches-')),db=new Database(dir);await db.call('ready');const sql=new DatabaseSync(path.join(dir,'atelier.sqlite'));t.after(async()=>{sql.close();await db.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,db,sql};}
const run=()=>({id:'r',status:'running',messages:[{id:'u',role:'user',text:'task'},{id:'a',role:'assistant',text:'a'.repeat(9000)}],tools:[{id:'t',turnKey:'u',type:'analysis',detail:'中文😀'.repeat(20000),nativeActivity:[{id:'n',text:'z'.repeat(10000)}]}],approvals:[],questions:[]});
test('long output is stored outside item JSON; appends send one item and preserve full context after reopening',async t=>{
 const {db,sql,dir}=await fixture(t),r=run();await db.call('saveRuns',[r]);
 const initial=sql.prepare("SELECT data FROM run_items WHERE item_key='t'").get().data;assert.ok(initial.length<500);assert.ok(sql.prepare('SELECT count(*) n FROM run_text_chunks').get().n>1);
 const sends=[],request=db.request.bind(db);db.request=(method,args)=>{if(method==='saveRunPatches')sends.push(args);return request(method,args);};
 const hints=new Map([['r',new Set([JSON.stringify(['messages','a'])])]]);r.messages[1].text+=' next';await db.call('saveRunUpdates',[r],{hints});
 assert.equal(sends[0].patches[0].upserts.length,1);assert.equal(sends[0].patches[0].upserts[0].key,'a');assert.equal(sends[0].patches[0].upserts[0].texts[0].text,' next');assert.ok(JSON.stringify(sends[0]).length<1500);
 assert.equal(sql.prepare("SELECT data FROM run_items WHERE item_key='t'").get().data,initial);
 await db.close();const reopened=new Database(dir);try{const saved=(await reopened.call('readRuns'))[0];assert.deepEqual(saved.messages,r.messages);assert.deepEqual(saved.tools,r.tools);}finally{await reopened.close();}
});
test('replayed patches are idempotent, conflicting text append rolls back metadata and content',async t=>{
 const {db}=await fixture(t),writer=createRunPatches(),r=run();let batch=writer.prepare([r]);await db.request('saveRunPatches',batch.input);batch.commit();
 r.status='waiting';r.messages[1].text+='delta';batch=writer.prepare([r]);await db.request('saveRunPatches',batch.input);await db.request('saveRunPatches',batch.input);batch.commit();assert.equal((await db.call('readRuns'))[0].messages[1].text,r.messages[1].text);
 const bad=structuredClone(batch.input);bad.mutationId='bad';bad.patches[0].meta=JSON.stringify({...r,status:'completed'});await assert.rejects(db.request('saveRunPatches',bad),/TEXT_REVISION_CONFLICT/);assert.equal((await db.call('readRuns'))[0].status,'waiting');
 const collision=structuredClone(batch.input);collision.patches[0].meta='{}';await assert.rejects(db.request('saveRunPatches',collision),/PATCH_ID_CONFLICT/);
});
test('replacements, shortening, nested changes, surrogate boundaries and deletion clean up chunks',async t=>{
 const {db,sql}=await fixture(t),r=run();await db.call('saveRuns',[r]);r.messages[1].text+='\ud83d';await db.call('saveRunUpdates',[r]);assert.equal((await db.call('readRuns'))[0].messages[1].text,r.messages[1].text);
 r.messages[1].text+='\ude00';r.tools[0].nativeActivity[0].text='replacement'.repeat(1000);r.tools[0].detail='short';await db.call('saveRunUpdates',[r]);let saved=(await db.call('readRuns'))[0];assert.deepEqual(saved.messages,r.messages);assert.deepEqual(saved.tools,r.tools);
 assert.equal(sql.prepare("SELECT count(*) n FROM run_texts WHERE item_key='t' AND field='[\"detail\"]'").get().n,0);
 r.tools=[];await db.call('saveRunUpdates',[r]);assert.equal(sql.prepare("SELECT count(*) n FROM run_texts WHERE item_key='t'").get().n,0);await db.call('saveRuns',[]);assert.equal(sql.prepare('SELECT count(*) n FROM run_text_chunks').get().n,0);
});
test('small incremental appends pack into bounded chunks instead of creating one row per delta',async t=>{
 const {db,sql}=await fixture(t),r=run();await db.call('saveRuns',[r]);const before=sql.prepare("SELECT count(*) n FROM run_text_chunks WHERE item_key='a'").get().n;
 for(let i=0;i<40;i++){r.messages[1].text+='x';await db.call('saveRunUpdates',[r]);}
 assert.equal(sql.prepare("SELECT count(*) n FROM run_text_chunks WHERE item_key='a'").get().n,before);
 assert.equal((await db.call('readRuns'))[0].messages[1].text,r.messages[1].text);
});
test('migration backs up version 15 and lazily externalizes old text without changing user input',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'run-migration-'));let db=new Database(dir);await db.call('ready');await db.call('saveRuns',[run()]);await db.close();
 const sql=new DatabaseSync(path.join(dir,'atelier.sqlite'));sql.exec('PRAGMA foreign_keys=OFF; DROP TABLE run_text_chunks; DROP TABLE run_texts; DROP TABLE run_patch_receipts; PRAGMA user_version=15;');const text='USER '+('旧消息'.repeat(4000));sql.prepare("UPDATE run_items SET data=? WHERE item_key='u'").run(JSON.stringify({id:'u',role:'user',inputSource:'user',inputDeliveryState:'delivered',text}));sql.close();
 db=new Database(dir);t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});const rows=await db.call('readRuns');assert.equal(rows[0].messages[0].text,text);await db.call('saveRunUpdates',rows);
 assert.equal((await db.call('inputRequest',{action:'messages',runId:'r'}))[0].text,text);assert.equal((await fs.readdir(dir)).filter(f=>f.includes('before-v16')).length,1);
});
test('disk detail pagination reads exact ranges including native activity and split emoji',async t=>{
 const {db}=await fixture(t),r=run();await db.call('saveRuns',[r]);
 for(const offset of [0,32767,32768,64001,999999]){const page=await db.call('readToolText',{id:'r',toolId:'t',offset,limit:101});assert.equal(page.text,r.tools[0].detail.slice(offset,offset+101));assert.equal(page.total,r.tools[0].detail.length);}
 const native=await db.call('readToolText',{id:'r',toolId:'t',activityId:'n',offset:5,limit:123});assert.equal(native.text,'z'.repeat(123));
 const first=await db.call('readToolText',{id:'r',toolId:'t'});r.tools[0].detail='y'.repeat(r.tools[0].detail.length);await db.call('saveRunUpdates',[r]);assert.notEqual((await db.call('readToolText',{id:'r',toolId:'t'})).version,first.version);
 await assert.rejects(db.call('readToolText',{id:'r',toolId:'t',offset:-1}));
});
test('diagnostic records sharing a turn retain distinct identities outside frequently written metadata',async t=>{
 const {db,sql}=await fixture(t),r=run();r.modelRequests=Array.from({length:5},(_,i)=>({requestId:'req-'+i,turnKey:'u',events:i}));await db.call('saveRuns',[r]);assert.deepEqual((await db.call('readRuns'))[0].modelRequests,r.modelRequests);assert.equal(JSON.parse(sql.prepare("SELECT data FROM runs WHERE id='r'").get().data).modelRequests,undefined);
 r.modelRequests.shift();r.modelRequests.push({requestId:'last',turnKey:'u',events:123});await db.call('saveRunUpdates',[r]);assert.deepEqual((await db.call('readRuns'))[0].modelRequests,r.modelRequests);
});
test('runtime streaming saves exclude unrelated history and retain updates arriving during a write',async t=>{
 const {db}=await fixture(t),{AgentRuntime}=require('../electron/agent-runtime.cjs');const runtime=new AgentRuntime({directory:'/unused',database:db,publish:()=>{}}),r=run();runtime.runs=[r];t.after(()=>clearTimeout(runtime.saveTimer));runtime.changed(r);await runtime.persistChanged();
 let reads=0;Object.defineProperty(r.tools[0],'audit',{enumerable:true,get(){reads++;return 'unchanged';}});
 let release;const send=db.request.bind(db);let held=true;db.request=async(method,args)=>{if(method==='saveRunPatches'&&held){held=false;await new Promise(resolve=>release=resolve);}return send(method,args);};
 r.messages[1].text+=' first';runtime.changed(r,{stream:true,items:[['messages','a']]});const first=runtime.persistChanged();await new Promise(resolve=>setImmediate(resolve));
 r.messages[1].text+=' second';runtime.changed(r,{stream:true,items:[['messages','a']]});const second=runtime.persistChanged();release();await first;await second;
 assert.equal(reads,0);assert.equal((await db.call('readRuns'))[0].messages[1].text,r.messages[1].text);assert.equal(runtime.dirtyRuns.size,0);
});
test('restart reconciliation does not rewrite existing chunks and concurrent controls survive terminal commit',async t=>{
 const {db,dir,sql}=await fixture(t),r=run(),other={...run(),id:'other'};await db.call('saveRuns',[r,other]);const before=sql.prepare('SELECT run_id,field,revision FROM run_texts ORDER BY run_id,item_key,field').all();await db.close();
 const reopened=new Database(dir);try{
 const {AgentRuntime}=require('../electron/agent-runtime.cjs'),runtime=new AgentRuntime({directory:dir,database:reopened,publish:()=>{}});await runtime.init();t.after(()=>clearTimeout(runtime.saveTimer));
 assert.deepEqual(sql.prepare('SELECT run_id,field,revision FROM run_texts ORDER BY run_id,item_key,field').all(),before);
 const a=runtime.runs.find(r=>r.id==='r'),b=runtime.runs.find(r=>r.id==='other');a.status='waiting';a.questions=[{id:'supplement',questions:[{id:'q',question:'保留补充信息'}]}];a.approvals=[{id:'approve',detail:'review'}];a.permissionChange={state:'applied',effective:'full-access'};a.modelChange={state:'applied',effective:'next-model'};b.messages[1].text+=' parallel';runtime.changed(a);runtime.changed(b,{stream:true,items:[['messages','a']]});await runtime.persistChanged();a.status='completed';runtime.changed(a);await runtime.persist({runId:a.id,turnId:'u'});
 const saved=await reopened.call('readRuns');assert.deepEqual(saved.find(r=>r.id==='r').questions,a.questions);assert.deepEqual(saved.find(r=>r.id==='r').permissionChange,a.permissionChange);assert.deepEqual(saved.find(r=>r.id==='r').modelChange,a.modelChange);assert.equal(saved.find(r=>r.id==='other').messages[1].text,b.messages[1].text);
 }finally{await reopened.close();}
});
test('failed transaction preserves writer baseline and retries without duplicate output',async t=>{
 const {db,sql}=await fixture(t),r=run();await db.call('saveRuns',[r]);const before=r.tools[0].detail;
 sql.exec("CREATE TRIGGER reject_chunk BEFORE INSERT ON run_text_chunks BEGIN SELECT RAISE(ABORT,'disk failure fixture'); END");r.tools[0].detail+='x'.repeat(40000);await assert.rejects(db.call('saveRunUpdates',[r]),/disk failure/);
 assert.equal(sql.prepare("SELECT sum(length(text)/2) n FROM run_text_chunks WHERE item_key='t' AND field='[\"detail\"]'").get().n,before.length);
 sql.exec('DROP TRIGGER reject_chunk');await db.call('saveRunUpdates',[r]);assert.equal((await db.call('readRuns'))[0].tools[0].detail,r.tools[0].detail);
});
test('committed text and replay receipts survive an abrupt worker exit',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'run-crash-'));let db=new Database(dir);
 try{await db.call('ready');const writer=createRunPatches(),r=run(),batch=writer.prepare([r]);await db.request('saveRunPatches',batch.input);await db.worker.terminate();await db.close().catch(()=>{});
 db=new Database(dir);await db.call('ready');await db.request('saveRunPatches',batch.input);const saved=(await db.call('readRuns'))[0];assert.deepEqual(saved.messages,r.messages);assert.deepEqual(saved.tools,r.tools);
 }finally{await db.close().catch(()=>{});await fs.rm(dir,{recursive:true,force:true});}
});
test('queued writes freeze metadata and dirty text together before later runtime mutations',async t=>{
 const {db}=await fixture(t),r=run();await db.call('saveRuns',[r]);let release;const request=db.request.bind(db),sent=[];
 db.request=async(method,args)=>{if(method==='readSetting')await new Promise(resolve=>release=resolve);if(method==='saveRunPatches')sent.push(args);return request(method,args);};
 const hold=db.call('readSetting',{key:'hold'});await new Promise(resolve=>setImmediate(resolve));r.messages[1].text+=' earlier';const earlier=r.messages[1].text;
 const save=db.call('saveRunUpdates',[r],{hints:new Map([['r',new Set([JSON.stringify(['messages','a'])])]])});r.status='completed';r.messages[1].text+=' later';release();await hold;await save;
 assert.equal(JSON.parse(sent[0].patches[0].meta).status,'running');assert.equal((await db.call('readRuns'))[0].messages[1].text,earlier);
 await db.call('saveRunUpdates',[r]);assert.equal((await db.call('readRuns'))[0].messages[1].text,r.messages[1].text);
});
test('legacy host snapshot writes replace chunk references instead of resurrecting old text',async t=>{
 const {db}=await fixture(t),r=run();await db.call('saveRuns',[r]);r.tools[0].detail='legacy replacement';await db.request('saveRunUpdates',[r]);assert.equal((await db.call('readRuns'))[0].tools[0].detail,'legacy replacement');
});
