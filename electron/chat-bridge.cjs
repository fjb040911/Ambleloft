const {applyImageInputPolicy}=require('./model-capabilities.cjs');
// Protocol translation only. Codex owns the agent loop, tools and approvals.
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');
const usesChat = config => config.protocol === 'chat' || ((!config.protocol || config.protocol === 'auto') && /^deepseek/i.test(config.model));
const toolName = item => !item.namespace && /^[a-zA-Z0-9_-]{1,64}$/.test(item.name) ? item.name : String(item.name).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,32) + '_' + createHash('sha256').update((item.namespace || '') + '/' + item.name).digest('hex').slice(0,24);
// Some compatible services reject tool_choice even when it is "none" if tools
// is absent. Normalize after capability filtering and protocol translation.
function normalizeToolSelection(body) {
  if(body.tools?.length)return body;
  const {tools,tool_choice,parallel_tool_calls,...withoutTools}=body;
  return withoutTools;
}
function translateRequest(data, config) {
  data=applyImageInputPolicy(data,config);
  if(data.previous_response_id)throw new Error('协议适配需要完整会话历史，不能使用 previous_response_id');
  const definitions = new Map();
  const tools=[];
  function add(tool,namespace) {
    if(tool.type==='namespace'){for(const child of tool.tools||[])add(child,tool.name);return;}
    if(!['function','custom'].includes(tool.type))throw new Error(`此协议暂不支持工具类型：${tool.type}`);
    const entry={...tool,namespace};const name=toolName(entry);if(definitions.has(name))throw new Error('工具名称重复，无法安全映射');definitions.set(name,entry);
    tools.push({type:'function',function:{name,description:tool.description||'',parameters:tool.type==='custom'?{type:'object',properties:{input:{type:'string',description:'Complete raw input for this tool.'}},required:['input'],additionalProperties:false}:tool.parameters||{type:'object',properties:{}}}});
  }
  for(const tool of data.tools||[])add(tool);
  const messages=[];let reasoning='';
  const pendingCalls=new Set();let toolImages=[];
  const flushImages=()=>{
    if(toolImages.length){messages.push({role:'user',content:toolImages});toolImages=[];}
  };
  const imagePart=c=>({type:'image_url',image_url:{url:c.image_url,...(c.detail?{detail:c.detail}:{})}});
  if(data.instructions)messages.push({role:'system',content:data.instructions});
  for(const item of typeof data.input==='string'?[{role:'user',content:data.input}]:data.input||[]) {
    if(item.type==='reasoning'){reasoning+=(item.content?.map(c=>c.text).join('\n')||item.summary?.map(c=>c.text).join('\n')||'');continue;}
    if(['function_call','custom_tool_call'].includes(item.type)){
      const last=messages.at(-1);const message=last?.role==='assistant'?last:{role:'assistant',content:null};
      if(message!==last)messages.push(message);
      if(reasoning){message.reasoning_content=reasoning;reasoning='';}
      pendingCalls.add(item.call_id);
      message.tool_calls||=[];message.tool_calls.push({id:item.call_id,type:'function',function:{name:toolName(item),arguments:item.type==='custom_tool_call'?JSON.stringify({input:item.input}):item.arguments}});continue;
    }
    if(['function_call_output','custom_tool_call_output'].includes(item.type)){
      let content=item.output;
      if(Array.isArray(content)){
        const text=[];
        for(const part of content){
          if(['input_text','output_text','text'].includes(part.type))text.push(part.text);
          else if(part.type==='input_image'){
            // Chat tool messages cannot carry images. Attach them after all parallel
            // tool results, so no user message splits an assistant/tool exchange.
            toolImages.push({type:'text',text:`Image returned by tool call ${item.call_id}:`},imagePart(part));
            text.push('[Image attached after tool results]');
          }else throw new Error(`此协议暂不支持工具结果类型：${part.type}`);
        }
        content=text.join('\n');
      }
      messages.push({role:'tool',tool_call_id:item.call_id,content:typeof content==='string'?content:JSON.stringify(content)});
      pendingCalls.delete(item.call_id);
      if(!pendingCalls.size)flushImages();
      continue;
    }
    flushImages();
    if(item.type&&item.type!=='message')throw new Error(`此协议暂不支持输入类型：${item.type}`);
    let content=item.content;
    if(Array.isArray(content))content=content.map(c=>{
      if(['input_text','output_text','text'].includes(c.type))return {type:'text',text:c.text};
      if(c.type==='input_image')return imagePart(c);
      throw new Error(`此协议暂不支持内容类型：${c.type}`);
    });
    const message={role:item.role==='developer'?'system':item.role,content};
    if(item.role==='assistant'&&reasoning){message.reasoning_content=reasoning;reasoning='';}
    messages.push(message);
  }
  flushImages();
  const body={model:data.model,messages,stream:true,stream_options:{include_usage:true},...(tools.length?{tools}:{}),...(/^deepseek/i.test(config.model)?{thinking:{type:config.reasoningSummary===false?'disabled':'enabled'}}:{})};
  if(data.max_output_tokens)body.max_tokens=data.max_output_tokens;
  if(data.temperature!==undefined)body.temperature=data.temperature;
  if(data.tool_choice&&typeof data.tool_choice==='string')body.tool_choice=data.tool_choice;
  return {body:normalizeToolSelection(body),definitions};
}
function resolveTool(name, definitions) {
  if(definitions.has(name))return definitions.get(name);
  // Only exact aliases of tools advertised in this request; ambiguous aliases are rejected.
  const matches=[...definitions.values()].filter(tool=>name===tool.name ||
    (tool.namespace && name===tool.namespace+'.'+tool.name));
  return matches.length===1?matches[0]:undefined;
}
async function* readSSE(body) {
  const decoder=new TextDecoder();let buffer='';
  for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let end;
    while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)yield data;}
    if(buffer.length>8*1024*1024)throw new Error('模型流事件过大');
  }
  if(buffer.trim())throw new Error('模型流在事件结束前断开');
}
// Never retain the raw error body: gateways can echo credentials or image data.
function sanitizeError(value,key){
  let text=typeof value==='string'?value:'';
  if(key)text=text.split(key).join('[REDACTED]');
  return text.replace(/data:[^\s"']+/gi,'[IMAGE REDACTED]')
    .replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]+/g,'[REDACTED]')
    .replace(/[a-zA-Z0-9+/=_-]{128,}/g,'[DATA REDACTED]')
    .replace(/[\x00-\x1f\x7f]/g,' ').slice(0,600);
}
async function readUpstreamError(response,key){
  const reader=response.body?.getReader();let raw='';let size=0;let timer;
  if(reader){
    timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},3000);
    try{while(size<16384){const {done,value}=await reader.read();if(done)break;
      raw+=Buffer.from(value.subarray(0,16384-size)).toString('utf8');size+=value.length;
    }}catch{}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
  }
  let error;try{const parsed=JSON.parse(raw);error=parsed.error||parsed;}catch{}
  const message=sanitizeError(typeof error==='string'?error:error?.message,key);
  const code=sanitizeError(error?.code||error?.type,key);
  const hint=message+' '+code;
  const category=/context.{0,30}(length|window|limit)|too many tokens|maximum.{0,20}tokens/i.test(hint)?'context_length_exceeded':
    /image|vision|multimodal/i.test(hint)?'image_request_error':'upstream_error';
  const label=category==='context_length_exceeded'?'上下文超限':category==='image_request_error'?'图片请求不受支持或格式无效':'请求被模型服务拒绝';
  return {upstreamCode:code||category,errorCategory:category,upstreamMessage:message?`${label}；${message}`:label};
}
async function startChatBridge(config, sessionId = randomUUID(), passthrough = false, onDiagnostic = () => {}) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error("模型会话 ID 无效");
  const token=randomUUID();const active=new Set();
  const server=http.createServer(async(req,res)=>{
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401);res.end();return;}
    if(req.method!=='POST'||req.url!=='/v1/responses'){res.writeHead(404);res.end();return;}
    const controller=new AbortController();active.add(controller);res.on('close',()=>controller.abort());
    const diagnostic={requestId:randomUUID(),sessionId,startedAt:new Date().toISOString(),protocol:passthrough?'responses':'chat',stage:'request',events:0,done:false,finishReason:null};
    const started=performance.now();
    const report=()=>{diagnostic.durationMs=Math.round(performance.now()-started);try{onDiagnostic({...diagnostic});}catch{}};
    let seq=0;const emit=(type,fields)=>{if(!res.destroyed)res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:seq++,...fields})}\n\n`);};
    try {
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32*1024*1024)throw new Error('请求过大');}
      const data=applyImageInputPolicy(JSON.parse(raw),config);if(config.effectiveLimits?.maxOutputTokens)data.max_output_tokens=config.effectiveLimits.maxOutputTokens;const {body,definitions}=passthrough ? {body:normalizeToolSelection(data)} : translateRequest(data,config);
      const requestBody=JSON.stringify(body);
      diagnostic.requestBytes=Buffer.byteLength(requestBody);
      if(!passthrough){
        diagnostic.messageCount=body.messages.length;
        diagnostic.imageCount=body.messages.reduce((n,m)=>n+(Array.isArray(m.content)?m.content.filter(c=>c.type==='image_url').length:0),0);
      }
      if(config.effectiveLimits)diagnostic.limits={...config.effectiveLimits};
      const upstream=await fetch(config.baseUrl+(passthrough?'/responses':'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json','X-Model-Client':'atelier-codex','X-Model-Session-Id':sessionId,'X-Request-Id':diagnostic.requestId,...(config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{})},body:requestBody,redirect:'error',signal:controller.signal});
      diagnostic.httpStatus=upstream.status;diagnostic.stage='upstream_stream';
      if(!upstream.ok){
        const detail=await readUpstreamError(upstream,config.apiKey);
        Object.assign(diagnostic,detail);
        const error=new Error(`模型服务返回 HTTP ${upstream.status}：${detail.upstreamMessage}`);
        error.httpStatus=upstream.status;error.code=detail.upstreamCode;throw error;
      }
      if(passthrough){
        res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-cache'});
        for await(const chunk of upstream.body){if(res.destroyed)break;res.write(chunk);}
        diagnostic.stage='forwarded';res.end();return;
      }
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      const response={id:'resp_'+randomUUID(),object:'response',created_at:Math.floor(Date.now()/1000),model:data.model,status:'in_progress',output:[]};
      emit('response.created',{response});let reasoningItem,textItem;const calls=new Map();let finish,usage,done=false;
      const add=item=>{item.index=response.output.length;response.output.push(item);emit('response.output_item.added',{output_index:item.index,item:{...item,index:undefined}});return item;};
      for await(const rawEvent of readSSE(upstream.body)){
        if(rawEvent==='[DONE]'){done=true;diagnostic.done=true;break;}
        diagnostic.events++;diagnostic.lastEventAt=new Date().toISOString();
        const chunk=JSON.parse(rawEvent);if(chunk.error)throw new Error('模型返回流式错误');if(chunk.usage)usage=chunk.usage;
        const choice=chunk.choices?.[0];if(!choice)continue;
        if(choice.finish_reason){finish=choice.finish_reason;diagnostic.finishReason=finish;}
        const delta=choice.delta||{};
        const thought=[delta.reasoning_content,delta.reasoning,delta.reasoning_text].find(v=>typeof v==='string'&&v.length);
        if(thought){
          if(!reasoningItem)reasoningItem=add({id:'rs_'+randomUUID(),type:'reasoning',summary:[],content:[]});
          reasoningItem.content[0]||={type:'reasoning_text',text:''};reasoningItem.content[0].text+=thought;
          emit('response.reasoning_text.delta',{item_id:reasoningItem.id,output_index:reasoningItem.index,content_index:0,delta:thought});
        }
        if(delta.content){
          if(!textItem){textItem=add({id:'msg_'+randomUUID(),type:'message',role:'assistant',status:'in_progress',content:[]});emit('response.content_part.added',{item_id:textItem.id,output_index:textItem.index,content_index:0,part:{type:'output_text',text:'',annotations:[]}});}
          textItem.content[0]||={type:'output_text',text:'',annotations:[]};textItem.content[0].text+=delta.content;
          emit('response.output_text.delta',{item_id:textItem.id,output_index:textItem.index,content_index:0,delta:delta.content});
        }
        for(const call of delta.tool_calls||[]){
          const acc=calls.get(call.index)||{name:'',args:'',id:''};acc.name+=call.function?.name||'';acc.args+=call.function?.arguments||'';acc.id+=call.id||'';calls.set(call.index,acc);
        }
      }
      diagnostic.stage='validate_completion';
      if(!done||!finish)throw new Error('模型流未完整结束，请重试');
      if(!['stop','tool_calls','length'].includes(finish))throw new Error(`模型未正常完成：${finish}`);
      // Never execute a truncated tool call.
      if(finish==='length'&&calls.size)throw new Error('工具参数被输出长度限制截断，未执行');
      if(reasoningItem)emit('response.reasoning_text.done',{item_id:reasoningItem.id,output_index:reasoningItem.index,content_index:0,text:reasoningItem.content[0].text});
      if(textItem){textItem.phase=calls.size?'commentary':'final_answer';textItem.status='completed';emit('response.output_text.done',{item_id:textItem.id,output_index:textItem.index,content_index:0,text:textItem.content[0].text});emit('response.content_part.done',{item_id:textItem.id,output_index:textItem.index,content_index:0,part:textItem.content[0]});}
      diagnostic.stage='translate_tools';
      for(const call of calls.values()){
        const def=resolveTool(call.name,definitions);
        if(!def){
          const safeName=name=>/^[a-zA-Z0-9_.-]{1,160}$/.test(name)?name:'[invalid tool name]';
          diagnostic.returnedTool=safeName(call.name);
          diagnostic.availableTools=[...definitions.keys()].slice(0,100).map(safeName);
          throw new Error('模型调用了未提供或名称不唯一的工具');
        }
        const args=JSON.parse(call.args);const item={id:'fc_'+randomUUID(),call_id:call.id||randomUUID(),type:def.type==='custom'?'custom_tool_call':'function_call',name:def.name,...(def.namespace?{namespace:def.namespace}:{}),status:'completed'};
        if(def.type==='custom'){if(typeof args.input!=='string')throw new Error('工具输入无效');item.input=args.input;}else item.arguments=call.args;
        add(item);
      }
      for(const item of response.output){delete item.index;emit('response.output_item.done',{output_index:response.output.indexOf(item),item});}
      response.status=finish==='length'?'incomplete':'completed';
      if(finish==='length')response.incomplete_details={reason:'max_output_tokens'};
      response.usage={input_tokens:usage?.prompt_tokens||0,output_tokens:usage?.completion_tokens||0,total_tokens:usage?.total_tokens||0};
      emit(finish==='length'?'response.incomplete':'response.completed',{response});diagnostic.stage='completed';res.end();
    }catch(error){
      diagnostic.failed=true;diagnostic.cancelled=controller.signal.aborted;
      diagnostic.errorType=error.name;
      diagnostic.causeCode=typeof error.cause?.code==='string'?error.cause.code:undefined;
      // Error details are bounded and sanitized before they reach diagnostics.
      diagnostic.reason=error instanceof SyntaxError?'JSON 格式解析失败':/^(模型|工具|此协议|请求过大)/.test(error.message)?error.message:'连接读取或转发失败';
      report();
      if(!res.destroyed){if(res.headersSent){emit('error',{message:error.message,code:'bridge_error'});res.end();}else{res.writeHead(error.httpStatus||502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:diagnostic.reason,code:error.code||'bridge_error'}}));}}}
    finally{if(!diagnostic.failed)report();controller.abort();active.delete(controller);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {config:{...config,baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:token},close(){for(const controller of active)controller.abort();server.close();server.closeAllConnections();}};
}
module.exports={startChatBridge,translateRequest,readSSE,usesChat,resolveTool};
