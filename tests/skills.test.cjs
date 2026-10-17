const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Database}=require('../electron/database.cjs');
const {createSkills,parseSkill}=require('../electron/skills.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'amble-skills-'));const source=path.join(dir,'original');await fs.mkdir(path.join(source,'references'),{recursive:true});await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: meeting-summary\ndescription: >-\n  Summarize meetings\n  and action items.\nlicense: MIT\n---\nRead references/format.md before writing.');await fs.writeFile(path.join(source,'references/format.md'),'Meeting format');const db=new Database(path.join(dir,'app'));await db.call('ready');t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,source,db,skills:createSkills(path.join(dir,'app'),db)};}
test('imports a complete owned copy, persists in SQLite, handles duplicates and immutable revisions',async t=>{
 const {dir,source,db,skills}=await fixture(t);const {skill}=await skills.importFolder(source);
 assert.equal(skill.name,'meeting-summary');assert.equal(skill.description,'Summarize meetings and action items.');assert.equal(skill.version,1);assert.equal('body' in skill,false);
 assert.equal((await skills.importFolder(source)).duplicate.id,skill.id);
 const replacement=(await skills.importFolder(source,{replaceId:skill.id})).skill;assert.equal(replacement.version,2);
 const second=(await skills.importFolder(source,{asNew:true})).skill;assert.notEqual(second.id,skill.id);
 await fs.rm(source,{recursive:true});assert.equal(await fs.readFile(path.join(path.dirname(skill.path),'references/format.md'),'utf8'),'Meeting format');
 const reopened=createSkills(path.join(dir,'app'),db);assert.equal((await reopened.list()).length,2);
 const updated=await reopened.update({id:skill.id,version:2,name:'Meeting writer',description:'Write minutes',body:'New body'});
 assert.equal(updated.version,3);assert.match(await fs.readFile(updated.path,'utf8'),/license: MIT/);assert.match(await fs.readFile(skill.path,'utf8'),/Read references/);
 await assert.rejects(reopened.update({id:skill.id,version:2,name:'Stale',description:'d',body:'b'}),/已更新/);
 await reopened.remove(skill.id);assert.equal((await reopened.list()).length,1);assert.match(await fs.readFile(skill.path,'utf8'),/Read references/);
});
test('automatic catalog is lazy, selections are deduplicated and disabled/deleted selections fail',async t=>{
 const {skills,source}=await fixture(t);const {skill}=await skills.importFolder(source);
 const implicit=await skills.prepare();assert.match(implicit.instructions,/meeting-summary/);assert.doesNotMatch(implicit.instructions,/Read references\/format/);assert.equal(implicit.explicit,'');
 const explicit=await skills.prepare([skill.id,skill.id]);assert.equal(explicit.snapshots.length,1);assert.match(explicit.explicit,/Read references/);
 await skills.update({id:skill.id,enabled:false});assert.doesNotMatch((await skills.prepare()).instructions,/meeting-summary/);await assert.rejects(skills.prepare([skill.id]),/停用或删除/);
 await skills.remove(skill.id);await assert.rejects(skills.prepare([skill.id]),/停用或删除/);
 assert.equal(explicit.snapshots[0].version,1);assert.equal(explicit.snapshots[0].name,'meeting-summary');
});
test('rejects malformed skills and symlinks without writing a database record',async t=>{
 assert.throws(()=>parseSkill('no frontmatter'),/SKILL.md/);assert.throws(()=>parseSkill('---\nname: a\nname: b\ndescription: d\n---\nbody'),/唯一/);
 const {skills,source}=await fixture(t);await fs.symlink('/etc',path.join(source,'escape'));await assert.rejects(skills.importFolder(source),/符号链接/);assert.deepEqual(await skills.list(),[]);
});
test('execution sends current catalog and explicit workflow while a follow-up does not reselect it',async()=>{
 const calls=[];const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const run={messages:[{id:'first',role:'user',text:'Summarize this'}],cwd:'/tmp',permission:'default'};
 const rpc={send(){},async call(method,params){calls.push({method,params});return method==='turn/start'?{turn:{id:'turn'}}:{thread:{id:'thread'}};}};
 await runtime.execute({rpc,run,turnKey:'first',config:{model:'test'},skills:{instructions:'CATALOG ONLY',explicit:'WORKFLOW BODY'}});
 assert.match(calls.find(c=>c.method==='thread/start').params.developerInstructions,/CATALOG ONLY/);assert.match(calls.find(c=>c.method==='turn/start').params.input[0].text,/WORKFLOW BODY/);
 calls.length=0;run.messages.push({id:'second',role:'user',text:'Shorten it'});
 await runtime.execute({rpc,run,turnKey:'second',config:{model:'test'},skills:{instructions:'CURRENT CATALOG',explicit:''}});
 assert.equal(calls.find(c=>c.method==='turn/start').params.input[0].text,'Shorten it');assert.match(calls.find(c=>c.method==='thread/resume').params.developerInstructions,/CURRENT CATALOG/);
});

