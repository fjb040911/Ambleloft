const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {collectArtifacts,accessArtifact}=require('../electron/artifacts.cjs');
test('delivery cards require real workspace files and refuse deleted or escaped files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-artifacts-'));const cwd=path.join(root,'work');await fs.mkdir(cwd);
 try{
 await fs.writeFile(path.join(cwd,'report.md'),'# Verified');await fs.writeFile(path.join(root,'outside.md'),'private');await fs.symlink(path.join(root,'outside.md'),path.join(cwd,'escape.md'));
 const run={cwd,tools:[],messages:[{turnKey:'u',role:'assistant',phase:'final_answer',text:'[Report](report.md) [Missing](missing.md) [Escape](escape.md) [Outside](../outside.md)'}]};
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
