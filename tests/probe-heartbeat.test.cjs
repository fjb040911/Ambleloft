const {test}=require('node:test'),assert=require('node:assert/strict');
const {startHeartbeat}=require('../scripts/probes/heartbeat.cjs');
test('asynchronous trace setup does not become a false first event-loop stall',async()=>{
 let now=0,tick,cpu=0;const gaps=[];
 const stop=await startHeartbeat({prepare:async()=>{now+=600;cpu+=100000;},clock:()=>now,cpu:()=>({user:cpu,system:0}),onGap:g=>gaps.push(g),schedule:fn=>{tick=fn;return 1;},cancel:id=>assert.equal(id,1)});
 now+=50;cpu+=1000;tick();assert.deepEqual(gaps,[]);
 now+=500;cpu+=16000;tick();assert.deepEqual(gaps,[{ms:500,cpuMs:16}]);stop();
});
test('CPU and waiting stalls are distinguished and subsequent intervals reset',async()=>{
 let now=0,tick,cpu=0;const gaps=[];
 await startHeartbeat({prepare:async()=>{},clock:()=>now,cpu:()=>({user:cpu,system:0}),onGap:g=>gaps.push(g),schedule:fn=>{tick=fn;},cancel:()=>{}});
 now+=200;cpu+=190000;tick();now+=200;tick();now+=50;tick();
 assert.deepEqual(gaps,[{ms:200,cpuMs:190},{ms:200,cpuMs:0}]);
});
test('failed setup does not leave a sampler running',async()=>{
 await assert.rejects(startHeartbeat({prepare:async()=>{throw Error('setup failed');},schedule:()=>assert.fail('must not schedule')}),/setup failed/);
});
