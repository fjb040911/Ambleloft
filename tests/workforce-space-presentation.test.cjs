const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const exportsObject={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/workforce-space-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,exportsObject);
const {spaceSummary,documentImpact}=exportsObject;
const pkg=(id,refs=[],dependencies=[],mode='work')=>({id,status:'review',definition:{id,title:id,mode,documentRefs:refs,dependencies},attempts:[]});
test('document impact follows work references and downstream dependencies, excludes read-only discussion and deduplicates attempts',()=>{
 const plan={id:'plan',packages:[{...pkg('source',[{id:'doc',revision:1}]),attempts:[{requestId:'attempt'}]},pkg('downstream',[],['source']),pkg('read-only',[{id:'doc',revision:1}],[],'discussion'),pkg('current',[{id:'doc',revision:2}])]};
 const result=documentImpact([plan],[{id:'attempt',mode:'work',documentRefs:[{id:'doc',revision:1}]},{id:'standalone',mode:'work',documentRefs:[{id:'doc',revision:1}]}],'doc',2);
 assert.deepEqual(result.packages.map(p=>[p.packageId,p.indirect]),[['source',false],['downstream',true]]);assert.deepEqual(result.requests.map(r=>r.id),['standalone']);
});
test('overview activity uses real work dates, not space visits or configuration updates, and counts a plan attempt once',()=>{
 const space={id:'space',createdAt:'2026-01-01',updatedAt:'2099-01-01'};
 const plan={id:'plan',spaceId:'space',updatedAt:'2026-01-03',name:'plan',events:[],packages:[{...pkg('source'),attempts:[{requestId:'attempt'}]}]};
 const data={plans:[plan],documents:[],requests:[{id:'attempt',spaceId:'space',createdAt:'2026-01-03',participants:[{status:'failed'}]},{id:'discussion',spaceId:'space',createdAt:'2026-01-02',prompt:'Discussion',participants:[{status:'completed',updatedAt:'2026-01-04'}]}]};
 const result=spaceSummary(space,data);assert.equal(result.attention.length,1);assert.equal(result.lastActivity,'2026-01-04');assert.equal(result.activity.length,2);
});
test('a single-employee follow-up replaces its earlier failed attention item without discarding history',()=>{
 const space={id:'space',createdAt:'2026-01-01'};const data={plans:[],documents:[],requests:[{id:'old',spaceId:'space',createdAt:'2026-01-01',prompt:'Goal',participants:[{employeeId:'one',status:'failed'},{employeeId:'two',status:'completed'}]},{id:'retry',replyTo:'old',spaceId:'space',createdAt:'2026-01-02',prompt:'Goal',participants:[{employeeId:'one',status:'running'}]}]};
 const result=spaceSummary(space,data);assert.equal(result.attention.length,0);assert.equal(result.activity.length,2);
});
test('input and approval waits are actionable rather than hidden as ordinary dependency waits',()=>{
 const space={id:'space',createdAt:'2026-01-01'};const data={plans:[{id:'p',spaceId:'space',events:[],updatedAt:'2026-01-01',packages:[{...pkg('input'),status:'waiting'},{...pkg('dependency'),status:'pending'}]}],documents:[],requests:[]};
 const result=spaceSummary(space,data);assert.deepEqual(result.attention.map(i=>i.kind),['input']);
});
