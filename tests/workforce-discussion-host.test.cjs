const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService,spaceInstructions}=require('../core/workforce/spaces.cjs');
const {checked,sourcesFor}=require('../core/workforce/discussion-host.cjs');
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await tick();}throw Error('Timed out');}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'discussion-host-')),database=new Database(root);await database.call('ready');
 const employees=[{id:'product',name:'Product',responsibilities:'Scope and acceptance',skills:[{name:'requirements'}]},{id:'architect',name:'Architect',responsibilities:'Contracts and architecture'}];
 const runtime={runs:[],starts:[],async start(input,context){this.starts.push({input,context});const r={id:randomUUID(),status:'running',employee:{id:input.employeeId,name:employees.find(e=>e.id===input.employeeId).name},collaboration:context.collaboration,messages:[],tools:[]};this.runs.push(r);return r;},async stop(id){this.runs.find(r=>r.id===id).status='interrupted';}};
 const service=new SpaceService({directory:root,database,workspace:{read:async()=>({projects:[]})},workforce:{read:async()=>({employees}),providers:{secret:async()=>({model:'test'})}},runtime});await service.initialize();clearInterval(service.plans.timer);service.hostPollMs=5;
 const space=await service.save({value:{name:'Repair ticket test',purpose:'Plan and deliver',projectIds:[],members:employees.map(e=>({employeeId:e.id,assignment:e.responsibilities,projectIds:[]}))}});
 t.after(async()=>{await service.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});
 const start=(extra={})=>service.coordinateDiscussion({spaceId:space.id,clientRequestId:randomUUID(),prompt:'Plan a repair ticket system',locale:'zh-CN',...extra});
 const finish=async()=>{await until(()=>!service.hostJobs.size);return (await service.snapshot()).requests[0];};return {service,runtime,space,start,finish};
}
const response=(extra={})=>({action:'reply',message:'Let us clarify the goal.',brief:{goal:'Repair tickets',items:[]},questions:[],delegates:[],...extra});
const delegate=(employeeId)=>response({action:'delegate',message:'Invite '+employeeId,delegates:[{employeeId,instruction:'Analyze only your assigned scope.',reason:'The next stage needs this conclusion.'}]});
test('H01 host can clarify without any experts; answers persist and produce an editable task draft',async t=>{
 const f=await fixture(t);await f.service.save({id:f.space.id,expectedRevision:1,value:{...f.space,members:[]}});
 f.service.generateDiscussionHost=async()=>response({action:'ask',questions:[{label:'Target users?',help:'Choose the audience',type:'select',options:[{label:'Operators',value:'operators'},{label:'Customers',value:'customers'}],defaultValue:'operators'}]});
 await f.start();const first=await f.finish();assert.equal(first.host.status,'needs-input');assert.equal(f.runtime.runs.length,0);
 await assert.rejects(f.start({replyTo:first.id,answerTo:first.id,answers:{}}),/补充/);
 f.service.generateDiscussionHost=async(_c,r)=>{assert.ok(r.input.sources.some(s=>s.text==='Target users?：Operators'));return response({action:'ready',brief:{goal:'Tickets for operators',items:[{id:'audience',kind:'decision',text:'For operators',sourceIds:[r.input.sources.at(-1).id]}]}});};
 await f.start({prompt:'Target users?：Operators',replyTo:first.id,answerTo:first.id,answers:{answer0:'operators'}});const second=await f.finish();assert.equal(second.host.status,'ready');const state=await f.service.read();assert.equal(state.requests.find(r=>r.id===first.id).host.question.answeredBy,second.id);
 await assert.rejects(f.start({replyTo:first.id,answerTo:first.id,answers:{answer0:'customers'}}),/已变化/);
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:first.id,commandId:randomUUID()});assert.ok(JSON.stringify(draft.source).includes('Tickets for operators'));assert.equal((await f.service.read()).plans.length,0);
});
test('H02 dependent experts receive real predecessor output, scoped instructions and user decisions',async t=>{
 const f=await fixture(t);let count=0;
 f.service.generateDiscussionHost=async(_c,r)=>{count++;if(count===1)return delegate('product');if(count===2){assert.ok(r.input.sources.some(s=>s.text==='Product facts /api/v1'));return delegate('architect');}return response({action:'ready'});};
 await f.start({prompt:'Use /api/v1 and port 18765'});await until(()=>f.runtime.runs.length===1);assert.equal(f.runtime.runs[0].employee.id,'product');await tick();assert.equal(f.runtime.runs.length,1);
 Object.assign(f.runtime.runs[0],{status:'completed',messages:[{role:'assistant',text:'Product facts /api/v1'}]});await until(()=>f.runtime.runs.length===2);
 const second=f.runtime.starts[1];assert.equal(second.input.employeeId,'architect');assert.equal(second.context.collaboration.hostDelegated,true);assert.ok(second.context.collaboration.sources.some(s=>s.text==='Product facts /api/v1'));assert.ok(second.context.collaboration.sources.some(s=>s.text==='Use /api/v1 and port 18765'));
 assert.match(spaceInstructions(second.context.collaboration),/host|主持/);
 f.runtime.runs[1].status='completed';const final=await f.finish();assert.equal(final.host.status,'ready');assert.equal(final.participants.length,2);assert.equal((await f.service.read()).plans.length,0);
});
test('H03 direct follow-up targets only explicit expert, preserves full sources, then host accepts next turn',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response();await f.start();const host=await f.finish();
 await f.service.start({spaceId:f.space.id,clientRequestId:randomUUID(),mode:'discussion',employeeIds:['architect'],prompt:'@Architect review the contract',replyTo:host.id});assert.equal(f.runtime.runs.length,1);assert.equal(f.runtime.runs[0].employee.id,'architect');assert.ok(f.runtime.starts[0].context.collaboration.priorDiscussion.sources.some(s=>s.id===host.id));
 f.runtime.runs[0].status='completed';const direct=(await f.service.snapshot()).requests[0];await f.start({replyTo:direct.id,prompt:'Please consolidate'});assert.equal((await f.finish()).host.status,'completed');assert.equal(f.runtime.runs.length,1);
});
test('H05 invalid sources, invented experts, duplicate delegation and false user decisions are rejected',()=>{
 const sources=[{id:'expert-source',kind:'expert'}],roster=[{id:'product'}];
 assert.throws(()=>checked(response({brief:{goal:'x',items:[{id:'one',kind:'decision',text:'Approved',sourceIds:['expert-source']}]}}),sources,roster,new Set(),4),/用户决定/);
 assert.throws(()=>checked(response({brief:{goal:'x',items:[{id:'one',kind:'proposal',text:'Proposal',sourceIds:['invented']}]}}),sources,roster,new Set(),4),/来源/);
 assert.throws(()=>checked(delegate('invented'),sources,roster,new Set(),4),/未授权/);
 assert.throws(()=>checked(delegate('product'),sources,roster,new Set(['product']),4),/重复/);
});
test('H06 stop rejects late model responses and duplicate submits do not repeat dispatch',async t=>{
 const f=await fixture(t);let resolve;f.service.generateDiscussionHost=()=>new Promise(r=>resolve=r);const clientRequestId=randomUUID();await f.start({clientRequestId});await until(()=>!!resolve);await f.start({clientRequestId});assert.equal(f.service.hostJobs.size,1);
 await f.service.stopDiscussionHost({requestId:clientRequestId});resolve(delegate('product'));await tick();const r=await f.finish();assert.equal(r.host.status,'interrupted');assert.equal(f.runtime.runs.length,0);
});
test('H06 cancelling while an expert is starting stops its late run',async t=>{
 const f=await fixture(t);let release,started;const old=f.runtime.start.bind(f.runtime);f.runtime.start=(...args)=>{started=true;return new Promise(r=>release=()=>old(...args).then(r));};f.service.generateDiscussionHost=async()=>delegate('product');await f.start();await until(()=>started);const id=(await f.service.read()).requests[0].id;await f.service.stopDiscussionHost({requestId:id});await release();await until(()=>f.runtime.runs[0]?.status==='interrupted');assert.equal((await f.finish()).host.status,'interrupted');
});
test('H06 expert timeout stops unfinished work and keeps prior output; restart does not replay',async t=>{
 const f=await fixture(t);f.service.hostExpertTimeoutMs=20;f.service.generateDiscussionHost=async()=>delegate('product');await f.start();const r=await f.finish();assert.equal(r.host.status,'failed');assert.equal(f.runtime.runs[0].status,'interrupted');
 await f.service.change(s=>{s.requests[0].host.status='running';});await f.service.initialize();clearInterval(f.service.plans.timer);assert.equal((await f.service.read()).requests[0].host.status,'interrupted');assert.equal(f.runtime.runs.length,1);
});
test('H06 partial expert failure does not become ready or invoke downstream experts',async t=>{
 const f=await fixture(t);let called=0;f.service.generateDiscussionHost=async()=>{called++;return response({action:'delegate',delegates:[...delegate('product').delegates,...delegate('architect').delegates]});};await f.start();await until(()=>f.runtime.runs.length===2);f.runtime.runs[0].status='completed';f.runtime.runs[1].status='failed';assert.equal((await f.finish()).host.status,'failed');assert.equal(called,1);
});
test('H05 source retrieval preserves original messages, including beginning of long expert responses',()=>{
 const r={id:'r',spaceId:'s',createdAt:'a',prompt:'User decision',participants:[{employeeId:'product',contribution:{id:'p'},output:'IMPORTANT '+'.'.repeat(5000)}]};assert.match(sourcesFor({requests:[r]},'s','r')[1].text,/^IMPORTANT/);
});
test('H06 stopped preparation with no runtime result does not block a new host turn',async t=>{
 const f=await fixture(t);let starting=false;f.runtime.start=()=>{starting=true;return new Promise(()=>{});};f.service.generateDiscussionHost=async()=>delegate('product');await f.start();await until(()=>starting);const previous=(await f.service.read()).requests[0];await f.service.stopDiscussionHost({requestId:previous.id});assert.equal((await f.finish()).participants[0].status,'interrupted');f.service.generateDiscussionHost=async()=>response();await f.start({replyTo:previous.id,prompt:'Reassess without delegation'});assert.equal((await f.finish()).host.status,'completed');
});
test('H06 offline, model timeout, and changed assignments preserve the submitted prompt without dispatch',async t=>{
 const f=await fixture(t);f.service.workforce.providers.secret=async()=>{throw Error('Offline provider');};await f.start();assert.match((await f.finish()).host.error,/Offline/);
 f.service.workforce.providers.secret=async()=>({});f.service.hostTimeoutMs=10;f.service.generateDiscussionHost=()=>new Promise(()=>{});await f.start();assert.equal((await f.finish()).host.status,'failed');
 f.service.hostTimeoutMs=90000;let release;f.service.generateDiscussionHost=()=>new Promise(r=>release=r);await f.start();await until(()=>!!release);await assert.rejects(f.service.save({id:f.space.id,expectedRevision:1,value:{...f.space,members:[]}}),/活跃任务/);await f.service.change(s=>{s.spaces[0].revision++;});release(delegate('product'));const last=await f.finish();assert.equal(last.prompt,'Plan a repair ticket system');assert.match(last.host.error,/分工已变化/);assert.equal(f.runtime.runs.length,0);
});
test('H06 source withdrawal and stale-thread direct dispatch cannot bypass host scope',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response();const doc=await f.service.saveDocument({spaceId:f.space.id,title:'Source',body:'Scoped content'});await f.start({documentRefs:[{id:doc.id,revision:1,hash:doc.hash}]});const first=await f.finish();
 let release;f.service.generateDiscussionHost=()=>new Promise(r=>release=r);await f.start({replyTo:first.id});await until(()=>!!release);
 await assert.rejects(f.service.start({spaceId:f.space.id,clientRequestId:randomUUID(),mode:'discussion',employeeIds:['product'],prompt:'stale branch',replyTo:first.id}),/上一轮/);
 const active=(await f.service.read()).requests[0];await f.service.stopDiscussionHost({requestId:active.id});await f.service.withdrawDocument({id:doc.id,expectedRevision:1});await assert.rejects(f.start({replyTo:active.id}),/撤回/);
});

