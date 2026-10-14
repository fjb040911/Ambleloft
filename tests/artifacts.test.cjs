const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {collectArtifacts,accessArtifact}=require('../electron/artifacts.cjs');
test('delivery cards require real workspace files and refuse deleted or escaped files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-artifacts-'));const cwd=path.join(root,'work');await fs.mkdir(cwd);
 try{
 await fs.writeFile(path.join(cwd,'report.md'),'# Verified');await fs.writeFile(path.join(root,'outside.md'),'private');await fs.symlink(path.join(root,'outside.md'),path.join(cwd,'escape.md'));
 const run={cwd,tools:['report.md','missing.md','escape.md','../outside.md'].map(path=>({turnKey:'u',type:'deliverable',status:'completed',detail:JSON.stringify({path,title:path})})),fileChanges:[{turnKey:'u',files:['report.md','missing.md','escape.md','../outside.md'].map(path=>({path,status:'added'}))}],messages:[{turnKey:'u',role:'assistant',phase:'final_answer',text:'[Report](report.md) [Missing](missing.md) [Escape](escape.md) [Outside](../outside.md)'}]};
 run.artifacts=await collectArtifacts(run,'u');assert.equal(run.artifacts.length,1);assert.equal(run.artifacts[0].name,'report.md');assert.equal(run.artifacts[0].size,10);
 assert.equal((await accessArtifact(run,run.artifacts[0].id,true)).text,'# Verified');
 await assert.rejects(accessArtifact(run,'unknown',true));await fs.unlink(path.join(cwd,'report.md'));await assert.rejects(accessArtifact(run,run.artifacts[0].id,true));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('every advertised preview extension is readable and unsupported or oversized files are rejected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-preview-'));
 try{
  const policy=require('../electron/artifact-preview.json');
  for(const extension of policy.extensions){
   const name=`sample.${extension.toUpperCase()}`;const file=path.join(root,name);
   await fs.writeFile(file,'Preview 文本\n');
   const run={cwd:root,artifacts:[{id:'file',path:file}]};
   assert.equal((await accessArtifact(run,'file',true)).text,'Preview 文本\n',extension);
  }
  for(const name of ['report.pdf','report.docx','photo.png','archive.zip','large.txt']){
   const file=path.join(root,name);await fs.writeFile(file,name==='large.txt'?'a'.repeat(policy.maxBytes+1):'unsupported');
   await assert.rejects(accessArtifact({cwd:root,artifacts:[{id:'file',path:file}]},'file',true));
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('review references and directory snapshots never become deliverables',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-artifact-evidence-'));
 try{
  const {snapshot,compare}=require('../electron/file-changes.cjs');
  await fs.writeFile(path.join(root,'index.html'),'existing site');
  await fs.writeFile(path.join(root,'style.css'),'existing styles');
  const baseline=await snapshot(root);
  const messages=[{turnKey:'review',role:'assistant',phase:'final_answer',text:'已检查 `index.html`；排除 [样式](style.css)。[报告](report.json)'}];
  const run={cwd:root,tools:[],messages};
  assert.deepEqual(await collectArtifacts(run,'review'),[]);
  await fs.writeFile(path.join(root,'report.json'),'{}');
  run.fileChanges=[await compare(root,baseline,'review')];
  assert.deepEqual((await collectArtifacts(run,'review')).map(f=>f.name),[]);
  assert.deepEqual(await collectArtifacts(run,'next'),[]);
  assert.deepEqual(await collectArtifacts({...run,fileChanges:[{turnKey:'review',files:[],notice:'baseline unavailable'}]},'review'),[]);
  const before=await snapshot(root);await fs.writeFile(path.join(root,'index.html'),'actually changed');
  run.fileChanges=[await compare(root,before,'edit')];
  assert.deepEqual((await collectArtifacts(run,'edit')).map(f=>f.name),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('file writes alone are not explicit deliverable registrations',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-artifact-tools-'));
 try{
  await fs.writeFile(path.join(root,'output.txt'),'result');
  const tool={turnKey:'t',type:'fileChange',status:'completed',detail:JSON.stringify([{path:'output.txt',kind:{type:'add'}}])};
  const run={cwd:root,messages:[],tools:[tool]};
  assert.equal((await collectArtifacts(run,'t')).length,0);
  for(const override of [{status:'failed'},{type:'commandExecution'},{turnKey:'old'},{detail:JSON.stringify([{path:'output.txt',kind:{type:'delete'}}])}])assert.deepEqual(await collectArtifacts({...run,tools:[{...tool,...override}]},'t'),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('explicit deliveries are distinct from changes and cannot escape the workspace',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-delivery-'));
 try{
  await fs.writeFile(path.join(root,'report.md'),'report');await fs.writeFile(path.join(root,'source.js'),'code');
  const delivery=(path,title='Report')=>({turnKey:'t',type:'deliverable',status:'completed',detail:JSON.stringify({path,title})});
  const run={cwd:root,tools:[delivery('report.md'),delivery('report.md','Final report'),delivery('../outside.md'),delivery('missing.md')],fileChanges:[{turnKey:'t',files:[{path:'report.md',status:'added'},{path:'source.js',status:'modified'}]}]};
  const files=await collectArtifacts(run,'t');assert.equal(files.length,1);
  assert.equal(files.find(f=>f.name==='report.md').kind,'delivery');assert.equal(files.find(f=>f.name==='report.md').title,'Final report');
  assert.equal(files.find(f=>f.name==='source.js'),undefined);
  assert.deepEqual(await collectArtifacts(run,'other'),[]);
  assert.equal((await collectArtifacts({...run,fileChanges:[]},'t'))[0].kind,'delivery');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('delivery tool exposes structured intent and rejects invalid registrations',()=>{
 const {handle}=require('../electron/plan-server.cjs');
 assert.ok(handle({id:1,method:'tools/list'}).result.tools.some(t=>t.name==='register_deliverable'));
 for(const args of [{path:'a'},{path:'../a',title:''},null])assert.equal(handle({id:2,method:'tools/call',params:{name:'register_deliverable',arguments:args}}).result.isError,true);
 assert.equal(handle({id:3,method:'tools/call',params:{name:'register_deliverable',arguments:{path:'report.md',title:'Report'}}}).result.isError,undefined);
});
