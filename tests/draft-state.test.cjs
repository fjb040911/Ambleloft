const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exported={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/useDraftState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported,require});
test('restoring composer files never restores a stale permission escalation or provider confirmation',()=>{
 const value=exported.restoreComposerOptions({permission:'full',confirmProviderChange:true,model:'old',attachments:[{path:'C:/file.txt',name:'file.txt'},null,{path:7}],selectedSkillIds:['skill',null]}, {permission:'default',model:'current'});
 assert.equal(value.permission,'default');assert.equal(value.model,'current');assert.equal(value.confirmProviderChange,undefined);assert.equal(value.attachments.length,1);assert.equal(value.selectedSkillIds.length,1);
});
test('saved draft origins preserve the original revision for conflict detection and reject malformed storage',()=>{
 const draft={id:'draft',prompt:'original',title:'Title',status:'draft',revision:3};assert.equal(exported.restoreTaskDraft(draft),draft);for(const value of [null,'x',[],{id:'x'},{...draft,status:'completed'}])assert.equal(exported.restoreTaskDraft(value),null);
});
