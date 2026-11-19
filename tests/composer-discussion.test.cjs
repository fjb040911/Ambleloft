const {test}=require('node:test'),assert=require('node:assert/strict');
const {invoke,status}=require('../electron/composer-discussion.cjs');
test('discussion acceptance distinguishes pending validation, receipt, rejection and follow-up root',async()=>{
 let release;const snapshot={requests:[]},service={snapshot:async()=>snapshot,start:()=>new Promise(r=>release=r)};
 const input={clientRequestId:'send'},query={clientMutationId:'send',runId:'space'};
 const flight=invoke(service,'start',input);assert.deepEqual(await status(service,query),{state:'pending'});
 snapshot.requests.push({id:'send',spaceId:'space',followups:[]});assert.deepEqual(await status(service,query),{state:'accepted',discussionId:'send'});release();await flight;
 snapshot.requests.push({id:'round',spaceId:'space',replyTo:'send',followups:[{id:'follow'}]});assert.deepEqual(await status(service,{...query,clientMutationId:'follow'}),{state:'accepted',discussionId:'send'});
 assert.deepEqual(await status(service,{...query,runId:'other'}),{state:'absent'});
 service.start=async()=>{throw Error('rejected');};await assert.rejects(invoke(service,'start',{clientRequestId:'bad'}),/rejected/);assert.deepEqual(await status(service,{...query,clientMutationId:'bad'}),{state:'absent'});
 await assert.rejects(status(service,{clientMutationId:'',runId:'space'}),/INVALID_ARGUMENT/);
});

test('snapshot read racing with successful completion cannot report absence',async()=>{
 let finish,read;const service={start:()=>new Promise(r=>finish=r),snapshot:()=>new Promise(r=>read=r)};
 const flight=invoke(service,'start',{clientRequestId:'race'});await Promise.resolve();
 const checking=status(service,{clientMutationId:'race',runId:'space'});finish();await flight;read({requests:[]});
 assert.deepEqual(await checking,{state:'pending'});
 service.snapshot=async()=>({requests:[{id:'race',spaceId:'space'}]});assert.deepEqual(await status(service,{clientMutationId:'race',runId:'space'}),{state:'accepted',discussionId:'race'});
});

test('deleted discussion receipt remains handled and is not restored as unsent',async()=>{
 const service={snapshot:async()=>({requests:[],discussionStates:{root:{status:'deleted',spaceId:'space',requestIds:['root','round']}}})};
 assert.deepEqual(await status(service,{clientMutationId:'round',runId:'space'}),{state:'accepted',discussionId:'root'});
 assert.deepEqual(await status(service,{clientMutationId:'round',runId:'other'}),{state:'absent'});
});
