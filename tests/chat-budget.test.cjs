const {test}=require('node:test'),assert=require('node:assert/strict');
const {startChatBridge}=require('../electron/chat-bridge.cjs');
const frame=value=>'data: '+JSON.stringify(value)+'\n\n';
const answer=(delta,finish)=>new Response(frame({choices:[{delta,finish_reason:finish}]})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
async function fixture(t,respond,{profile='chat',passthrough=false,config={}}={}){
 const original=global.fetch,requests=[],diagnostics=[],usage=[];
 global.fetch=async(url,options)=>{if(!String(url).startsWith('https://budget.fixture'))return original(url,options);const body=JSON.parse(options.body);requests.push(body);return respond(body,requests.length,options.signal);};
 const bridge=await startChatBridge({baseUrl:'https://budget.fixture/v1',model:'deepseek-test',...config},'budget-test',passthrough,d=>diagnostics.push(d),u=>usage.push(u),{profile});
 t.after(()=>{bridge.close();global.fetch=original;});
 const send=async(data={},signal)=>{const result=await original(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:JSON.stringify({model:'deepseek-test',input:'Check supplied data only.',...data}),signal});return {status:result.status,text:await result.text()};};
 return {requests,diagnostics,usage,send,bridge};
}
for(const profile of ['chat','expert'])test(profile+' retries reasoning-only exhaustion once using shared budget',async t=>{
 const f=await fixture(t,(_body,n)=>n===1?answer({reasoning_content:'thinking'},'length'):answer({content:'15'},'stop'),{profile});
 const result=await f.send();assert.deepEqual(f.requests.map(r=>r.max_tokens),[32768,65536]);assert.match(result.text,/response.completed/);assert.equal(f.diagnostics[0].outputLimitRetried,true);assert.equal(f.usage.filter(u=>u.status==='running').length,2);
});
test('truncated tool batch is discarded and only the complete retry reaches the executor',async t=>{
 const f=await fixture(t,(_b,n)=>answer({tool_calls:[{index:0,id:n===1?'bad':'good',function:{name:'check',arguments:n===1?'{"value":':'{"value":15}'}}]},n===1?'length':'tool_calls'));
 const r=await f.send({tools:[{type:'function',name:'check',parameters:{type:'object'}}]});
 assert.equal(f.requests.length,2);assert.ok(!r.text.includes('"call_id":"bad"'));assert.match(r.text,/"call_id":"good"/);assert.match(r.text,/response.completed/);
});
test('partial visible text is preserved, never silently replayed',async t=>{
 const f=await fixture(t,()=>answer({content:'Partial result'},'length'));
 const r=await f.send();assert.equal(f.requests.length,1);assert.match(r.text,/response.incomplete/);assert.equal(f.diagnostics[0].outputRecovery,'visible-output-preserved');
});
test('configured capacity prevents futile retries and incomplete calls never escape',async t=>{
 const f=await fixture(t,()=>answer({tool_calls:[{index:0,id:'bad',function:{name:'check',arguments:'{'}}]},'length'),{config:{effectiveLimits:{maxOutputTokens:8000}}});
 const r=await f.send({tools:[{type:'function',name:'check'}]});assert.equal(f.requests.length,1);assert.equal(f.requests[0].max_tokens,8000);assert.ok(!r.text.includes('"type":"function_call"'));assert.match(r.text,/未执行/);
});
test('Responses passthrough shares capacity limits without replaying exposed events',async t=>{
 const f=await fixture(t,()=>new Response(frame({type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}}),{headers:{'content-type':'text/event-stream'}}),{passthrough:true,config:{effectiveLimits:{maxOutputTokens:10000}}});
 const r=await f.send();assert.equal(f.requests[0].max_output_tokens,10000);assert.equal(f.requests.length,1);assert.match(r.text,/response.incomplete/);
});
test('tool name correction and budget recovery share a bounded three-request loop',async t=>{
 const f=await fixture(t,(_b,n)=>answer({tool_calls:[{index:0,id:'c'+n,function:{name:n===1?'unknown':'check',arguments:n===2?'{':'{}'}}]},n===2?'length':'tool_calls'));
 const r=await f.send({tools:[{type:'function',name:'check'}]});assert.equal(f.requests.length,3);assert.deepEqual(f.requests.map(r=>r.max_tokens),[32768,32768,65536]);assert.match(r.text,/response.completed/);assert.equal(f.diagnostics[0].toolCorrectionAttempts,1);
});
test('context exhaustion is rejected before any provider call',async t=>{
 const f=await fixture(t,()=>{throw Error('must not call');},{config:{effectiveLimits:{contextWindow:100}}});
 const r=await f.send({input:'context '.repeat(200)});assert.equal(f.requests.length,0);assert.equal(r.status,502);assert.match(r.text,/上下文容量不足/);
});
test('closing chat during exhaustion cancels recovery and leaves tools unexposed',async t=>{
 let f;
 f=await fixture(t,()=>new Response(new ReadableStream({start(controller){
  controller.enqueue(Buffer.from(frame({choices:[{delta:{reasoning_content:'pending'},finish_reason:null}]})));
  setImmediate(()=>{f.bridge.close();controller.close();});
 }}),{headers:{'content-type':'text/event-stream'}}));
 await f.send().catch(()=>{});assert.equal(f.requests.length,1);
});
test('diagnostic export keeps budget provenance and excludes arbitrary capacity metadata',()=>{
 const {diagnosticReport}=require('../electron/run-diagnostics.cjs');
 const report=diagnosticReport({modelRequests:[{budget:{profile:'expert',maxOutputTokens:32768,source:'discovered',private:'PRIVATE'},outputBudgets:[32768,65536,'PRIVATE'],outputLimitRetried:true}]},'test');
 assert.equal(report.requests[0].budget.source,'discovered');assert.deepEqual(report.requests[0].outputBudgets,[32768,65536]);assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
