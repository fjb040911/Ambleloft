const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {ChatInputs}=require('../core/forms/chat-inputs.cjs');
const {InputRequests}=require('../core/inputs/service.cjs');
const {bindModelInputs}=require('../core/inputs/model.cjs');
const {createAgentChannel}=require('../core/extensions/agent-channel.cjs');
const definition=()=>structuredClone(require('../specs/extensions/examples/user-input/travel.json'));
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'input-model-')),database=new Database(root);
 const runtime={runs:[{id:'run',status:'running',messages:[],tools:[]},{id:'other',status:'running',messages:[],tools:[]}]};
 await database.call('saveRuns',runtime.runs);
 const queue=new ChatInputs({database,runtime,publish:()=>{},validate:async()=>{}});queue.tick=()=>{};
 const service=new InputRequests({database,runtime,chatInputs:queue,publish:()=>{}});
 const api=bindModelInputs(service,'run');
 t.after(async()=>{await queue.shutdown();await database.close();await fs.rm(root,{recursive:true,force:true});});
 const messages=async items=>{runtime.runs[0].messages=items;await database.call('saveRuns',runtime.runs);};
 return {root,api,service,queue,database,runtime,messages};
}
const user=(id,text)=>({id,text,role:'user',inputSource:'user',inputDeliveryState:'delivered'});
const answer={destination:'beijing',date:'2026-11-01',days:3};
test('model projection hides drafts, isolates chats and returns durable creation receipts',async t=>{
 const f=await fixture(t),input=definition();
 const a=await f.api.call('input_request',input);assert.equal(a.ok,true);assert.equal(a.value.created,true);
 const r=(await f.service.list('run'))[0];await f.service.action({runId:'run',requestId:r.id,expectedRevision:r.revision,clientMutationId:'draft',action:'saveDraft',values:{name:'PRIVATE DRAFT'}});
 const list=await f.api.call('input_list',{});assert.equal(JSON.stringify(list).includes('PRIVATE DRAFT'),false);assert.equal(list.value.requests[0].draftTouched,true);
 const read=await f.api.call('input_read_answer',{requestId:r.id});assert.equal(read.value.answer,null);assert.equal(JSON.stringify(read).includes('draft'),false);
 assert.equal((await bindModelInputs(f.service,'other').call('input_read_answer',{requestId:r.id})).error.code,'NOT_FOUND');
 assert.equal((await f.api.call('input_request',{...input,runId:'other'})).error.code,'INVALID_ARGUMENT');
 const repeat=await f.api.call('input_request',input);assert.equal(repeat.value.created,false);assert.equal(repeat.value.revision,1);
 assert.equal((await f.api.call('input_request',{...input,reason:'Different'})).error.code,'CONFLICT');
});
test('message resolution freezes real evidence, is idempotent, and never enqueues the original message',async t=>{
 const f=await fixture(t);await f.messages([user('m','去北京，11月1日出发，三天')]);
 const r=(await f.api.call('input_request',definition())).value;
 const args={requestId:r.requestId,expectedRevision:0,sourceMessageIds:['m'],values:answer};
 const first=await f.api.call('input_resolve_from_message',args);assert.equal(first.value.outcome,'resolved');
 assert.deepEqual(await f.api.call('input_resolve_from_message',args),first);
 const read=await f.api.call('input_read_answer',{requestId:r.requestId});assert.equal(read.value.answer.source,'userMessage');assert.equal(read.value.answer.sourceMessages[0].text,'去北京，11月1日出发，三天');assert.equal(read.value.delivery,null);
 assert.equal((await f.queue.snapshot('run')).deliveries.length,0);
 const repeat=await f.api.call('input_request',definition());assert.equal(repeat.value.state,'answered');assert.equal(repeat.value.created,false);
});
test('assistant, generated, queued, unknown legacy and foreign evidence is rejected',async t=>{
 const f=await fixture(t);await f.messages([{...user('assistant','x'),role:'assistant'},{...user('form','x'),formSubmissionId:'f'},{...user('queued','x'),inputDeliveryState:'queued'},{id:'legacy',role:'user',text:'x'}]);
 const r=(await f.api.call('input_request',definition())).value;
 assert.deepEqual((await f.api.call('input_list',{})).value.sourceMessages,[]);
 for(const id of ['assistant','form','queued','legacy','foreign'])assert.equal((await f.api.call('input_resolve_from_message',{requestId:r.requestId,expectedRevision:0,sourceMessageIds:[id],values:answer})).error.code,'FORBIDDEN');
 assert.equal((await f.service.list('run'))[0].state,'pending');
});
test('edited drafts require confirmation and remain unchanged; proposals do not leak draft or evidence',async t=>{
 const f=await fixture(t);await f.messages([user('m','北京')]);const r=await f.service.createDynamic('run',definition());
 await f.service.action({runId:'run',requestId:r.id,expectedRevision:0,clientMutationId:'edit',action:'beginEdit'});
 const result=await f.api.call('input_resolve_from_message',{requestId:r.id,expectedRevision:1,sourceMessageIds:['m'],values:answer});
 assert.equal(result.value.outcome,'confirmationRequired');assert.equal((await f.service.list('run'))[0].state,'pending');
 const listed=(await f.api.call('input_list',{})).value.requests[0];assert.deepEqual(Object.keys(listed.proposal).sort(),['id','kind']);assert.equal((await f.queue.snapshot('run')).deliveries.length,0);
});
test('source message summaries are bounded and explicitly truncated',async t=>{
 const f=await fixture(t);await f.messages(Array.from({length:25},(_,i)=>user('m'+i,'旅'.repeat(3000))));
 const listed=(await f.api.call('input_list',{})).value;assert.equal(listed.sourcesTruncated,true);assert.ok(listed.sourceMessages.length<=20);assert.ok(Buffer.byteLength(JSON.stringify(listed.sourceMessages))<=32768);assert.ok(listed.sourceMessages.every(m=>m.truncated&&m.text.length<=2000));
 const r=(await f.api.call('input_request',definition())).value;
 const result=await f.api.call('input_resolve_from_message',{requestId:r.requestId,expectedRevision:0,sourceMessageIds:['m0'],values:answer});assert.equal(result.value.outcome,'resolved');
});
test('static opt-in binds trusted catalog identity and locale and rejects business operations',async t=>{
 const f=await fixture(t),template={version:1,id:'travel',title:'Travel',fields:[{name:'city',type:'text',label:'City'}],submit:{kind:'chat',label:'Send'}};
 let entry={key:'skill:travel:travel',revision:'v1',digest:'digest',template};
 const forms={locale:()=> 'en',catalog:async()=>({entries:[entry]}),displayEntry:e=>e.template};const api=bindModelInputs(f.service,'run',{forms});
 const input={requestKey:'static',reason:'Travel details',source:{kind:'template',key:entry.key}};
 assert.equal((await api.call('input_request',input)).ok,true);const saved=(await f.service.list('run'))[0];assert.equal(saved.originKey,'skill:travel');assert.equal(saved.sourceKey,entry.key);assert.equal(saved.locale,'en');
 entry={...entry,template:{...template,submit:{kind:'operation',label:'Pay',operation:'demo.pay',input:{}}}};
 assert.equal((await api.call('input_request',{...input,requestKey:'business'})).error.code,'UNSUPPORTED');
});
test('authenticated MCP publishes only implemented tools, returns immediately and rejects expired owner',async t=>{
 const f=await fixture(t);let active=true;const inputs=bindModelInputs(f.service,'run',{validate:()=>{if(!active)throw Object.assign(Error('CANCELLED'),{code:'CANCELLED'});}});
 const channel=await createAgentChannel({inputs,list:async()=>[],invoke:async()=>{}});t.after(()=>channel.close());
 const rpc=async(method,params)=>(await (await fetch(channel.config.url,{method:'POST',headers:channel.config.http_headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;
 const tools=(await rpc('tools/list')).tools.map(t=>t.name);assert.ok(tools.includes('input_request'));assert.ok(tools.includes('input_cancel'));assert.ok(tools.includes('input_replace'));
 const created=await rpc('tools/call',{name:'input_request',arguments:definition()});assert.equal(JSON.parse(created.content[0].text).value.state,'pending');
 active=false;const stale=await rpc('tools/call',{name:'input_list',arguments:{}});assert.equal(stale.isError,true);assert.equal(JSON.parse(stale.content[0].text).error.code,'CANCELLED');
});
test('runtime discovery stays gated until dock readiness and binds each live execution',async t=>{
 const f=await fixture(t),{AgentRuntime}=require('../electron/agent-runtime.cjs');
 const runtime=new AgentRuntime({directory:f.root,publish(){}});runtime.inputRequests=f.service;
 const context={key:'a',run:f.runtime.runs[0]},other={key:'b',run:f.runtime.runs[1]};runtime.contexts.set('a',context);runtime.contexts.set('b',other);
 assert.equal(runtime.supplementalTools(context),undefined);runtime.inputToolsEnabled=true;
 const a=runtime.supplementalTools(context),b=runtime.supplementalTools(other);
 const r=(await a.call('input_request',definition())).value;
 assert.equal((await b.call('input_read_answer',{requestId:r.requestId})).error.code,'NOT_FOUND');
 runtime.contexts.delete('a');assert.equal((await a.call('input_list',{})).error.code,'CANCELLED');
 assert.equal((await b.call('input_list',{})).ok,true);
});
test('retry after locale changes preserves original labels and returns the same request',async t=>{
 const f=await fixture(t);let language='zh-CN';const api=bindModelInputs(f.service,'run',{locale:()=>language});
 const first=await api.call('input_request',definition());language='en';const second=await api.call('input_request',definition());
 assert.equal(second.ok,true);assert.equal(second.value.requestId,first.value.requestId);assert.equal(second.value.created,false);
 assert.equal((await f.service.list('run'))[0].locale,'zh-CN');
});
test('replace shares pending quota, reserves proposal identity, and never exposes edited drafts',async t=>{
 const f=await fixture(t);let r=(await f.api.call('input_request',definition())).value;
 for(let i=0;i<4;i++)await f.api.call('input_request',{...definition(),requestKey:'q'+i});
 const replacement={...definition(),requestKey:'next',reason:'New trip'};
 const cmd={requestId:r.requestId,expectedRevision:r.revision,replacement};
 const immediate=await f.api.call('input_replace',cmd);assert.equal(immediate.value.outcome,'replaced');assert.deepEqual(await f.api.call('input_replace',cmd),immediate);
 assert.equal((await f.service.list('run')).filter(r=>r.state==='pending').length,5);assert.equal((await f.queue.snapshot('run')).deliveries.length,0);
 r=(await f.service.list('run')).find(r=>r.id===immediate.value.replacementId);
 r=await f.service.action({action:'saveDraft',runId:'run',requestId:r.id,expectedRevision:r.revision,clientMutationId:'edit',values:{name:'PRIVATE'}});
 const proposal=await f.api.call('input_replace',{requestId:r.id,expectedRevision:r.revision,replacement:{...replacement,requestKey:'next2'}});
 assert.equal(proposal.value.outcome,'confirmationRequired');assert.equal(JSON.stringify(proposal).includes('PRIVATE'),false);
 let current=(await f.service.list('run')).find(v=>v.id===r.id);assert.equal(current.draft.name,'PRIVATE');assert.equal((await f.service.list('run')).length,6);
 const accept={action:'acceptProposal',runId:'run',requestId:r.id,expectedRevision:current.revision,proposalId:current.proposal.id,clientMutationId:'accept'};
 const saved=await f.service.action(accept);assert.equal(saved.replacedById,proposal.value.replacementId);assert.deepEqual(await f.service.action(accept),saved);
 assert.equal((await f.service.list('run')).filter(r=>r.state==='pending').length,5);assert.equal((await f.queue.snapshot('run')).deliveries.length,1);
});
test('proposal CAS preserves drafts; reject keeps original; submit removes pending proposal',async t=>{
 const f=await fixture(t);let r=await f.service.createDynamic('run',definition());
 const command=(action,r,extras={})=>({action,runId:'run',requestId:r.id,expectedRevision:r.revision,clientMutationId:action+':'+r.revision,...extras});
 r=await f.service.action(command('saveDraft',r,{values:{name:'local'}}));
 await f.api.call('input_replace',{requestId:r.id,expectedRevision:r.revision,replacement:{...definition(),requestKey:'new'}});
 r=(await f.service.list('run'))[0];const stale=command('acceptProposal',r,{proposalId:r.proposal.id});
 r=await f.service.action(command('saveDraft',r,{values:{name:'newer'}}));
 await assert.rejects(f.service.action(stale),{code:'CONFLICT'});assert.equal((await f.service.list('run'))[0].draft.name,'newer');
 r=await f.service.action(command('rejectProposal',r,{proposalId:r.proposal.id}));assert.equal(r.state,'pending');assert.equal(r.proposal,undefined);assert.equal(r.draft.name,'newer');
 await f.api.call('input_replace',{requestId:r.id,expectedRevision:r.revision,replacement:{...definition(),requestKey:'newer'}});
 r=(await f.service.list('run'))[0];r=await f.service.action(command('submit',r,{values:answer}));assert.equal(r.state,'answered');assert.equal(r.proposal,undefined);
});
test('confirming message interpretation sends one structured result, excludes original evidence text',async t=>{
 const f=await fixture(t);await f.messages([user('m','UNIQUE ORIGINAL TEXT')]);let r=await f.service.createDynamic('run',definition());
 r=await f.service.action({action:'beginEdit',runId:'run',requestId:r.id,expectedRevision:0,clientMutationId:'edit'});
 await f.api.call('input_resolve_from_message',{requestId:r.id,expectedRevision:r.revision,sourceMessageIds:['m'],values:answer});r=(await f.service.list('run'))[0];
 const cmd={action:'acceptProposal',runId:'run',requestId:r.id,expectedRevision:r.revision,proposalId:r.proposal.id,clientMutationId:'confirm'};
 await f.queue.pause('run');await assert.rejects(f.service.action(cmd),{code:'INTERACTION_REQUIRED'});
 const continued={...cmd,resume:{expectedPolicyGeneration:1}};const saved=await f.service.action(continued);assert.deepEqual(await f.service.action(continued),saved);assert.equal(saved.answer.source,'userMessage');assert.equal((await f.queue.snapshot('run')).policy.paused,false);
 const {deliveries}=await f.queue.snapshot('run');assert.equal(deliveries.length,1);assert.equal(deliveries[0].text.includes('UNIQUE ORIGINAL TEXT'),false);
});
test('model cancellation has no outbox; user cancellation stays paused across restart-safe policy',async t=>{
 const f=await fixture(t),r=await f.service.createDynamic('run',definition());
 const cmd={requestId:r.id,expectedRevision:0,reason:'No longer needed'};const result=await f.api.call('input_cancel',cmd);assert.equal(result.value.state,'cancelled');assert.deepEqual(await f.api.call('input_cancel',cmd),result);assert.equal((await f.queue.snapshot('run')).deliveries.length,0);
 const r2=await f.service.createDynamic('run',{...definition(),requestKey:'second'});await f.queue.pause('run');
 const cancel={action:'cancel',runId:'run',requestId:r2.id,expectedRevision:0,clientMutationId:'cancel'};const saved=await f.service.action(cancel);assert.deepEqual(await f.service.action(cancel),saved);
 const snapshot=await f.queue.snapshot('run');assert.equal(snapshot.policy.paused,true);assert.equal(snapshot.deliveries.length,1);assert.equal(snapshot.deliveries[0].held,true);assert.equal(snapshot.deliveries[0].activeOnly,true);
});

test('host position survives retries and stays out of the model projection',async t=>{
 const f=await fixture(t);let turnKey='first',order=10;
 const api=bindModelInputs(f.service,'run',{position:()=>({turnKey,order:order++})});
 const first=await api.call('input_request',definition());assert.equal(first.ok,true);
 turnKey='later';await api.call('input_request',definition());
 const records=await f.service.list('run');assert.equal(records.length,1);assert.equal(records[0].turnKey,'first');assert.equal(records[0].order,10);
 const list=await api.call('input_list',{});assert.equal(list.value.requests[0].turnKey,undefined);
});
