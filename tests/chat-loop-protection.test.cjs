const {test}=require('node:test');
const assert=require('node:assert/strict');
const {startChatBridge}=require('../electron/chat-bridge.cjs');
const {diagnosticReport}=require('../electron/run-diagnostics.cjs');
const {PAUSE_MESSAGE}=require('../electron/tool-loop-guard.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const tools=['exec_command','write_stdin'].map(name=>({type:'function',name,parameters:{type:'object',properties:name==='exec_command'?{cmd:{type:'string'}}:{session_id:{type:'integer'},chars:{type:'string'}},required:[name==='exec_command'?'cmd':'session_id']}}));
const frame=value=>'data: '+JSON.stringify(value)+'\n\n';

for(const passthrough of [false,true])test(`${passthrough?'Responses':'Chat'}: warns, blocks before upstream, and records tool identity without content`,async t=>{
  const fetchOriginal=global.fetch,requests=[],diagnostics=[];let selected='exec_command';
  global.fetch=async(url,options)=>{
    if(!String(url).startsWith('https://fixture.invalid'))return fetchOriginal(url,options);
    const data=JSON.parse(options.body);requests.push(data);
    const args=selected==='exec_command'?{cmd:'echo PRIVATE-COMMAND'}:{session_id:8945,chars:''};
    const call={type:'function_call',id:'fc'+requests.length,call_id:'c'+requests.length,name:selected,arguments:JSON.stringify(args)};
    const text=passthrough?frame({type:'response.output_item.done',item:call})+frame({type:'response.completed',response:{status:'completed',output:[call]}}):
      frame({choices:[{delta:{tool_calls:[{index:0,id:call.call_id,function:{name:selected,arguments:call.arguments}}]},finish_reason:'tool_calls'}]})+'data: [DONE]\n\n';
    return new Response(text,{headers:{'content-type':'text/event-stream'}});
  };
  const bridge=await startChatBridge({baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'PRIVATE-KEY'},'fixture',passthrough,d=>diagnostics.push(d));
  t.after(()=>{bridge.close();global.fetch=fetchOriginal;});
  const input=[{role:'user',content:'PRIVATE-PROMPT'}];
  const send=()=>fetchOriginal(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey,'Content-Type':'application/json','thread-id':'thread'},body:JSON.stringify({model:'fixture',tools,input})});
  await (await send()).text();
  for(let i=1;i<=12;i++){
    input.push({type:'function_call',name:'exec_command',call_id:'exec'+i,arguments:JSON.stringify({cmd:'echo placeholder-'+i})},{type:'function_call_output',call_id:'exec'+i,output:'Process exited with code 0\nOutput:\nPRIVATE-OUTPUT-'+i});
    const response=await send();await response.text();
    if(i===6){assert.equal(diagnostics.at(-1).loopGuard.action,'warn');assert.match(JSON.stringify(requests.at(-1)),/host detected repeated tool calls/);}
    if(i===12)assert.equal(response.status,502);
  }
  assert.equal(requests.length,12,'the request after the twelfth no-op never reaches the provider');
  assert.equal(diagnostics.at(-1).loopGuard.action,'pause');
  input.push({role:'user',content:'Change strategy'});selected='write_stdin';
  await (await send()).text();
  assert.equal(diagnostics.at(-1).loopGuard,undefined);
  const last=diagnostics.at(-1);assert.equal(last.calls[0].returnedName,'write_stdin');assert.equal(last.calls[0].mappedName,'write_stdin');
  assert.equal(last.tools.find(t=>t.name==='write_stdin').schemaType,'object');
  const report=diagnosticReport({id:'run',model:'fixture',status:'interrupted',modelRequests:diagnostics,error:'PRIVATE-ERROR',baseUrl:'https://private'},'test');
  const json=JSON.stringify(report);for(const value of ['PRIVATE-KEY','PRIVATE-PROMPT','PRIVATE-COMMAND','PRIVATE-OUTPUT','PRIVATE-ERROR','https://private','placeholder-'])assert.ok(!json.includes(value),value);
  assert.equal(report.requests.at(-1).calls[0].mappedName,'write_stdin');
});

test('runtime interrupts once and preserves pause reason across turn-completed races',async()=>{
  const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.persist=async()=>{};runtime.changed=()=>{};
  const run={id:'run',threadId:'thread',turnId:'turn',messages:[],tools:[],approvals:[],status:'running'};
  const calls=[];let paused=0;
  const context={key:'context',run,config:{},rpc:{closed:false,close(){this.closed=true;},async call(method){calls.push(method);await runtime.finish(context,'failed','stream disconnected');}}};
  runtime.contexts.set(context.key,context);runtime.runs=[run];runtime.chatInputs={pause:async()=>{paused++;}};
  const d={requestId:'request',loopGuard:{action:'pause',count:12}};
  runtime.modelDiagnostic(context,d);runtime.modelDiagnostic(context,d);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(paused,1);assert.deepEqual(calls,['turn/interrupt']);assert.equal(run.status,'interrupted');assert.equal(run.error,PAUSE_MESSAGE);assert.equal(runtime.contexts.size,0);
});

test('diagnostic exports omit legacy sensitive fields and stay out of renderer history',()=>{
  const {pageRun,summary}=require('../electron/history-pages.cjs');
  const run={id:'r',messages:[],tools:[],modelRequests:[{requestId:'request',reason:'secret',upstreamMessage:'secret',availableTools:['secret'],body:'secret',calls:[{returnedName:'exec_command',arguments:'secret',output:'secret'}]}]};
  assert.ok(!JSON.stringify(diagnosticReport(run,'test')).includes('secret'));
  assert.equal(pageRun(run).modelRequests,undefined);assert.equal(summary(run).modelRequests,undefined);
  let published;const runtime=new AgentRuntime({directory:'/unused',publish:value=>{published=value;}});
  runtime.changed(run);clearTimeout(runtime.saveTimer);assert.equal(published.modelRequests,undefined);assert.equal(run.modelRequests.length,1);
});

test('Responses diagnostic tap handles split UTF-8/CRLF and duplicate terminal items without retaining arguments',()=>{
  const {responseObserver}=require('../electron/run-diagnostics.cjs');
  const {ToolLoopGuard}=require('../electron/tool-loop-guard.cjs');const guard=new ToolLoopGuard();
  const d={events:0};const observe=responseObserver(d,v=>guard.fingerprint(v));
  const item={type:'function_call',call_id:'call',name:'write_stdin',arguments:'{"chars":"私密","session_id":8945}'};
  const text=[{type:'response.output_item.done',item},{type:'response.completed',response:{status:'completed',output:[item],usage:{input_tokens:23,output_tokens:7,total_tokens:30}}}].map(v=>'data: '+JSON.stringify(v)+'\r\n\r\n').join('');
  for(const byte of Buffer.from(text))observe(Buffer.from([byte]));
  assert.equal(d.calls.length,1);assert.equal(d.calls[0].mappedName,'write_stdin');assert.equal(d.done,true);assert.equal(d.usage.total_tokens,30);
  assert.ok(!JSON.stringify(d).includes('私密'));assert.ok(!JSON.stringify(d).includes('8945'));
});
