const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {snapshot,compare}=require('../electron/file-changes.cjs');
test('turn snapshots record net text changes, command writes, binaries and deletion without git',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'changes-'));
 try{
  await fs.writeFile(path.join(root,'readme.md'),'old\nkeep\n');
  await fs.writeFile(path.join(root,'gone.json'),'{}\n');
  await fs.writeFile(path.join(root,'sheet.xlsx'),'binary-a');
  await fs.writeFile(path.join(root,'same.ts'),'original\n');
  await fs.symlink('/etc',path.join(root,'outside'));
  const before=await snapshot(root);
  await fs.writeFile(path.join(root,'readme.md'),'intermediate\n');
  await fs.writeFile(path.join(root,'readme.md'),'new\nkeep\n');
  await fs.writeFile(path.join(root,'same.ts'),'temporary');await fs.writeFile(path.join(root,'same.ts'),'original\n');
  await fs.unlink(path.join(root,'gone.json'));
  await fs.writeFile(path.join(root,'sheet.xlsx'),'binary-b');
  await fs.writeFile(path.join(root,'deck.pptx'),'binary');
  await fs.writeFile(path.join(root,'new.ts'),'const x = 1;\n');
  const result=await compare(root,before,'turn');
  assert.equal(result.files.length,5);
  const md=result.files.find(f=>f.path==='readme.md');assert.equal(md.additions,1);assert.equal(md.deletions,1);assert.ok(md.hunks[0].lines.includes('-old'));assert.ok(md.hunks[0].lines.includes('+new'));
  assert.equal(result.files.find(f=>f.path==='gone.json').status,'deleted');
  assert.equal(result.files.find(f=>f.path==='sheet.xlsx').hunks,undefined);
  assert.equal(result.files.find(f=>f.path==='deck.pptx').status,'added');
  assert.equal(result.files.find(f=>f.path==='new.ts').additions,1);
  await fs.writeFile(path.join(root,'readme.md'),'later');assert.ok(md.hunks[0].lines.includes('+new'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('partial baseline does not mislabel unknown files as newly created',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'changes-'));
 try{await fs.writeFile(path.join(root,'a'),'a');await fs.writeFile(path.join(root,'b'),'b');const before=await snapshot(root,{maxFiles:1});const result=await compare(root,before,'turn');assert.ok(result.notice);assert.equal(result.files.length,0);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('runtime finish stores changes on the correct turn only once',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'changes-'));
 try{
  const {AgentRuntime}=require('../electron/agent-runtime.cjs');
  const runtime=new AgentRuntime({directory:root,publish(){}});runtime.changed=()=>{};runtime.persist=async()=>{};
  const run={cwd:root,messages:[],tools:[]};const context={run,turnKey:'one',fileBaseline:await snapshot(root)};
  await fs.writeFile(path.join(root,'report.json'),'{}\n');await runtime.finish(context,'completed');await runtime.finish(context,'completed');
  assert.equal(run.fileChanges.length,1);assert.equal(run.fileChanges[0].turnKey,'one');assert.equal(run.fileChanges[0].files[0].status,'added');assert.equal(context.fileBaseline,null);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
