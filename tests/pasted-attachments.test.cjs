const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {importPastedAttachments,MAX_BYTES}=require('../electron/pasted-attachments.cjs');
test('clipboard blobs persist with safe unique paths and exact bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paste-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const bytes=new Uint8Array([137,80,78,71,0,255]);
 const files=await importPastedAttachments([{name:'../../image.png',bytes},{name:'image.png',bytes}],dir);
 assert.equal(files[0].name,'image.png');assert.notEqual(files[0].path,files[1].path);
 for(const file of files){assert.ok(file.path.startsWith(dir+path.sep));assert.deepEqual(await fs.readFile(file.path),Buffer.from(bytes));}
});
test('native files retain paths, deduplicate and do not copy file bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paste-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'报告.txt');await fs.writeFile(file,'original');
 assert.deepEqual(await importPastedAttachments([{path:file},{path:file}],path.join(dir,'cache')),[{name:'报告.txt',path:file}]);
 await assert.rejects(fs.stat(path.join(dir,'cache')));
});
test('reject oversized batches, missing files and malformed payloads before writing',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paste-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(const input of [[],Array(51).fill({}),[{path:path.join(dir,'missing')}],[{name:'x',bytes:'fake'}],[{name:'x',bytes:new Uint8Array(MAX_BYTES+1)}]])await assert.rejects(importPastedAttachments(input,dir));
 assert.deepEqual(await fs.readdir(dir),[]);
});
