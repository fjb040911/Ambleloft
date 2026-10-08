const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {zipSync,strToU8}=require('fflate');
const {Database}=require('../electron/database.cjs');const {ExtensionService}=require('../core/extensions/service.cjs');const {PackageStore}=require('../core/extensions/packages.cjs');
const legacy=require('../examples/extensions/workspace-guide.json');
const manifest=(version='1.0.0')=>({specVersion:'1.0-draft',publisher:'fixture',name:'package',version,displayName:'Fixture',engines:{api:'1'},main:'main.cjs',permissions:[{capability:'projects.read',scope:'project'},{capability:'storage',scope:'self'},{capability:'secrets',scope:'self'}]});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-a3-'));const db=new Database(root);await db.call('ready');t.after(async()=>{await db.close();await fs.rm(root,{recursive:true,force:true});});const service=new ExtensionService(db,{directory:root});await service.initialize();return {root,db,service};}
async function archive(root,m=manifest(),extra={}){const file=path.join(root,'test.amble-extension');await fs.writeFile(file,zipSync({'extension.json':strToU8(JSON.stringify(m)),'main.cjs':strToU8('throw new Error("Package code must not run during install")'),...extra}));return file;}
test('archive install, cancellation, update, restore and restart require explicit trust without executing code',async t=>{
 const {root,db,service}=await fixture(t);let file=await archive(root);
 await service.installPackage(file,'archive',async()=>false);assert.equal(service.items.length,0);
 await service.installPackage(file,'archive',async r=>{assert.match(r.digest,/^[a-f0-9]{64}$/);return true;});const first=service.items[0].active;
 file=await archive(root,manifest('2.0.0'));await service.installPackage(file,'archive',async()=>true);assert.notEqual(service.items[0].active,first);assert.equal(service.items[0].revisions.length,2);
 await service.rollback('fixture.package',first,async()=>true);assert.equal(service.items[0].manifest.version,'1.0.0');
 const restarted=new ExtensionService(db,{directory:root});await restarted.initialize();assert.equal(restarted.items[0].active,first);
 await restarted.setEnabled('fixture.package',false);assert.equal(restarted.items[0].enabled,false);
});
test('unsafe archive paths, collisions, links, corruption and development symlinks are rejected',async t=>{
 const {root}=await fixture(t),store=new PackageStore(root);
 for(const extra of [{'../escape':strToU8('bad')},{'A/x':strToU8('x'),'a/y':strToU8('y')},{'main.cjs/child':strToU8('x')},{'CON.txt':strToU8('x')}])await assert.rejects(store.prepare(await archive(root,manifest(),extra)));
 const file=await archive(root);let bytes=await fs.readFile(file);const central=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bytes.writeUInt32LE((0xa1ff*65536)>>>0,central+38);await fs.writeFile(file,bytes);await assert.rejects(store.prepare(file),/links/);
 await archive(root);bytes=await fs.readFile(file);bytes[bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]))+16]^=1;await fs.writeFile(file,bytes);await assert.rejects(store.prepare(file),/integrity/);
 const dir=path.join(root,'dev');await fs.mkdir(dir);await fs.symlink(file,path.join(dir,'link'));await assert.rejects(store.prepare(dir,'directory'),/links/);
 assert.deepEqual(await fs.readdir(path.join(store.root,'staging')),[]);
});
test('project grants deny other projects, stale generations and undeclared capabilities; storage survives optional uninstall',async t=>{
 const {root,db,service}=await fixture(t);await service.installPackage(await archive(root),'archive',async()=>true);
 await db.call('patchWorkspace',{changes:['p','q'].map(id=>({kind:'project',action:'put',id,expectedRevision:null,value:{id,name:id,path:root,createdAt:'now'}}))});
 const id='fixture.package';await assert.rejects(service.check({id,generation:service.items[0].generation},'projects.read','p'),/FORBIDDEN/);
 await service.setGrants(id,[{capability:'projects.read',resource:'project:p'},{capability:'storage',resource:'self'}]);const context={id,generation:service.items[0].generation};
 await service.check(context,'projects.read','p');await assert.rejects(service.check(context,'projects.read','q'),/FORBIDDEN/);
 await assert.rejects(service.check({...context,projectId:'p'},'projects.read','q'),/mismatch/);
 await assert.rejects(service.setGrants(id,[{capability:'projects.path.read',resource:'project:p'}]),/Undeclared/);
 await service.storage(context,'k',{write:true,value:{hello:1},expectedRevision:0});assert.deepEqual((await service.storage(context,'k')).value,{hello:1});
 await assert.rejects(service.storage(context,'k',{write:true,value:2,expectedRevision:0}),/CONFLICT/);
 await assert.rejects(service.storage(context,'secret',{kind:'secret',write:true,value:'sensitive',expectedRevision:0}),/Secure storage/);
 await service.setGrants(id,[]);await assert.rejects(service.storage(context,'k'),/FORBIDDEN/);
 await service.remove(id,false);await service.installPackage(await archive(root),'archive',async()=>true);assert.equal(service.items[0].grants.length,0);await service.setGrants(id,[{capability:'storage',resource:'self'}]);assert.deepEqual((await service.storage({id,generation:service.items[0].generation},'k')).value,{hello:1});
 await service.remove(id,true);await service.installPackage(await archive(root),'archive',async()=>true);await service.setGrants(id,[{capability:'storage',resource:'self'}]);assert.equal((await service.storage({id,generation:service.items[0].generation},'k')).value,null);
});
test('legacy migration isolates bad entries, preserves text commands and never carries code trust into replacement',async t=>{
 const {root,db}=await fixture(t);await db.call('writeSetting',{key:'platform.extensions.v1',value:[{manifest:legacy,enabled:true},{manifest:{},enabled:true}]});
 // Use a fresh profile DB because migration is deliberately one-shot.
 const dir=path.join(root,'legacy');await fs.mkdir(dir);const old=new Database(dir);t.after(()=>old.close());await old.call('writeSetting',{key:'platform.extensions.v1',value:[{manifest:legacy,enabled:true},{manifest:{},enabled:true}]});
 const service=new ExtensionService(old,{directory:dir});await service.initialize();assert.equal(service.items[0].trusted,false);assert.equal(service.snapshot().diagnostics.length,1);assert.ok(service.execute(legacy.id+'.open'));
 const [publisher,name]=legacy.id.split('.');await service.installPackage(await archive(root,{...manifest(),publisher,name}),'archive',async()=>false);assert.equal(service.items[0].kind,'legacy');
 await service.installPackage(await archive(root,{...manifest(),publisher,name}),'archive',async()=>true);assert.equal(service.items.length,1);assert.equal(service.items[0].kind,'package');assert.equal(service.items[0].grants.length,0);assert.throws(()=>service.execute(legacy.id+'.open'));
});
test('pending switch recovery disables the extension and preserves old active revision',async t=>{
 const {root,db,service}=await fixture(t);await service.installPackage(await archive(root),'archive',async()=>true);const first=service.items[0].active;
 const revision=await service.packages.prepare(await archive(root,manifest('2.0.0')));await db.call('extensionMutation',{action:'stage',id:revision.id,revision});
 const recovered=new ExtensionService(db,{directory:root});await recovered.initialize();assert.equal(recovered.items[0].active,first);assert.equal(recovered.items[0].enabled,false);assert.equal(recovered.items[0].pending,null);assert.ok(recovered.items[0].diagnostic);
});
test('stored package tampering blocks enabling and reinstall; failed validation keeps current version intact',async t=>{
 const {root,service}=await fixture(t);const file=await archive(root);await service.installPackage(file,'archive',async()=>true);const item=service.items[0],target=path.join(service.packages.root,item.revisions[0].relativePath,'main.cjs');
 await service.setEnabled(item.id,false);await fs.writeFile(target,'changed');await assert.rejects(service.setEnabled(item.id,true),/integrity/);assert.equal(service.items[0].enabled,false);
 await assert.rejects(service.installPackage(file,'archive',async()=>true),/integrity/);assert.equal(service.items[0].active,item.active);
 await fs.writeFile(file,'invalid');await assert.rejects(service.installPackage(file,'archive',async()=>true));assert.equal(service.items[0].active,item.active);
});
test('encrypted secrets, quota, tombstones and reinstallation invalidate old callers',async t=>{
 const {root,db,service}=await fixture(t);service.options.encryption={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from('cipher:'+v.split('').reverse().join('')),decryptString:b=>b.toString().slice(7).split('').reverse().join('')};
 const file=await archive(root);await service.installPackage(file,'archive',async()=>true);const id='fixture.package',grants=[{capability:'storage',resource:'self'},{capability:'secrets',resource:'self'}];await service.setGrants(id,grants);const old={id,generation:service.items[0].generation};
 await service.storage(old,'token',{kind:'secret',write:true,value:'sensitive',expectedRevision:0});assert.equal((await service.storage(old,'token',{kind:'secret'})).value,'sensitive');
 const raw=await db.call('extensionData',{...old,capability:'secrets',kind:'secret',key:'token'});assert.ok(!raw.value.includes('sensitive'));
 await assert.rejects(service.storage(old,'huge',{write:true,value:'x'.repeat(256*1024),expectedRevision:0}),/too large/);
 await service.storage(old,'k',{write:true,value:1,expectedRevision:0});await service.storage(old,'k',{write:true,value:null,expectedRevision:1});await assert.rejects(service.storage(old,'k',{write:true,value:2,expectedRevision:0}),/CONFLICT/);
 await service.remove(id);await service.installPackage(file,'archive',async()=>true);await service.setGrants(id,grants);assert.notEqual(service.items[0].generation,old.generation);await assert.rejects(service.storage(old,'token',{kind:'secret'}),/FORBIDDEN/);
});
test('updating clears grants and stale consent cannot authorize the new revision',async t=>{
 const {root,service}=await fixture(t);await service.installPackage(await archive(root),'archive',async()=>true);const id='fixture.package';await service.setGrants(id,[{capability:'storage',resource:'self'}]);const generation=service.items[0].generation;
 await service.installPackage(await archive(root,manifest('2.0.0')),'archive',async()=>true);assert.equal(service.items[0].grants.length,0);
 await assert.rejects(service.setGrants(id,[{capability:'storage',resource:'self'}],generation),/CONFLICT/);
});
test('development snapshots include dependencies and bundled validator works; profiles remain isolated',async t=>{
 const {root,db,service}=await fixture(t);const dev=path.join(root,'dev');await fs.mkdir(path.join(dev,'node_modules','fixture'),{recursive:true});await fs.writeFile(path.join(dev,'extension.json'),JSON.stringify(manifest()));await fs.writeFile(path.join(dev,'main.cjs'),'module.exports={}');await fs.writeFile(path.join(dev,'node_modules','fixture','index.js'),'module.exports=42');
 await service.installPackage(dev,'directory',async()=>true);const revision=service.items[0].revisions[0];assert.equal(await fs.readFile(path.join(service.packages.root,revision.relativePath,'node_modules','fixture','index.js'),'utf8'),'module.exports=42');
 const validator=path.join(root,'validator.cjs');require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../core/extensions/manifest.cjs')],bundle:true,platform:'node',format:'cjs',outfile:validator});
 const otherRoot=path.join(root,'other-profile');const otherDb=new Database(otherRoot);t.after(()=>otherDb.close());const other=new ExtensionService(otherDb,{directory:otherRoot,validator});await other.initialize();assert.equal(other.items.length,0);await other.installPackage(dev,'directory',async()=>true);
 assert.notEqual(await db.call('readSetting',{key:'extensions.profile'}),await otherDb.call('readSetting',{key:'extensions.profile'}));assert.equal(other.items[0].grants.length,0);
 await fs.writeFile(path.join(dev,'main.cjs'),'module.exports={changed:true}');assert.equal(await fs.readFile(path.join(service.packages.root,revision.relativePath,'main.cjs'),'utf8'),'module.exports={}');
});
test('configuration schema and aggregate storage quota are enforced',async t=>{
 const {root,service}=await fixture(t);const m=manifest();m.permissions.push({capability:'configuration',scope:'self'});m.configuration={type:'object',properties:{server:{type:'string',maxLength:200}},required:['server'],additionalProperties:false};
 await service.installPackage(await archive(root,m),'archive',async()=>true);await service.setGrants('fixture.package',[{capability:'storage',resource:'self'},{capability:'configuration',resource:'self'}]);const context={id:'fixture.package',generation:service.items[0].generation,projectId:'bound-project'};
 await assert.rejects(service.storage(context,'settings',{kind:'configuration',write:true,value:{server:42},expectedRevision:0}),/Configuration/);
 await service.storage(context,'settings',{kind:'configuration',write:true,value:{server:'https://example.invalid'},expectedRevision:0});assert.deepEqual((await service.storage(context,'settings',{kind:'configuration'})).value,{server:'https://example.invalid'});
 for(let i=0;i<39;i++)await service.storage(context,'quota-'+i,{write:true,value:'x'.repeat(256*1024-2),expectedRevision:0});
 await assert.rejects(service.storage(context,'overflow',{write:true,value:'x'.repeat(256*1024-2),expectedRevision:0}),/QUOTA/);
});
