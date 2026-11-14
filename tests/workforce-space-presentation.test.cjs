const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const path=require('node:path'),cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),exports);
 return exports;
}
const exportsObject=load(path.resolve('src/workforce-space-state.ts'));
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
const snapshot=(packages=[],status='running')=>({spaces:[],plans:[{id:'plan',spaceId:'space',name:'Current plan',status,updatedAt:'2026-01-02',events:[],packages}],documents:[],requests:[]});
const withRun=(id,status)=>({...pkg(id),status,attempts:[{runId:id,requestId:id+'-request'}]});
const summary=(data,kinds={})=>spaceSummary({id:'space',createdAt:'2026-01-01'},data,kinds);
test('parallel execution and categorized attention coexist; a node counts once despite two request types',()=>{
 const result=summary(snapshot([withRun('working','running'),withRun('blocked','waiting'),pkg('review')]),{working:'',blocked:'approval-input'});
 assert.equal(result.state,'running');assert.equal(result.running,1);assert.equal(result.actionable.length,2);
 assert.deepEqual(result.attention[0].kinds,['approval','input']);assert.equal(result.currentPlans[0].packages.length,3);
});
test('paused nodes, dependencies and superseded attempt requests are not actionable failures',()=>{
 const data=snapshot([{...withRun('pause','interrupted'),stopReason:'plan-pause'},{...pkg('next'),status:'pending'}],'paused');
 data.requests=[{id:'pause-request',spaceId:'space',createdAt:'2026-01-02',participants:[{status:'failed'}]}];
 const result=summary(data,{pause:'approval'});assert.equal(result.state,'paused');assert.equal(result.attention.length,0);
});
test('scheduler running is distinct from execution; completed and draft plans have distinct states',()=>{
 assert.equal(summary(snapshot([{...pkg('dependency'),status:'pending'}])).state,'scheduling');
 assert.equal(summary(snapshot([{...pkg('new'),status:'pending'}],'draft')).state,'ready');
 assert.equal(summary(snapshot([{...pkg('done'),status:'accepted'}],'completed')).state,'completed');
 const data=snapshot([], 'completed');data.plans.push({...data.plans[0],id:'new',status:'draft',updatedAt:'2026-01-03'});
 assert.deepEqual(summary(data).currentPlans.map(p=>p.id),['new']);
});
test('failed request reads are unknown; loading never masquerades as an empty queue or confirmed input',()=>{
 const data=snapshot([withRun('wait','waiting')]);
 assert.equal(summary(data,{wait:'loading'}).state,'unknown');assert.equal(summary(data,{wait:'loading'}).actionable.length,0);
 assert.equal(summary(data,{wait:'unknown'}).attention[0].kind,'unknown');
 assert.equal(summary(data,{wait:''}).attention[0].kind,'unknown');
});
test('host questions are actionable, survive explanation turns, and clear after answers or closing the topic',()=>{
 const data={plans:[],documents:[],requests:[{id:'root',spaceId:'space',createdAt:'2026-01-01',prompt:'Goal',participants:[],host:{status:'ready',question:{requestKey:'question'}}}]};
 assert.equal(summary(data).attention[0].kind,'input');
 data.requests.push({id:'explain',spaceId:'space',replyTo:'root',intent:'explain-node',createdAt:'2026-01-02',participants:[]});
 assert.equal(summary(data).attention.length,1);
 data.requests[0].host.question.answeredBy='answer';assert.equal(summary(data).attention.length,0);
 delete data.requests[0].host.question.answeredBy;data.discussionStates={root:{status:'closed'}};assert.equal(summary(data).attention.length,0);
 delete data.discussionStates;data.requests.push({id:'restart',spaceId:'space',replyTo:'root',intent:'restart-guide',createdAt:'2026-01-03',participants:[]});assert.equal(summary(data).attention.length,0);
});
test('archived spaces retain history without live actions and streaming does not bump activity timestamps',()=>{
 const data=snapshot([withRun('run','waiting')]);data.requests=[{id:'discussion',spaceId:'space',prompt:'Goal',createdAt:'2026-01-01',participants:[{status:'running',updatedAt:'2099-01-01'}]}];
 const result=spaceSummary({id:'space',createdAt:'2026-01-01',archivedAt:'2026-01-03'},data,{run:'approval'});
 assert.equal(result.state,'archived');assert.equal(result.attention.length,0);assert.equal(result.lastActivity,'2026-01-02');
});
test('current host workflow includes pending draft clarification but not an abandoned draft',()=>{
 const data={plans:[],documents:[],taskDrafts:[{id:'draft',spaceId:'space',status:'needs-input',pendingQuestion:{source:{definition:{title:'Clarify'}}}}],requests:[{id:'root',spaceId:'space',createdAt:'2026-01-01',prompt:'Goal',participants:[],host:{status:'needs-input',task:{draftId:'draft'}}}]};
 assert.equal(summary(data).attention[0].kind,'input');
 data.requests.push({id:'restart',spaceId:'space',replyTo:'root',intent:'restart-guide',createdAt:'2026-01-02',participants:[],host:{status:'completed',task:{draftId:'new-draft'}}});
 assert.equal(summary(data).attention.length,0);
});
test('one paused plan never labels other schedulable work as fully paused',()=>{
 const data=snapshot([{...pkg('pending'),status:'pending'}],'paused');data.plans.push({...data.plans[0],id:'other',status:'running'});
 assert.equal(summary(data).state,'scheduling');data.plans[1].status='draft';assert.equal(summary(data).state,'partial-paused');
});

test('automatic verification, repair and delayed retry count as work rather than human attention',()=>{
 const nodes=[{...withRun('review','review'),attempts:[{runId:'review',automaticReview:{state:'checking'}}]},{...withRun('repair','pending'),autoRepairs:1},{...withRun('retry','pending'),retryAt:Date.now()+1000}];
 const result=summary(snapshot(nodes));assert.equal(result.running,3);assert.equal(result.state,'running');assert.equal(result.actionable.length,0);
});

test('pausing a scheduled automatic retry is not reported as running work or a manual failure',()=>{
 const nodes=[{...withRun('retry','pending'),retryAt:Date.now()+1000},{...withRun('paused','interrupted'),stopReason:'plan-pause'}];
 const result=summary(snapshot(nodes,'paused'));assert.equal(result.running,0);assert.equal(result.state,'paused');assert.equal(result.actionable.length,0);
 assert.equal(!!exportsObject.needsAttention(nodes[1]),false);
});
