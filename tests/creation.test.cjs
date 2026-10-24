const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {Database}=require('../electron/database.cjs');const {createSkills}=require('../electron/skills.cjs');const {ExtensionService}=require('../core/extensions/service.cjs');const {CreationService}=require('../core/creation/service.cjs');const {FormService}=require('../core/forms/service.cjs');
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'creation-')),project=path.join(dir,'project'),data=path.join(dir,'data');await fs.mkdir(project);const database=new Database(data);await database.call('ready');
 const runtime={runs:[{id:'r',projectId:'p',cwd:project,status:'completed',messages:[]}]};await database.call('saveRuns',runtime.runs);
 const skills=createSkills(data,database),extensions=new ExtensionService(database,{directory:data});await extensions.initialize();
 const options={database,directory:data,runtime,skills,extensions};const creation=new CreationService(options);t.after(async()=>{await extensions.shutdown();await database.close();await fs.rm(dir,{recursive:true,force:true});});return {...options,creation,project,dir};
}
const brief=(revision,kind='skill')=>({expectedRevision:revision,title:'差旅登记',kind,summary:'收集行程与预算，确认后返回聊天',nextStep:'生成表单',stage:'building',trialPrompt:'帮我登记差旅',limitations:'尚未连接企业系统'});
async function prepareSkill(f){await fs.cp(path.join(__dirname,'../resources/skills/skill-master/examples/travel-skill'),path.join(f.project,'travel'),{recursive:true});let state=await f.creation.ensure('r');state=await f.creation.update('r',brief(state.revision));return f.creation.prepare('r',{expectedRevision:state.revision,directory:'travel'});}
const approve={confirmSkill:async()=>({}),confirmPackage:async()=>true};
test('durable brief and checked snapshot install a real three-step skill and discover its form',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);assert.equal(state.stage,'ready');assert.equal((await f.skills.list()).length,0);
 await fs.writeFile(path.join(f.project,'travel/SKILL.md'),'changed after validation');
 const reopened=new CreationService(f);assert.equal((await reopened.read('r')).limitations,'尚未连接企业系统');
 state=await reopened.install('r',state.revision,approve);assert.equal(state.stage,'installed');assert.equal(state.trial,'pending');
 const forms=new FormService({database:f.database,skills:f.skills,extensions:f.extensions,runtime:f.runtime,publish(){},confirm:async()=>true});let delivered='';const {ChatInputs}=require('../core/forms/chat-inputs.cjs');forms.chatInputs=new ChatInputs({database:f.database,runtime:{deliverFormInput:async(item,{onDispatch})=>{await onDispatch({});delivered=item.text;}},validate:item=>forms.validateInput(item),publish(){}});t.after(()=>forms.chatInputs.shutdown());const catalog=await forms.catalog();assert.deepEqual(catalog.errors,[]);assert.equal(catalog.entries[0].template.steps.length,3);
 await forms.present(f.runtime.runs[0],'turn',catalog.entries[0].key);const [flow]=await forms.list('r');assert.equal(flow.step,0);
 let saved=await forms.action({runId:'r',id:flow.id,revision:flow.revision,action:'save',values:{destination:'上海',departure:'2026-11-01'}},{});saved=await forms.action({runId:'r',id:flow.id,revision:saved.revision,action:'next'},{});assert.equal(saved.step,1);
 saved=await forms.action({runId:'r',id:flow.id,revision:saved.revision,action:'save',values:{reason:'客户交流',budget:'1200'}},{});
 saved=await forms.action({runId:'r',id:flow.id,revision:saved.revision,action:'next'},{});assert.equal(saved.step,2);
 saved=await forms.action({runId:'r',id:flow.id,revision:saved.revision,action:'save',values:{confirmed:true}},{});
 await forms.action({runId:'r',id:flow.id,revision:saved.revision,action:'next'},{});await forms.chatInputs.poll;await Promise.all(forms.chatInputs.inflight.values());assert.match(delivered,/上海/);assert.match(delivered,/1200.00/);assert.equal((await forms.list('r'))[0].status,'completed');
 state=await reopened.confirmTrial('r',state.revision);assert.equal(state.trial,'confirmed');
 await f.skills.update({id:state.installed.id,enabled:false});await assert.rejects(reopened.confirmTrial('r',state.revision),/停用/);
});
test('rejects stale progress, fabricated completion, traversal, symlinks and invalid form files',async t=>{
 const f=await fixture(t);let state=await f.creation.ensure('r');await assert.rejects(f.creation.update('r',{...brief(state.revision),stage:'installed'}),/参数/);
 state=await f.creation.update('r',brief(state.revision));await assert.rejects(f.creation.update('r',brief(1)),/进度已变化/);
 for(const directory of ['../','/tmp','../../etc'])await assert.rejects(f.creation.prepare('r',{expectedRevision:state.revision,directory}),/相对目录/);
 await fs.symlink(f.dir,path.join(f.project,'escape'));await assert.rejects(f.creation.prepare('r',{expectedRevision:state.revision,directory:'escape'}),/符号链接/);
 await fs.mkdir(path.join(f.project,'bad'));await fs.writeFile(path.join(f.project,'bad/SKILL.md'),'---\nname: bad\ndescription: bad\n---\n```amble-form-ref\npath: absent.yaml\n```');await assert.rejects(f.creation.prepare('r',{expectedRevision:state.revision,directory:'bad'}));
 assert.equal((await f.creation.read('r')).stage,'building');assert.equal((await f.skills.list()).length,0);
});
test('cancel and active runs never install; duplicate replacement enables the selected skill',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);f.runtime.runs[0].status='running';await assert.rejects(f.creation.install('r',state.revision,approve),/本轮/);f.runtime.runs[0].status='completed';
 assert.equal((await f.creation.install('r',state.revision,{...approve,confirmSkill:async()=>null})).stage,'ready');assert.equal((await f.skills.list()).length,0);
 const old=(await f.skills.importFolder(state.prepared.path)).skill;await f.skills.update({id:old.id,enabled:false});
 state=await f.creation.install('r',state.revision,{...approve,confirmSkill:async(_,duplicate)=>{assert.equal(duplicate.id,old.id);return {replaceId:duplicate.id};}});assert.equal(state.installed.id,old.id);assert.equal((await f.skills.list())[0].enabled,true);
 await assert.rejects(f.creation.install('r',state.revision,approve),/文件检查/);
});
test('skill can become an extension without losing the brief; trust gates actual package installation',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);state=await f.creation.update('r',{...brief(state.revision,'extension'),nextStep:'接入设备工具',summary:'保留差旅表单；示范能力适配，不限定 HTTP'});
 await fs.cp(path.join(__dirname,'fixtures/extensions/valid'),path.join(f.project,'extension'),{recursive:true});
 state=await f.creation.prepare('r',{expectedRevision:state.revision,directory:'extension'});assert.equal(f.extensions.items.length,0);
 assert.equal((await f.creation.install('r',state.revision,{...approve,confirmPackage:async()=>false})).stage,'ready');assert.equal(f.extensions.items.length,0);
 state=await f.creation.install('r',state.revision,approve);assert.equal(state.installed.kind,'extension');assert.equal(f.extensions.items[0].trusted,true);assert.equal(state.trial,'pending');assert.match(state.summary,/不限定 HTTP/);
});
test('task context, cancellation and immutable snapshot integrity are enforced',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);await fs.appendFile(path.join(state.prepared.path,'SKILL.md'),'tampered');await assert.rejects(f.creation.install('r',state.revision,approve),/文件已变化/);
 await assert.rejects(f.creation.bind('r',()=>{throw Error('CANCELLED');}).call('creation_read',{}),/CANCELLED/);
 f.runtime.runs[0].projectId='another';await assert.rejects(f.creation.read('r'),/项目已变更/);f.runtime.runs[0].projectId='p';f.runtime.runs[0].archivedAt='now';await assert.rejects(f.creation.read('r'),/归档/);
});
test('bundled skill master is localizable, selects by capability and has a valid intake example',async t=>{
 const f=await fixture(t);await f.skills.initializeBuiltins();f.skills.locale='zh-CN';const master=(await f.skills.list()).find(s=>s.id==='builtin-skill-master');assert.equal(master.displayName,'技能大师');
 const detail=await f.skills.detail(master.id);assert.match(detail.body,/GDB/);assert.match(detail.body,/Fixed fields do NOT require an extension/);
 const example=JSON.parse((await f.skills.readFile({id:master.id,file:'examples/first-question.json'})).text);require('../core/inputs/definition.cjs').validateTool('input_request',example);
});
test('documented environment settings install empty and remain editable through host configuration',async t=>{
 const f=await fixture(t),source=path.join(f.project,'debugger');await fs.cp(path.join(__dirname,'fixtures/extensions/valid'),source,{recursive:true});
 const reference=await fs.readFile(path.join(__dirname,'../resources/skills/skill-master/references/configuration.md'),'utf8');
 const fragment=JSON.parse(reference.match(/```json\r?\n([\s\S]*?)\r?\n```/)[1]);
 const file=path.join(source,'extension.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));
 Object.assign(manifest,fragment);await fs.writeFile(file,JSON.stringify(manifest));
 const snapshot=await f.extensions.installPackage(source,'directory',async()=>true),id=snapshot.installed[0].id;
 await f.extensions.setGrants(id,[{capability:'configuration',resource:'self'}]);
 let config=await f.extensions.configuration({id});assert.deepEqual(config.value,{});
 config=await f.extensions.configuration({id,action:'save',value:{debugServer:'localhost:3333'},generation:config.generation,expectedRevision:config.revision});
 assert.equal(config.value.debugServer,'localhost:3333');assert.equal(config.value.gdbPath,undefined);
 await f.extensions.configuration({id,action:'save',value:{debugServer:'localhost:4444',gdbPath:'/opt/toolchain/bin/gdb'},generation:config.generation,expectedRevision:config.revision});
 assert.equal((await f.extensions.configuration({id})).value.gdbPath,'/opt/toolchain/bin/gdb');
 assert.match(await fs.readFile(path.join(__dirname,'../resources/skills/skill-master/references/contracts.d.ts'),'utf8'),/onDidChange/);
});
test('rechecks snapshot and active state after a slow user confirmation',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);
 await assert.rejects(f.creation.install('r',state.revision,{...approve,confirmSkill:async()=>{await fs.appendFile(path.join(state.prepared.path,'SKILL.md'),'changed during confirmation');return {};}}),/文件已变化/);assert.equal((await f.skills.list()).length,0);
});
test('model channel persists progress but never exposes installation or trial approval',async t=>{
 const f=await fixture(t);const {createAgentChannel}=require('../core/extensions/agent-channel.cjs');const channel=await createAgentChannel({creation:f.creation.bind('r',()=>{})});t.after(()=>channel.close());
 const rpc=async(method,params)=>(await (await fetch(channel.config.url,{method:'POST',headers:{...channel.config.http_headers,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;
 const list=await rpc('tools/list');assert.deepEqual(list.tools.map(t=>t.name),['creation_read','creation_update','creation_prepare']);
 const read=await rpc('tools/call',{name:'creation_read',arguments:{}});const state=JSON.parse(read.content[0].text);assert.equal(state.revision,1);
 const updated=await rpc('tools/call',{name:'creation_update',arguments:brief(state.revision)});assert.equal(updated.isError,false);assert.equal((await f.creation.read('r')).stage,'building');
 assert.equal((await rpc('tools/call',{name:'creation_install',arguments:{}})).isError,true);
});
test('verification is host-owned, bound to the artifact and remains historical after a rebuild',async t=>{
 const f=await fixture(t);let state=await prepareSkill(f);
 assert.equal(state.evidence.length,1);assert.equal(state.evidence[0].method,'package-validation');assert.equal(state.evidence[0].artifactDigest,state.prepared.digest);assert.equal(state.evidence[0].current,true);
 await assert.rejects(f.creation.update('r',{...brief(state.revision),evidence:[{result:'passed'}]}),/参数/);
 state=await f.creation.install('r',state.revision,approve);assert.equal(state.trial,'pending');assert.equal(state.readiness.connection,'unverified');assert.equal(state.readiness.configuration,'not-needed');
 state=await f.creation.confirmTrial('r',state.revision);assert.equal(state.evidence.at(-1).method,'user-trial');assert.equal(state.trial,'confirmed');
 const installed=(await f.skills.list()).find(s=>s.id===state.installed.id);await fs.appendFile(installed.path,'\nChanged outside the host');
 const stale=await f.creation.read('r');assert.equal(stale.trial,'pending');assert.equal(stale.trialStale,true);assert.equal(stale.evidence.at(-1).current,false);
 await fs.rm(path.dirname(installed.path),{recursive:true,force:true});assert.equal((await f.creation.read('r')).trialStale,true);
 state=await f.creation.update('r',{...brief(state.revision),delivery:{environment:['本机'],settings:[],unverified:['外部业务服务']}});assert.equal(state.evidence.every(e=>!e.current),true);assert.deepEqual(state.delivery.unverified,['外部业务服务']);
 state=await f.creation.prepare('r',{expectedRevision:state.revision,directory:'travel'});assert.equal(state.installed,undefined);assert.equal(state.evidence.at(-1).source,'host');assert.equal(state.trial,'pending');
});
test('configuration and credential changes invalidate a confirmed extension trial without exposing values',async t=>{
 const f=await fixture(t),source=path.join(f.project,'extension');await fs.cp(path.join(__dirname,'fixtures/extensions/valid'),source,{recursive:true});
 const file=path.join(source,'extension.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));
 manifest.configuration={type:'object',properties:{endpoint:{type:'string'}},additionalProperties:false};
 manifest.permissions=[...(manifest.permissions||[]).filter(p=>!['configuration','secrets'].includes(p.capability)),{capability:'configuration',scope:'self'},{capability:'secrets',scope:'self'}];await fs.writeFile(file,JSON.stringify(manifest));
 let state=await f.creation.ensure('r');state=await f.creation.update('r',brief(state.revision,'extension'));state=await f.creation.prepare('r',{expectedRevision:state.revision,directory:'extension'});state=await f.creation.install('r',state.revision,approve);
 const id=state.installed.id;await f.extensions.setGrants(id,[{capability:'configuration',resource:'self'},{capability:'secrets',resource:'self'}]);
 state=await f.creation.confirmTrial('r',state.revision);assert.equal(state.trial,'confirmed');
 let config=await f.extensions.configuration({id});await f.extensions.configuration({id,action:'save',value:{endpoint:'private-setting-value'},generation:config.generation,expectedRevision:config.revision});
 state=await f.creation.read('r');assert.equal(state.trial,'pending');assert.equal(state.trialStale,true);assert.equal(state.readiness.configuration,'saved');assert.equal(state.readiness.connection,'unverified');assert.ok(!JSON.stringify(state).includes('private-setting-value'));
 state=await f.creation.confirmTrial('r',state.revision);const item=f.extensions.items.find(i=>i.id===id);
 await f.database.call('extensionData',{id,generation:item.generation,capability:'secrets',kind:'secret',key:'private-key-name',write:true,value:'encrypted-test-only',expectedRevision:0});
 const reopened=new CreationService(f);state=await reopened.read('r');assert.equal(state.trialStale,true);assert.equal(state.trial,'pending');assert.ok(!JSON.stringify(state).includes('private-key-name'));assert.ok(!JSON.stringify(state).includes('encrypted-test-only'));
 state=await f.creation.confirmTrial('r',state.revision);const installedRevision=item.revisions.find(r=>r.digest===item.active);await fs.appendFile(path.join(f.extensions.packages.root,installedRevision.relativePath,'extension.json'),' ');
 state=await reopened.read('r');assert.equal(state.trialStale,true);assert.equal(state.readiness.versionCurrent,false);await assert.rejects(reopened.confirmTrial('r',state.revision),/版本已变化/);
});
