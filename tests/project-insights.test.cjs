const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Database}=require('../electron/database.cjs');
const {ExtensionService}=require('../core/extensions/service.cjs');
const {AutomationService}=require('../core/automation/service.cjs');
const {ProjectInsightsService}=require('../core/project-insights/service.cjs');
const {record}=require('../core/project-insights/usage.cjs');
const id='fixture.insights';
const manifest={specVersion:'1.0-draft',publisher:'fixture',name:'insights',version:'1.0.0',displayName:'Insights',engines:{api:'1'},main:'main.cjs',permissions:['conversations.read','background.jobs','project.activity.read','project.usage.read','project.summaries.generate'].map(capability=>({capability,scope:'project'}))};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'insights-'));let db=new Database(root);await db.call('ready');
 const extensions=new ExtensionService(db,{directory:root});await extensions.initialize();
 await db.call('patchWorkspace',{changes:['p','q'].map(id=>({kind:'project',action:'put',id,expectedRevision:null,value:{id,name:id,path:root,createdAt:'today'}}))});
 await extensions.change({action:'stage',id,revision:{id,digest:'digest',relativePath:'unused',manifest}});await extensions.change({action:'commit',id,digest:'digest'});
 await extensions.setGrants(id,manifest.permissions.map(p=>({capability:p.capability,resource:'project:p'})));
 const providers={list:async()=>({providers:[{id:'provider',models:['model']}]}),secret:async()=>({id:'provider',model:'model',baseUrl:'https://model.invalid'})};
 const automation=new AutomationService({database:db,extensions,providers,generate:async()=>({items:[{text:'Implemented a test fixture',sourceIndexes:[0]}]})});automation.tick=()=>{};extensions.automation=automation;
 const insights=new ProjectInsightsService({database:db,automation,providers});extensions.projectInsights=insights;
 const f={root,extensions,automation,insights,providers,get db(){return db;},get context(){return {id,generation:extensions.items[0].generation};},list:kind=>insights.forExtension(f.context,kind+'.list',f.query),query:{projectId:'p',from:new Date(Date.now()-86400000).toISOString(),to:new Date(Date.now()+86400000).toISOString(),timezone:'Asia/Shanghai',limit:1}};
 f.policy=()=>automation.manage({id,action:'policy',policy:{paused:false,providerId:'provider',model:'model',dailyLimit:100}});
 f.commit=async(n=1)=>{const runs=Array.from({length:n},(_,i)=>({id:'run'+i,projectId:'p',status:i%2?'interrupted':'completed',terminalTurnId:'turn',messages:[{id:'turn',role:'user',text:'private path /home/user/file secret source'},{id:'answer',role:'assistant',text:'Test result'}]}));await db.call('saveRuns',runs);return (await db.call('readRuns')).map(run=>({conversationId:run.conversationId,turnId:'turn',version:1}));};
 f.prepare=async(turns,key='request')=>insights.forExtension(f.context,'summaries.prepare',{projectId:'p',turns,requestKey:key,ruleVersion:'test-v1',language:'zh-CN',modelRef:{providerId:'provider',model:'model'}});
 f.restart=async()=>{await db.close();db=new Database(root);await db.call('ready');extensions.database=db;automation.database=db;insights.database=db;await db.call('automationRecover');};
 t.after(async()=>{await extensions.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});return f;
}
test('activity is content-free, includes interruption, stable paginated and rechecks project grants',async t=>{
 const f=await fixture(t);await f.commit(2);const page=await f.list('activity');assert.equal(page.items.length,1);assert.ok(page.nextCursor);assert.ok(!JSON.stringify(page).includes('/home/user'));assert.equal(page.items[0].sourceAvailability,'available');
 const next=await f.insights.forExtension(f.context,'activity.list',{...f.query,cursor:page.nextCursor});assert.equal(next.items.length,1);assert.notEqual(next.items[0].id,page.items[0].id);assert.equal(next.nextCursor,null);
 await assert.rejects(f.insights.forExtension(f.context,'activity.list',{...f.query,projectId:'q',cursor:page.nextCursor}),/FORBIDDEN/);
 await assert.rejects(f.insights.forExtension(f.context,'activity.list',{...f.query,from:'bad'}),/INVALID_ARGUMENT/);
 await f.extensions.setGrants(id,[]);await assert.rejects(f.list('activity'),/FORBIDDEN/);
});
test('usage unknown != zero; attempts are independent; repeated final is idempotent and restart preserves rows',async t=>{
 const f=await fixture(t),base={id:'request:0',hostRequestId:'request',projectId:'p',startedAt:new Date().toISOString(),status:'succeeded',model:'m',purpose:'development'};
 const row=record({...base,usage:{prompt_tokens:0,completion_tokens:3,total_tokens:3},prompt:'secret'});
 await f.db.call('insightsRecordUsage',row);await f.db.call('insightsRecordUsage',row);
 await f.db.call('insightsRecordUsage',record({...base,id:'request:1',attempt:1,status:'running'}));await f.restart();
 const first=await f.list('usage');assert.equal(first.items[0].counts.input,0);assert.equal(first.items[0].revision,1);assert.ok(!JSON.stringify(first).includes('secret'));
 const next=await f.insights.forExtension(f.context,'usage.list',{...f.query,cursor:first.nextCursor});assert.equal(next.items[0].counts.input,null);assert.equal(next.items[0].quality,'unknown');assert.equal(next.items[0].status,'unknown');
 await assert.rejects(f.db.call('insightsRecordUsage',{...row,projectId:'q'}),/CONFLICT/);
});
test('summaries require opt-in, batch real frozen sources, cache safely and count completed batches',async t=>{
 const f=await fixture(t),refs=await f.commit(12);await assert.rejects(f.prepare(refs),/INTERACTION_REQUIRED/);await f.policy();
 const root=await f.prepare(refs);assert.equal(root.totalBatches,2);assert.equal(root.completedBatches,0);assert.equal(root.status,'generating');
 await f.automation.runJob();let value=await f.insights.forExtension(f.context,'summaries.get',{id:root.id});assert.equal(value.completedBatches,1);
 await f.automation.runJob();value=await f.insights.forExtension(f.context,'summaries.get',{id:root.id});assert.equal(value.status,'ready');assert.equal(value.items.length,2);assert.equal(value.items[0].evidenceStatus,'reported');assert.deepEqual(value.items[0].sourceRefs,[refs[0]]);
 assert.equal((await f.prepare(refs,'second-click')).id,root.id);await f.restart();assert.equal((await f.insights.forExtension(f.context,'summaries.get',{id:root.id})).status,'ready');
 await f.db.call('saveRuns',[]);await assert.rejects(f.insights.forExtension(f.context,'summaries.get',{id:root.id}),/SOURCE_EXPIRED/);
});
test('queued cancellation is definite, in-flight cancellation is unknown and late success cannot overwrite',async t=>{
 const f=await fixture(t),refs=await f.commit();await f.policy();const root=await f.prepare(refs);
 await f.db.call('automationStartJob',{id:root.usageJobIds[0]});
 const cancelled=await f.insights.forExtension(f.context,'summaries.cancel',{id:root.id});assert.equal(cancelled.status,'unknown');
 await f.db.call('automationFinishJob',{id:root.usageJobIds[0],status:'succeeded',result:{items:[]}});
 assert.equal((await f.insights.forExtension(f.context,'summaries.get',{id:root.id})).status,'unknown');assert.equal((await f.prepare(refs,'another-key')).id,root.id);
});
test('source expiry and summary-only revocation prevent queued execution and cache access',async t=>{
 const f=await fixture(t),refs=await f.commit();await f.policy();const root=await f.prepare(refs);
 await f.extensions.setGrants(id,manifest.permissions.filter(p=>p.capability!=='project.summaries.generate').map(p=>({capability:p.capability,resource:'project:p'})));
 assert.equal(await f.db.call('automationNextJob'),null);await assert.rejects(f.insights.forExtension(f.context,'summaries.get',{id:root.id}),/FORBIDDEN/);
});
test('structured provider reports each actual HTTP attempt and raw unknown usage separately',async()=>{
 const {generate}=require('../core/automation/provider.cjs');const original=global.fetch;const events=[];let calls=0;
 try{global.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:calls===1?'not json':'{"ok":true}'}}],usage:{prompt_tokens:12,completion_tokens:2,total_tokens:14},id:'upstream-id'}),{headers:{'content-type':'application/json'}});};
 await generate({baseUrl:'https://example.invalid/v1',model:'m',protocol:'chat'},{input:[],prompt:'test',repairInvalidOutput:true,outputSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},observeUsage:e=>events.push(e)},new AbortController().signal);
 assert.equal(calls,2);assert.equal(events.length,4);assert.equal(events[0].hostRequestId,events[2].hostRequestId);assert.notEqual(events[0].id,events[2].id);assert.equal(events[2].attempt,1);assert.equal(events[0].status,'running');assert.equal(events[1].usage.prompt_tokens,12);assert.equal(events[1].providerRequestId,'upstream-id');assert.equal(events[0].id,events[1].id);
 }finally{global.fetch=original;}
});

