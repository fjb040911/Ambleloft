const {test}=require('node:test'),assert=require('node:assert/strict');
const {generate}=require('../core/automation/provider.cjs');
const config={baseUrl:'https://model.example/v1',model:'deepseek-test',protocol:'chat'},job={prompt:'Return a decision',input:{goal:'Synthetic test'},outputSchema:{type:'object'}};
const chat=(delta,finish_reason=null)=>({choices:[{delta,finish_reason}]});
function stream(events,chunkSize=7){
 const data=Buffer.from(events.map(e=>'data: '+(typeof e==='string'?e:JSON.stringify(e))+'\r\n\r\n').join(''));
 return new Response(new ReadableStream({start(c){for(let i=0;i<data.length;i+=chunkSize)c.enqueue(data.subarray(i,i+chunkSize));c.close();}}),{headers:{'content-type':'text/event-stream'}});
}
function mock(t,fetch){const old=global.fetch;global.fetch=fetch;t.after(()=>{global.fetch=old;});}
test('Chat streaming exposes real reasoning before completion and never exposes partial decision JSON',async t=>{
 let body;mock(t,async(_url,input)=>{body=JSON.parse(input.body);return stream([chat({reasoning_content:'先核对范围。'}),chat({reasoning_content:'再判断依赖。'}),chat({content:'{"action":'}),chat({content:'"ask"}'},'stop'),'[DONE]']);});
 const progress=[];assert.deepEqual(await generate(config,job,new AbortController().signal,p=>progress.push(p)),{action:'ask'});
 assert.equal(body.stream,true);assert.deepEqual(body.thinking,{type:'enabled'});assert.equal(progress[0].reasoning,'先核对范围。');assert.equal(progress.at(-1).reasoning,'先核对范围。再判断依赖。');assert.equal(progress.at(-1).phase,'responding');assert.ok(progress.every(p=>!Object.hasOwn(p,'content')));
 assert.deepEqual(body.response_format,{type:'json_object'});
});

