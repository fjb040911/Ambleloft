const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {Database}=require('../electron/database.cjs');const {MessageService}=require('../core/extensions/message-service.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'messages-host-')),db=new Database(dir);await db.call('ready');await db.call('extensionMutation',{action:'initialize',legacy:[],diagnostics:[]});for(const id of ['fixture.one','fixture.two']){await db.call('extensionMutation',{action:'stage',id,revision:{id,digest:id,manifest:{displayName:id,version:'1',permissions:[]}}});await db.call('extensionMutation',{action:'commit',id,digest:id});}let events=0;const service=new MessageService(db,{publish:()=>events++});const items=await db.call('extensionState');const context=items.map(i=>({id:i.id,generation:i.generation}));t.after(async()=>{service.close();await db.close();await fs.rm(dir,{recursive:true,force:true});});return {db,service,context,events:()=>events};}
const input={eventKey:'event',title:'Message',body:'Detail',category:'notice'};
test('host identity binding rejects forged scope, foreign IDs and stale extension generations',async t=>{const {db,service:s,context:[a,b]}=await fixture(t);await assert.rejects(s.forExtension(a,'publish',{...input,source:b.id}),/FORBIDDEN/);const r=await s.forExtension(a,'publish',input);await assert.rejects(s.forExtension(b,'update',{id:r.id,patch:{body:'Other'},expectedRevision:1}),/NOT_FOUND/);await db.call('extensionMutation',{action:'enable',id:a.id,enabled:false});await assert.rejects(s.forExtension(a,'publish',{...input,eventKey:'later'}),/FORBIDDEN/);assert.equal((await s.list()).items.length,1);});
test('host controls preferences, extension projection excludes reading and clear state',async t=>{const {service:s,context:[a],events}=await fixture(t);const r=await s.forExtension(a,'publish',input);await s.markRead({id:r.id});let view=await s.forExtension(a,'getByEventKey',{eventKey:input.eventKey});assert.equal(Object.hasOwn(view,'readAt'),false);assert.equal(Object.hasOwn(view,'dismissedAt'),false);await assert.rejects(s.forExtension(a,'setPreferences',{}),/UNSUPPORTED/);await s.setPreferences({source:'extension:'+a.id,preferences:{receive:false,muted:false}});assert.equal((await s.forExtension(a,'publish',{...input,eventKey:'new'})).status,'rejected');await s.dismiss({id:r.id});assert.equal(await s.forExtension(a,'getByEventKey',{eventKey:input.eventKey}),null);assert.equal((await s.list()).unread,0);assert.ok(events()>=4);});
test('host filters bulk changes and preserves rejected event keys without enabling unimplemented actions',async t=>{const {service:s,context:[a,b]}=await fixture(t);await s.forExtension(a,'publish',input);await s.forExtension(b,'publish',input);assert.equal((await s.bulk({source:'extension:'+a.id,action:'read'})).count,1);assert.equal((await s.list({source:'extension:'+b.id})).unread,1);await assert.rejects(s.forExtension(a,'publish',{...input,eventKey:'button',actions:[{id:'x',label:'Run',commandId:'unsafe'}]}),/UNSUPPORTED/);await assert.rejects(s.forExtension(a,'publish',{...input,eventKey:'large',body:'x'.repeat(70000)}),/Content size/);await assert.rejects(s.list({source:'missing'}),/NOT_FOUND/);});
test('native reminder only follows fresh accepted publication; delivery failure preserves persistence',async t=>{
 const {service:s,context:[a]}=await fixture(t);const delivered=[];s.notify=m=>delivered.push(m.id);
 const first=await s.forExtension(a,'publish',input);assert.deepEqual(delivered,[first.id]);
 await s.forExtension(a,'publish',input);
 await s.forExtension(a,'update',{id:first.id,patch:{body:'Updated'},expectedRevision:1});
 assert.equal(delivered.length,1);
 await s.setPreferences({source:'extension:'+a.id,preferences:{receive:true,muted:true}});
 await s.forExtension(a,'publish',{...input,eventKey:'muted'});assert.equal(delivered.length,1);
 await s.setPreferences({source:'extension:'+a.id,preferences:{receive:false,muted:false}});
 await s.forExtension(a,'publish',{...input,eventKey:'rejected'});assert.equal(delivered.length,1);
 s.notify=()=>{throw Error('OS unavailable');};
 assert.equal((await s.postSystem({...input,eventKey:'system'})).status,'published');
 assert.equal((await s.list({source:'host'})).items.length,1);
});
test('notification source localization follows workspace language without changing preferences or source identity',async t=>{
 const {db,service:s,context:[a]}=await fixture(t);
 await db.call('extensionMutation',{action:'stage',id:a.id,revision:{id:a.id,digest:'localized',manifest:{displayName:'%name%',version:'2',permissions:[]},dictionaries:{default:{name:'默认来源'},en:{name:'English source'}}}});
 await db.call('extensionMutation',{action:'commit',id:a.id,digest:'localized'});
 await s.setPreferences({source:'extension:'+a.id,preferences:{receive:false,muted:true}});
 await db.call('writeSetting',{key:'workspace',value:{language:'en'}});
 const source=(await s.sources()).find(v=>v.id==='extension:'+a.id);
 assert.equal(source.name,'English source');assert.deepEqual(source.preferences,{receive:false,muted:true});
});
test('message buttons route durable identity, atomically report and reject replay across windows',async t=>{
 const {db,service:s,context:[original]}=await fixture(t);const op={id:'fixture.one.accept',effect:'write',exposeTo:['page']};
 await db.call('extensionMutation',{action:'stage',id:original.id,revision:{id:original.id,digest:'actions',manifest:{displayName:original.id,version:'2',permissions:[],operations:[op]}}});await db.call('extensionMutation',{action:'commit',id:original.id,digest:'actions'});
 const item=(await db.call('extensionState')).find(i=>i.id===original.id),context={id:item.id,generation:item.generation};
 const message=await s.forExtension(context,'publish',{...input,category:'actionRequired',actions:[{id:'accept',label:'Accept',commandId:op.id,arguments:{task:'one'}}]});
 let dispatches=0;s.router={invoke:async(id,args,invocation)=>{assert.equal(id,op.id);assert.deepEqual(args,{task:'one'});await invocation.validate();await invocation.onDispatch();dispatches++;const records=await s.forExtension(context,'listActionInvocations');assert.equal(records[0].id,invocation.message.invocationId);
 const report={invocationId:records[0].id,reportId:'accepted',expectedRevision:records[0].revision,outcome:'accepted',remoteTaskId:'server-1'};await s.forExtension(context,'reportActionResult',report);return {ok:true,value:{}};}};
 await s.execute({messageId:message.id,actionId:'accept',expectedRevision:1},{});assert.equal(dispatches,1);
 await assert.rejects(s.execute({messageId:message.id,actionId:'accept',expectedRevision:1},{}),/BUSY/);
 const record=(await s.forExtension(context,'listActionInvocations'))[0],report={invocationId:record.id,reportId:'done',expectedRevision:record.revision,outcome:'completed',messageUpdate:{patch:{businessState:'resolved'},expectedRevision:999}};
 await assert.rejects(s.forExtension(context,'reportActionResult',report),/CONFLICT/);assert.equal((await s.forExtension(context,'listActionInvocations'))[0].state,'accepted');
 report.messageUpdate.expectedRevision=1;const result=await s.forExtension(context,'reportActionResult',report);assert.equal(result.message.businessState,'resolved');assert.deepEqual(await s.forExtension(context,'reportActionResult',report),result);assert.equal((await s.list()).items[0].executions[0].state,'completed');
});