test('skill previews read owned files and reject traversal and symlinks',async t=>{
 const {skills,source,dir}=await fixture(t);await fs.writeFile(path.join(source,'script.py'),'print("hello")');await fs.writeFile(path.join(source,'binary.bin'),Buffer.from([0,1]));
 const {skill}=await skills.importFolder(source);
 assert.equal((await skills.readFile({id:skill.id,file:'SKILL.md'})).kind,'markdown');
 assert.equal((await skills.readFile({id:skill.id,file:'references/format.md'})).text,'Meeting format');
 assert.equal((await skills.readFile({id:skill.id,file:'script.py'})).kind,'text');
 assert.equal((await skills.readFile({id:skill.id,file:'binary.bin'})).kind,'unsupported');
 await assert.rejects(skills.readFile({id:skill.id,file:'../SKILL.md'}),/路径/);
 const target=path.join(path.dirname(skill.path),'references/format.md');await fs.unlink(target);await fs.symlink(path.join(source,'SKILL.md'),target);
 await assert.rejects(skills.readFile({id:skill.id,file:'references/format.md'}),/符号链接/);
});

test('repository installation preserves complete resources, provenance and disabled state',async t=>{
 const {skills,source}=await fixture(t);let cleaned=0;
 const checkout=async()=>({source,provenance:{kind:'github',repository:'https://github.com/example/rules',directory:'skills/rules',requestedRef:'main',commit:'a'.repeat(40)},cleanup:async()=>cleaned++});
 const spec={repository:'https://github.com/example/rules',directory:'skills/rules',ref:'main'};
 const first=await skills.installRepository(spec,{checkout});assert.equal(first.skill.provenance.commit,'a'.repeat(40));assert.ok(first.skill.files.includes('references/format.md'));assert.match(first.visibility,/下一次/);
 const duplicate=await skills.installRepository(spec,{checkout});assert.equal(duplicate.duplicate.id,first.skill.id);
 await skills.update({id:first.skill.id,enabled:false});const updated=await skills.installRepository({...spec,replaceId:first.skill.id},{checkout});assert.equal(updated.skill.enabled,false);assert.equal(updated.skill.version,2);assert.equal(cleaned,3);
});
test('repository install rejects untrusted hosts, invalid refs and escaping paths before checkout',async t=>{
 const {skills}=await fixture(t);let called=false;const checkout=async()=>{called=true;throw Error('unexpected');};
 for(const spec of [{repository:'https://example.com/a/b',directory:'skills/rules'},{repository:'https://github.com/a/b',directory:'../rules'},{repository:'https://github.com/a/b',directory:'skills/rules',ref:'--upload-pack=bad'}])await assert.rejects(skills.installRepository(spec,{checkout}));assert.equal(called,false);
});

