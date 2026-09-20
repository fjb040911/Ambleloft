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
