const {createHash}=require('node:crypto');
const pending=new WeakMap();
const fingerprint=input=>require('./stored-json.cjs').hash(input);
function valid(id){if(typeof id!=='string'||!id||id.length>128)throw Error('INVALID_CLIENT_MUTATION_ID');}
async function status(runtime,{clientMutationId,runId,kind='start'}){
 valid(clientMutationId);
 if(kind==='append'){
  const id='user:'+createHash('sha256').update(JSON.stringify([runId,clientMutationId])).digest('hex');
  const read=()=>runtime.database.call('chatInput',{action:'get',id});const item=await (runtime.chatInputs?.serial?runtime.chatInputs.serial(runId,read):read());
  return item?{state:'accepted',deliveryState:item.state}:{state:'absent'};
 }
 if(pending.get(runtime)?.has(clientMutationId))return {state:'pending'};
 const receipt=runtime.database?await runtime.database.call('composerReceipt',{id:clientMutationId}):null;
 return receipt?{state:'accepted',runId:receipt.run_id}:{state:'absent'};
}
function start(runtime,input,context){
 if(input?.clientMutationId===undefined)return runtime.startOnce(input,context);
 valid(input.clientMutationId);const id=input.clientMutationId,digest=fingerprint(input);
 let entries=pending.get(runtime);if(!entries)pending.set(runtime,entries=new Map());
 const existing=entries.get(id);if(existing){if(existing.digest!==digest)throw Error('IDEMPOTENCY_CONFLICT');return existing.promise;}
 const promise=Promise.resolve().then(async()=>{
  const receipt=runtime.database?await runtime.database.call('composerReceipt',{id}):null;
  if(receipt){if(receipt.digest!==digest)throw Error('IDEMPOTENCY_CONFLICT');const run=runtime.runs.find(r=>r.id===receipt.run_id);if(!run)throw Error('REQUEST_ALREADY_HANDLED');return require('./history-pages.cjs').pageRun(run);}
  return runtime.startOnce(input,{...context,composerRequest:{id,digest}});
 }).finally(()=>entries.delete(id));
 entries.set(id,{digest,promise});return promise;
}
module.exports={start,status,fingerprint};
