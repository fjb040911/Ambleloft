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
 const run={messages:[{role:'user',text:'Summarize this'}],cwd:'/tmp',permission:'default'};
 const rpc={send(){},async call(method,params){calls.push({method,params});return method==='turn/start'?{turn:{id:'turn'}}:{thread:{id:'thread'}};}};
 await runtime.execute({rpc,run,config:{model:'test'},skills:{instructions:'CATALOG ONLY',explicit:'WORKFLOW BODY'}});
 assert.match(calls.find(c=>c.method==='thread/start').params.developerInstructions,/CATALOG ONLY/);assert.match(calls.find(c=>c.method==='turn/start').params.input[0].text,/WORKFLOW BODY/);
 calls.length=0;run.messages.push({role:'user',text:'Shorten it'});
 await runtime.execute({rpc,run,config:{model:'test'},skills:{instructions:'CURRENT CATALOG',explicit:''}});
 assert.equal(calls.find(c=>c.method==='turn/start').params.input[0].text,'Shorten it');assert.match(calls.find(c=>c.method==='thread/resume').params.developerInstructions,/CURRENT CATALOG/);
});
