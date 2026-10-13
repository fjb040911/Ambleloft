const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const L=require('../core/localization/index.cjs');
const dictionaries={default:{title:'申请',status:'状态',open:'待处理',notice:'{name} 已准备'},en:{title:'Request',status:'Status',open:'Pending',notice:'{name} is ready'},'zh-Hans':{title:'申请'},'zh-Hant':{title:'申請'}};
test('locale lookup preserves scripts, falls back per key and formats only typed arguments',()=>{
 assert.equal(L.text(dictionaries,'%title%','zh-TW'),'申請');assert.equal(L.text(dictionaries,'%title%','en_US'),'Request');assert.equal(L.text(dictionaries,'%status%','fr'),'状态');assert.equal(L.format(dictionaries,'notice',{name:'<script>business</script>'},'en'),'<script>business</script> is ready');assert.throws(()=>L.format(dictionaries,'notice',{},'en'));assert.throws(()=>L.validate({default:{x:'{one}'},en:{x:'{two}'}}));assert.throws(()=>L.strictJSON('{"x":"a","x":"b"}'));assert.throws(()=>L.strictJSON('{"__proto__":"bad"}'));assert.equal(L.text({'zh-Hans':{x:'简'},default:{x:'Fallback'}},'%x%','zh-Hant'),'Fallback');
});
test('display projection leaves identities, prompts, business values and bindings untouched',()=>{
 const template={title:'%title%',rows:{key:'id',fields:[{name:'status',label:'%status%',type:'text'}],valueLabels:{status:{open:'%open%'}},card:{titleField:'status'}},actions:[{id:'go',label:'%title%',prompt:'%title%',input:{value:'%title%'}}],data:{title:'%title%'}};
 const snapshot=L.prepare(template,dictionaries,v=>v),view=L.project(template,snapshot,'en');assert.equal(view.title,'Request');assert.equal(view.rows.valueLabels.status.open,'Pending');assert.equal(view.actions[0].prompt,'%title%');assert.equal(view.data.title,'%title%');assert.equal(view.rows.card.titleField,'status');assert.equal(template.title,'%title%');assert.throws(()=>L.prepare({title:'%absent%'},dictionaries,v=>v));assert.throws(()=>L.prepare({title:'%notice%'},dictionaries,v=>v));
});
test('automatic dictionary discovery rejects aliases and symlinks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'l10n-load-'));try{await fs.writeFile(path.join(root,'skill.nls.json'),JSON.stringify(dictionaries.default));await fs.writeFile(path.join(root,'skill.nls.en-US.json'),'{}');assert.ok(L.load(root)['en-US']);await fs.writeFile(path.join(root,'skill.nls.en_us.json'),'{}');assert.throws(()=>L.load(root),/重复/);await fs.unlink(path.join(root,'skill.nls.en_us.json'));await fs.symlink(path.join(root,'skill.nls.json'),path.join(root,'skill.nls.fr.json'));assert.throws(()=>L.load(root),/符号链接/);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('template snapshots survive source changes, locale projection never mutates stored revisions',async()=>{
 const {Database}=require('../electron/database.cjs'),{FormService}=require('../core/forms/service.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'l10n-ui-')),db=new Database(root);try{
 const template={version:1,id:'test',type:'collection',title:'%title%',fields:[],rows:{key:'id',fields:[{name:'id',label:'%status%',type:'text'}]},actions:[{id:'go',scope:'row',kind:'chat',label:'%open%',prompt:'original',input:{row:{from:'row'}}}]};
 const f=new FormService({database:db,runtime:{runs:[{id:'r'}]},extensions:{options:{locale:'en'}},publish:()=>{}});f.ui.catalog=async()=>({entries:[{key:'s',template,localization:L.prepare(template,dictionaries,v=>v),digest:'t',revision:'v1'}]});
 const flow=await f.ui.present(f.runtime.runs[0],'t',{key:'s',data:{rows:[{id:'%title%'}]}});const first=await f.project(flow);assert.equal(first.displayTemplate.title,'Request');assert.equal(first.data.rows[0].id,'%title%');
 f.extensions.options.locale='zh-TW';f.ui.catalog=async()=>({entries:[]});const view=await f.project(flow);assert.equal(view.displayTemplate.title,'申請');assert.equal(view.revision,flow.revision);assert.equal((await f.rows('r'))[0].template.title,'%title%');
 const a=await db.call('localizationSnapshot',{action:'put',dictionaries:{default:{a:'A'}}});assert.equal(a,await db.call('localizationSnapshot',{action:'put',dictionaries:{default:{a:'A'}}}));
 }finally{await db.close();await fs.rm(root,{recursive:true,force:true});}
});
test('checked-in bilingual skill works with source and packaged validators',async()=>{
 const root=path.resolve('specs/extensions/examples/localized-skill');
 for(const validator of [require('../core/localization/skill.cjs'),require('../build/extension-manifest.cjs')]){
  const metadata=await validator.validateSkillLocalization(root);assert.equal(metadata.displayName,'%skill.name%');assert.equal(L.project(metadata,metadata.displayMessages,'en').displayName,'Bilingual request demo');
 }
});
test('legacy historical templates are never reinterpreted as translation references',async()=>{
 const {FormService}=require('../core/forms/service.cjs');const f=new FormService({extensions:{options:{locale:'en'}}});const template={title:'%original%'};assert.equal((await f.project({template,revision:2})).displayTemplate.title,'%original%');
});
