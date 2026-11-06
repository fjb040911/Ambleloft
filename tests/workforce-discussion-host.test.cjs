const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{SpaceService,spaceInstructions}=require('../core/workforce/spaces.cjs');
const {checked,sourcesFor,schemaForSources}=require('../core/workforce/discussion-host.cjs');
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
test('source contract permits only current evidence and preserves intent constraints',()=>{
 const Ajv=require('ajv'),sources=[{id:'current-user',kind:'user'},{id:'current-expert',kind:'expert'}];
 const validate=new Ajv({strict:false}).compile(schemaForSources(sources));
 const item={id:'scope',kind:'proposal',text:'Suggested scope',sourceIds:['current-user']};
 const withItem=i=>response({brief:{goal:'Goal',items:[i]}});
 assert.equal(validate(withItem(item)),true);
 for(const sourceIds of [[],['old-guide'],['scope'],['current-user','invented']])assert.equal(validate(withItem({...item,sourceIds})),false);
 assert.equal(validate(withItem({...item,text:'   '})),false);
 assert.equal(validate(response()),true,'Early clarification need not invent brief items');
 assert.deepEqual(schemaForSources(sources,'restart-guide').properties.action.enum,['restart-guide']);
 assert.deepEqual(schemaForSources(sources,'explain-node').properties.action.enum,['reply']);
 const empty=new Ajv({strict:false}).compile(schemaForSources([]));assert.equal(empty(response()),true);assert.equal(empty(withItem(item)),false);
 assert.throws(()=>checked(withItem({...item,kind:'decision',sourceIds:['current-expert']}),sources,[],new Set(),0),/用户决定/);
});
test('invalid citations receive one inference repair across Chat and Responses adapters',async t=>{
 for(const protocol of ['chat','responses'])for(const invalidRefs of [[],['project-not-a-source']])await t.test(protocol+' '+JSON.stringify(invalidRefs),async t=>{
  const f=await fixture(t),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0,sourceId;
  f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'generic-model',protocol});
  f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
  global.fetch=async(_url,options)=>{
   calls++;const body=JSON.parse(options.body),input=JSON.parse(protocol==='chat'?body.messages[1].content:body.input);sourceId=input.sources.at(-1).id;
   if(calls===2){assert.match(protocol==='chat'?body.messages[0].content:body.instructions,/sourceIds/);assert.equal((await f.service.read()).requests[0].host.steps.length,0);}
   const content=JSON.stringify(response({brief:{goal:'Goal',items:[{id:'scope',kind:'decision',text:'User scope',sourceIds:calls===1?invalidRefs:[sourceId]}]}}));
   return new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:'stop',message:{content}}]}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:content}]}]}));
  };
  await f.start();const result=await f.finish();assert.equal(calls,2);assert.equal(result.host.status,'completed',result.host.error);
  assert.deepEqual(result.host.brief.items[0].sourceIds,[sourceId]);assert.equal(result.host.steps.length,1);assert.equal(f.runtime.starts.length,0);
 });
});
test('failed citation repair preserves submitted answers and reports safe validation diagnostics',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'ask',questions:[{label:'Scope?',help:'',type:'textarea',options:[],defaultValue:''}]});
 await f.start();const first=await f.finish(),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'generic-model',protocol:'chat'});
 f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response({action:'plan',brief:{goal:'New goal',items:[{id:'scope',kind:'decision',text:'PRIVATE_TEXT',sourceIds:['PRIVATE_BAD_ID']}]}}))}}]}));};
 await f.start({replyTo:first.id,answerTo:first.id,answers:{answer0:'Public test deployment'},prompt:'Answer'});const failed=await f.finish(),state=await f.service.read();
 assert.equal(calls,2);assert.equal(failed.host.status,'failed');assert.equal(failed.host.errorCode,'INVALID_OUTPUT');assert.match(failed.host.error,/来源.*校验/);assert.doesNotMatch(failed.host.error,/无法解析/);
 assert.equal(failed.host.outputDiagnostics.stage,'schema');assert.equal(failed.host.outputDiagnostics.attempts,2);assert.doesNotMatch(JSON.stringify(failed.host.outputDiagnostics),/PRIVATE/);
 assert.deepEqual(failed.host.brief,first.host.brief);assert.equal(failed.host.steps.length,0);assert.equal(state.requests.find(r=>r.id===first.id).host.question.answers.answer0,'Public test deployment');
 assert.equal(state.taskDrafts.length,0);assert.equal(state.plans.length,0);assert.equal(f.runtime.starts.length,0);
});
test('citation validation survives schema and JSON format fallback within the shared request budget',async t=>{
 const f=await fixture(t),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'generic-model',protocol:'chat'});f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 global.fetch=async(_url,options)=>{
  calls++;const body=JSON.parse(options.body);
  if(calls<=2){assert.equal(body.response_format.type,calls===1?'json_schema':'json_object');return new Response(JSON.stringify({error:{message:'response_format is not supported'}}),{status:400});}
  assert.equal(body.response_format,undefined);const input=JSON.parse(body.messages[1].content),sourceId=input.sources.at(-1).id;
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response({brief:{goal:'Goal',items:[{id:'scope',kind:'proposal',text:'Scope',sourceIds:[calls===3?'invented':sourceId]}]}}))}}]}));
 };
 await f.start();const result=await f.finish();assert.equal(calls,4);assert.equal(result.host.status,'completed',result.host.error);assert.equal(result.host.steps.length,1);assert.equal(f.runtime.starts.length,0);
});
test('restart excludes old source IDs from both context and repaired output',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response();await f.start();const first=await f.finish();
 f.service.generateDiscussionHost=async()=>response({action:'restart-guide'});await f.start({replyTo:first.id,prompt:'重新引导'});const reset=await f.finish(),draft=(await f.service.read()).taskDrafts[0];
 const original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'generic-model',protocol:'chat'});f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 global.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);assert.ok(input.sources.every(s=>s.id!==first.id));
  const sourceId=input.sources.at(-1).id;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response({brief:{goal:'New goal',items:[{id:'scope',kind:'decision',text:'New scope',sourceIds:[calls===1?first.id:sourceId]}]}}))}}]}));};
 await f.start({replyTo:reset.id,taskContext:{draftId:draft.id,draftRevision:draft.revision},prompt:'新的目标'});const result=await f.finish();
 assert.equal(calls,2);assert.equal(result.host.status,'completed');assert.deepEqual(result.host.brief.items[0].sourceIds,[result.id]);assert.equal(f.runtime.starts.length,0);
});
test('stopping during citation repair prevents late valid output from dispatching',async t=>{
 const f=await fixture(t),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0,release;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'generic-model',protocol:'chat'});f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 const wire=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 global.fetch=async()=>{if(++calls===1)return wire(response({brief:{goal:'Scope',items:[{id:'scope',kind:'proposal',text:'Scope',sourceIds:[]}]}}));return new Promise(resolve=>{release=()=>resolve(wire(delegate('product')));});};
 await f.start();await until(()=>!!release);const id=(await f.service.read()).requests[0].id;await f.service.stopDiscussionHost({requestId:id});release();await tick();
 const result=await f.finish();assert.equal(calls,2);assert.equal(result.host.status,'interrupted');assert.equal(result.host.steps.length,0);assert.equal(f.runtime.starts.length,0);
});
test('host repairs a multi-question response into one decision before presenting a form',async t=>{
 const f=await fixture(t),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'fixture',protocol:'chat'});
 f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 const question={label:'Who is the first release for?',help:'This defines the delivery scope.',type:'select',options:[{label:'Internal team',value:'internal'}],defaultValue:''};
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response({action:'ask',questions:calls===1?[question,{...question,label:'Another unrelated decision?'}]:[question]}))}}]}));};
 await f.start();const result=await f.finish();assert.equal(calls,2);assert.equal(result.host.status,'needs-input');assert.equal(result.host.question.source.definition.fields.length,1);assert.equal(f.runtime.starts.length,0);
});
test('H12 malformed host output retries only inference and preserves submitted answers if both responses fail',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'ask',questions:[{label:'Access?',help:'',type:'select',options:[{label:'Test HTTP',value:'test'}],defaultValue:''}]});
 await f.start();const first=await f.finish();const original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'deepseek-test',protocol:'chat'});
 f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'private invalid text'}}]}));};
 await f.start({replyTo:first.id,answerTo:first.id,answers:{answer0:'test'},prompt:'Confirm access'});const failed=await f.finish();
 assert.equal(calls,2);assert.equal(failed.host.status,'failed');assert.equal(failed.host.errorCode,'INVALID_OUTPUT');assert.match(failed.host.error,/选择.*保留/);assert.ok(!failed.host.error.includes('INVALID_OUTPUT'));assert.deepEqual(failed.host.outputDiagnostics,{stage:'content',reason:'invalid-json',characters:20,attempts:2,protocol:'chat',mode:'schema'});
 assert.equal(failed.prompt,'Access?：Test HTTP');const state=await f.service.read();assert.equal(state.requests.find(r=>r.id===first.id).host.question.answers.answer0,'test');assert.equal(state.plans.length,0);assert.equal(f.runtime.runs.length,0);
 calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:calls===1?'bad':JSON.stringify(response())}}]}));};
 await f.start({replyTo:failed.id,prompt:'Continue with my confirmed choices'});const recovered=await f.finish();assert.equal(recovered.host.status,'completed');assert.equal(calls,2);assert.equal(recovered.host.steps.length,1);assert.equal(f.runtime.runs.length,0);
});
test('H13 valid JSON still cannot invent experts or bypass host validation',async t=>{
 const f=await fixture(t),original=global.fetch;t.after(()=>{global.fetch=original;});let calls=0;
 f.service.workforce.providers.secret=async()=>({baseUrl:'https://model.example/v1',model:'deepseek-test',protocol:'chat'});f.service.generateDiscussionHost=require('../core/automation/provider.cjs').generate;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(delegate('invented-expert'))}}]}));};
 await f.start();const result=await f.finish();assert.equal(result.host.status,'failed');assert.match(result.host.error,/未授权/);assert.equal(calls,1);assert.equal(f.runtime.runs.length,0);
});
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
 await f.service.stopDiscussionHost({requestId:clientRequestId});resolve(delegate('product'));await tick();const r=await f.finish();assert.equal(r.host.status,'interrupted');assert.equal(r.host.errorCode,'DISCUSSION_STOPPED');assert.match(r.host.error,/讨论已停止/);assert.ok(!r.host.error.includes('超时'));assert.equal(f.runtime.runs.length,0);
});
test('H06 cancelling while an expert is starting stops its late run',async t=>{
 const f=await fixture(t);let release,started;const old=f.runtime.start.bind(f.runtime);f.runtime.start=(...args)=>{started=true;return new Promise(r=>release=()=>old(...args).then(r));};f.service.generateDiscussionHost=async()=>delegate('product');await f.start();await until(()=>started);const id=(await f.service.read()).requests[0].id;await f.service.stopDiscussionHost({requestId:id});await release();await until(()=>f.runtime.runs[0]?.status==='interrupted');assert.equal((await f.finish()).host.status,'interrupted');
});
test('H06 expert execution and approval waits have no coordination time limit',async t=>{
 for(const status of ['running','waiting'])await t.test(status,async t=>{
  const f=await fixture(t),timeout=AbortSignal.timeout.bind(AbortSignal);
  // Compress the old ten-minute deadline without waiting ten real minutes.
  t.mock.method(AbortSignal,'timeout',ms=>timeout(ms===600000?20:ms));
  let calls=0;f.service.generateDiscussionHost=async()=>++calls===1?delegate('product'):response();
  await f.start();await until(()=>f.runtime.runs.length===1);
  f.runtime.runs[0].status=status;
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(f.runtime.runs[0].status,status);assert.equal(f.service.hostJobs.size,1);assert.equal(calls,1);
  Object.assign(f.runtime.runs[0],{status:'completed',messages:[{role:'assistant',text:'Expert evidence'}]});
  const result=await f.finish();assert.equal(result.host.status,'completed');assert.equal(calls,2);
  assert.equal(result.participants[0].output,'Expert evidence');assert.equal(result.participants[0].error,undefined);
 });
});
test('H06 stopping an expert wait preserves completed results and the explicit stop reason',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'delegate',delegates:[...delegate('product').delegates,...delegate('architect').delegates]});
 await f.start();await until(()=>f.runtime.runs.length===2);
 Object.assign(f.runtime.runs[0],{status:'completed',messages:[{role:'assistant',text:'Completed evidence'}]});f.runtime.runs[1].status='waiting';
 await new Promise(resolve=>setTimeout(resolve,20));
 const id=(await f.service.read()).requests[0].id;await f.service.stopDiscussionHost({requestId:id});const result=await f.finish();
 assert.equal(result.host.status,'interrupted');assert.equal(result.host.errorCode,'DISCUSSION_STOPPED');assert.match(result.host.error,/讨论已停止/);
 assert.equal(f.runtime.runs[0].status,'completed');assert.equal(f.runtime.runs[1].status,'interrupted');
 assert.equal(result.participants[0].output,'Completed evidence');assert.equal(result.participants[0].error,undefined);
 assert.equal((await f.service.read()).requests[0].participants[0].status,'completed');
 await f.service.change(s=>{s.requests[0].host.status='running';});await f.service.initialize();clearInterval(f.service.plans.timer);assert.equal((await f.service.read()).requests[0].host.status,'interrupted');assert.equal(f.runtime.runs.length,2);
});
test('H06 host summary failure does not overwrite a completed expert in persistence',async t=>{
 const f=await fixture(t);let calls=0;f.service.generateDiscussionHost=async()=>{if(++calls===1)return delegate('product');throw Error('Summary provider unavailable');};
 await f.start();await until(()=>f.runtime.runs.length===1);f.runtime.runs[0].status='completed';
 const result=await f.finish();assert.equal(result.host.status,'failed');assert.match(result.host.error,/Summary provider unavailable/);
 const stored=(await f.service.read()).requests[0].participants[0];assert.equal(stored.status,'completed');assert.equal(stored.error,undefined);
 assert.equal(result.participants[0].status,'completed');assert.equal(result.participants[0].error,undefined);
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
 f.service.workforce.providers.secret=async()=>({});f.service.hostIdleTimeoutMs=10;f.service.generateDiscussionHost=()=>new Promise(()=>{});await f.start();assert.equal((await f.finish()).host.status,'failed');
 f.service.hostIdleTimeoutMs=300000;let release;f.service.generateDiscussionHost=()=>new Promise(r=>release=r);await f.start();await until(()=>!!release);await assert.rejects(f.service.save({id:f.space.id,expectedRevision:1,value:{...f.space,members:[]}}),/活跃任务/);await f.service.change(s=>{s.spaces[0].revision++;});release(delegate('product'));const last=await f.finish();assert.equal(last.prompt,'Plan a repair ticket system');assert.match(last.host.error,/分工已变化/);assert.equal(f.runtime.runs.length,0);
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

const taskResult=(overrides={})=>({summary:'规划说明：先核对范围，再完成交付并验收。',ready:true,questions:[],value:{name:'Delivery plan',goal:'Deliver verified results',packages:[{id:'scope',title:'Verify scope',ownerId:'product',mode:'discussion',projectId:'',instruction:'Analyze the confirmed requirements',deliverables:'Scope report',acceptance:'Every requirement is covered',verification:'Compare each requirement',constraints:'No project execution',dependencies:[],documentIds:[],projectBinding:{responsibility:'',relations:[],reason:''}}]},...overrides});
test('explicit node explanation cannot create questions, replan, delegate or consume unanswered input',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();
 await f.start({prompt:'生成任务'});const first=await f.finish(),draft=(await f.service.read()).taskDrafts[0];
 const target={draftId:draft.id,draftRevision:draft.revision,packageId:'scope'};
 for(const action of ['plan','new-plan','delegate','ask']){
  f.service.generateDiscussionHost=async(_c,job)=>{assert.deepEqual(job.outputSchema.properties.action.enum,['reply']);assert.equal(job.outputSchema.properties.questions.maxItems,0);return response({action});};
  f.service.generateTaskGuide=async()=>{throw Error('Explanation must not prepare tasks');};
  await f.start({replyTo:first.id,intent:'explain-node',taskContext:target,prompt:'解释节点'});const result=await f.finish();assert.equal(result.host.status,'failed');assert.match(result.host.error,/计划未修改/);assert.deepEqual((await f.service.read()).taskDrafts,[draft]);assert.equal(f.runtime.starts.length,0);
 }
 await f.service.change(s=>{s.requests.find(r=>r.id===first.id).host.question={requestKey:'pending',source:{kind:'dynamic',definition:{title:'A pending decision',fields:[{name:'answer0',type:'textarea',label:'Scope',required:true}]}},prefill:{}};});
 f.service.generateDiscussionHost=async()=>response({message:'This node verifies the API contract.'});
 await f.start({replyTo:first.id,intent:'explain-node',taskContext:target,prompt:'解释节点'});const result=await f.finish();assert.equal(result.host.status,'completed');assert.equal(result.intent,'explain-node');assert.equal(result.host.question,null);assert.deepEqual((await f.service.read()).taskDrafts,[draft]);assert.equal((await f.service.read()).requests.find(r=>r.id===first.id).host.question.answeredBy,undefined);
 const count=(await f.service.read()).requests.length;await assert.rejects(f.start({replyTo:first.id,intent:'explain-node',prompt:'没有选择节点'}),/选择要解释/);assert.equal((await f.service.read()).requests.length,count);
});
test('H07 host creates and revises the same draft, explains without writes and reports actual plan state',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();
 await f.start({prompt:'生成任务'});const first=await f.finish();assert.equal(first.host.status,'ready');assert.ok(first.host.task.draftId);let d=(await f.service.read()).taskDrafts[0];assert.equal(f.runtime.runs.length,0);assert.equal((await f.service.read()).plans.length,0);
 f.service.generateDiscussionHost=async(_c,r)=>{assert.equal(r.input.taskContext.draft.id,d.id);assert.equal(r.input.latestUserRequest,'为什么这样安排？');return response();};
 await f.start({replyTo:first.id,prompt:'为什么这样安排？'});const explanation=await f.finish();assert.equal((await f.service.read()).taskDrafts[0].revision,d.revision);
 f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async(_c,r)=>{assert.equal(r.input.value.packages[0].id,'scope');assert.ok(r.input.source.some(s=>s.prompt==='为什么这样安排？'));return taskResult({value:{...r.input.value,goal:'New public delivery goal',packages:r.input.value.packages.map(p=>({...p,instruction:'Verify public deployment',documentIds:[]}))}});};
 await f.start({replyTo:explanation.id,prompt:'改成公网交付'});const changed=await f.finish();d=(await f.service.read()).taskDrafts[0];assert.equal(changed.host.task.draftId,first.host.task.draftId);assert.equal(d.value.goal,'New public delivery goal');assert.equal(changed.host.task.changes.goalChanged,true);assert.deepEqual(changed.host.task.changes.changed,['Verify scope']);
 const plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});assert.equal(plan.status,'draft');
 await f.service.change(s=>{s.plans[0].packages[0].status='review';s.plans[0].packages[0].reason='Awaiting human acceptance';});
 f.service.generateDiscussionHost=async(_c,r)=>{assert.equal(r.input.taskContext.progress.nodes[0].status,'review');assert.equal(r.input.taskContext.progress.nodes[0].accepted,false);return response({action:'status',message:'执行已结束，仍待验收。'});};
 await f.start({replyTo:changed.id,prompt:'进度如何？'});const status=await f.finish();assert.equal(status.host.progress.planId,plan.id);assert.equal(status.host.progress.nodes[0].status,'review');assert.equal((await f.service.read()).plans.length,1);assert.equal(f.runtime.runs.length,0);
});
test('H08 host revision does not mutate running plan; explicit apply pauses and preserves version history',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();await f.start({prompt:'生成任务'});const first=await f.finish(),d=(await f.service.read()).taskDrafts[0];let plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 await f.service.change(s=>{s.plans[0].status='running';});
 f.service.generateTaskGuide=async(_c,r)=>taskResult({value:{...r.input.value,packages:r.input.value.packages.map(p=>({...p,instruction:'Revised instructions',documentIds:[]}))}});
 await f.start({replyTo:first.id,prompt:'修改这个任务'});const revised=await f.finish(),draft=(await f.service.read()).taskDrafts.find(d=>d.id===revised.host.task.draftId);assert.equal(draft.basePlanId,plan.id);assert.equal(draft.basePlanRevision,1);assert.equal((await f.service.read()).plans[0].status,'running');assert.equal((await f.service.read()).plans[0].packages[0].definition.instruction,'Analyze the confirmed requirements');
 await assert.rejects(f.service.createGuidedPlan({id:draft.id,expectedRevision:draft.revision}),/暂停/);
 plan=await f.service.createGuidedPlan({id:draft.id,expectedRevision:draft.revision,pauseBeforeApply:true});assert.equal(plan.revision,2);assert.equal(plan.status,'draft');assert.equal(plan.packages[0].definition.instruction,'Revised instructions');assert.equal(plan.versions.length,2);assert.equal(plan.source.discussionId,first.id);assert.equal(f.runtime.runs.length,0);
 assert.equal((await f.service.createGuidedPlan({id:draft.id,expectedRevision:draft.revision,pauseBeforeApply:true})).revision,2);
});
test('H09 stopped planning cannot commit a late model reply and manual edits win revision conflicts',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});let release;f.service.generateTaskGuide=()=>new Promise(r=>release=r);await f.start({prompt:'生成任务'});await until(()=>!!release);const r=(await f.service.read()).requests[0];await f.service.stopDiscussionHost({requestId:r.id});release(taskResult());await tick();assert.equal((await f.finish()).host.status,'interrupted');assert.equal((await f.service.read()).taskDrafts[0].value.packages.length,0);
 release=null;await f.start({replyTo:r.id,prompt:'继续规划'});await until(()=>!!release);const d=(await f.service.read()).taskDrafts[0];await f.service.saveTaskDraft({id:d.id,expectedRevision:d.revision,value:{...d.value,name:'Manual wins'}});release(taskResult());assert.equal((await f.finish()).host.status,'failed');assert.equal((await f.service.read()).taskDrafts[0].value.name,'Manual wins');assert.equal(f.runtime.runs.length,0);
});
test('H10 new goal creates a separate draft, invalid topic targets are rejected and stale base rebases on current plan',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();await f.start({prompt:'生成任务'});const first=await f.finish();let d=(await f.service.read()).taskDrafts[0],plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 await f.start({replyTo:first.id,prompt:'修订计划'});const r=await f.finish(),revision=(await f.service.read()).taskDrafts.find(d=>d.id===r.host.task.draftId);
 plan=await f.service.savePlan({id:plan.id,expectedRevision:plan.revision,spaceId:f.space.id,value:{name:plan.name,goal:'Manual latest goal',packages:plan.packages.map(p=>p.definition)}});
 await assert.rejects(f.service.createGuidedPlan({id:revision.id,expectedRevision:revision.revision}),/新版本/);
 f.service.generateTaskGuide=async(_c,r)=>{assert.equal(r.input.value.goal,'Manual latest goal');return taskResult({value:{...r.input.value,packages:r.input.value.packages.map(p=>({...p,documentIds:[]}))}});};
 await f.start({replyTo:r.id,prompt:'基于最新版本重新修订',taskContext:{draftId:revision.id,draftRevision:revision.revision}});const rebased=await f.finish();assert.notEqual(rebased.host.task.draftId,revision.id);assert.equal((await f.service.read()).taskDrafts[0].basePlanRevision,plan.revision);
 f.service.generateDiscussionHost=async()=>response({action:'new-plan'});f.service.generateTaskGuide=async()=>taskResult();await f.start({replyTo:rebased.id,prompt:'另建一个新目标的计划'});const fresh=await f.finish();assert.notEqual(fresh.host.task.draftId,rebased.host.task.draftId);assert.equal((await f.service.read()).taskDrafts[0].basePlanId,undefined);
 await assert.rejects(f.start({prompt:'新话题',taskContext:{planId:plan.id}}),/不属于/);assert.equal((await f.service.read()).plans.length,1);
});
test('H11 progress includes persistent pending input without leaking unsubmitted answers',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();await f.start({prompt:'生成任务'});const first=await f.finish(),d=(await f.service.read()).taskDrafts[0],plan=await f.service.createGuidedPlan({id:d.id,expectedRevision:d.revision});
 await f.service.change(s=>{s.plans[0].status='running';s.plans[0].packages[0].status='running';s.plans[0].packages[0].attempts=[{id:'attempt',runId:'run',requestId:'req',planRevision:1}];});f.runtime.runs.push({id:'run',status:'running',messages:[],questions:[],approvals:[]});f.runtime.inputRequests={list:async()=>[{state:'pending',template:{title:'确认项目环境'},reason:'请选择环境',draft:{environment:'PRIVATE_UNSUBMITTED'}}]};
 f.service.generateDiscussionHost=async(_c,r)=>{assert.equal(r.input.taskContext.progress.nodes[0].inputCount,1);assert.equal(r.input.taskContext.progress.nodes[0].pendingInputs[0].title,'确认项目环境');assert.doesNotMatch(JSON.stringify(r.input),/PRIVATE_UNSUBMITTED/);return response({action:'status'});};
 await f.start({replyTo:first.id,prompt:'检查状态',taskContext:{planId:plan.id,planRevision:1}});assert.equal((await f.finish()).host.progress.nodes[0].inputCount,1);assert.equal(f.runtime.starts.length,0);
});