test('H09 model progress persists live but never enters task evidence; late progress after stopping is ignored',async t=>{
 const f=await fixture(t);let emit,release;
 f.service.generateDiscussionHost=async(_config,_job,_signal,onProgress)=>{emit=onProgress;await onProgress({phase:'reasoning',reasoning:'Actual model text',reasoningFormat:'text'});return new Promise(resolve=>{release=resolve;});};
 await f.start({clientRequestId:'progress-test'});await until(async()=>(await f.service.snapshot()).requests[0].host.activity?.reasoning==='Actual model text');
 const live=(await f.service.snapshot()).requests[0];assert.equal(live.host.status,'running');assert.equal(live.host.steps.length,0);assert.equal(f.runtime.starts.length,0);
 assert.ok(!JSON.stringify(sourcesFor(await f.service.snapshot(),f.space.id,live.id)).includes('Actual model text'));
 await f.service.stopDiscussionHost({requestId:live.id});await emit({phase:'reasoning',reasoning:'Late overwrite',reasoningFormat:'text'});release(response());await tick();
 const stopped=(await f.service.snapshot()).requests[0];assert.equal(stopped.host.status,'interrupted');assert.equal(stopped.host.activity.reasoning,'Actual model text');assert.equal(stopped.host.steps.length,0);
});
test('H09 completed stream keeps its latest reasoning and final verified brief across reload',async t=>{
 const f=await fixture(t);
 f.service.generateDiscussionHost=async(_config,_job,_signal,onProgress)=>{await onProgress({phase:'reasoning',reasoning:'First',reasoningFormat:'summary'});await onProgress({phase:'responding',reasoning:'First and last',reasoningFormat:'summary'});return response();};
 await f.start();const done=await f.finish();assert.equal(done.host.activity.phase,'complete');assert.equal(done.host.activity.reasoning,'First and last');assert.equal(done.host.steps[0].reasoning,undefined);
 await f.service.initialize();assert.equal((await f.service.snapshot()).requests[0].host.activity.reasoning,'First and last');
 const draft=await f.service.createTaskDraft({spaceId:f.space.id,discussionId:done.id,commandId:'no-reasoning-evidence'});
 assert.equal(draft.source[0].host.brief.goal,'Repair tickets');assert.ok(!JSON.stringify(draft.source).includes('First and last'));
});
test('H09 long token streams reach the final host reply through the real adapter and persistence',async t=>{
 const f=await fixture(t);f.service.workforce.providers.secret=async()=>({model:'deepseek-test',protocol:'chat',baseUrl:'https://model.example/v1'});
 const delta='核对。',count=8192,events=Array.from({length:count},(_,i)=>({id:'synthetic-completion-0123456789',model:'deepseek-test',object:'chat.completion.chunk',created:1793539561,choices:[{index:0,delta:{reasoning_content:delta},finish_reason:null}],usage:{prompt_tokens:2000,completion_tokens:i+1}}));
 events.push({choices:[{delta:{content:JSON.stringify(response())},finish_reason:'stop'}]});
 const wire=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));assert.ok(wire.length>1024*1024);
 t.mock.method(global,'fetch',async()=>new Response(new ReadableStream({start(c){for(let i=0;i<wire.length;i+=16384)c.enqueue(wire.subarray(i,i+16384));c.close();}}),{headers:{'content-type':'text/event-stream'}}));
 await f.start();const done=await f.finish();assert.equal(done.host.status,'completed');assert.equal(done.host.error,undefined);
 assert.equal(done.host.activity.reasoning,delta.repeat(count));assert.equal(done.host.steps.at(-1).text,response().message);assert.equal(f.runtime.starts.length,0);
});

