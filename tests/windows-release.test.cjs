const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),YAML=require('yaml');
const {validate}=require('../scripts/publish-windows-release.cjs');
test('publication requires matching installer, metadata and blockmap before any GitHub writes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amble-release-')),name='Ambleloft-1.2.3-windows-x64.exe',data=Buffer.from('test installer');
 const hash=crypto.createHash('sha512').update(data).digest('base64');
 const metadata={version:'1.2.3',files:[{url:name,size:data.length,sha512:hash}],path:name,sha512:hash};
 const write=()=>fs.writeFileSync(path.join(root,'latest.yml'),YAML.stringify(metadata));
 try{
  fs.writeFileSync(path.join(root,name),data);write();assert.throws(()=>validate(root),/ENOENT/);
  fs.writeFileSync(path.join(root,name+'.blockmap'),zlib.gzipSync(JSON.stringify({version:'2',files:[{name:'file',offset:0,sizes:[data.length],checksums:['test']}]})));
  assert.equal(validate(root).version,'1.2.3');assert.ok(validate(root).names.includes('latest.yml'));
  metadata.files[0].size++;write();assert.throws(()=>validate(root),/metadata mismatch/);metadata.files[0].size--;write();
  fs.appendFileSync(path.join(root,name),'corrupt');assert.throws(()=>validate(root),/metadata mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
