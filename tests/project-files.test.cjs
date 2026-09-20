const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createProjectFiles,TEXT_LIMIT}=require('../electron/project-files.cjs');
async function fixture(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-files-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'project');await fs.mkdir(root);await fs.mkdir(path.join(root,'docs'));await fs.writeFile(path.join(root,'docs','readme.md'),'# Hello');await fs.writeFile(path.join(temp,'secret.txt'),'outside');
 const state={projects:[{id:'p',path:root}]},runs=[{id:'r',projectId:'p',cwd:root}];
 return {root,temp,state,runs,api:createProjectFiles({getWorkspace:async()=>state,getRuns:()=>runs}),input:{projectId:'p',runId:'r'}};
}
test('file access is scoped to project and session; traversal and escaping symlinks are rejected',async t=>{
 const {api,input,root}=await fixture(t);
 assert.equal((await api.read({...input,path:'docs/readme.md'})).text,'# Hello');
 for(const file of ['../secret.txt','docs/../../secret.txt','/etc/passwd'])await assert.rejects(api.read({...input,path:file}));
 await fs.symlink('../secret.txt',path.join(root,'outside.txt'));
 await assert.rejects(api.read({...input,path:'outside.txt'}));
 await assert.rejects(api.read({...input,runId:'wrong',path:'docs/readme.md'}));
 await assert.rejects(api.read({...input,projectId:'wrong',path:'docs/readme.md'}));
 await assert.rejects(api.read({...input,path:'docs'}));
});
test('reads are bounded, change-aware, and handle binary/non-UTF-8 files',async t=>{
 const {api,input,root}=await fixture(t);
 const first=await api.read({...input,path:'docs/readme.md'});
 assert.equal((await api.read({...input,path:'docs/readme.md',version:first.version})).unchanged,true);
 await fs.writeFile(path.join(root,'docs/readme.md'),'# Updated');
 assert.equal((await api.read({...input,path:'docs/readme.md',version:first.version})).text,'# Updated');
 await fs.writeFile(path.join(root,'large.txt'),'a'.repeat(TEXT_LIMIT+10));
 const large=await api.read({...input,path:'large.txt'});assert.equal(large.text.length,TEXT_LIMIT);assert.equal(large.truncated,true);
 await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([0,1,2]));assert.equal((await api.read({...input,path:'binary.bin'})).kind,'unsupported');
 await fs.writeFile(path.join(root,'legacy.txt'),Buffer.from([255,254,123]));assert.equal((await api.read({...input,path:'legacy.txt'})).kind,'unsupported');
});
test('directory search filters generated files and resource URLs keep the same boundary',async t=>{
 const {api,input,root,state}=await fixture(t);
 await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','hidden.md'),'hidden');
 assert.equal((await api.search({...input,query:'.md'})).entries.length,1);
 assert.equal((await api.search({...input,query:'.md',hidden:true})).entries.length,2);
 const context=await api.context(input);
 await fs.writeFile(path.join(root,'index.html'),'<h1>Preview</h1>');
 const resource=await api.resource({url:context.baseUrl+'index.html'});
 assert.equal(resource.status,200);assert.match(resource.headers.get('Content-Security-Policy'),/connect-src 'none'/);
 assert.match(await resource.text(),/^<h1>Preview<\/h1>/);
 await fs.symlink('../secret.txt',path.join(root,'outside.html'));
 assert.equal((await api.resource({url:context.baseUrl+'outside.html'})).status,404);
 assert.equal((await api.resource({url:context.baseUrl+'..%2Fsecret.txt'})).status,404);
 state.projects=[];assert.equal((await api.resource({url:context.baseUrl+'index.html'})).status,404);
});
test('default open and reveal use resolved files; arbitrary application requests are rejected',async t=>{
 const {api,input,root}=await fixture(t);const calls=[];
 const shell={openPath:async file=>{calls.push(['open',file]);return '';},showItemInFolder:file=>calls.push(['reveal',file])};
 await api.open({...input,path:'docs/readme.md'},{shell});await api.open({...input,path:'docs/readme.md',action:'reveal'},{shell});
 assert.deepEqual(calls,[['open',await fs.realpath(path.join(root,'docs/readme.md'))],['reveal',await fs.realpath(path.join(root,'docs/readme.md'))]]);
 await assert.rejects(api.open({...input,path:'docs/readme.md',application:'/tmp/arbitrary.app'},{shell}));
});

test('file browser requires a project even for a valid standalone conversation',async t=>{
 const f=await fixture(t);
 try {
  f.runs.push({id:'standalone',projectId:null,cwd:f.root});
  const input={runId:'standalone'};
  await assert.rejects(f.api.context(input),/请选择项目/);
  await assert.rejects(f.api.read({...input,path:'../outside.txt'}));
  await assert.rejects(f.api.context({runId:'missing'}));
  await assert.rejects(f.api.context({runId:'r'}));
  await assert.rejects(f.api.context({...input,projectId:'p'}));
 } finally {await fs.rm(f.temp,{recursive:true,force:true});}
});
