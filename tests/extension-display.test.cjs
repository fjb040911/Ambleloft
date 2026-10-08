const {test}=require('node:test');const assert=require('node:assert/strict');const {ExtensionService}=require('../core/extensions/service.cjs');
test('snapshot localizes all display labels and evaluates command visibility without removing conditions',()=>{
 const s=new ExtensionService({});s.options.locale='en-US';s.items=[{id:'test',kind:'package',manifest:{displayName:'%name%',description:'%description%',contextKeys:[{key:'test.ready',type:'boolean',default:false}],contributes:{commands:[{id:'open',title:'%name%',when:'test.ready'}]}},dictionaries:{default:{name:'默认',description:'说明'},en:{name:'English'}}}];
 let item=s.snapshot().installed[0];assert.equal(item.manifest.name,'English');assert.equal(item.manifest.description,'说明');assert.equal(item.manifest.contributes.commands[0].visible,false);assert.equal(item.manifest.contributes.commands[0].when,'test.ready');
 s.hosts={entries:new Map([['test',{context:{'test.ready':true}}]]),snapshot:()=>({})};assert.equal(s.snapshot().installed[0].manifest.contributes.commands[0].visible,true);
 s.options.locale='zh-CN';assert.equal(s.snapshot().installed[0].manifest.name,'默认');
});
test('unknown error codes are never exposed to extensions',()=>{const {publicCode}=require('../core/extensions/errors.cjs');assert.equal(publicCode({code:'CONFLICT'}),'CONFLICT');assert.equal(publicCode({code:'SQLITE_ERROR',message:'secret'}),'INTERNAL');});
test('localization normalizes regional tags and falls back without leaking placeholders',()=>{
 const {localized}=require('../core/extensions/localization.cjs');const item={dictionaries:{default:{name:'Default'},en:{name:'English'},'en-gb':{name:'British'}}};
 assert.equal(localized(item,'%name%','en_GB'),'British');assert.equal(localized(item,'%name%','en-US'),'English');assert.equal(localized(item,'%name%','fr'),'Default');assert.equal(localized(item,'%missing%','fr'),'missing');assert.equal(localized(item,'Literal','en'),'Literal');
});