test('cursor tampering is rejected and expired source metadata cannot resurrect frozen text',async t=>{
 const f=await fixture(t),refs=await f.commit(2);await f.policy();const root=await f.prepare(refs);const page=await f.list('activity');const cursor=JSON.parse(Buffer.from(page.nextCursor,'base64url').toString());cursor.watermark+=10;
 await assert.rejects(f.insights.forExtension(f.context,'activity.list',{...f.query,cursor:Buffer.from(JSON.stringify(cursor)).toString('base64url')}),/INVALID_ARGUMENT/);
 await f.db.call('automationNextEvent',{now:Date.now()+8*86400000});assert.equal((await f.list('activity')).items[0].sourceAvailability,'expired');await assert.rejects(f.insights.forExtension(f.context,'summaries.get',{id:root.id}),/SOURCE_EXPIRED/);
});

test('real Chat bridge records correction attempts independently and never promotes adapter zero to observed usage',async t=>{
 const http=require('node:http'),{startChatBridge}=require('../electron/chat-bridge.cjs');let calls=0;const events=[];
 const upstream=http.createServer(async(req,res)=>{for await(const _part of req){}calls++;const tool=calls===1?'invented':'known';res.writeHead(200,{'Content-Type':'text/event-stream'});const chunks=[{id:'upstream-'+calls,choices:[{delta:{tool_calls:[{index:0,id:'call',function:{name:tool,arguments:'{}'}}]},finish_reason:'tool_calls'}]},...(calls===1?[{choices:[],usage:{prompt_tokens:5,completion_tokens:2,total_tokens:7}}]:[])];res.end(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const bridge=await startChatBridge({baseUrl:'http://127.0.0.1:'+upstream.address().port,model:'fixture',protocol:'chat'},'fixture',false,()=>{},e=>events.push(e));t.after(()=>{bridge.close();upstream.closeAllConnections();upstream.close();});
 const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey,'Content-Type':'application/json','x-codex-parent-thread-id':'parent'},body:JSON.stringify({model:'fixture',input:[],tools:[{type:'function',name:'known',parameters:{type:'object'}}]})});await response.text();
 assert.equal(calls,2);const final=events.filter(e=>e.status!=='running');assert.equal(final.length,2);assert.notEqual(final[0].id,final[1].id);assert.equal(final[0].hostRequestId,final[1].hostRequestId);assert.equal(final[0].usage.prompt_tokens,5);assert.equal(final[1].usage,null);assert.equal(final[0].origin,'subagent');
});

test('summary references identify outer turns, reject message indexes and expose a terminal failure',async t=>{
 const f=await fixture(t),refs=await f.commit();await f.policy();const root=await f.prepare(refs);
 const job=await f.db.call('automationNextJob');
 assert.deepEqual(job.outputSchema.properties.items.items.properties.sourceIndexes.items.enum,[0]);assert.equal(job.input[0].sourceIndex,0);assert.equal(job.input[0].messages.length,2);
 f.automation.request=async()=>({items:[{text:'Wrong source reference',sourceIndexes:[1]}]});await f.automation.runJob();
 const result=await f.insights.forExtension(f.context,'summaries.get',{id:root.id});assert.equal(result.status,'failed');assert.equal(result.items.length,0);assert.ok(result.coverage.reasons.includes('INVALID_OUTPUT'));
});
