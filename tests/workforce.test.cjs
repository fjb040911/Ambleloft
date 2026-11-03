const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Database}=require('../electron/database.cjs');
const {createSkills}=require('../electron/skills.cjs');
const {CatalogStore}=require('../core/catalog-store/service.cjs');
const {WorkforceService,roleInstructions}=require('../core/workforce/service.cjs');
const {verifyRoles,roleCatalog}=require('../core/workforce/contract.cjs');
const {publish}=require('../scripts/publish-store.cjs');
const {publishRoles}=require('../scripts/publish-roles.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-workforce-')),db=new Database(root);await db.call('ready');
 const skills=createSkills(root,db),catalog=new CatalogStore({directory:root,database:db,skills,extensions:{items:[]}});await catalog.initialize();
 const workforce=new WorkforceService({directory:root,database:db,skills,catalog});await workforce.initialize();
 t.after(async()=>{await workforce.shutdown();await catalog.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});
 const source=path.join(root,'example');await fs.mkdir(source);await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: fixture-workflow\ndescription: Verify sources\n---\nRead sources before acting.\n');
 return {root,db,skills,catalog,workforce,source};
}
const role=skills=>({name:'Reviewer',domain:'Hardware',responsibilities:'Check the design',methods:'Read evidence',deliverables:'Review report',skills});
test('declarations do not install; activation freezes source and shares globally across roles',async t=>{
 const f=await fixture(t),ref=await f.workforce.previewImport(f.source,{kind:'github',repository:'https://github.com/example/fixture',directory:'skills/fixture',requestedRef:'main',commit:'a'.repeat(40)});
 const a=await f.workforce.save({value:role([ref])}),b=await f.workforce.save({value:{...role([ref]),name:'Engineer'}});
 assert.equal((await f.skills.list()).length,0);
 await fs.writeFile(path.join(f.source,'SKILL.md'),'changed user source');
 await Promise.all([f.workforce.activate({id:a.id,expectedRevision:a.revision}),f.workforce.activate({id:b.id,expectedRevision:b.revision})]);
 assert.equal((await f.skills.list()).length,1);assert.equal((await f.skills.list())[0].provenance.commit,'a'.repeat(40));
 const view=await f.workforce.snapshot();assert.ok(view.employees.every(e=>e.status==='ready'));
 assert.equal(view.employees.find(e=>e.id===b.id).job.steps[0].status,'reused');
 const snapshot=await f.workforce.prepare(a.id);assert.match(snapshot.skills[0].body,/Read sources/);assert.match(roleInstructions(snapshot),/WHEN relevant/);
 await f.workforce.save({id:a.id,expectedRevision:1,value:{...role([]),name:'New reviewer'}});
 assert.equal((await f.workforce.prepare(null,snapshot)).name,'Reviewer');assert.equal((await f.skills.list()).length,1);
 await f.workforce.remove({id:b.id,expectedRevision:1});assert.equal((await f.skills.list()).length,1);
});
test('optimistic editing, missing skills, disabled reuse, and restart recovery remain explicit',async t=>{
 const f=await fixture(t),installed=(await f.skills.importFolder(f.source)).skill;
 const a=await f.workforce.save({value:role([{name:installed.name,label:'Sources',source:{kind:'installed',skillId:installed.id}}])});
 await assert.rejects(f.workforce.save({id:a.id,expectedRevision:0,value:role([])}),/已被修改/);
 await f.skills.update({id:installed.id,enabled:false});await f.workforce.activate({id:a.id,expectedRevision:1});assert.equal((await f.skills.list())[0].enabled,false);assert.equal((await f.workforce.snapshot()).employees[0].status,'failed');await f.skills.update({id:installed.id,enabled:true});await f.workforce.activate({id:a.id,expectedRevision:1});
 const frozen=await f.workforce.prepare(a.id);await f.skills.remove(installed.id);await assert.rejects(f.workforce.prepare(null,frozen),/停用或卸载/);
 await f.workforce.activate({id:a.id,expectedRevision:1});assert.equal((await f.workforce.snapshot()).employees[0].status,'failed');
 await f.workforce.change(s=>{s.jobs[0].status='running';s.jobs[0].steps[0].status='installing';});
 await f.workforce.initialize();assert.equal((await f.workforce.snapshot()).employees[0].status,'interrupted');
});
test('partial failure preserves successful global installs; retry does not duplicate them',async t=>{
 const f=await fixture(t),a=await f.workforce.previewImport(f.source),other=path.join(f.root,'other');await fs.mkdir(other);await fs.writeFile(path.join(other,'SKILL.md'),'---\nname: another-workflow\ndescription: Another\n---\nOther workflow.\n');
 const b=await f.workforce.previewImport(other),employee=await f.workforce.save({value:role([a,b])});
 const installFrozen=f.skills.installFrozen;let broken=true;f.skills.installFrozen=async(...args)=>{if(broken&&args[0].includes(b.source.importId))throw Error('temporary failure');return installFrozen(...args);};
 await f.workforce.activate({id:employee.id,expectedRevision:1});assert.equal((await f.skills.list()).length,1);assert.equal((await f.workforce.snapshot()).employees[0].status,'failed');
 broken=false;const oldJob=(await f.workforce.snapshot()).employees[0].job;await f.workforce.activate({id:employee.id,expectedRevision:1,skillKey:oldJob.steps[1].key});assert.equal((await f.workforce.read()).jobs.length,2);assert.equal((await f.skills.list()).length,2);assert.equal((await f.workforce.snapshot()).employees[0].job.steps[0].status,'reused');
});
test('signed role catalog and published skill archives work through the real installer',async t=>{
 const f=await fixture(t),keys=crypto.generateKeyPairSync('ed25519'),keyFile=path.join(f.root,'key.pem'),output=path.join(f.root,'release');
 await fs.writeFile(keyFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 await publish({specFile:path.resolve('store/workforce-skills.json'),keyFile,output,reviewedBy:'automated contract validation'});
 await publishRoles({specFile:path.resolve('store/roles.json'),keyFile,output});
 const source={id:'curated',title:'Test',keyId:'curated-v1',baseUrl:'http://127.0.0.1:18081/',publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
 const fetcher=async url=>new Response(await fs.readFile(path.join(output,new URL(url).pathname)),{status:200});
 f.catalog.sources=[source];f.catalog.fetcher=fetcher;f.workforce.fetcher=fetcher;
 const catalog=await f.workforce.roles({refresh:true});assert.equal(catalog.items.length,7);
 const envelope=JSON.parse(await fs.readFile(path.join(output,'roles.json'),'utf8'));
 assert.throws(()=>verifyRoles({...envelope,payload:Buffer.from('{}').toString('base64')},source),/SIGNATURE/);
 const payload=verifyRoles(envelope,source).catalog;assert.throws(()=>roleCatalog({...payload,kind:'skills'}));
 const template=catalog.items[0],employee=await f.workforce.save({value:{...template.en,skills:template.skills}});
 await f.workforce.activate({id:employee.id,expectedRevision:1});assert.equal((await f.workforce.snapshot()).employees[0].status,'ready');assert.equal((await f.skills.list()).length,2);
 f.workforce.fetcher=async()=>{throw Error('offline');};const offline=await f.workforce.roles({refresh:true});assert.equal(offline.stale,true);assert.equal(offline.items.length,7);
});

test('role drafts persist incomplete input and step, copy only definition, and commit exactly one employee',async t=>{
 const f=await fixture(t),employee=await f.workforce.save({value:role([])});
 const copied=await f.workforce.createDraft({commandId:'copy-role',employeeId:employee.id,copy:true});
 assert.equal(copied.employeeId,null);assert.equal(copied.employeeRevision,null);assert.equal(copied.value.id,undefined);
 const empty=await f.workforce.createDraft({commandId:'new-role'});
 assert.equal(empty.step,1);assert.equal(empty.mode,'manual');
 const saved=await f.workforce.saveDraft({id:empty.id,expectedRevision:1,value:{...empty.value,domain:'Semiconductors'},step:2,mode:'manual',brief:''});
 await f.workforce.initialize();assert.equal((await f.workforce.snapshot()).drafts.find(d=>d.id===saved.id).step,2);
 await assert.rejects(f.workforce.saveDraft({id:empty.id,expectedRevision:1,value:empty.value,step:0,mode:'manual'}),/其他窗口/);
 const input={draftId:copied.id,expectedDraftRevision:1,value:copied.value};
 const first=await f.workforce.save(input),again=await f.workforce.save(input);assert.equal(first.id,again.id);assert.notEqual(first.id,employee.id);
 assert.equal((await f.workforce.snapshot()).employees.length,2);
 assert.ok((await f.workforce.snapshot()).drafts.some(d=>d.id===saved.id));
});

test('late AI role suggestions never overwrite edited fields or a discarded draft',async t=>{
 const f=await fixture(t);f.workforce.providers={secret:async()=>({model:'test'})};let resolve;
 f.workforce.generateRole=async()=>new Promise(r=>resolve=r);
 const draft=await f.workforce.createDraft({commandId:'ai-role'});
 const request=f.workforce.suggestRole({id:draft.id,expectedRevision:1});
 while(!resolve)await new Promise(r=>setImmediate(r));
 await f.workforce.saveDraft({id:draft.id,expectedRevision:1,value:{...draft.value,name:'My confirmed name'},step:1,mode:'guided',brief:'Design reviews'});
 resolve({fields:{name:'Suggested name'},questions:['Which domain?'],skillSuggestions:['architecture review']});
 assert.equal((await request).status,'stale');
 const current=(await f.workforce.snapshot()).drafts[0];assert.equal(current.value.name,'My confirmed name');
 assert.equal(current.suggestion.result.fields.name,'Suggested name');
 await f.workforce.discardDraft({id:current.id,expectedRevision:current.revision});
 assert.equal((await f.workforce.snapshot()).drafts.length,0);
});

test('stopping role suggestion aborts request and ignores a late model response',async t=>{
 const f=await fixture(t);f.workforce.providers={secret:async()=>({model:'test'})};let resolve,signal;
 f.workforce.generateRole=async(_c,_j,s)=>{signal=s;return new Promise(r=>resolve=r)};
 const draft=await f.workforce.createDraft({commandId:'cancel-ai'});
 const request=f.workforce.suggestRole({id:draft.id,expectedRevision:1,requestId:'role-request'});
 while(!resolve)await new Promise(r=>setImmediate(r));
 assert.equal((await f.workforce.cancelRoleSuggestion({id:draft.id,requestId:'role-request'})).cancelled,true);
 assert.equal(signal.aborted,true);resolve({fields:{name:'late'},questions:[],skillSuggestions:[]});
 await assert.rejects(request);const saved=(await f.workforce.snapshot()).drafts.find(d=>d.id===draft.id);
 assert.equal(saved.suggestion.status,'cancelled');assert.equal(saved.value.name,'');
});

test('role suggestion supports unchanged employee edit without persisting a draft',async t=>{
 const f=await fixture(t),employee=await f.workforce.save({value:role([])});
 const draft=await f.workforce.createDraft({commandId:'edit-suggest',employeeId:employee.id});
 assert.equal(draft.ephemeral,true);f.workforce.providers={secret:async()=>({model:'test'})};
 f.workforce.generateRole=async()=>({fields:{name:'Suggested'},questions:[],skillSuggestions:[]});
 const result=await f.workforce.suggestRole({id:draft.id,expectedRevision:draft.revision,requestId:'edit-request'});
 assert.equal(result.status,'ready');assert.equal(result.result.fields.name,'Suggested');
 assert.equal((await f.workforce.snapshot()).drafts.length,0);
 assert.equal((await f.workforce.snapshot()).employees[0].name,employee.name);
});

test('stopping before role job creation prevents the model request',async t=>{
 const f=await fixture(t),draft=await f.workforce.createDraft({commandId:'cancel-immediate'});let calls=0;
 f.workforce.providers={secret:async()=>({model:'test'})};f.workforce.generateRole=async()=>{calls++;return {fields:{},questions:[],skillSuggestions:[]};};
 const request=f.workforce.suggestRole({id:draft.id,expectedRevision:draft.revision,requestId:'stop-now'});const rejection=assert.rejects(request);
 assert.equal((await f.workforce.cancelRoleSuggestion({id:draft.id,requestId:'stop-now'})).cancelled,true);
 await rejection;assert.equal(calls,0);
});

test('stopping while loading model credentials does not start the model request',async t=>{
 const f=await fixture(t),draft=await f.workforce.createDraft({commandId:'cancel-secret'});let release,calls=0;
 f.workforce.providers={secret:async()=>new Promise(r=>release=r)};f.workforce.generateRole=async()=>{calls++;return {fields:{},questions:[],skillSuggestions:[]};};
 const request=f.workforce.suggestRole({id:draft.id,expectedRevision:draft.revision,requestId:'stop-secret'});const rejection=assert.rejects(request);
 while(!release)await new Promise(r=>setImmediate(r));await f.workforce.cancelRoleSuggestion({id:draft.id,requestId:'stop-secret'});
 release({model:'test'});await rejection;assert.equal(calls,0);
 assert.equal((await f.workforce.snapshot()).drafts.find(d=>d.id===draft.id).suggestion.status,'cancelled');
});

test('expert guide persists multi-turn answers and validates declarative question without applying a role',async t=>{
 const f=await fixture(t);f.workforce.providers={secret:async()=>({model:'test'})};const calls=[];
 f.workforce.generateRole=async(_c,job)=>{calls.push(job.input);return calls.length===1?{message:'先了解你的主要用户。',question:{title:'服务对象',label:'主要面向谁？',options:['芯片设计团队','工具开发团队']},fields:{}}:{message:'可以先这样定义。',question:null,fields:{name:'芯片产品经理',responsibilities:'分析开发者需求'}};};
 let draft=await f.workforce.createDraft({commandId:'guide-flow'});
 const user={id:'message-1',role:'user',text:'需要一位芯片产品经理'};
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:user.text,guide:[user]});
 const first=await f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-1'});
 assert.equal(first.message.question.source.definition.fields[0].type,'select');
 const question=first.message;question.question.prefill={choice:'option-1'};
 const answer={id:'message-2',role:'user',text:'主要面向谁？：工具开发团队'};
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:user.text,guide:[user,question,answer]});
 const second=await f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-2'});
 assert.equal(calls[1].history[2].text,answer.text);assert.equal(second.fields.name,'芯片产品经理');
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:user.text,guide:[user,question,answer,second.message]});
 const restored=(await f.workforce.snapshot()).drafts.find(x=>x.id===draft.id);
 assert.equal(restored.guide[1].question.prefill.choice,'option-1');assert.equal(restored.guide[3].fields.name,'芯片产品经理');assert.equal(restored.value.name,'');
 const reopened=new WorkforceService({directory:f.root,database:f.db,skills:f.skills,catalog:f.catalog});await reopened.initialize();
 const afterRestart=(await reopened.snapshot()).drafts.find(x=>x.id===draft.id);assert.equal(afterRestart.guide[1].question.prefill.choice,'option-1');assert.equal(afterRestart.guide[3].fields.name,'芯片产品经理');await reopened.shutdown();
});

