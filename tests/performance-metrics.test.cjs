const {test}=require('node:test'),assert=require('node:assert/strict');
const {createMetrics}=require('../electron/performance-metrics.cjs');
const {diagnosticReport}=require('../electron/run-diagnostics.cjs');
test('performance metrics have bounded retention and only retain numeric allowlisted data',()=>{
 const metrics=createMetrics(3);for(let i=0;i<20;i++){metrics.record('databaseMs',i);metrics.record('secret',100);metrics.record('databaseMs',NaN);metrics.sample({rss:i,heapUsed:i,secret:'PRIVATE'},{p95:1,max:2});metrics.exited('PRIVATE',i);}
 const snapshot=metrics.snapshot();assert.equal(snapshot.samples.length,3);assert.equal(snapshot.samples[0].memory.rss,17);assert.equal(snapshot.exits.length,20);assert.equal(snapshot.exits[0].reason,'unknown');assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));assert.deepEqual(snapshot.samples[2].metrics.databaseMs,{count:1,total:19,max:19});snapshot.samples.length=0;assert.equal(metrics.snapshot().samples.length,3);
});
test('diagnostics retain safe connection codes and event timestamps without exporting raw errors',()=>{
 const report=diagnosticReport({modelRequests:[{causeCode:'ECONNRESET',lastEventAt:'2026-11-17T03:44:37.000Z',reason:'PRIVATE',error:'PRIVATE'},{causeCode:'https://secret',lastEventAt:'PRIVATE'}]},'test');
 assert.equal(report.requests[0].causeCode,'ECONNRESET');assert.equal(report.requests[0].lastEventAt,'2026-11-17T03:44:37.000Z');assert.equal(report.requests[1].causeCode,undefined);assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('renderer hang and recovery evidence is bounded and contains no arbitrary payload',()=>{
 const metrics=createMetrics();metrics.responsiveness('PRIVATE',1);metrics.responsiveness('unresponsive','PRIVATE');
 for(let i=0;i<24;i++)metrics.responsiveness(i%2?'responsive':'unresponsive',i);
 const snapshot=metrics.snapshot();assert.equal(snapshot.responsiveness.length,20);assert.deepEqual(snapshot.responsiveness.map(e=>e.contentsId),Array.from({length:20},(_,i)=>i+4));
 assert.equal(snapshot.responsiveness.at(-1).state,'responsive');assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));snapshot.responsiveness.length=0;assert.equal(metrics.snapshot().responsiveness.length,20);
});
