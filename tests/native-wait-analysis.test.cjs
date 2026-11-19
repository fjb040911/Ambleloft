const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeWaits}=require('../scripts/probes/analyze-native-waits.cjs');
const event=(ms,old,next,state='Wait',stack='')=>`EVENT\t${new Date(1700000000000+ms).toISOString()}\tThread/CSwitch\tpid=1\ttid=${next}\nSWITCH\toldTid=${old}\tnewTid=${next}\twait=UserRequest\tstate=${state}\n${stack}`;
test('a switch without a call stack still ends a wait and prevents double counting',()=>{
 const result=analyzeWaits(event(0,1,2)+event(50,2,1)+event(100,3,1));
 assert.equal(result.filter(w=>w.thread===1).length,1);assert.equal(result.find(w=>w.thread===1).ms,50);assert.deepEqual(result.find(w=>w.thread===1).stack,[]);
});
test('resumed thread stack is used and ready-state scheduling delay is not labeled blocked',()=>{
 const result=analyzeWaits(event(0,1,2,'Ready')+event(200,2,1,'Wait','  module!resume\n'));
 assert.equal(result[0].thread,1);assert.equal(result[0].previousState,'Ready');assert.deepEqual(result[0].stack,['module!resume']);
});
test('unknown start of an observation window does not invent a wait duration',()=>assert.deepEqual(analyzeWaits(event(500,2,1)),[]));