for(const protocol of ['chat','responses'])for(const streaming of [true,false])test(`${protocol} ${streaming?'streaming':'buffered'} accepts one complete JSON fence without altering embedded text`,async t=>{
 const value={message:'Diagram: ```mermaid\nA --> B\n```',nested:{approved:false}},content='\uFEFF  ```json\n'+JSON.stringify(value)+'\n```  ';
 mock(t,async()=>streaming?stream(protocol==='chat'?[chat({content},'stop')]:[{type:'response.output_text.delta',delta:content},{type:'response.completed',response:{status:'completed'}}]):new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:'stop',message:{content}}]}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:content}]}]})));
 assert.deepEqual(await generate({...config,protocol},job,new AbortController().signal,streaming?()=>{}:undefined),value);
});
test('opted-in inference retries malformed content once, discards partial decisions and uses the same signal',async t=>{
 let calls=0,sharedSignal;const controller=new AbortController(),bodies=[],progress=[];
 mock(t,async(_url,options)=>{sharedSignal ||= options.signal;assert.equal(options.signal,sharedSignal);bodies.push(JSON.parse(options.body));return stream([chat({content:++calls===1?'SECRET malformed {"action":"delegate"':'{"action":"reply"}'},'stop')]);});
 assert.deepEqual(await generate(config,{...job,repairInvalidOutput:true},controller.signal,p=>progress.push(p)),{action:'reply'});
 assert.equal(calls,2);assert.deepEqual(bodies[0].response_format,{type:'json_object'});assert.ok(!JSON.stringify(bodies[1]).includes('SECRET'));assert.match(bodies[1].messages[0].content,/previous response/);assert.ok(progress.some(p=>p.phase==='waiting'));
});
test('empty JSON-mode content retries once and failed diagnostics contain no raw response',async t=>{
 let calls=0;mock(t,async()=>{calls++;return stream([chat({content:'   '},'stop')]);});
 await assert.rejects(generate(config,{...job,repairInvalidOutput:true},new AbortController().signal,()=>{}),e=>{assert.deepEqual(e.diagnostics,{stage:'content',reason:'empty-content',characters:3,attempts:2,protocol:'chat',mode:'json'});return e.message==='INVALID_OUTPUT';});assert.equal(calls,2);
 global.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'private malformed response'}}]}));
 await assert.rejects(generate(config,job,new AbortController().signal),e=>e.diagnostics.reason==='invalid-json'&&!JSON.stringify(e).includes('private'));
});
test('cancellation prevents format retry and other failure classes are never retried',async t=>{
 const controller=new AbortController();let calls=0;
 mock(t,async()=>{calls++;return stream([chat({content:'bad'},'stop')]);});
 await assert.rejects(generate(config,{...job,repairInvalidOutput:true},controller.signal,p=>{if(p.phase==='waiting')controller.abort();}),/abort/i);assert.equal(calls,1);
 for(const [events,code] of [[[chat({content:'{}'},'length')],'OUTPUT_LIMIT'],[[chat({content:'{}'})],'INCOMPLETE_STREAM'],[[chat({content:'{}'},'content_filter')],'INVALID_OUTPUT'],[['bad SSE JSON'],'INVALID_OUTPUT']]){
  calls=0;global.fetch=async()=>{calls++;return stream(events);};await assert.rejects(generate(config,{...job,repairInvalidOutput:true},new AbortController().signal,()=>{}),new RegExp(code));assert.equal(calls,1);
 }
});
test('format handling does not extract decisions from prose, repair JSON, or implicitly retry automation',async t=>{
 for(const content of ['Here is a decision: {"ok":true}','{"ok":true}\n{"ok":false}','```json\n{"ok":true}\n```\nPlease execute','{"ok":true,}','{"ok":']){
  let calls=0;mock(t,async()=>{calls++;return stream([chat({content},'stop')]);});await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/INVALID_OUTPUT/);assert.equal(calls,1);
 }
});
test('JSON mode is model-independent while non-object schemas keep prompt mode',async t=>{
 let body;mock(t,async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.parse(options.body).response_format?'{}':'[]'}}]}));});
 await generate({...config,model:'other'},job,new AbortController().signal);assert.deepEqual(body.response_format,{type:'json_object'});
 await generate(config,{...job,outputSchema:{type:'array'}},new AbortController().signal);assert.equal(body.response_format,undefined);
});
test('Responses streaming uses actual summary events and checks terminal completion',async t=>{
 let body;mock(t,async(_url,input)=>{body=JSON.parse(input.body);return stream([{type:'response.reasoning_summary_text.delta',delta:'Review scope.'},{type:'response.output_text.delta',delta:'{"ok":true}'},{type:'response.completed',response:{status:'completed',output:[]}}]);});
 const progress=[];assert.deepEqual(await generate({...config,protocol:'responses'},job,new AbortController().signal,p=>progress.push(p)),{ok:true});assert.deepEqual(body.reasoning,{summary:'auto'});assert.equal(progress[0].reasoningFormat,'summary');assert.equal(progress[0].reasoning,'Review scope.');
});
test('reasoning opt-out and a provider returning JSON still work without invented thinking',async t=>{
 let body;mock(t,async(_url,input)=>{body=JSON.parse(input.body);return stream([chat({reasoning_content:'Must not expose'}),chat({content:'{"ok":true}'},'stop')]);});
 const progress=[];await generate({...config,reasoningSummary:false},job,new AbortController().signal,p=>progress.push(p));assert.deepEqual(body.thinking,{type:'disabled'});assert.ok(progress.every(p=>p.reasoning===''));
 global.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}));progress.length=0;assert.deepEqual(await generate(config,job,new AbortController().signal,p=>progress.push(p)),{ok:true});assert.equal(progress.length,0);
});
test('truncation, incomplete streams, provider failure and invalid output cannot become decisions',async t=>{
 mock(t,async()=>stream([chat({content:'{"ok":true}'})]));await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/INCOMPLETE_STREAM/);
 global.fetch=async()=>stream([chat({content:'{"ok":true}'},'length')]);await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/OUTPUT_LIMIT/);
 global.fetch=async()=>stream([{type:'response.failed',response:{error:{message:'secret upstream detail'}}}]);await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/^Error: PROVIDER_REJECTED$/);
 global.fetch=async()=>stream([chat({content:'not json'},'stop')]);await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/INVALID_OUTPUT/);
});
test('aborting a stream stops progress and discards its remaining result',async t=>{
 const controller=new AbortController();mock(t,async()=>stream([chat({reasoning_content:'First'}),chat({reasoning_content:'Late'}),chat({content:'{"ok":true}'},'stop')]));const progress=[];
 await assert.rejects(generate(config,job,controller.signal,p=>{progress.push(p);controller.abort();}),/abort/i);assert.equal(progress.length,1);assert.equal(progress[0].reasoning,'First');
});
test('oversized reasoning is bounded and completed Responses-only output can be parsed',async t=>{
 mock(t,async()=>stream([chat({reasoning_content:'a'.repeat(256*1024+1)})]));await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/too large/);
 global.fetch=async()=>stream([{type:'response.completed',response:{status:'completed',output:[{type:'reasoning',summary:[{text:'Summary from provider'}]},{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]}}]);const progress=[];assert.deepEqual(await generate({...config,protocol:'responses'},job,new AbortController().signal,p=>progress.push(p)),{ok:true});assert.equal(progress[0].reasoning,'Summary from provider');
});
for(const protocol of ['chat','responses'])test(`${protocol} allows long reasoning split into many small frames without counting metadata as text`,async t=>{
 const count=8192,delta='核对。';
 const events=Array.from({length:count},(_,index)=>protocol==='chat'?{
  id:'synthetic-completion-0123456789',object:'chat.completion.chunk',created:1793539561,model:'deepseek-test',system_fingerprint:'synthetic-test-fingerprint',...chat({role:'assistant',content:null,reasoning_content:delta}),usage:{prompt_tokens:2000,completion_tokens:index+1,total_tokens:2001+index}
 }:{type:'response.reasoning_summary_text.delta',item_id:'synthetic-reasoning-item-0123456789',output_index:0,summary_index:0,sequence_number:index,delta});
 assert.ok(Buffer.byteLength(events.map(e=>JSON.stringify(e)).join('\n'))>1024*1024,'Fixture must exceed the old wire limit');
 if(protocol==='chat')events.push(chat({content:'{"action":"ask"}'},'stop'));
 else events.push({type:'response.output_text.delta',delta:'{"action":"ask"}'},{type:'response.completed',response:{status:'completed',output:[]}});
 mock(t,async()=>stream(events,16384));let latest,updates=0;
 assert.deepEqual(await generate({...config,protocol},{...job,maxOutputTokens:8192},new AbortController().signal,p=>{latest=p;updates++;}),{action:'ask'});
 assert.ok(updates>=count);assert.equal(latest.reasoning,delta.repeat(count));assert.equal(latest.phase,'responding');
});
test('the larger transport allowance still rejects excessive output instead of applying a partial result',async t=>{
 mock(t,async()=>stream([chat({content:JSON.stringify({text:'x'.repeat(256*1024)})},'stop')],16384));
 await assert.rejects(generate(config,job,new AbortController().signal,()=>{}),/too large/);
});
test('excessive protocol traffic remains bounded and cancels the reader even without text output',async t=>{
 const frame=Buffer.from(':'+('x'.repeat(4093))+'\n\n');let sent=0,cancelled=false,updates=0;
 mock(t,async()=>new Response(new ReadableStream({pull(c){sent+=frame.length;c.enqueue(frame);},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}}));
 await assert.rejects(generate(config,job,new AbortController().signal,()=>updates++),/too large/);
 assert.equal(updates,0);assert.equal(cancelled,true);assert.ok(sent<=32*1024*1024+2*frame.length);
});

