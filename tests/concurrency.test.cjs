const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
test('scheduler caps parallel tasks, isolates directories and stops only targeted queued task',async()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});
 runtime.changed=()=>{};runtime.persist=async()=>{};
 const launched=[];
 const add=(id,cwd)=>{const c={key:id,run:{id,cwd,status:'preparing',queued:true,messages:[]},launch:async()=>launched.push(id)};runtime.contexts.set(id,c);runtime.pendingStarts.push(c);return c;};
 const a=add('a','/a'),b=add('b','/b'),c=add('c','/c'),d=add('d','/a');
 runtime.drain();assert.deepEqual(launched,['a','b']);assert.equal(c.run.queued,true);
 await runtime.stop('d');assert.equal(d.run.status,'interrupted');assert.equal(runtime.contexts.has('a'),true);
 await runtime.finish(a,'completed');assert.deepEqual(launched,['a','b','c']);
 assert.equal(runtime.contexts.has('b'),true);assert.equal(c.run.queued,false);
});
test('same directory waits while unrelated directory can proceed',()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};
 const launched=[];
 for(const [id,cwd] of [['a','/same'],['b','/same'],['c','/other']]){
 const context={key:id,run:{id,cwd},launch:async()=>launched.push(id)};runtime.contexts.set(id,context);runtime.pendingStarts.push(context);
 }
 runtime.drain();assert.deepEqual(launched,['a','c']);
});

test('drain never launches cancelled or finishing queued contexts',()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};const launched=[];
 for(const [id,state] of [['cancelled',{cancelled:true}],['done',{done:true}],['ready',{}]]){const c={key:id,run:{id,cwd:'/same'},...state,launch:async()=>launched.push(id)};runtime.contexts.set(id,c);runtime.pendingStarts.push(c);}
 runtime.drain();assert.deepEqual(launched,['ready']);assert.equal(runtime.pendingStarts.length,0);
});
test('a timed out model stops its run and releases the queued successor',async()=>{
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=()=>{};runtime.persist=async()=>{};runtime.maxConcurrent=1;
 const run={id:'slow',cwd:'/same',status:'running',messages:[],tools:[],questions:[],approvals:[]};const c={key:'slow',run,launched:true};runtime.contexts.set(c.key,c);runtime.runs.push(run);
 let launched;const started=new Promise(resolve=>launched=resolve);const next={key:'next',run:{id:'next',cwd:'/same'},launch:async()=>launched()};runtime.contexts.set(next.key,next);runtime.pendingStarts.push(next);
 runtime.modelDiagnostic(c,{timedOut:true});await started;assert.equal(run.status,'interrupted');assert.match(run.error,/长时间未返回有效内容/);assert.equal(runtime.contexts.has('slow'),false);
});
