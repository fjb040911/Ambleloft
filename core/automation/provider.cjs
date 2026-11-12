const {usesChat}=require('../../electron/chat-bridge.cjs');
const {parseStructuredOutput,outputError}=require('./structured-output.cjs');
const capabilities=require('./output-capabilities.cjs');
const Ajv=require('ajv');
const {inferenceDeadline,abortable}=require('./inference-deadline.cjs');
const {resolveBudget,recoverBudget,estimateInput,thinking}=require('../models/budget.cjs');
const {discoverCapacity}=require('../models/capacity.cjs');
// One shared budget for protocol/format negotiation and a single content repair.
// Nothing outside this inference is retried; all mutations remain with callers.
async function generate(config,job,signal,onProgress){
 const deadline=inferenceDeadline(signal,{timeoutMs:job.timeoutMs});
 job={...job,usageRequestId:require('node:crypto').randomUUID(),observeUsage:job.observeUsage||require('../project-insights/usage.cjs').forConfig(config,job.usageScope)};
 try{return await abortable(generateWithinDeadline(config,job,deadline.signal,onProgress),deadline.signal);}
 finally{deadline.dispose();}
}
async function generateWithinDeadline(config,job,signal,onProgress){
 let validate;try{validate=new Ajv({strict:false,allErrors:true,logger:false}).compile(job.outputSchema);}catch{throw Object.assign(Error('INVALID_SCHEMA'),{definitive:true});}
 await discoverCapacity(config,signal);
 job={...job,outputBudget:resolveBudget(config,{profile:job.budgetProfile,requested:job.maxOutputTokens,reasoning:thinking(config),inputTokens:estimateInput({prompt:job.prompt,input:job.input,schema:job.outputSchema})})};
 let protocol=usesChat(config)?'chat':'responses',available=capabilities.formats(job.outputSchema);
 let unsupported=[];
 const choose=()=>{unsupported=capabilities.profile(config,protocol,!!onProgress)?.unsupported||[];const found=available.findIndex(mode=>!unsupported.includes(mode));return found<0?available.length-1:found;};
 let index=choose(),repair='',repaired=false,switched=false,outputRetried=false;
 for(let attempt=0;attempt<4;attempt++){
  signal.throwIfAborted();const mode=available[index];
  job={...job,usageAttempt:attempt};
  try{
   const result=await request({...config,protocol},repair?{...job,prompt:job.prompt+'\n'+repair}:job,signal,onProgress,mode);
   if(!validate(result)){
    const error=outputError('schema-mismatch',0,'schema');
    error.diagnostics.issues=validate.errors.slice(0,6).map(e=>({schemaPath:e.schemaPath,keyword:e.keyword}));throw error;
   }
   signal.throwIfAborted();
   await capabilities.remember(config,{protocol,streaming:!!onProgress,mode,unsupported});
   signal.throwIfAborted();return result;
  }catch(error){
   error.diagnostics={...error.diagnostics,attempts:attempt+1,protocol,mode,budget:job.outputBudget,...(error.message==='OUTPUT_LIMIT'?{maxOutputTokens:outputBudget(config,job),outputLimitRetried:outputRetried}: {})};
   signal.throwIfAborted();if(attempt===3)throw error;
   const probeRoute=job.probeProtocol&&error.message==='PROVIDER_REJECTED'&&error.diagnostics?.httpStatus===404;
   if((error.message==='PROTOCOL_UNSUPPORTED'||probeRoute)&&(!config.protocol||config.protocol==='auto')&&!switched){protocol=protocol==='chat'?'responses':'chat';switched=true;index=choose();}
   else if(['FORMAT_UNSUPPORTED','SCHEMA_UNSUPPORTED'].includes(error.message)&&index<available.length-1){if(error.message==='FORMAT_UNSUPPORTED')unsupported=[...new Set([...unsupported,mode])];index++;}
   else if(job.retryOutputLimit&&!outputRetried&&error.message==='OUTPUT_LIMIT'){
    const next=recoverBudget(job.outputBudget);
    if(!next)throw error;
    outputRetried=true;
    job={...job,outputBudget:next};
    repair='The previous response reached its output limit. Return one complete JSON value matching the schema. Keep prose concise and avoid repetition across fields. Preserve all requested scope, tasks, dependencies and user-confirmed constraints; do not omit requirements to shorten the response.';
   }
   else if(job.repairInvalidOutput&&!repaired&&error.message==='INVALID_OUTPUT'&&['content','schema'].includes(error.diagnostics.stage)){
    repaired=true;repair='The previous response did not satisfy the output contract. Return one complete JSON value matching the schema, without commentary or Markdown fences.';
    if(error.diagnostics.issues)repair+=' Validation errors (schema locations only): '+JSON.stringify(error.diagnostics.issues);
   }else throw error;
   await onProgress?.({phase:'waiting',reasoning:'',reasoningFormat:'summary'});
  }
 }
}
function outputBudget(config,job){
 return job.outputBudget.maxOutputTokens;
}
async function request(config,job,signal,onProgress,mode){
 const id=require('node:crypto').randomUUID(),startedAt=new Date().toISOString();let usage=null,providerRequestId=null,status='unknown',dispatched=false;
 const observed=()=>({id,hostRequestId:job.usageRequestId,attempt:job.usageAttempt||0,startedAt,finishedAt:status==='running'?null:new Date().toISOString(),status,usage,providerRequestId});
 const notify=async()=>{try{await job.observeUsage?.(observed());}catch{}};
 const onUsage=(value,requestId)=>{usage=value;providerRequestId=requestId||providerRequestId;};
 try{
 const chat=usesChat(config),instruction='Return only JSON matching this schema: '+JSON.stringify(job.outputSchema)+'\n'+job.prompt;
 const maximum=outputBudget(config,job);
 const input=JSON.stringify(job.input),body=chat?{model:config.model,messages:[{role:'system',content:instruction},{role:'user',content:input}],max_tokens:maximum,stream:false}:{model:config.model,instructions:instruction,input,max_output_tokens:maximum,stream:false,store:false};
 capabilities.applyFormat(body,mode,job.outputSchema,chat);
 if(onProgress){
  body.stream=true;if(chat)body.stream_options={include_usage:true};
  if(chat&&/^deepseek/i.test(config.model))body.thinking={type:config.reasoningSummary===false?'disabled':'enabled'};
  if(!chat&&config.reasoningSummary!==false)body.reasoning={summary:'auto'};
 }
 signal.throwIfAborted();
 dispatched=true;status='running';await notify();
 const response=await fetch(config.baseUrl+(chat?'/chat/completions':'/responses'),{method:'POST',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify(body),signal,redirect:'error'});
 if(!response.ok)throw await capabilities.httpError(response);
 if(onProgress&&response.headers.get('content-type')?.includes('text/event-stream')){const result=await require('./provider-stream.cjs').readStructuredStream(response,{chat,signal,onProgress,onUsage,reasoning:config.reasoningSummary!==false});status='succeeded';return result;}
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>256*1024)throw Error('Response too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 signal?.throwIfAborted();
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{throw outputError('invalid-envelope',bytes,'transport');}
 if(!data||typeof data!=='object')throw outputError('invalid-envelope',bytes,'transport');
 onUsage(data.usage||null,data.id);
 if(data.choices?.[0]?.finish_reason==='length'||data.incomplete_details?.reason==='max_output_tokens')throw Object.assign(Error('OUTPUT_LIMIT'),{definitive:true});
 if(data.status&&data.status!=='completed'||data.choices?.[0]?.finish_reason&&data.choices[0].finish_reason!=='stop')throw outputError('unexpected-finish',bytes,'completion');
 if(data.choices?.[0]?.message?.refusal||(data.output||[]).some(i=>(i.content||[]).some(c=>c.type==='refusal')))throw Object.assign(Error('MODEL_REFUSAL'),{definitive:true,diagnostics:{stage:'completion',reason:'refusal'}});
 const text=chat?data.choices?.[0]?.message?.content:(data.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(onProgress&&config.reasoningSummary!==false){
  const reasoning=chat?(data.choices?.[0]?.message?.reasoning_content||data.choices?.[0]?.message?.reasoning||''):(data.output||[]).filter(i=>i.type==='reasoning').flatMap(i=>i.summary||[]).map(c=>c.text||'').join('\n');
  if(reasoning)await onProgress({phase:'responding',reasoning,reasoningFormat:chat?'text':'summary'});
 }
 const result=parseStructuredOutput(text);status='succeeded';return result;
 }catch(error){status=signal?.aborted?'unknown':error.definitive?'failed':'unknown';throw error;}
 finally{if(dispatched)await notify();}
}
module.exports={generate};
