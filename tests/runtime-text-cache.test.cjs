const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {reference,RuntimeTextCache}=require('../electron/runtime-text-cache.cjs');
const {pageRun,summary}=require('../electron/history-pages.cjs');
const {previewTool}=require('../electron/tool-previews.cjs');
const {participantOutput}=require('../core/workforce/output-preview.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-text-')),db=new Database(dir);await db.call('ready');t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,db};}
function makeRun(i=0){return {id:'r'+i,status:'completed',messages:[{id:'u',role:'user',text:'Supplement '+i,timing:{outcome:'completed'}},{id:'a',role:'assistant',status:'completed',text:('answer 😀 '+i).repeat(4000)}],tools:[{id:'t',turnKey:'u',type:'analysis',status:'completed',detail:('tool '+i+' 中文😀').repeat(12000),nativeActivity:[{id:'child',text:'activity'.repeat(3000)}],analysisAgent:{name:'Memory audit'}}],approvals:[],questions:[],model:'new-model',permission:'full',modelChange:{state:'applied'},permissionChange:{state:'applied'},conversation:{updates:[{id:'update',state:'applied',text:'Keep supplementary requirement'}]}};}
test('startup and summary/preview paths do not load persisted full text; semantic readers get exact bodies',async t=>{
 const {db,dir}=await fixture(t),input=Array.from({length:20},(_,i)=>makeRun(i));await db.call('saveRuns',input);
 const runtime=new AgentRuntime({directory:dir,database:db,publish:()=>{}});await runtime.init();
 assert.equal(db.textCache.stats().loads,0);assert.equal(db.textCache.stats().bytes,0);
 const run=runtime.runs.find(r=>r.id==='r0');assert.ok(reference(run.tools[0],'detail'));assert.ok(reference(run.messages[1],'text'));
 for(const run of runtime.runs){summary(run);pageRun(run);participantOutput(run,true);}
 assert.equal(db.textCache.stats().loads,0);
 assert.equal(run.tools[0].detail,input[0].tools[0].detail);assert.equal(run.messages[1].text,input[0].messages[1].text);
 assert.equal(participantOutput(run).output,input[0].messages[1].text);
 assert.deepEqual(run.conversation,input[0].conversation);assert.equal(run.modelChange.state,'applied');assert.equal(run.permissionChange.state,'applied');
 const count=db.textCache.stats().loads;await db.call('saveRunUpdates',[run]);assert.equal(db.textCache.stats().loads,count);
});
test('full text LRU is byte bounded and oversized reads are not retained',async t=>{
 const {db}=await fixture(t);await db.call('saveRuns',[makeRun()]);const [run]=await db.call('readRuntimeRuns');
 const cache=new RuntimeTextCache(db.file,{maxBytes:200000,maxEntryBytes:200000,maxEntries:1});t.after(()=>cache.close());
 const ref=reference(run.messages[1],'text'),large=reference(run.tools[0],'detail');
 assert.equal(cache.read(ref),makeRun().messages[1].text);assert.equal(cache.stats().entries,1);
 assert.equal(cache.read(large),makeRun().tools[0].detail);assert.equal(cache.stats().entries,1);assert.ok(cache.stats().bytes<=200000);
 const activity=reference(run.tools[0].nativeActivity[0],'text');cache.read(activity);assert.equal(cache.stats().entries,1);const loads=cache.stats().loads;cache.read(ref);assert.equal(cache.stats().loads,loads+1);
});
test('live streamed fields stay writable until completion; completed siblings release full text',async t=>{
 const {db}=await fixture(t);await db.call('readRuntimeRuns');const run=makeRun();run.status='running';run.messages[1].status='running';run.tools[0].status='running';
 await db.call('saveRuns',[run]);assert.equal(reference(run.messages[1],'text'),undefined);assert.equal(reference(run.tools[0],'detail'),undefined);
 for(let i=0;i<10;i++){run.messages[1].text+='delta';run.tools[0].detail+='output';await db.call('saveRunUpdates',[run]);}
 assert.equal(db.textCache.stats().loads,0);
 run.tools[0].status='completed';await db.call('saveRunUpdates',[run]);assert.ok(reference(run.tools[0],'detail'));assert.equal(reference(run.messages[1],'text'),undefined);
 run.messages[1].status='completed';run.status='completed';await db.call('saveRunUpdates',[run]);assert.ok(reference(run.messages[1],'text'));
 assert.equal(run.messages[1].text,makeRun().messages[1].text+'delta'.repeat(10));assert.equal(run.tools[0].detail,makeRun().tools[0].detail+'output'.repeat(10));
});
test('queued acknowledgement cannot overwrite newer text, supplemental input, model or permission state',async t=>{
 const {db}=await fixture(t);await db.call('readRuntimeRuns');const run=makeRun();await db.call('saveRuns',[run]);
 const old=run.messages[1].text;run.messages[1].text=old+' first';const first=db.call('saveRunUpdates',[run]);
 run.messages[1].text=old+' second';run.messages.push({id:'supp',role:'user',turnKey:'u',text:'Additional requirement',inputDeliveryState:'delivered'});run.model='next';run.permission='default';run.modelChange={state:'applied'};run.permissionChange={state:'applied'};const second=db.call('saveRunUpdates',[run]);
 await Promise.all([first,second]);const restored=await db.call('readRun',{id:run.id});assert.equal(restored.messages[1].text,old+' second');assert.equal(run.messages[1].text,old+' second');assert.equal(restored.messages.at(-1).text,'Additional requirement');assert.equal(restored.model,'next');assert.equal(restored.permission,'default');
 assert.deepEqual(restored.tools[0].analysisAgent,run.tools[0].analysisAgent);
 // A diagnostic full-history read must not reset the live lazy-reference baseline.
 await db.call('readRuns');await db.call('saveRunUpdates',[run]);assert.equal(run.messages[1].text,restored.messages[1].text);
});
test('preview versions match disk pagination and nested child activity does not hydrate',async t=>{
 const {db}=await fixture(t);await db.call('saveRuns',[makeRun()]);const [run]=await db.call('readRuntimeRuns');const value=previewTool(run.tools[0]);assert.equal(db.textCache.stats().loads,0);
 assert.equal(value.detailVersion,(await db.call('readToolText',{id:run.id,toolId:'t'})).version);assert.equal(value.nativeActivity[0].textVersion,(await db.call('readToolText',{id:run.id,toolId:'t',activityId:'child'})).version);
});

