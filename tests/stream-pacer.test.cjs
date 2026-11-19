const {test}=require('node:test'),assert=require('node:assert/strict'),{pace}=require('../scripts/probes/stream-pacer.cjs');
test('high-rate fixture yields without another timer tick when Windows timer is late',async()=>{
 const calls=[],scheduler={now:()=>115,timer:(done,ms)=>{calls.push(['timer',ms]);done();},immediate:done=>{calls.push(['immediate']);done();}};
 await pace(110,scheduler);await pace(115,scheduler);await pace(120,scheduler);
 assert.deepEqual(calls,[['immediate'],['immediate'],['timer',5]]);
});
