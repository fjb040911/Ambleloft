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
