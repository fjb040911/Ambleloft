const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertDiscussionEvidence}=require('../scripts/probes/discussion-verdict.cjs');
const fixture=()=>({hostBefore:'completed',hostAfter:'completed',before:[{id:'expert',status:'completed',messages:[{length:12,hash:'source-hash'}]}],after:[{id:'expert',status:'completed',messages:[{length:12,hash:'source-hash'}]}],expected:[{id:'expert',messages:[{length:12,hash:'source-hash'}]}],requests:[{engine:true,model:'fixture'}],model:'fixture',exits:[{code:0,signal:null},{code:0,signal:null}]});
test('complete independent evidence passes',()=>assert.equal(assertDiscussionEvidence(fixture()),true));
for(const status of ['failed','interrupted','running','stopped'])test(`matching restart hashes cannot hide ${status} tasks`,()=>{const e=fixture();e.before[0].status=e.after[0].status=status;assert.throws(()=>assertDiscussionEvidence(e),/expert must complete/);});
for(const [name,mutate] of [
 ['failed host',e=>e.hostBefore='failed'],['missing model request',e=>e.requests=[]],['wrong model',e=>e.requests[0].model='other'],
 ['matching corrupted bodies',e=>e.before[0].messages[0].hash=e.after[0].messages[0].hash='wrong'],
 ['missing restart body',e=>e.after[0].messages=[]],['restart status regression',e=>e.hostAfter='interrupted'],
 ['unclean exit',e=>e.exits[0].code=1],['missing exit',e=>e.exits.pop()],['empty workload',e=>e.expected=[]]
])test(name+' fails the combined gate',()=>{const e=fixture();mutate(e);assert.throws(()=>assertDiscussionEvidence(e));});
