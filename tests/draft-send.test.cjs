const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/draft-send.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {draftForSend}=exportsObject;
const draft={id:'draft',title:'Title',prompt:'Prompt',projectId:'project',modelId:'',status:'draft',createdAt:'today',revision:1,conversationId:'same'};
test('unchanged draft adopts current revision while preserving identity',()=>{
 const latest={...draft,revision:2};assert.equal(draftForSend(draft,[latest]),latest);assert.equal(latest.conversationId,'same');
});
test('changed, archived, missing and incompatible draft snapshots cannot silently send',()=>{
 for(const value of [{...draft,prompt:'Other'},{...draft,projectId:'other'},{...draft,archivedAt:'today'},{...draft,revision:undefined}])assert.throws(()=>draftForSend(draft,[value]));
 assert.throws(()=>draftForSend(draft,[]));
});
