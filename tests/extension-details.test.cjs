const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {extensionDetails}=require('../core/extensions/details.cjs');
test('details read case-insensitive README from active installed revision only',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'extension-details-')));
 try{await fs.mkdir(path.join(root,'revision'));await fs.writeFile(path.join(root,'revision','Readme.md'),'# Hello');const service={packages:{root},items:[{id:'demo',kind:'package',active:'one',manifest:{publisher:'author'},revisions:[{digest:'one',relativePath:'revision'}]}]};
 assert.deepEqual(await extensionDetails(service,'demo'),{readme:'# Hello',publisher:'author',size:7});
 await fs.rm(path.join(root,'revision','Readme.md'));await fs.symlink('/etc/passwd',path.join(root,'revision','README.md'));assert.equal((await extensionDetails(service,'demo')).readme,'');
 await assert.rejects(extensionDetails(service,'missing'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
