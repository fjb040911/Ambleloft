const {test}=require('node:test');const assert=require('node:assert/strict');
const {ExtensionRegistry,validate}=require('../core/extensions/registry.cjs');
const {ExtensionService}=require('../core/extensions/service.cjs');
const manifest=require('../examples/extensions/workspace-guide.json');
test('declarative contributions validate ownership, version, code and command targets',()=>{
 const registry=new ExtensionRegistry();const copy=structuredClone(manifest);
 const dispose=registry.register(copy);copy.name='changed';assert.equal(registry.list()[0].name,manifest.name);
 assert.throws(()=>registry.register(manifest),/already/);dispose();registry.register(manifest);dispose();assert.equal(registry.list().length,1);
 for(const invalid of [{...manifest,entry:'index.js'},{...manifest,apiVersion:'2'},{...manifest,requiredCapabilities:['tasks.read']},{...manifest,contributes:{views:[{id:'core.home',title:'Bad',body:'Text'}]}},{...manifest,contributes:{commands:[{id:manifest.id+'.bad',title:'Bad',viewId:'other.view'}]}}])assert.throws(()=>validate(invalid));
});
test('extension lifecycle persists, rejects disabled commands and serializes mutations',async()=>{
 let saved=null;const database={async call(method,{value}){if(method==='readSetting')return structuredClone(saved);saved=structuredClone(value);}};
 const service=new ExtensionService(database);await service.initialize();await service.install(manifest);
 assert.equal(service.execute(manifest.id+'.open').viewId,manifest.id+'.home');
 await assert.rejects(service.install(manifest),/已安装/);
 await service.setEnabled(manifest.id,false);assert.throws(()=>service.execute(manifest.id+'.open'),/停用/);
 const restarted=new ExtensionService(database);await restarted.initialize();assert.equal(restarted.snapshot().installed[0].enabled,false);
 await Promise.all([restarted.setEnabled(manifest.id,true),restarted.remove(manifest.id)]);
 assert.equal(restarted.snapshot().installed.length,0);assert.equal(saved.length,0);
});
test('failed persistence does not expose uncommitted contributions',async()=>{
 const service=new ExtensionService({async call(method){if(method==='readSetting')return null;throw new Error('disk full');}});
 await service.initialize();await assert.rejects(service.install(manifest),/disk full/);assert.equal(service.snapshot().installed.length,0);
});
