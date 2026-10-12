const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {collectArtifacts,accessArtifact}=require('../electron/artifacts.cjs');
test('delivery cards require real workspace files and refuse deleted or escaped files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-artifacts-'));const cwd=path.join(root,'work');await fs.mkdir(cwd);
 try{
 await fs.writeFile(path.join(cwd,'report.md'),'# Verified');await fs.writeFile(path.join(root,'outside.md'),'private');await fs.symlink(path.join(root,'outside.md'),path.join(cwd,'escape.md'));
 const run={cwd,tools:[],fileChanges:[{turnKey:'u',files:['report.md','missing.md','escape.md','../outside.md'].map(path=>({path,status:'added'}))}],messages:[{turnKey:'u',role:'assistant',phase:'final_answer',text:'[Report](report.md) [Missing](missing.md) [Escape](escape.md) [Outside](../outside.md)'}]};
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


test('review references do not become artifacts; snapshot changes include shell reports only in their own turn',async()=>{
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
  assert.deepEqual((await collectArtifacts(run,'review')).map(f=>f.name),['report.json']);
  assert.deepEqual(await collectArtifacts(run,'next'),[]);
  assert.deepEqual(await collectArtifacts({...run,fileChanges:[{turnKey:'review',files:[],notice:'baseline unavailable'}]},'review'),[]);
  const before=await snapshot(root);await fs.writeFile(path.join(root,'index.html'),'actually changed');
  run.fileChanges=[await compare(root,before,'edit')];
  assert.deepEqual((await collectArtifacts(run,'edit')).map(f=>f.name),['index.html']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('completed file writes remain evidence when no baseline is available, never reads or failed writes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-artifact-tools-'));
 try{
  await fs.writeFile(path.join(root,'output.txt'),'result');
  const tool={turnKey:'t',type:'fileChange',status:'completed',detail:JSON.stringify([{path:'output.txt',kind:{type:'add'}}])};
  const run={cwd:root,messages:[],tools:[tool]};
  assert.equal((await collectArtifacts(run,'t')).length,1);
  for(const override of [{status:'failed'},{type:'commandExecution'},{turnKey:'old'},{detail:JSON.stringify([{path:'output.txt',kind:{type:'delete'}}])}])assert.deepEqual(await collectArtifacts({...run,tools:[{...tool,...override}]},'t'),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