test('restart guide preserves old work and isolates later planning from unconfirmed history',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'plan'});f.service.generateTaskGuide=async()=>taskResult();
 await f.start({prompt:'旧要求：生成工单任务'});const first=await f.finish(),old=(await f.service.read()).taskDrafts[0];
 f.service.generateDiscussionHost=async()=>response({action:'restart-guide',message:'旧稿保留。现在最希望解决什么问题？'});
 f.service.generateTaskGuide=async()=>{throw Error('Restart must not auto-plan');};
 await f.start({replyTo:first.id,prompt:'开始新的引导',taskContext:{draftId:old.id,draftRevision:old.revision}});const reset=await f.finish();
 assert.equal(reset.host.task.restarted,true);assert.equal(reset.host.question,null);
 let state=await f.service.read(),fresh=state.taskDrafts.find(d=>d.id===reset.host.task.draftId);
 assert.deepEqual(state.taskDrafts.find(d=>d.id===old.id),old);assert.equal(fresh.value.packages.length,0);assert.deepEqual(fresh.source.map(r=>r.id),[reset.id]);
 f.service.generateDiscussionHost=async(_c,job)=>{assert.ok(job.input.sources.every(s=>!s.text.includes('旧要求')));assert.equal(job.input.taskContext.draft.value.packages.length,0);return response({action:'plan'});};
 f.service.generateTaskGuide=async(_c,job)=>{assert.ok(job.input.source.every(s=>s.id!==first.id));return taskResult();};
 await f.start({replyTo:reset.id,prompt:'新要求：规划离线阅读器',taskContext:{draftId:fresh.id,draftRevision:fresh.revision}});const planned=await f.finish();
 assert.notEqual(planned.host.status,'failed',planned.host.error);assert.equal(planned.host.task.draftId,fresh.id);
 state=await f.service.read();assert.ok(state.taskDrafts.find(d=>d.id===fresh.id).source.every(r=>r.id!==first.id));assert.deepEqual(state.taskDrafts.find(d=>d.id===old.id),old);assert.equal(f.runtime.starts.length,0);
});