test('expert guide rejects malformed questions and ignores responses after stop or draft change',async t=>{
 const f=await fixture(t);f.workforce.providers={secret:async()=>({model:'test'})};
 let draft=await f.workforce.createDraft({commandId:'guide-cancel'});
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:'test',guide:[{id:'user-1',role:'user',text:'test'}]});
 f.workforce.generateRole=async()=>({message:'问题',question:{title:'选择',label:'选择',options:['相同','相同']},fields:{}});
 await assert.rejects(f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'bad'}),/问题格式无效/);
 let resolve,signal;f.workforce.generateRole=async(_c,_j,s)=>{signal=s;return new Promise(r=>resolve=r)};
 const pending=f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'stop-guide'});const rejected=assert.rejects(pending);
 while(!resolve)await new Promise(r=>setImmediate(r));await f.workforce.cancelRoleSuggestion({id:draft.id,requestId:'stop-guide'});assert.equal(signal.aborted,true);
 resolve({message:'迟到',question:null,fields:{name:'不应应用'}});await rejected;
 assert.equal((await f.workforce.snapshot()).drafts.find(d=>d.id===draft.id).value.name,'');
});

test('typing a future message during generation is preserved, while changing the profile invalidates the reply',async t=>{
 const f=await fixture(t);f.workforce.providers={secret:async()=>({model:'test'})};
 let draft=await f.workforce.createDraft({commandId:'guide-basis'});
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:'test',guide:[{id:'user-1',role:'user',text:'test'}]});
 let resolve;f.workforce.generateRole=async()=>new Promise(r=>resolve=r);
 let pending=f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-typing'});
 while(!resolve)await new Promise(r=>setImmediate(r));
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:'test',guide:draft.guide,guideInput:'next message'});
 resolve({message:'reply',question:null,fields:{}});assert.equal((await pending).message.text,'reply');
 assert.equal((await f.workforce.snapshot()).drafts.find(x=>x.id===draft.id).guideInput,'next message');
 resolve=null;pending=f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-changed'});const rejected=assert.rejects(pending,/已变化/);
 while(!resolve)await new Promise(r=>setImmediate(r));
 await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:{...draft.value,name:'confirmed'},step:1,mode:'guided',brief:'test',guide:draft.guide});
 resolve({message:'outdated',question:null,fields:{name:'other'}});await rejected;
});

test('stopping expert guide while loading provider credentials immediately releases the request',async t=>{
 const f=await fixture(t);let release,calls=0;f.workforce.providers={secret:async()=>new Promise(r=>release=r)};
 f.workforce.generateRole=async()=>{calls++;return {message:'late',question:null,fields:{}};};
 let draft=await f.workforce.createDraft({commandId:'guide-provider-cancel'});
 draft=await f.workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:'test',guide:[{id:'user-1',role:'user',text:'test'}]});
 const pending=f.workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-provider-stop'});const rejected=assert.rejects(pending);
 while(!release)await new Promise(r=>setImmediate(r));
 await f.workforce.cancelRoleSuggestion({id:draft.id,requestId:'guide-provider-stop'});await rejected;
 release({model:'test'});await new Promise(r=>setImmediate(r));assert.equal(calls,0);
});
