const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/workforce-plan-graph.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,out);
const {graphTopology,graphLayout,graphRelations,unmetDependencies,previewPackages}=out;
const defs=[{id:'product',dependencies:[]},{id:'environment',dependencies:[]},{id:'api',dependencies:['product','environment']},{id:'web',dependencies:['product']},{id:'delivery',dependencies:['api','web']}];
test('parallel roots, forks and joins are stable across status, wording and attempts',()=>{
 const before=graphLayout(defs);assert.equal(before.errors.length,0);assert(before.positions.get('product').x<before.positions.get('api').x);assert(before.positions.get('api').x<before.positions.get('delivery').x);
 assert.equal(before.positions.get('product').x,before.positions.get('environment').x);
 assert.deepEqual(graphLayout(defs.map(p=>({...p,title:'Changed title',status:'accepted',attempts:[{}]}))).positions,before.positions);
 assert.equal(graphTopology(defs).key,graphTopology(defs.map(p=>({...p,dependencies:[...p.dependencies].reverse()}))).key);
});
test('transitive dependencies are distinct from unrelated parallel roots',()=>{
 const r=graphRelations(defs,'web');assert.deepEqual([...r.upstream],['product']);assert.deepEqual([...r.downstream],['delivery']);assert(!r.upstream.has('environment'));
});
test('missing IDs, duplicate IDs and cycles never produce misleading layouts',()=>{
 for(const [definitions,kind] of [[[{id:'a',dependencies:['missing']}],'missing'],[[{id:'a',dependencies:[]},{id:'a',dependencies:[]}],'duplicate'],[[{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}],'cycle']]){const r=graphLayout(definitions);assert.equal(r.errors[0].kind,kind);assert.equal(r.positions.size,0);}
});
test('only accepted nonstale prerequisites clear dependency edges',()=>{
 const packages=previewPackages(defs);const api=packages[2];packages[0].status='review';packages[1].status='completed';assert.deepEqual(unmetDependencies(packages,api),['product','environment']);
 packages[0].status='accepted';packages[1].status='accepted';assert.deepEqual(unmetDependencies(packages,api),[]);packages[0].stale=true;assert.deepEqual(unmetDependencies(packages,api),['product']);
});
test('draft previews have no execution evidence or inherited acceptance',()=>{
 const preview=previewPackages(defs);assert(preview.every(p=>p.status==='draft'&&!p.acceptance&&!p.stale&&!p.attempts.length));assert.equal(graphLayout([]).positions.size,0);
});
test('thirty work packages retain every node and dependency without changing input',()=>{
 const thirty=Array.from({length:30},(_,i)=>({id:'task-'+i,dependencies:i<3?[]:['task-'+(i-3)]}));const before=JSON.stringify(thirty),r=graphLayout(thirty);
 assert.equal(r.positions.size,30);assert.equal(r.order.length,30);assert.equal(r.errors.length,0);assert.equal(JSON.stringify(thirty),before);
 for(const p of thirty)for(const id of p.dependencies)assert(r.positions.get(id).x<r.positions.get(p.id).x);
});