test('nested reasoning arrays stay lazy during startup and persistence',async t=>{
 const {db,dir}=await fixture(t),run=makeRun();run.messages.push({id:'thought',role:'assistant',kind:'reasoning',status:'completed',text:'summary',content:['reasoning '.repeat(3000)],summary:['summary '.repeat(2000)]});await db.call('saveRuns',[run]);
 const runtime=new AgentRuntime({directory:dir,database:db,publish:()=>{}});await runtime.init();assert.equal(db.textCache.stats().loads,0);
 const item=runtime.runs[0].messages.at(-1);assert.ok(reference(item.content,'0'));assert.equal(item.content[0],run.messages.at(-1).content[0]);
});
test('failed writes retain the new live value and retry without losing archived full text',async t=>{
 const {db}=await fixture(t);await db.call('saveRuns',[makeRun()]);const [run]=await db.call('readRuntimeRuns');
 const original=run.messages[1].text;run.messages[1].text=original+' retry';const request=db.request.bind(db);let fail=true;
 db.request=(method,args)=>method==='saveRunPatches'&&fail?(fail=false,Promise.reject(Error('injected write failure'))):request(method,args);
 await assert.rejects(db.call('saveRunUpdates',[run]),/injected/);assert.equal(reference(run.messages[1],'text'),undefined);assert.equal(run.messages[1].text,original+' retry');assert.equal((await db.call('readRun',{id:run.id})).messages[1].text,original);
 await db.call('saveRunUpdates',[run]);assert.ok(reference(run.messages[1],'text'));assert.equal(run.messages[1].text,original+' retry');
});
