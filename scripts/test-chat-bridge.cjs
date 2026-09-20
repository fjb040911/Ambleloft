const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
(async()=>{
 const directory=await fs.mkdtemp('/tmp/atelier-bridge-test-');let mode='tool';let requests=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);requests.push(data);
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(mode==='hang'){res.write(': waiting\n\n');return;}
  const send=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\n\n');
  send({reasoning_content:'Check environment.',reasoning:'Check environment.'});
  await new Promise(r=>setTimeout(r,40));
  if(mode==='error'){res.end();return;}
  if(mode==='tool'&&!data.messages.some(m=>m.role==='tool')){
   const tool=data.tools.find(t=>(t.function.name==='exec_command'||t.function.name.startsWith('exec_command_')));assert.ok(tool);
   send({content:'I will check the working directory.'});
   send({tool_calls:[{index:0,id:'call_fixture',type:'function',function:{name:tool.function.name,arguments:'{"cmd":"pwd",'}}]});
   send({tool_calls:[{index:0,function:{arguments:'"max_output_tokens":100}'}}]},'tool_calls');
  }else if(mode==='question'){
   const tool=data.tools.find(t=>(t.function.name==='request_user_input'||t.function.name.startsWith('request_user_input_')));assert.ok(tool);
   mode='text';send({tool_calls:[{index:0,id:'call_question',type:'function',function:{name:tool.function.name,arguments:JSON.stringify({questions:[{id:'audience',header:'Audience',question:'Who is this for?',options:[{label:'Designer',description:'Design work'},{label:'Developer',description:'Engineering'}]}]})}}]},'tool_calls');
  }else if(mode==='plan'){
   const tool=data.tools.find(t=>(t.function.name==='update_plan'||t.function.name.startsWith('update_plan_')));assert.ok(tool);
   mode='text';send({tool_calls:[{index:0,id:'call_plan',type:'function',function:{name:tool.function.name,arguments:JSON.stringify({plan:[{step:'Verify',status:'completed'}]})}}]},'tool_calls');
  }else {send({content:'Done.'},'stop');}
  res.end('data: [DONE]\n\n');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const config={baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture',protocol:'chat',apiKey:''};const updates=[];
 const runtime=new AgentRuntime({directory,provider:{secret:async()=>config},workspace:{read:async()=>({projects:[]})},publish:r=>updates.push(r)});
 async function finished(id){const until=Date.now()+40000;while(runtime.active&&Date.now()<until)await new Promise(r=>setTimeout(r,50));const r=runtime.list().find(r=>r.id===id);assert.ok(!runtime.active,'timeout');return r;}
 try{
  await runtime.init();const first=await runtime.start({prompt:'Check the current directory.'});let result=await finished(first.id);assert.equal(result.status,'completed',result.error);
  assert.ok(result.tools.some(t=>t.type==='commandExecution'&&t.status==='completed'));
  assert.ok(result.messages.some(m=>m.phase==='commentary'));
  assert.equal(result.messages.filter(m=>m.kind==='reasoning')[0].text,'Check environment.');
  assert.ok(updates.some(r=>r.messages.some(m=>m.kind==='reasoning'&&m.text&&m.status==='running')));
  const history=requests.at(-1).messages;assert.ok(history.some(m=>m.role==='tool'));assert.equal(history.find(m=>m.tool_calls)?.reasoning_content,'Check environment.');
  mode='text';await runtime.start({runId:first.id,prompt:'Continue.'});result=await finished(first.id);assert.equal(result.status,'completed',result.error);assert.ok(JSON.stringify(requests.at(-1).messages).includes('Check the current directory.'));
  mode='plan';const plan=await runtime.start({prompt:'Plan the work.'});result=await finished(plan.id);assert.equal(result.status,'completed',result.error);assert.equal(result.plans[0].steps[0].step,'Verify');
  mode='question';const questionRun=await runtime.start({prompt:'Ask who this is for.'});
  const untilQuestion=Date.now()+10000;while(runtime.active&&!runtime.list().find(r=>r.id===questionRun.id).questions?.length&&Date.now()<untilQuestion)await new Promise(r=>setTimeout(r,50));
  const question=runtime.list().find(r=>r.id===questionRun.id).questions?.[0];assert.ok(question,'native question event received');
  runtime.answer({runId:questionRun.id,requestId:question.id,answers:{audience:'Designer'}});
  assert.equal((await finished(questionRun.id)).status,'completed');
  assert.ok(JSON.stringify(requests.at(-1).messages).includes('Designer'));
  mode='error';const error=await runtime.start({prompt:'Broken stream.'});assert.equal((await finished(error.id)).status,'failed');
  mode='hang';const count=requests.length;const pending=await runtime.start({prompt:'Wait.'});const until=Date.now()+10000;while(requests.length===count&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert.ok(requests.length>count);await runtime.stop(pending.id);assert.equal((await finished(pending.id)).status,'interrupted');
  console.log('PASS real Codex bridge: reasoning stream, deduplication, commentary, command execution, reasoning replay, resume, MCP plan, native user question and answer, broken stream and cancellation');
 }finally{await runtime.shutdown();server.closeAllConnections();server.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
