const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Database}=require('../electron/database.cjs'),{createSkills}=require('../electron/skills.cjs'),{CatalogStore}=require('../core/catalog-store/service.cjs'),{WorkforceService,roleInstructions}=require('../core/workforce/service.cjs');
const value=skills=>({name:'Expert',domain:'Software',responsibilities:'Review evidence',methods:'Use relevant declared skills',deliverables:'Review',skills});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-preparation-')),db=new Database(root);await db.call('ready');const skills=createSkills(root,db),catalog=new CatalogStore({directory:root,database:db,skills,extensions:{items:[]}});await catalog.initialize();const w=new WorkforceService({directory:root,database:db,skills,catalog});await w.initialize();t.after(async()=>{await w.shutdown();await catalog.shutdown();await db.close();await fs.rm(root,{recursive:true,force:true});});const source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: verification\ndescription: Review sources\n---\nInspect inputs and report unknowns.\n');const ref=await w.previewImport(source);return {root,db,skills,catalog,w,source,ref};}
async function settle(w){await w.installQueue;await w.queue;return w.snapshot();}
test('submission is durable before installation, atomic on completion, and idempotent',async t=>{
 const {w,skills,ref}=await fixture(t);let release;const original=skills.installFrozen;skills.installFrozen=async(...args)=>{await new Promise(r=>release=r);return original(...args);};
 const input={commandId:'first',value:value([ref])},accepted=await w.submit(input);assert.ok(accepted.jobId);assert.equal((await w.read()).employees.length,0);
 while(!release)await new Promise(r=>setImmediate(r));assert.equal((await w.snapshot()).employees[0].pending,true);
 assert.equal((await w.submit(input)).jobId,accepted.jobId);await assert.rejects(w.submit({...input,value:{...input.value,name:'different'}}),/KEY_CONFLICT/);
 release();await settle(w);const state=await w.read();assert.equal(state.employees.length,1);assert.equal(state.jobs[0].status,'ready');assert.equal((await skills.list()).length,1);
 assert.equal((await w.submit(input)).jobId,accepted.jobId);await settle(w);assert.equal((await w.read()).employees.length,1);
});
test('failed edit retains effective configuration, retry reuses successful packages, snapshots remain fixed',async t=>{
 const {w,skills,ref,source}=await fixture(t);
 const first=await w.submit({commandId:'create',value:value([ref])});await settle(w);const before=await w.prepare(first.id);
 await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: other\ndescription: Second skill\n---\nSecond content.\n');const second=await w.previewImport(source);
 const original=skills.installFrozen;let broken=true;skills.installFrozen=async(...args)=>{if(broken&&args[0].includes(second.source.importId))throw Error('NETWORK_TEST_FAILURE');return original(...args);};
 const edited=await w.submit({commandId:'edit',id:first.id,expectedRevision:1,value:{...value([ref,second]),name:'Updated'}});await settle(w);
 assert.equal((await w.read()).employees[0].name,'Expert');assert.equal((await w.read()).employees[0].revision,1);assert.equal((await skills.list()).length,1);
 assert.equal((await w.snapshot()).employees[0].pendingJob.status,'failed');broken=false;await w.controlPreparation({jobId:edited.jobId,action:'retry'});await settle(w);
 assert.equal((await w.read()).employees[0].revision,2);assert.equal((await skills.list()).length,2);assert.equal((await w.prepare(null,before)).name,'Expert');assert.equal((await w.read()).jobs[0].steps[0].status,'reused');
});
test('no-op edit and opening editor preserve revision, timestamps and no modification draft',async t=>{
 const {w}=await fixture(t);const accepted=await w.submit({commandId:'create',value:value([])});await settle(w);const old=(await w.read()).employees[0];
 let draft=await w.createDraft({commandId:'open',employeeId:accepted.id});assert.equal((await w.snapshot()).drafts.length,0);
 draft=await w.saveDraft({id:draft.id,expectedRevision:1,value:draft.value,step:3,mode:'manual',brief:''});assert.equal((await w.snapshot()).drafts.length,0);
 const result=await w.submit({commandId:'unchanged',id:old.id,expectedRevision:old.revision,value:draft.value,draftId:draft.id,expectedDraftRevision:draft.revision});assert.equal(result.noChange,true);assert.deepEqual((await w.read()).employees[0],old);assert.equal((await w.read()).jobs.length,1);
 draft=await w.saveDraft({id:draft.id,expectedRevision:draft.revision,value:{...draft.value,name:'Changed'},step:1,mode:'manual',brief:''});assert.equal((await w.snapshot()).drafts.length,1);
 await w.saveDraft({id:draft.id,expectedRevision:draft.revision,value:value([]),step:2,mode:'manual',brief:''});assert.equal((await w.snapshot()).drafts.length,0);
});
test('cancel before apply does not create an employee; restart marks interrupted work and retry resumes',async t=>{
 const {w,skills,ref}=await fixture(t);let release;const original=skills.installFrozen;skills.installFrozen=async(...args)=>{await new Promise(r=>release=r);return original(...args);};
 const accepted=await w.submit({commandId:'create',value:value([ref])});while(!release)await new Promise(r=>setImmediate(r));await w.controlPreparation({jobId:accepted.jobId,action:'cancel'});release();await settle(w);assert.equal((await w.read()).employees.length,0);assert.equal((await w.read()).jobs[0].status,'cancelled');
 skills.installFrozen=original;const next=await w.submit({commandId:'next',value:value([ref])});await settle(w);assert.equal((await skills.list()).length,1);
 await w.change(s=>{s.jobs[0].status='running';s.employees=[];});await w.initialize();assert.equal((await w.read()).jobs[0].status,'interrupted');await w.controlPreparation({jobId:next.jobId,action:'retry'});await settle(w);assert.equal((await w.read()).employees.length,1);
});
test('same-name different imports coexist, disabled packages never silently enable, usage is frozen',async t=>{
 const {w,skills,ref,source}=await fixture(t);ref.usage={mode:'when-relevant',when:'Review only',whenNot:'Skip unrelated implementation'};
 const a=await w.submit({commandId:'a',value:value([ref])});await settle(w);const snapshot=await w.prepare(a.id);assert.match(roleInstructions(snapshot),/Skip unrelated implementation/);
 await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: verification\ndescription: New version\n---\nChanged content.\n');const other=await w.previewImport(source);await w.submit({commandId:'b',value:value([other])});await settle(w);assert.equal((await skills.list()).length,2);
 assert.match((await w.prepare(null,snapshot)).skills[0].body,/Inspect inputs/);
 await skills.update({id:snapshot.skills[0].id,enabled:false});await w.submit({commandId:'disabled',value:value([ref])});await settle(w);assert.equal((await w.read()).jobs[0].status,'failed');assert.equal((await skills.list()).find(s=>s.id===snapshot.skills[0].id).enabled,false);
});
test('failed submission can return to editing without losing template, locale or selections',async t=>{
 const {w,skills,ref}=await fixture(t);const original=skills.installFrozen;skills.installFrozen=async()=>{throw Error('OFFLINE');};
 const templateRef={id:'amble.product',version:'1.0.0'},profile={...value([ref]),templateRef,definitionLocale:'en'};
 const result=await w.submit({commandId:'new',value:profile});await settle(w);
 const draft=await w.createDraft({commandId:'adjust',preparationId:result.jobId});assert.deepEqual(draft.value.templateRef,templateRef);assert.equal(draft.value.definitionLocale,'en');assert.equal(draft.value.skills.length,1);assert.equal((await w.read()).jobs[0].status,'cancelled');assert.equal((await w.read()).employees.length,0);
 skills.installFrozen=original;const retried=await w.submit({commandId:'corrected',value:draft.value,draftId:draft.id,expectedDraftRevision:draft.revision});await settle(w);assert.equal((await w.snapshot()).employees[0].status,'ready');
 const edit=await w.createDraft({commandId:'edit',employeeId:retried.id});assert.deepEqual(edit.value.templateRef,templateRef);assert.equal((await w.snapshot()).drafts.length,0);
});
test('concurrent effective revision update blocks apply without overwriting it',async t=>{
 const {w,skills,ref}=await fixture(t);const first=await w.submit({commandId:'first',value:value([])});await settle(w);
 let release;const original=skills.installFrozen;skills.installFrozen=async(...a)=>{await new Promise(r=>release=r);return original(...a);};
 const edit=await w.submit({commandId:'edit',id:first.id,expectedRevision:1,value:{...value([ref]),name:'Candidate'}});while(!release)await new Promise(r=>setImmediate(r));
 await w.change(s=>{s.employees[0].revision=2;s.employees[0].name='Other window';});release();await settle(w);
 const state=await w.read();assert.equal(state.employees[0].name,'Other window');assert.equal(state.jobs.find(j=>j.id===edit.jobId).status,'conflict');await assert.rejects(w.controlPreparation({jobId:edit.jobId,action:'retry'}),/NOT_RETRYABLE/);
});
test('verified script resources remain callable without executing installation scripts',async t=>{
 const {w,skills,source}=await fixture(t);await fs.mkdir(path.join(source,'scripts'));await fs.writeFile(path.join(source,'scripts','helper'),'#!/bin/sh\nexit 0\n',{mode:0o644});const ref=await w.previewImport(source);
 const accepted=await w.submit({commandId:'helper',value:value([ref])});await settle(w);const snapshot=await w.prepare(accepted.id),file=path.join(path.dirname(snapshot.skills[0].path),'scripts/helper');
 assert.equal(await fs.readFile(file,'utf8'),'#!/bin/sh\nexit 0\n');if(process.platform!=='win32')assert.ok((await fs.stat(file)).mode&0o100);assert.equal((await skills.list()).length,1);
});

