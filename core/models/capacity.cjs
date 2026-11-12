// Optional /models metadata discovery. Never infer output capacity from a
// context window or model name, and never persist credentials or raw responses.
const {createHash}=require('node:crypto');
const cache=new Map(),TTL=15*60*1000,FAILURE_TTL=30000;
function parseCapacity(data,model){
 const entry=Array.isArray(data?.data)?data.data.find(x=>x?.id===model):null;
 const result={};
 for(const [key,value] of Object.entries({contextWindow:entry?.context_window,maxOutputTokens:entry?.max_output_tokens}))
  if(Number.isSafeInteger(value)&&value>0)result[key]=value;
 return result;
}
async function discoverCapacity(config,signal){
 if(!config.discoverModelLimits)return config;
 signal?.throwIfAborted();
 const key=createHash('sha256').update(JSON.stringify([config.baseUrl,config.model,config.apiKey||'',config.revision||0])).digest('hex');
 const prior=cache.get(key);
 if(prior&&prior.expires>Date.now()){config.detectedModelLimits=prior.value;return config;}
 const timeout=AbortSignal.timeout(1500),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let value={};
 try{
  const response=await fetch(config.baseUrl+'/models',{headers:{...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},redirect:'error',signal:combined});
  if(!response.ok){await response.body?.cancel();throw Error('METADATA_UNAVAILABLE');}
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.length;if(size>256*1024)throw Error('METADATA_TOO_LARGE');chunks.push(Buffer.from(chunk));}}
  finally{await reader.cancel().catch(()=>{});}
  value=parseCapacity(JSON.parse(Buffer.concat(chunks).toString()),config.model);
 }catch{signal?.throwIfAborted();/* Missing optional metadata must not break inference. */}
 if(cache.size>=200)cache.delete(cache.keys().next().value);
 cache.set(key,{value,expires:Date.now()+(Object.keys(value).length?TTL:FAILURE_TTL)});
 config.detectedModelLimits=value;return config;
}
module.exports={parseCapacity,discoverCapacity};