test('explicit restart rejects incompatible model output and cannot reset another topic source',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async(_c,job)=>{assert.deepEqual(job.outputSchema.properties.action.enum,['restart-guide']);return response({action:'plan'});};
 await f.start({intent:'restart-guide',prompt:'重新引导'});const failed=await f.finish();assert.equal(failed.host.status,'failed');assert.equal((await f.service.read()).taskDrafts.length,0);
 await assert.rejects(f.service.createTaskDraft({spaceId:f.space.id,discussionId:failed.id,commandId:randomUUID(),newPlan:true,sourceFromRequestId:randomUUID()}),/来源/);
});

// Short clocks exercise production timeout policy without slow provider calls.
test('host tolerates long active generation and disables the provider total deadline',async t=>{
 const f=await fixture(t);f.service.hostIdleTimeoutMs=100;
 f.service.generateDiscussionHost=async(_config,job,_signal,progress)=>{
  assert.equal(job.timeoutMs,null);
  for(let i=1;i<=8;i++){await new Promise(r=>setTimeout(r,25));await progress({phase:'responding',reasoning:'',receivedCharacters:i});}
  return response();
 };
 await f.start();const done=await f.finish();assert.equal(done.host.status,'completed');assert.ok(done.host.activity.lastProgressAt);assert.ok(done.host.activity.finishedAt>=done.host.activity.lastProgressAt);assert.equal(f.runtime.starts.length,0);
});
test('host silence timeout preserves answers, ignores heartbeat metadata and rejects late decisions',async t=>{
 const f=await fixture(t);f.service.generateDiscussionHost=async()=>response({action:'ask',questions:[{label:'Scope?',help:'',type:'select',options:[{label:'Read only',value:'read'}],defaultValue:''}]});
 await f.start();const first=await f.finish();let emit,release,calls=0,timer;
 f.service.hostIdleTimeoutMs=70;
 f.service.generateDiscussionHost=async(_config,_job,_signal,progress)=>{
  calls++;emit=progress;await progress({phase:'reasoning',reasoning:'Reviewing the answer',receivedCharacters:20});
  timer=setInterval(()=>{void progress({phase:'reasoning',reasoning:'Reviewing the answer',receivedCharacters:20});},10);
  return new Promise(r=>{release=r;});
 };
 t.after(()=>clearInterval(timer));await f.start({replyTo:first.id,answerTo:first.id,answers:{answer0:'read'},prompt:'Confirm scope'});const failed=await f.finish();clearInterval(timer);
 assert.equal(failed.host.status,'failed');assert.equal(failed.host.errorCode,'MODEL_RESPONSE_TIMEOUT');assert.match(failed.host.error,/长时间没有返回新内容/);assert.equal(calls,1);assert.equal(failed.prompt,'Scope?：Read only');assert.equal(failed.host.activity.reasoning,'Reviewing the answer');assert.ok(failed.host.finishedAt);assert.ok(failed.host.outputDiagnostics.silentMs>=60);
 assert.equal((await f.service.read()).requests.find(r=>r.id===first.id).host.question.answers.answer0,'read');
 await emit({phase:'reasoning',reasoning:'Late overwrite',receivedCharacters:100});release(delegate('product'));await tick();
 assert.equal((await f.service.read()).requests[0].host.activity.reasoning,'Reviewing the answer');assert.equal(f.runtime.starts.length,0);
 f.service.generateDiscussionHost=async()=>response();await f.start({replyTo:failed.id,prompt:'Continue with my confirmed answer'});assert.equal((await f.finish()).host.status,'completed');
});
test('host active reasoning can still be stopped without replaying a decision',async t=>{
 const f=await fixture(t);f.service.hostIdleTimeoutMs=100;let calls=0,timer,release;
 f.service.generateDiscussionHost=async(_config,job,signal,progress)=>{
  assert.equal(job.timeoutMs,null);calls++;let characters=0;timer=setInterval(()=>{void progress({phase:'reasoning',reasoning:'Thinking',receivedCharacters:++characters});},15);
  signal.addEventListener('abort',()=>clearInterval(timer),{once:true});return new Promise(r=>{release=r;});
 };
 t.after(()=>clearInterval(timer));await f.start();await until(()=>!!release);await new Promise(r=>setTimeout(r,220));
 const active=(await f.service.snapshot()).requests[0];assert.equal(active.host.status,'running');
 await f.service.stopDiscussionHost({requestId:active.id});release(delegate('product'));const stopped=await f.finish();
 assert.equal(stopped.host.errorCode,'DISCUSSION_STOPPED');assert.equal(stopped.host.status,'interrupted');assert.equal(calls,1);assert.ok(stopped.host.activity.lastProgressAt);assert.equal(f.runtime.starts.length,0);assert.equal(f.service.spaceLocks.size,0);
});