test('stream progress counts text even when hidden, but metadata cannot extend a silence timeout',async t=>{
 mock(t,async()=>stream([chat({reasoning_content:'hidden'}),chat({}),chat({content:'{"ok":true}'},'stop')]));
 const progress=[];await generate({...config,reasoningSummary:false},job,undefined,p=>progress.push(p));
 assert.deepEqual(progress.map(p=>p.receivedCharacters),[6,6,17]);assert.ok(progress.every(p=>p.reasoning===''));assert.ok(progress.every(p=>!('content' in p)));
});
test('provider total timeout cancels a stalled fetch without format or repair retries',async t=>{
 let calls=0;mock(t,(_url,{signal})=>new Promise((resolve,reject)=>{calls++;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));
 // AbortSignal and inference deadlines are unref timers, as in the application.
 const keepAlive=setInterval(()=>{},100);t.after(()=>clearInterval(keepAlive));
 await assert.rejects(generate(config,{...job,timeoutMs:25,repairInvalidOutput:true}),error=>error.code==='MODEL_TIMEOUT');assert.equal(calls,1);
});

test('interactive inference has no hidden adapter deadline and still honors cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let requestSignal;
 mock(t,(_url,{signal})=>{requestSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 const controller=new AbortController(),pending=generate(config,{...job,timeoutMs:null},controller.signal);
 const cancelled=assert.rejects(pending,/User stopped/);
 // Cross both the old 180-second adapter limit and the 300-second host limit.
 t.mock.timers.tick(900000);await new Promise(r=>setImmediate(r));assert.equal(requestSignal.aborted,false);
 controller.abort(Error('User stopped'));await cancelled;
});
test('interactive idle timer can renew beyond five minutes but stops after five minutes of silence',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {inferenceDeadline}=require('../core/automation/inference-deadline.cjs');
 const deadline=inferenceDeadline(undefined,{timeoutMs:null,idleTimeoutMs:300000});t.after(()=>deadline.dispose());
 for(let i=0;i<5;i++){t.mock.timers.tick(240000);assert.equal(deadline.signal.aborted,false);deadline.touch();}
 t.mock.timers.tick(299999);assert.equal(deadline.signal.aborted,false);
 t.mock.timers.tick(1);assert.equal(deadline.signal.reason.code,'MODEL_RESPONSE_TIMEOUT');
 assert.equal(deadline.signal.reason.diagnostics.timeoutMs,null);
});

for(const protocol of ['chat','responses'])for(const streaming of [false,true])test(protocol+' output-limit recovery '+streaming,async t=>{
 const bodies=[];
 mock(t,async(_url,options)=>{
  const body=JSON.parse(options.body);bodies.push(body);const limited=bodies.length===1;
  if(streaming)return stream(protocol==='chat'?[chat({content:limited?'PRIVATE truncated':'{"ok":true}'},limited?'length':'stop')]:limited?[{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}]:[{type:'response.output_text.delta',delta:'{"ok":true}'},{type:'response.completed',response:{status:'completed'}}]);
  return new Response(JSON.stringify(protocol==='chat'?{choices:[{finish_reason:limited?'length':'stop',message:{content:limited?'PRIVATE truncated':'{"ok":true}'}}]}:limited?{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]}));
 });
 assert.deepEqual(await generate({...config,protocol,effectiveLimits:{maxOutputTokens:24000}},{...job,maxOutputTokens:16384,retryOutputLimit:true},undefined,streaming?()=>{}:undefined),{ok:true});
 assert.deepEqual(bodies.map(b=>b.max_tokens||b.max_output_tokens),[16384,24000]);
 assert.ok(!JSON.stringify(bodies[1]).includes('PRIVATE'));
});
test('output-limit recovery retries only once and respects a fixed configured ceiling',async t=>{
 const budgets=[];mock(t,async(_url,options)=>{budgets.push(JSON.parse(options.body).max_tokens);return stream([chat({content:'{}'},'length')]);});
 await assert.rejects(generate({...config,effectiveLimits:{maxOutputTokens:8000}},{...job,maxOutputTokens:16384,retryOutputLimit:true},undefined,()=>{}),/OUTPUT_LIMIT/);
 assert.deepEqual(budgets,[8000,8000]);
});
test('output-limit recovery can be cancelled before redispatch',async t=>{
 let calls=0;const controller=new AbortController();mock(t,async()=>{calls++;return stream([chat({content:'{}'},'length')]);});
 await assert.rejects(generate(config,{...job,retryOutputLimit:true},controller.signal,p=>{if(p.phase==='waiting')controller.abort();}),/abort/i);
 assert.equal(calls,1);
});