test('H10 host preserves composer selections and passes them to delegated experts only for the current round',async t=>{
 const f=await fixture(t),file=path.join(f.service.root,'brief.md');await fs.mkdir(f.service.root,{recursive:true});await fs.writeFile(file,'Attachment contents stay with the reading expert.');
 const attachments=[{name:'brief.md',path:file}],skills=[{id:'review',name:'Review',description:'Verify sources',body:'Compare supplied evidence before reaching conclusions.',version:1,hash:'fixture'}];
 let prepared=0;f.service.workforce.skills={prepare:async ids=>{prepared++;assert.deepEqual(ids,['review']);return {snapshots:skills};}};
 let passes=0;
 f.service.generateDiscussionHost=async(_config,job)=>{
  assert.deepEqual(job.input.sources[0].attachments,attachments);
  assert.deepEqual(job.input.selectedSkills,[{id:'review',name:'Review',description:'Verify sources',instructions:skills[0].body}]);
  assert.ok(!JSON.stringify(job).includes('Attachment contents stay with the reading expert.'));
  return ++passes===1?delegate('product'):response();
 };
 const clientRequestId=randomUUID();await f.start({clientRequestId,permission:'full',attachments,selectedSkillIds:['review']});await until(()=>f.runtime.starts.length===1);
 assert.equal(f.runtime.starts[0].input.permission,'full');assert.deepEqual(f.runtime.starts[0].input.attachments,attachments);assert.deepEqual(f.runtime.starts[0].input.selectedSkillIds,['review']);
 await f.start({clientRequestId,permission:'full',attachments,selectedSkillIds:['review']});assert.equal(prepared,1);assert.equal(f.runtime.starts.length,1);
 f.runtime.runs[0].status='completed';const first=await f.finish();assert.equal(first.composer.permission,'full');assert.deepEqual(first.composer.skills,skills);
 let again=0;f.service.generateDiscussionHost=async(_config,job)=>{assert.deepEqual(job.input.selectedSkills,[]);assert.deepEqual(job.input.sources[0].attachments,attachments);return ++again===1?delegate('architect'):response();};
 await f.start({replyTo:first.id,prompt:'Review the result'});await until(()=>f.runtime.starts.length===2);assert.equal(f.runtime.starts[1].input.permission,'default');assert.deepEqual(f.runtime.starts[1].input.attachments,[]);assert.deepEqual(f.runtime.starts[1].input.selectedSkillIds,[]);
 f.runtime.runs[1].status='completed';assert.equal((await f.finish()).host.status,'completed');assert.equal(prepared,1);
});
test('H10 invalid composer inputs fail before consuming the answer or contacting a model',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'ask',questions:[{label:'Audience?',help:'',type:'textarea',options:[],defaultValue:''}]});await f.start();const first=await f.finish();
 let modelCalls=0;f.service.generateDiscussionHost=async()=>{modelCalls++;return response();};
 f.service.workforce.skills={prepare:async()=>{throw Error('选中的技能已停用或删除');}};
 for(const invalid of [{permission:'invalid'},{attachments:[{path:'relative.md'}]},{attachments:[{path:path.join(f.service.root,'missing.md')}]},{attachments:Array(51).fill({path:'/tmp'})},{selectedSkillIds:['disabled']}]){
  await assert.rejects(f.start({replyTo:first.id,answerTo:first.id,answers:{answer0:'Operators'},...invalid}));
 }
 const state=await f.service.read();assert.equal(state.requests.length,1);assert.equal(state.requests[0].host.question.answeredBy,undefined);assert.equal(modelCalls,0);
});