test('built-in skill installs once, localizes, is lazy and read-only, and preserves disabled choice on upgrade',async t=>{
 const {skills,dir,db}=await fixture(t);const source=path.join(dir,'builtins');await fs.cp(path.join(__dirname,'../resources/skills'),source,{recursive:true});
 await skills.initializeBuiltins({root:source});let [skill]=await skills.list();assert.equal(skill.id,'builtin-supplemental-input');assert.equal(skill.builtIn.version,1);
 assert.equal(skill.displayName,'Supplemental information');skills.locale='zh-CN';assert.equal((await skills.list())[0].displayName,'补充信息');
 await skills.initializeBuiltins({root:source});assert.equal((await skills.list())[0].revision,skill.revision);
 const prepared=await skills.prepare();assert.equal(prepared.explicit,'');assert.equal(prepared.snapshots.length,0);assert.equal(prepared.instructions.split(skill.path).length-1,1);assert.equal(prepared.instructions.includes((await skills.detail(skill.id)).body),false);
 assert.doesNotMatch((await skills.prepare([],{inputToolsEnabled:false})).instructions,/supplemental-input/);
 assert.match(prepared.instructions,/Supplemental input interaction guidance/);
 assert.doesNotMatch((await skills.prepare([],{inputToolsEnabled:false})).instructions,/Supplemental input interaction guidance/);
 assert.equal((await skills.prepare([skill.id,skill.id])).snapshots.length,1);
 await assert.rejects(skills.update({id:skill.id,version:skill.version,name:'x',description:'x',body:'x'}),/只读/);
 await assert.rejects(skills.remove(skill.id),/不能删除/);
 await assert.rejects(skills.importFolder(path.join(source,'supplemental-input'),{replaceId:skill.id}),/不能覆盖/);
 await skills.update({id:skill.id,enabled:false});
 await fs.appendFile(path.join(source,'supplemental-input/references/lifecycle.md'),'\nUpdated guidance.\n');
 await skills.initializeBuiltins({root:source});const updated=(await skills.list())[0];assert.equal(updated.enabled,false);assert.equal(updated.version,2);assert.notEqual(updated.builtIn.digest,skill.builtIn.digest);
 assert.equal((await skills.prepare()).instructions.includes('supplemental-input'),false);
 assert.doesNotMatch((await skills.prepare()).instructions,/Supplemental input interaction guidance/);
 assert.match(await fs.readFile(skill.path,'utf8'),/Supplemental information/);
 const reopened=createSkills(path.join(dir,'app'),db);await reopened.initializeBuiltins({root:source});assert.equal((await reopened.list())[0].enabled,false);assert.equal((await reopened.list())[0].revision,updated.revision);
});
test('bundled example executes through real model tools without requiring the guide to stay enabled',async t=>{
 const {skills,db}=await fixture(t);await skills.initializeBuiltins();const [skill]=await skills.list();
 const file=await skills.readFile({id:skill.id,file:'examples/travel.json'}),request=JSON.parse(file.text);
 const {InputRequests}=require('../core/inputs/service.cjs'),{ChatInputs}=require('../core/forms/chat-inputs.cjs'),{bindModelInputs}=require('../core/inputs/model.cjs');
 const runtime={runs:[{id:'r',status:'running',messages:[],tools:[]}]};await db.call('saveRuns',runtime.runs);
 const queue=new ChatInputs({database:db,runtime,validate:async()=>{},publish(){}});queue.tick=()=>{};
 const service=new InputRequests({database:db,runtime,chatInputs:queue,publish(){}}),api=bindModelInputs(service,'r');
 await skills.update({id:skill.id,enabled:false});assert.equal((await skills.prepare()).explicit,'');
 const capabilities=await api.call('input_capabilities',{});assert.equal(capabilities.value.dynamicForms,1);
 const result=await api.call('input_request',request);assert.equal(result.ok,true);assert.equal(result.value.state,'pending');
 assert.equal((await api.call('input_request',request)).value.created,false);
 const saved=await service.action({action:'submit',runId:'r',requestId:result.value.requestId,expectedRevision:0,clientMutationId:'answer',values:{destination:'Shanghai'}});
 assert.equal((await api.call('input_read_answer',{requestId:saved.id})).value.answer.values.destination,'Shanghai');
 // The next focused request must not require the earlier answer to be entered
 // again, and must not expose defaults as a confirmed answer while pending.
 const followup=JSON.parse((await skills.readFile({id:skill.id,file:'examples/travel-preferences.json'})).text);
 const next=await api.call('input_request',followup);assert.equal(next.ok,true);
 assert.equal((await api.call('input_read_answer',{requestId:next.value.requestId})).value.answer,null);
 const answered=await service.action({action:'submit',runId:'r',requestId:next.value.requestId,expectedRevision:0,clientMutationId:'preferences',values:{nature:true,other:'少走路'}});
 const preferences=(await api.call('input_read_answer',{requestId:answered.id})).value.answer.values;
 assert.equal(preferences.nature,true);assert.equal(preferences.other,'少走路');
 assert.equal((await api.call('input_read_answer',{requestId:saved.id})).value.answer.values.destination,'Shanghai');
});
test('missing guide degrades to ordinary catalog; modified owned bundle is repaired without enabling it',async t=>{
 const {skills,dir}=await fixture(t);await skills.initializeBuiltins();let [skill]=await skills.list();await skills.update({id:skill.id,enabled:false});
 await fs.writeFile(skill.path,'tampered');await skills.initializeBuiltins();const repaired=(await skills.list())[0];assert.notEqual(repaired.revision,skill.revision);assert.equal(repaired.enabled,false);
 assert.match(await fs.readFile(repaired.path,'utf8'),/^---/);
 await skills.update({id:skill.id,enabled:true});await assert.rejects(skills.initializeBuiltins({root:path.join(dir,'missing')}));
 assert.doesNotMatch((await skills.prepare()).instructions,/supplemental-input/);
});
test('builtin bundle is included in both desktop resource configurations and its references are readable',async t=>{
 const {skills}=await fixture(t);await skills.initializeBuiltins();const [skill]=await skills.list();
 for(const file of ['references/lifecycle.md','references/interaction-design.md','examples/travel.json','examples/travel-preferences.json','skill.nls.json','skill.nls.zh-CN.json'])assert.ok((await skills.readFile({id:skill.id,file})).text.length);
 for(const config of ['electron-builder.cjs','electron-builder.win.cjs'])assert.ok(require('../build/'+config).extraResources.some(r=>r.from==='resources/skills'&&r.to==='skills'));
});