test('expert model preference survives drafts, copies, preparation and frozen profiles; clearing restores default',async t=>{
 const {w}=await fixture(t);const modelChoice={providerId:'provider-b',model:'model-b'};
 const created=await w.submit({commandId:'preferred-model',value:{...value([]),modelChoice}});await settle(w);
 const frozen=await w.prepare(created.id);assert.deepEqual(frozen.modelChoice,modelChoice);
 let draft=await w.createDraft({commandId:'edit-model',employeeId:created.id});assert.deepEqual(draft.value.modelChoice,modelChoice);
 const copy=await w.createDraft({commandId:'copy-model',employeeId:created.id,copy:true});assert.deepEqual(copy.value.modelChoice,modelChoice);
 draft=await w.saveDraft({id:draft.id,expectedRevision:draft.revision,value:{...draft.value,modelChoice:null},step:1,mode:'manual',brief:''});
 assert.equal(draft.value.modelChoice,undefined);
 await w.submit({commandId:'reset-model',id:created.id,expectedRevision:1,value:draft.value,draftId:draft.id,expectedDraftRevision:draft.revision});await settle(w);
 assert.equal((await w.prepare(created.id)).modelChoice,undefined);
 assert.deepEqual((await w.prepare(null,frozen)).modelChoice,modelChoice);
 const {definition,semantic}=require('../core/workforce/contract.cjs');
 assert.notEqual(semantic(value([])),semantic({...value([]),modelChoice}));
 for(const choice of [{providerId:'bad/path',model:'ok'},{providerId:'valid',model:''},'bad'])assert.throws(()=>definition({...value([]),modelChoice:choice}));
});

