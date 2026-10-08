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
test('failed persistence does not expose uncommitted contributions',async()=>{
 const service=new ExtensionService({async call(){throw new Error('disk full');}});
 await assert.rejects(service.install(manifest),/disk full/);assert.equal(service.snapshot().installed.length,0);
});

test('extension snapshots resolve description localization with locale and default fallback',()=>{
 const service=new ExtensionService({}, {locale:'zh-CN'});
 service.items=[{id:'demo',kind:'package',manifest:{displayName:'Demo',description:'%description%',version:'1.0.0'},dictionaries:{default:{description:'Default description'},zh:{description:'本地化描述'}}}];
 assert.equal(service.snapshot().installed[0].manifest.description,'本地化描述');
 delete service.items[0].dictionaries.zh;
 assert.equal(service.snapshot().installed[0].manifest.description,'Default description');
 service.items[0].manifest.description='Plain description';
 assert.equal(service.snapshot().installed[0].manifest.description,'Plain description');
});
