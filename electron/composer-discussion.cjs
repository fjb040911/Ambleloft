// Track IPC work before any asynchronous service validation. A missing snapshot
// is not proof of rejection while the original request is still in flight.
const pending=new WeakMap();
function invoke(service,action,input,context){
 let entries=pending.get(service);if(!entries)pending.set(service,entries=new Map());
 const id=input?.clientRequestId;entries.set(id,(entries.get(id)||0)+1);
 return Promise.resolve().then(()=>service[action](input,context)).finally(()=>{const count=entries.get(id)-1;if(count)entries.set(id,count);else entries.delete(id);});
}
async function status(service,{clientMutationId,runId}){
 if(typeof clientMutationId!=='string'||!clientMutationId||clientMutationId.length>128||typeof runId!=='string')throw Error('INVALID_ARGUMENT');
 const wasPending=pending.get(service)?.has(clientMutationId);
 const snapshot=await service.snapshot();
 const request=snapshot.requests.find(r=>r.spaceId===runId&&(r.id===clientMutationId||r.followups?.some(f=>f.id===clientMutationId)));
 if(request)return {state:'accepted',discussionId:require('../core/workforce/discussion-host.cjs').rootOf(snapshot.requests,request)};
 const deleted=Object.entries(snapshot.discussionStates||{}).find(([root,state])=>state.status==='deleted'&&state.spaceId===runId&&(root===clientMutationId||state.requestIds?.includes(clientMutationId)));
 if(deleted)return {state:'accepted',discussionId:deleted[0]};
 return {state:wasPending||pending.get(service)?.has(clientMutationId)?'pending':'absent'};
}
module.exports={invoke,status};