test('profile-only edits and removals never prepare or repair skills, and direct saves are idempotent',async t=>{
 const {w,skills,ref}=await fixture(t);const first=await w.submit({commandId:'create',value:value([ref])});await settle(w);
 const frozen=await w.prepare(first.id),skill=(await skills.list())[0];await skills.update({id:skill.id,enabled:false});
 skills.installFrozen=async()=>{throw Error('Unexpected installation');};w.resolveSkill=async()=>{throw Error('Unexpected network');};
 const input={commandId:'rename',id:first.id,expectedRevision:1,value:{...value([ref]),name:'Renamed',modelChoice:{providerId:'model-service',model:'preferred'}}};
 const result=await w.submit(input);assert.equal(result.jobId,undefined);assert.equal(result.revision,2);assert.deepEqual(await w.submit(input),result);
 await assert.rejects(w.submit({...input,value:{...input.value,name:'Other'}}),/KEY_CONFLICT/);
 assert.equal((await w.read()).jobs.length,1);assert.equal((await w.snapshot()).employees[0].requirements[0].readiness,'disabled');
 assert.equal((await w.read()).employees[0].activatedRevision,2);assert.equal(frozen.name,'Expert');
 const removed=await w.submit({commandId:'remove',id:first.id,expectedRevision:2,value:value([])});assert.equal(removed.jobId,undefined);assert.equal((await skills.list()).length,1);assert.equal((await w.snapshot()).employees[0].status,'ready');
});

test('editing reuses installed additions directly and only prepares missing additions',async t=>{
 const {w,skills,ref,source}=await fixture(t);await w.submit({commandId:'seed',value:value([ref])});await settle(w);
 const first=await w.submit({commandId:'empty',value:value([])});await settle(w);let installs=0;const install=skills.installFrozen;skills.installFrozen=async(...args)=>{installs++;return install(...args);};
 const reuse=await w.submit({commandId:'reuse',id:first.id,expectedRevision:1,value:value([ref])});assert.equal(reuse.jobId,undefined);assert.equal(installs,0);
 await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: extra\ndescription: Another skill\n---\nReview extra evidence.\n');const extra=await w.previewImport(source);
 await w.submit({commandId:'another-expert',value:{...value([]),name:'Another expert'}});await settle(w);const order=(await w.read()).employees.map(e=>e.id);
 const edit=await w.submit({commandId:'add',id:first.id,expectedRevision:2,value:value([ref,extra])});assert.ok(edit.jobId);await settle(w);assert.equal(installs,1);
 const job=(await w.read()).jobs.find(j=>j.id===edit.jobId);assert.equal(job.steps[0].status,'reused');assert.ok(!job.events.some(e=>e.key===job.steps[0].key));assert.equal(job.steps[1].status,'installed');assert.deepEqual((await w.read()).employees.map(e=>e.id),order);
});
