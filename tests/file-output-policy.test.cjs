const test=require('node:test');const assert=require('node:assert/strict');
const tool=(path,overrides={})=>({turnKey:'u',type:'fileChange',status:'completed',detail:JSON.stringify([{path,kind:'update'}]),...overrides});
test('only successful writes in this turn establish file ownership, not shell output or delivery',async()=>{
 const {attributedChanges}=await import('../electron/file-output-policy.mjs');
 const run={cwd:'/work',tools:[tool('own.js'),tool('failed.js',{status:'failed'}),tool('old.js',{turnKey:'old'}),tool('shell.js',{type:'commandExecution'}),tool('registered.js',{type:'deliverable'})]};
 const batch={turnKey:'u',files:['own.js','failed.js','old.js','shell.js','registered.js','outside.js'].map(path=>({path}))};
 assert.deepEqual(attributedChanges(run,batch).files,[{path:'own.js'}]);
});
test('deliveries win duplicate rows while keeping their diff; untyped legacy entries are suppressed',async()=>{
 const {turnFileOutputs}=await import('../electron/file-output-policy.mjs');
 const run={cwd:'/work',tools:[tool('./out/report.md'),tool('code.js')],artifacts:[{id:'a',kind:'delivery',path:'/work/out/report.md',turnKey:'u'},{id:'duplicate',kind:'delivery',path:'out/report.md',turnKey:'u'},{id:'legacy',path:'code.js',turnKey:'u'}],fileChanges:[{turnKey:'u',files:[{path:'out/report.md'},{path:'code.js'},{path:'external.js'}]}]};
 const result=turnFileOutputs(run,'u');
 assert.deepEqual(result.deliveries.map(f=>f.id),['a']);assert.equal(result.batches[0].files.length,2);assert.deepEqual(result.remaining[0].files,[{path:'code.js'}]);
});
test('Windows absolute and relative paths match without merging equal basenames in different folders',async()=>{
 const {turnFileOutputs}=await import('../electron/file-output-policy.mjs');
 const run={cwd:'C:\\Work',tools:[tool('C:\\Work\\out\\Report.md'),tool('src/Report.md')],artifacts:[{id:'a',turnKey:'u',kind:'delivery',path:'c:/work/out/report.md'}],fileChanges:[{turnKey:'u',files:[{path:'out/Report.md'},{path:'src/Report.md'}]}]};
 assert.deepEqual(turnFileOutputs(run,'u').remaining[0].files,[{path:'src/Report.md'}]);
});
