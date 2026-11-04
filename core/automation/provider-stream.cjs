const {readSSE}=require('../../electron/chat-bridge.cjs');
const {parseStructuredOutput,outputError}=require('./structured-output.cjs');
const invalid=code=>Object.assign(Error(code),{definitive:true});
// SSE repeats IDs, model metadata and sometimes usage on every token. The
// transfer budget must allow this overhead independently of the retained text.
// 32 MiB leaves headroom for the adapter's maximum 16K-token request; decoded
// reasoning and structured output still each have a 256K-character ceiling.
const MAX_STREAM_BYTES=32*1024*1024,MAX_TEXT_CHARACTERS=256*1024;

// Stream only model-supplied reasoning and transport phases. Partial JSON is
// never applied as a decision, question or delegation.
async function readStructuredStream(response,{chat,signal,onProgress,reasoning=true}){
 let content='',thought='',format='summary',finished=false,bytes=0,phase='waiting',receivedCharacters=0;
 const report=()=>onProgress({phase,reasoning:thought,reasoningFormat:format,receivedCharacters});
 async function* bounded(){
  const reader=response.body.getReader();
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_STREAM_BYTES)throw invalid('Response too large');yield value;}}
  finally{await reader.cancel().catch(()=>{});}
 }
 const appendThought=(text,kind)=>{if(typeof text==='string'&&text){receivedCharacters+=text.length;if(reasoning){thought+=text;format=kind;phase='reasoning';}}};
 for await(const raw of readSSE(bounded())){
  signal?.throwIfAborted();
  if(raw==='[DONE]')break;
  let event;try{event=JSON.parse(raw);}catch{throw outputError('invalid-event',raw.length,'transport');}
  if(!event||typeof event!=='object')throw outputError('invalid-event',raw.length,'transport');
  if(event.error||['error','response.failed'].includes(event.type))throw invalid('PROVIDER_REJECTED');
  if(chat){
   const choice=event.choices?.[0],delta=choice?.delta||{};
   if(delta.refusal)throw invalid('MODEL_REFUSAL');
   appendThought([delta.reasoning_content,delta.reasoning,delta.reasoning_text].find(v=>typeof v==='string'&&v),'text');
   if(typeof delta.content==='string'&&delta.content){content+=delta.content;receivedCharacters+=delta.content.length;phase='responding';}
   if(choice?.finish_reason){if(choice.finish_reason==='length')throw invalid('OUTPUT_LIMIT');if(choice.finish_reason!=='stop')throw outputError('unexpected-finish',content.length,'completion');finished=true;}
  }else{
   if(event.type==='response.refusal.delta'||event.type==='response.refusal.done')throw invalid('MODEL_REFUSAL');
   if(event.type==='response.reasoning_summary_text.delta')appendThought(event.delta,'summary');
   if(event.type==='response.reasoning_text.delta')appendThought(event.delta,'text');
   if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){content+=event.delta;receivedCharacters+=event.delta.length;phase='responding';}
   if(event.type==='response.incomplete'){if(event.response?.incomplete_details?.reason==='max_output_tokens')throw invalid('OUTPUT_LIMIT');throw outputError('incomplete-response',content.length,'completion');}
   if(event.type==='response.completed'){
    const data=event.response;if(data?.status!=='completed')throw outputError('unexpected-finish',content.length,'completion');
    if((data.output||[]).some(i=>(i.content||[]).some(c=>c.type==='refusal')))throw invalid('MODEL_REFUSAL');
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
 return parseStructuredOutput(content);
}
module.exports={readStructuredStream};
