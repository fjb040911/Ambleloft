const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {fork}=require('node:child_process');const {EventEmitter}=require('node:events');
const {Database}=require('../electron/database.cjs');const {ExtensionService}=require('../core/extensions/service.cjs');const {HostManager}=require('../core/extensions/hosts.cjs');const {AutomationService}=require('../core/automation/service.cjs');const {validateManifest,compileValueValidator}=require('../core/extensions/manifest.cjs');
const id='fixture.summary';
const manifest={specVersion:'1.0-draft',publisher:'fixture',name:'summary',version:'1.0.0',displayName:'Summary',engines:{api:'1'},main:'main.cjs',permissions:['agent.hooks','conversations.read','background.jobs'].map(capability=>({capability,scope:'project'})),hooks:[{event:'conversation.turn.completed',handler:'turn'},{event:'background.job.completed',handler:'result'}]};
const outputSchema={type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-m2-'));let db=new Database(root);await db.call('ready');const service=new ExtensionService(db,{directory:root});await service.initialize();
 await db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:'p',expectedRevision:null,value:{id:'p',name:'Project',path:root,createdAt:'today'}}]});
 const revision={id,digest:'digest',relativePath:'unused',manifest};await service.change({action:'stage',id,revision});await service.change({action:'commit',id,digest:revision.digest});await service.setGrants(id,manifest.permissions.map(p=>({capability:p.capability,resource:'project:p'})));
 const providers={list:async()=>({providers:[{id:'provider',models:['model']}]}),secret:async()=>({model:'model'})};
 const automation=new AutomationService({database:db,extensions:service,providers,generate:async()=>({summary:'done'})});service.automation=automation;
 // Tests drive the worker deterministically rather than racing a real polling timer.
 automation.tick=()=>{};
 t.after(async()=>{await service.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 const f={root,service,automation,get db(){return db;},get context(){return {id,generation:service.items[0].generation};},async restart(){await db.close();db=new Database(root);await db.call('ready');service.database=db;automation.database=db;await db.call('automationRecover');},async grant(){await service.setGrants(id,manifest.permissions.map(p=>({capability:p.capability,resource:'project:p'})));},async policy(value={}){return automation.manage({id,action:'policy',policy:{paused:false,providerId:'provider',model:'model',dailyLimit:20,...value}});},state:()=>db.call('automationManage',{id})};
 f.run={id:'run',projectId:'p',status:'completed',messages:[{id:'turn',role:'user',text:'Expense report'},{id:'answer',role:'assistant',text:'Approved'}]};
 f.commit=async()=>{await db.call('commitTurn',{runs:[f.run],runId:'run',turnId:'turn'});f.ref={conversationId:(await db.call('readRuns'))[0].conversationId,turnId:'turn',version:1};return f.ref;};
 f.submit=async(eventKey='one')=>automation.forExtension(f.context,'submit',{projectId:'p',eventKey,prompt:'Summarize this turn.',turns:[f.ref],outputSchema});return f;
}
test('hook manifest enforces main, scope, declared permission and unique bindings',()=>{
 assert.equal(validateManifest(manifest).ok,true);
 for(const change of [m=>delete m.main,m=>m.permissions[0].scope='self',m=>m.permissions.shift(),m=>m.hooks[1].handler='turn',m=>m.hooks[1].event='conversation.turn.completed']){const m=structuredClone(manifest);change(m);assert.equal(validateManifest(m).ok,false);}
});
test('terminal snapshot/outbox are atomic, immutable, version specific, and never emitted by streaming saves',async t=>{
 const f=await fixture(t);await f.db.call('saveRuns',[f.run]);assert.equal((await f.state()).events.length,0);
 await assert.rejects(f.db.call('commitTurn',{runs:[{...f.run,messages:[...f.run.messages,{id:'bad',value:1n}]}],runId:'run',turnId:'turn'}));assert.equal((await f.state()).events.length,0);
 await f.commit();const original=await f.automation.forExtension(f.context,'getTurn',f.ref);assert.equal(original.messages[1].text,'Approved');
 f.run.messages[1].text='Changed after commit';await f.commit();assert.deepEqual(await f.automation.forExtension(f.context,'getTurn',f.ref),original);assert.equal((await f.state()).events.length,1);
 await assert.rejects(f.automation.forExtension(f.context,'getTurn',{...f.ref,version:2}),/NOT_FOUND/);
 await f.restart();assert.deepEqual(await f.automation.forExtension(f.context,'getTurn',f.ref),original);
 await f.service.setGrants(id,[]);await assert.rejects(f.automation.forExtension(f.context,'getTurn',f.ref),/FORBIDDEN/);assert.equal((await f.state()).events.length,0);await f.grant();assert.equal((await f.state()).events.length,0);
});
test('events retain eventId across crash recovery, retry six attempts then enter dead letters',async t=>{
 const f=await fixture(t);await f.commit();let row=await f.db.call('automationNextEvent');const eventId=row.event.eventId;
 assert.equal(await f.db.call('automationNextEvent'),null);await f.restart();
 for(let n=2;n<=6;n++){row=await f.db.call('automationNextEvent',{now:Date.now()+n*1000000});assert.equal(row.event.eventId,eventId);await f.db.call('automationAck',{id:row.id,ok:false,now:Date.now(),jitter:0});}
 assert.equal((await f.state()).events[0].status,'dead');await f.automation.manage({id,action:'retry',eventId:row.id});row=await f.db.call('automationNextEvent');assert.equal(row.event.eventId,eventId);await f.db.call('automationAck',{id:row.id,ok:true});assert.equal((await f.state()).events.length,0);
});
test('jobs require opt-in, deduplicate durable keys, validate output, isolate source chat and respect budget',async t=>{
 const f=await fixture(t);await f.commit();await assert.rejects(f.submit(),/INTERACTION_REQUIRED/);await f.policy({dailyLimit:1});
 const first=await f.submit();assert.equal((await f.submit()).id,first.id);
 await assert.rejects(f.automation.forExtension(f.context,'submit',{projectId:'p',eventKey:'one',prompt:'Other',turns:[f.ref],outputSchema}),/CONFLICT/);
 await f.automation.runJob();assert.equal((await f.automation.forExtension(f.context,'getJob',{id:first.id})).result.summary,'done');
 const second=await f.submit('two');await f.automation.runJob();assert.equal((await f.automation.forExtension(f.context,'getJob',{id:second.id})).status,'queued');
 assert.deepEqual((await f.db.call('readRuns'))[0].messages,f.run.messages);
 await f.policy({dailyLimit:2});f.automation.request=async()=>({wrong:'schema'});await f.automation.runJob();assert.equal((await f.automation.forExtension(f.context,'getJob',{id:second.id})).error,'INVALID_OUTPUT');
 const calls=[];f.automation.request=async()=>{calls.push(1);throw Error('socket lost');};await f.policy({dailyLimit:3});const third=await f.submit('three');await f.automation.runJob();await f.automation.runJob();assert.equal(calls.length,1);assert.equal((await f.automation.forExtension(f.context,'getJob',{id:third.id})).status,'unknown');
});
test('restart only resumes unsent jobs; sent jobs become unknown and stored results are never regenerated',async t=>{
 const f=await fixture(t);await f.commit();await f.policy();const first=await f.submit('sent');await f.db.call('automationStartJob',{id:first.id});const second=await f.submit('queued');await f.restart();
 assert.equal((await f.automation.forExtension(f.context,'getJob',{id:first.id})).status,'unknown');let calls=0;f.automation.request=async()=>{calls++;return {summary:'recovered'};};await f.automation.runJob();await f.restart();await f.automation.runJob();assert.equal(calls,1);assert.equal((await f.automation.forExtension(f.context,'getJob',{id:second.id})).result.summary,'recovered');
});
test('revoke cancels queued work and disabling does not backfill on re-enable',async t=>{
 const f=await fixture(t);await f.commit();await f.policy();const job=await f.submit();await f.service.setEnabled(id,false);await f.db.call('automationReconcile');assert.equal((await f.state()).jobs[0].status,'cancelled');assert.equal((await f.state()).events.length,0);
 // Direct worker mutation avoids fake package integrity setup in this fixture.
 await f.service.change({action:'enable',id,enabled:true});assert.equal((await f.state()).events.length,0);assert.equal((await f.automation.forExtension(f.context,'getJob',{id:job.id})).status,'cancelled');
});
test('real isolated extension process receives a hook, reads frozen turn, submits job and reads its result',async t=>{
 const f=await fixture(t);const source=path.join(f.root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'extension.json'),JSON.stringify(manifest));await fs.writeFile(path.join(source,'main.cjs'),`exports.activate=ctx=>{ctx.hooks.register('turn',async event=>{const turn=await ctx.conversations.getTurn(event);await ctx.jobs.submit({projectId:event.projectId,eventKey:event.eventId,prompt:'Summarize',turns:[{conversationId:turn.conversationId,turnId:turn.turnId,version:turn.version}],outputSchema:${JSON.stringify(outputSchema)}});});ctx.hooks.register('result',async event=>{const job=await ctx.jobs.get(event.jobId);if(job.status!=='succeeded')throw Error('Not completed');});};`);
 const adapter={spawn(directory){const child=fork(path.resolve(__dirname,'../core/extensions/bootstrap.cjs'),[],{cwd:directory,execArgv:[],stdio:['ignore','ignore','ignore','ipc']});const channel=new EventEmitter();channel.send=m=>child.send(m);channel.kill=()=>child.kill();child.on('message',m=>channel.emit('message',m));child.on('exit',m=>channel.emit('exit',m));child.on('error',e=>channel.emit('error',e));return channel;}};
 const hosts=new HostManager({service:f.service,adapter,limits:{deactivation:100}});f.service.attachHosts(hosts);await f.service.installPackage(source,'directory',async()=>true);await f.grant();await f.policy();await f.commit();await f.automation.deliver();let state=await f.state();assert.equal(state.jobs.length,1);assert.equal(state.events.length,0);await f.automation.runJob();await f.automation.deliver();state=await f.state();assert.equal(state.jobs[0].status,'succeeded');assert.equal(state.events.length,0);
});
test('single request adapter sends no tools, applies output bound, and parses Chat/Responses JSON',async()=>{
 const {generate}=require('../core/automation/provider.cjs');const original=global.fetch;const seen=[];
 try{for(const protocol of ['chat','responses']){global.fetch=async(url,options)=>{seen.push({url,...options});return new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:'stop',message:{content:'{"summary":"ok"}'}}]}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"summary":"ok"}'}]}]}));};assert.deepEqual(await generate({baseUrl:'https://example.test/v1',model:'m',protocol,apiKey:'secret'},{prompt:'summary',input:[],outputSchema},new AbortController().signal),{summary:'ok'});}
 for(const request of seen){const body=JSON.parse(request.body);assert.equal(body.tools,undefined);assert.equal(body.stream,false);assert.equal(body.max_tokens||body.max_output_tokens,2048);assert.equal(request.redirect,'error');}
 }finally{global.fetch=original;}
});
test('scheduled save racing final commit cannot persist terminal state without its outbox',async t=>{
 const f=await fixture(t);f.run.status='running';await f.db.call('saveRuns',[f.run]);assert.equal((await f.state()).events.length,0);
 f.run.status='completed';f.run.terminalTurnId='turn';await f.db.call('saveRuns',[f.run]);assert.equal((await f.state()).events.length,1);
 await f.commit();assert.equal((await f.state()).events.length,1);
});
test('unknown requests cannot be retried by a new key; explicit host retry is durable and deduplicated',async t=>{
 const f=await fixture(t);await f.commit();await f.policy();const job=await f.submit();f.automation.request=async()=>{throw Error('Lost response');};await f.automation.runJob();await assert.rejects(f.submit('new-key'),/OUTCOME_UNKNOWN/);
 await f.automation.manage({id,action:'retryJob',jobId:job.id});await assert.rejects(f.automation.manage({id,action:'retryJob',jobId:job.id}),/CONFLICT/);
 const state=await f.state();assert.equal(state.jobs.length,2);assert.equal(state.jobs.find(j=>j.id===job.id).status,'unknown');
 f.automation.request=async()=>({summary:'explicit retry'});await f.automation.runJob();assert.equal((await f.state()).jobs.filter(j=>j.status==='succeeded').length,1);
});
test('pause and shutdown during dispatch preserve unsent work without issuing a model request',async t=>{
 const f=await fixture(t);await f.commit();await f.policy();const job=await f.submit();let calls=0;f.automation.request=async()=>{calls++;return {summary:'bad'};};
 await f.policy({paused:true});await f.automation.runJob();assert.equal(calls,0);await f.policy();
 const original=f.db.call.bind(f.db);f.db.call=async(method,args)=>{const value=await original(method,args);if(method==='automationStartJob')f.automation.closed=true;return value;};
 await f.automation.runJob();assert.equal(calls,0);assert.equal((await original('automationGetJob',{context:f.context,id:job.id})).status,'queued');
});
test('source project changes invalidate snapshot access and queued inputs before dispatch',async t=>{
 const f=await fixture(t);await f.commit();await f.policy();await f.submit();f.run.projectId=null;await f.db.call('saveRuns',[f.run]);
 await assert.rejects(f.automation.forExtension(f.context,'getTurn',f.ref),/FORBIDDEN|NOT_FOUND/);await f.automation.runJob();assert.equal((await f.state()).jobs[0].status,'cancelled');
});
test('sixth delivery crash becomes a dead letter on restart instead of a seventh automatic attempt',async t=>{
 const f=await fixture(t);await f.commit();let row;
 for(let n=0;n<6;n++){row=await f.db.call('automationNextEvent',{now:Date.now()+1000000});if(n<5)await f.db.call('automationAck',{id:row.id,ok:false});}
 await f.restart();assert.equal((await f.state()).events[0].status,'dead');assert.equal(await f.db.call('automationNextEvent'),null);
});
test('runtime finish commits complete turns and reserves first-run identity until persistence ends',async t=>{
 const f=await fixture(t);const {AgentRuntime}=require('../electron/agent-runtime.cjs');const runtime=new AgentRuntime({directory:f.root,database:f.db,publish(){}});runtime.initialized=true;runtime.runs=[f.run];
 const context={key:'first-run',run:f.run,turnKey:'turn'};runtime.contexts.set(context.key,context);
 const finishing=runtime.finish(context,'completed');await assert.rejects(runtime.start({runId:f.run.id,prompt:'next'}),/执行或排队/);await finishing;
 assert.equal((await f.state()).events.length,1);assert.equal((await f.db.call('readRuns'))[0].terminalTurnId,'turn');await runtime.shutdown();
});
test('expired snapshots return NOT_FOUND and queue capacity creates an explicit gap record',async t=>{
 const f=await fixture(t);const {DatabaseSync}=require('node:sqlite');const sql=new DatabaseSync(path.join(f.root,'atelier.sqlite'));
 try{sql.exec('BEGIN');const insert=sql.prepare("INSERT INTO automation_events VALUES (?,?,?,?,?,?,'dead',6,?)");for(let n=0;n<1000;n++)insert.run('old'+n,id,'p','old-conversation',Date.now(),Date.now(),JSON.stringify({type:'conversation.turn.completed',eventId:'old'+n}));sql.exec('COMMIT');}finally{sql.close();}
 await f.commit();const gap=(await f.state()).events.find(e=>e.data.type==='queue.overflow');assert.equal(gap.data.dropped,1);await assert.rejects(f.automation.manage({id,action:'retry',eventId:gap.id}),/NOT_FOUND/);
 await f.db.call('automationNextEvent',{now:Date.now()+8*86400000});await assert.rejects(f.automation.forExtension(f.context,'getTurn',f.ref),/NOT_FOUND/);
});
test('same conversation respects pending retry order and a dead letter does not block later turns',async t=>{
 const f=await fixture(t);await f.commit();f.run.messages.push({id:'turn2',role:'user',text:'Next'},{id:'answer2',role:'assistant',text:'Done'});await f.db.call('commitTurn',{runs:[f.run],runId:'run',turnId:'turn2'});
 const first=await f.db.call('automationNextEvent');assert.equal(first.event.turnId,'turn');await f.db.call('automationAck',{id:first.id,ok:false,now:Date.now()+100000});assert.equal(await f.db.call('automationNextEvent'),null);
 for(let n=0;n<5;n++){const row=await f.db.call('automationNextEvent',{now:Date.now()+1000000});assert.equal(row.event.turnId,'turn');await f.db.call('automationAck',{id:row.id,ok:false});}
 assert.equal((await f.db.call('automationNextEvent')).event.turnId,'turn2');
});
test('steered user answers remain inside the completed turn snapshot',async t=>{
 const f=await fixture(t);f.run.messages.splice(1,0,{id:'form-answer',role:'user',turnKey:'turn',text:'Amount: 12.30'});await f.commit();
 const snapshot=await f.automation.forExtension(f.context,'getTurn',f.ref);assert.deepEqual(snapshot.messages.map(m=>m.text),['Expense report','Amount: 12.30','Approved']);
});
