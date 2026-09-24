const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {startChatBridge}=require('../electron/chat-bridge.cjs');

test('Router headers survive streaming, follow-up, retry and bridge recreation in both protocols',async()=>{
 const received=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);assert.equal(body.max_output_tokens||body.max_tokens,1234);
  received.push({url:req.url,headers:req.headers});
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(req.url.endsWith('/responses')?'event: response.completed\ndata: {"type":"response.completed"}\n\n':'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const passthrough of [false,true]){
   const sessionId=randomUUID();
   for(let restart=0;restart<2;restart++){
    const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'fixture-secret',effectiveLimits:{maxOutputTokens:1234}},sessionId,passthrough);
    try{
     for(let attempt=0;attempt<3;attempt++){
      const result=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:'test',stream:true})});
      assert.match(await result.text(),/response.completed/);
      const record=received.at(-1);
      assert.equal(record.headers['x-model-client'],'atelier-codex');
      assert.equal(record.headers['x-model-session-id'],sessionId);
      assert.equal(record.headers.authorization,'Bearer fixture-secret');
      assert.equal(record.url,passthrough?'/v1/responses':'/v1/chat/completions');
     }
    }finally{bridge.close();}
   }
  }
  assert.equal(new Set(received.map(r=>r.headers['x-request-id'])).size,12);
  assert.equal(new Set(received.map(r=>r.headers['x-model-session-id'])).size,2);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('incomplete upstream stream retains request correlation and completion diagnostics',async()=>{
 const server=http.createServer(async(req,res)=>{
  for await(const chunk of req)void chunk;
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end('data: {"choices":[{"delta":{"content":"private-text"}}]}\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const records=[];
 const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}/v1`},randomUUID(),false,d=>records.push(d));
 try{
  const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:'private-prompt'})});
  await response.text();
  assert.equal(records.length,1);
  assert.equal(records[0].stage,'validate_completion');
  assert.equal(records[0].httpStatus,200);
  assert.equal(records[0].done,false);
  assert.equal(records[0].failed,true);
  assert.ok(records[0].requestId);
  assert.equal(JSON.stringify(records).includes('private-'),false);
 }finally{bridge.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('upstream errors preserve status and bounded sanitized detail in both protocols',async()=>{
 const server=http.createServer(async(req,res)=>{
  for await(const chunk of req)void chunk;
  res.writeHead(400,{'Content-Type':'application/json'});
  res.end(JSON.stringify({error:{code:'context_length_exceeded',message:'Maximum context length exceeded; fixture-secret Bearer other-secret data:image/png;base64,'+'A'.repeat(1000)}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const passthrough of [false,true]){
  const records=[];const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'fixture-secret'},randomUUID(),passthrough,d=>records.push(d));
  try{
   const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:'private-prompt'})});
   const result=await response.json();assert.equal(response.status,400);assert.equal(result.error.code,'context_length_exceeded');assert.match(result.error.message,/上下文超限/);
   assert.equal(records[0].httpStatus,400);assert.equal(records[0].failed,true);assert.equal(records[0].errorCategory,'context_length_exceeded');
   assert.ok(records[0].requestBytes>0);
   const retained=JSON.stringify({records,result});for(const value of ['fixture-secret','other-secret','base64','AAAA','private-prompt'])assert.ok(!retained.includes(value),value);
  }finally{bridge.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('old image history can resume through a recreated bridge without base64 tool text',async()=>{
 const requests=[];const image='data:image/png;base64,AA==';
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;requests.push(JSON.parse(raw));
  res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"resumed"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(let restart=0;restart<2;restart++){
  const records=[];const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}`,model:'fixture',modelImageInputs:{fixture:'supported'}},'restored-session',false,d=>records.push(d));
  try{
   const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:[{type:'function_call',name:'view_image',call_id:'old',arguments:'{}'},{type:'function_call_output',call_id:'old',output:[{type:'input_image',image_url:image}]},{role:'user',content:'Continue.'}]})});
   assert.match(await response.text(),/response.completed/);
   assert.equal(records[0].imageCount,1);assert.equal(records[0].messageCount,4);
   assert.ok(!requests.at(-1).messages.find(m=>m.role==='tool').content.includes('base64'));
   assert.equal(requests.at(-1).messages[2].content[1].image_url.url,image);
  }finally{bridge.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('unsupported image and non-JSON gateway errors remain actionable without retaining raw bodies',async()=>{
 let mode='image';const records=[];
 const server=http.createServer(async(req,res)=>{
  for await(const chunk of req)void chunk;
  res.writeHead(mode==='image'?400:503,{'Content-Type':mode==='image'?'application/json':'text/html'});
  res.end(mode==='image'?JSON.stringify({error:{code:'invalid_request_error',message:'This model does not support image input'}}):'<html>private-gateway-content'+'x'.repeat(20000));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}`},randomUUID(),false,d=>records.push(d));
 try{
  const options={method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:'test'})};
  let response=await fetch(bridge.config.baseUrl+'/responses',options);
  assert.equal(response.status,400);assert.match((await response.json()).error.message,/图片请求/);
  assert.equal(records.at(-1).errorCategory,'image_request_error');
  mode='html';response=await fetch(bridge.config.baseUrl+'/responses',options);
  assert.equal(response.status,503);assert.match((await response.json()).error.message,/请求被模型服务拒绝/);
  assert.ok(!JSON.stringify(records).includes('private-gateway-content'));
  response=await fetch(bridge.config.baseUrl+'/responses',{...options,headers:{}});assert.equal(response.status,401);await response.text();
  response=await fetch(bridge.config.baseUrl+'/invalid',options);assert.equal(response.status,404);await response.text();
 }finally{bridge.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('tool-free compaction and filtered requests do not send orphan tool selection in either protocol',async()=>{
 const received=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);received.push(body);
  if(!body.tools?.length&&('tool_choice' in body||'parallel_tool_calls' in body)){
   res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'When using tool_choice, tools must be set.'}}));return;
  }
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(req.url.endsWith('/responses')?'event: response.completed\ndata: {"type":"response.completed"}\n\n':'data: {"choices":[{"delta":{"content":"summary"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const passthrough of [false,true])for(const capability of ['supported','unsupported']){
  const bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}`,model:'fixture',modelImageInputs:{fixture:capability}},'tool-free-compaction',passthrough);
  try{for(const tools of [undefined,[],[{type:'function',name:'view_image'}],[{type:'function',name:'exec_command'}]]){
   const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'fixture',input:'Summarize previous work.',tools,tool_choice:'none',parallel_tool_calls:false})});
   assert.equal(response.status,200);assert.match(await response.text(),/response.completed/);
   const body=received.at(-1);
   if(body.tools?.length)assert.equal(body.tool_choice,'none');
   else{assert.equal(Object.hasOwn(body,'tool_choice'),false);assert.equal(Object.hasOwn(body,'parallel_tool_calls'),false);}
  }}finally{bridge.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
