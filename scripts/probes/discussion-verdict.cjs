// Shared evidence gate: matching two corrupt/unfinished snapshots is not success.
const assert=require('node:assert/strict');
function assertDiscussionEvidence({hostBefore,hostAfter,before,after,expected,requests,model,exits}){
 assert.equal(hostBefore,'completed','host must complete before shutdown');
 assert.equal(hostAfter,'completed','host terminal state must survive restart');
 assert.ok(expected.length>0,'expected participants must be explicit');
 assert.equal(before.length,expected.length,'all participants must be checked');
 assert.equal(new Set(before.map(r=>r.id)).size,before.length,'duplicate participant evidence');
 for(const run of before){assert.equal(run.status,'completed','expert must complete before shutdown');assert.deepEqual(run.messages,expected.find(e=>e.id===run.id)?.messages,'body must match independent source hashes');}
 assert.deepEqual(after,before,'restart must preserve terminal states and hashes');
 assert.equal(requests.filter(r=>r.engine&&r.model===model).length,expected.length,'actual model requests must cover every expert');
 assert.equal(exits.length,2,'both original and restarted processes must exit');
 assert.ok(exits.every(e=>e.code===0&&!e.signal),'process exits must be clean');
 return true;
}
module.exports={assertDiscussionEvidence};
