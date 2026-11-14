const {test}=require('node:test'),assert=require('node:assert/strict');
const {scenario}=require('./fixtures/complex-acceptance.cjs');
test('ten-node release completes repairs, delayed retry, human fallback, missing evidence and branch replay',async()=>{
 const result=await scenario();assert.equal(result.nodeCount,10);assert.equal(result.executions,20);
 assert.equal(Object.keys(result.snapshots).length,10);
});
