const {usesChat}=require('../../electron/chat-bridge.cjs');
// Direct, single model request. Never starts an Agent or exposes tools/credentials.
async function generate(config,job,signal,onProgress){
 const chat=usesChat(config),instruction='Return only JSON matching this schema: '+JSON.stringify(job.outputSchema)+'\n'+job.prompt;
 const requested=Number.isInteger(job.maxOutputTokens)?Math.max(256,Math.min(16384,job.maxOutputTokens)):2048;
 const maximum=Math.min(requested,config.effectiveLimits?.maxOutputTokens||requested);
 const input=JSON.stringify(job.input),body=chat?{model:config.model,messages:[{role:'system',content:instruction},{role:'user',content:input}],max_tokens:maximum,stream:false}:{model:config.model,instructions:instruction,input,max_output_tokens:maximum,stream:false,store:false};
 if(onProgress){
  body.stream=true;
  if(chat&&/^deepseek/i.test(config.model))body.thinking={type:config.reasoningSummary===false?'disabled':'enabled'};
  if(!chat&&config.reasoningSummary!==false)body.reasoning={summary:'auto'};
 }
 const response=await fetch(config.baseUrl+(chat?'/chat/completions':'/responses'),{method:'POST',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify(body),signal,redirect:'error'});
 if(!response.ok){await response.body?.cancel();throw Object.assign(Error('PROVIDER_REJECTED'),{definitive:true});}
 if(onProgress&&response.headers.get('content-type')?.includes('text/event-stream'))return require('./provider-stream.cjs').readStructuredStream(response,{chat,signal,onProgress,reasoning:config.reasoningSummary!==false});
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>256*1024)throw Error('Response too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(Error('INVALID_OUTPUT'),{definitive:true});}
 if(data.choices?.[0]?.finish_reason==='length'||data.incomplete_details?.reason==='max_output_tokens')throw Object.assign(Error('OUTPUT_LIMIT'),{definitive:true});
 if(data.status&&data.status!=='completed'||data.choices?.[0]?.finish_reason&&data.choices[0].finish_reason!=='stop')throw Object.assign(Error('INVALID_OUTPUT'),{definitive:true});
 const text=chat?data.choices?.[0]?.message?.content:(data.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(onProgress&&config.reasoningSummary!==false){
  const reasoning=chat?(data.choices?.[0]?.message?.reasoning_content||data.choices?.[0]?.message?.reasoning||''):(data.output||[]).filter(i=>i.type==='reasoning').flatMap(i=>i.summary||[]).map(c=>c.text||'').join('\n');
  if(reasoning)await onProgress({phase:'responding',reasoning,reasoningFormat:chat?'text':'summary'});
 }
 try{return JSON.parse(text);}catch{throw Object.assign(Error('INVALID_OUTPUT'),{definitive:true});}
}
module.exports={generate};
