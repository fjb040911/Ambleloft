const {randomUUID}=require('node:crypto');
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function counts(usage){
 const u=usage||{};
 return {input:count(u.input_tokens??u.prompt_tokens),output:count(u.output_tokens??u.completion_tokens),total:count(u.total_tokens),cachedInput:count(u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens),reasoningOutput:count(u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens)};
}
// Whitelisted metadata only. Never persist a provider envelope, prompt or URL.
function record(input){
 const c=counts(input.usage);
 const text=v=>typeof v==='string'?v.slice(0,200):null;
 return {id:text(input.id)||randomUUID(),hostRequestId:text(input.hostRequestId)||text(input.id),attempt:Number.isSafeInteger(input.attempt)?input.attempt:0,providerRequestId:text(input.providerRequestId),projectId:text(input.projectId),runId:text(input.runId),turnId:text(input.turnId),parentThreadId:text(input.parentThreadId),jobId:text(input.jobId),providerId:text(input.providerId),model:text(input.model),purpose:['development','summary','other'].includes(input.purpose)?input.purpose:'other',origin:text(input.origin)||'structured',startedAt:input.startedAt,finishedAt:input.finishedAt||null,status:['running','succeeded','failed','cancelled','unknown'].includes(input.status)?input.status:'unknown',counts:c,quality:c.input!==null&&c.output!==null?'reported':'unknown',schemaVersion:1};
}
// Instrumentation must not break a chat. A durable gap marker is attempted on
// write failure; failures also remain visible to the local diagnostic log.
function observer(database,scope){return async event=>{if(!database)return;try{await database.call('insightsRecordUsage',record({...scope,...event}));}catch{console.warn('Project usage ledger write failed');await database.call('insightsUsageGap',{projectId:scope.projectId||null}).catch(()=>{});}};}
const bindings=new WeakMap();
function bind(config,database){bindings.set(config,database);return config;}
function forConfig(config,scope={}){const db=bindings.get(config);return db?observer(db,{providerId:config.id,model:config.model,...scope}):undefined;}
module.exports={counts,record,observer,bind,forConfig};
