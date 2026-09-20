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
