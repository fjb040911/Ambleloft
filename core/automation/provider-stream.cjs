const {readSSE}=require('../../electron/chat-bridge.cjs');
const invalid=code=>Object.assign(Error(code),{definitive:true});
// SSE repeats IDs, model metadata and sometimes usage on every token. The
// transfer budget must allow this overhead independently of the retained text.
// 32 MiB leaves headroom for the adapter's maximum 16K-token request; decoded
// reasoning and structured output still each have a 256K-character ceiling.
const MAX_STREAM_BYTES=32*1024*1024,MAX_TEXT_CHARACTERS=256*1024;

// Stream only model-supplied reasoning and transport phases. Partial JSON is
// never applied as a decision, question or delegation.
async function readStructuredStream(response,{chat,signal,onProgress,reasoning=true}){
 let content='',thought='',format='summary',finished=false,bytes=0,phase='waiting';
 const report=()=>onProgress({phase,reasoning:thought,reasoningFormat:format});
 async function* bounded(){
  const reader=response.body.getReader();
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_STREAM_BYTES)throw invalid('Response too large');yield value;}}
  finally{await reader.cancel().catch(()=>{});}
 }
 const appendThought=(text,kind)=>{if(reasoning&&typeof text==='string'&&text){thought+=text;format=kind;phase='reasoning';}};
 for await(const raw of readSSE(bounded())){
  signal?.throwIfAborted();
  if(raw==='[DONE]')break;
  let event;try{event=JSON.parse(raw);}catch{throw invalid('INVALID_OUTPUT');}
  if(event.error||['error','response.failed'].includes(event.type))throw invalid('PROVIDER_REJECTED');
  if(chat){
   const choice=event.choices?.[0],delta=choice?.delta||{};
   appendThought([delta.reasoning_content,delta.reasoning,delta.reasoning_text].find(v=>typeof v==='string'&&v),'text');
   if(typeof delta.content==='string'&&delta.content){content+=delta.content;phase='responding';}
   if(choice?.finish_reason){if(choice.finish_reason==='length')throw invalid('OUTPUT_LIMIT');if(choice.finish_reason!=='stop')throw invalid('INVALID_OUTPUT');finished=true;}
  }else{
   if(event.type==='response.reasoning_summary_text.delta')appendThought(event.delta,'summary');
   if(event.type==='response.reasoning_text.delta')appendThought(event.delta,'text');
   if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){content+=event.delta;phase='responding';}
   if(event.type==='response.incomplete')throw invalid(event.response?.incomplete_details?.reason==='max_output_tokens'?'OUTPUT_LIMIT':'INVALID_OUTPUT');
   if(event.type==='response.completed'){
    const data=event.response;if(data?.status!=='completed')throw invalid('INVALID_OUTPUT');
    if(!content)content=(data.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    if(!thought)for(const item of data.output||[])if(item.type==='reasoning')appendThought((item.summary||[]).map(c=>c.text||'').join('\n'),'summary');
    finished=true;phase='responding';
   }
  }
  if(content.length>MAX_TEXT_CHARACTERS||thought.length>MAX_TEXT_CHARACTERS)throw invalid('Response too large');
  await report();
 }
 signal?.throwIfAborted();
 if(!finished)throw invalid('INCOMPLETE_STREAM');
 try{return JSON.parse(content);}catch{throw invalid('INVALID_OUTPUT');}
}
module.exports={readStructuredStream};
