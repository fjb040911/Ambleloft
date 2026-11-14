// Real pinned engine + local deterministic inference, never a paid model or user profile.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {CodexRPC,findCodex}=require('../../electron/codex-rpc.cjs');
const {NativeSubagents}=require('../../electron/native-subagents.cjs');
const {startChatBridge}=require('../../electron/chat-bridge.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await delay(25);}throw Error('Native probe timed out');}
async function probe(mode){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-native-')),events=[],requests=[],approvals=[],parallelReplies=[];let rpc,bridge,childId,held,rootId;
 const context={turnKey:'probe',config:{},run:{tools:[],messages:[],approvals:[]}};
 const runtime={changed(){},contexts:new Map([['probe',context]])},native=new NativeSubagents(runtime);
 const server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);
  const chat=mode==='chat',toolList=(body.tools||[]).flatMap(t=>t.type==='namespace'?t.tools.map(x=>({...x,namespace:t.name})):[t.function||t]);
  const input=chat?body.messages:body.input||[];
  const child=input.filter(i=>i.role==='user').some(i=>JSON.stringify(i.content).includes('CHILD_NATIVE_ONLY'));
  const emit=item=>{
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   if(chat){const delta=item.type==='function_call'?{tool_calls:[{index:0,id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}]}:{content:item.content[0].text};res.end('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason:item.type==='function_call'?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');return;}
   const response={id:'r'+requests.length,object:'response',status:'in_progress',output:[]};let seq=0;const send=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:seq++,...data})}\n\n`);
   send('response.created',{response});send('response.output_item.added',{output_index:0,item});send('response.output_item.done',{output_index:0,item});send('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}});res.end();
  };
  const final=text=>emit({id:'msg'+requests.length,type:'message',role:'assistant',content:[{type:'output_text',text}],status:'completed'});
  const call=(name,args)=>{const tool=toolList.find(t=>t.name===name||t.name.endsWith('__'+name));assert.ok(tool,'Missing '+name);emit({id:'fc'+requests.length,call_id:'call'+requests.length,type:'function_call',name:tool.name,...(tool.namespace?{namespace:tool.namespace}:{}),arguments:JSON.stringify(args),status:'completed'});};
  const outputs=input.filter(i=>i.type==='function_call_output'||i.role==='tool');
  if(!child&&(!outputs.length||(mode==='parallel'&&outputs.length<3))){call('spawn_agent',{message:'Task: Native verification\nCHILD_NATIVE_ONLY: complete the isolated verification.'});return;}
  if(child){
   if(mode==='stop'){held=res;return;}
   if(mode==='parallel'){parallelReplies.push(()=>final('CHILD_RESULT'));if(parallelReplies.length===3)parallelReplies.forEach(reply=>reply());return;}
   if(['full','approval'].includes(mode)&&!outputs.length){call('exec_command',mode==='full'?{cmd:'printf native-ok > native-proof.txt',max_output_tokens:100}:{cmd:'printf approval-probe',sandbox_permissions:'require_escalated',justification:'Isolated native approval probe',max_output_tokens:100});return;}
   final('CHILD_RESULT');return;
  }
  if(outputs.length===(mode==='parallel'?3:1)){const data=JSON.parse(outputs[0].output||outputs[0].content);assert.ok(data.agent_id);childId=data.agent_id;call('wait_agent',{targets:mode==='parallel'?outputs.map(o=>JSON.parse(o.output||o.content).agent_id):[childId],timeout_ms:10000});return;}
  final('PARENT_RESULT');
 }catch(e){console.error(e);res.destroy(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const config={model:'fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,protocol:mode==='chat'?'chat':'responses'};
  bridge=await startChatBridge(config,'native_probe_'+mode,mode!=='chat');
  rpc=new CodexRPC({executable:await findCodex(),home:root,cwd:root,config:bridge.config,notification:m=>{events.push(m);native.notification(context,m);},request:m=>{approvals.push(m);rpc.send({id:m.id,result:{decision:'decline'}});},exit:()=>{}});context.rpc=rpc;
  await rpc.call('initialize',{clientInfo:{name:'amble_native_probe',version:'1'},capabilities:{experimentalApi:true}});rpc.send({method:'initialized',params:{}});
  const {thread}=await rpc.call('thread/start',{model:'fixture',modelProvider:'atelier',cwd:root,sandbox:mode==='full'?'danger-full-access':'read-only',approvalPolicy:mode==='approval'?'on-request':'never'});rootId=thread.id;context.run.threadId=rootId;
  const start=await rpc.call('turn/start',{threadId:rootId,input:[{type:'text',text:'Use a native subagent for this isolated probe.'}]});context.run.turnId=start.turn.id;
  if(mode==='stop'){await until(()=>held&&context.run.tools.length);await native.stop(context.run.tools[0].id);held.destroy();}
  await until(()=>events.some(e=>e.method==='turn/completed'&&e.params.threadId===rootId));
  await until(()=>context.run.tools[0]?.analysisAgent.name&&!context.run.tools[0].analysisAgent.name.startsWith('Subagent'));
  const tool=context.run.tools[0];assert.equal(tool.nativeThreadId,childId);assert.ok(tool.analysisAgent.name);assert.equal(tool.analysisTitle,'Native verification');assert.ok(tool.nativeLifecycle.some(e=>e.status==='completed'||e.status==='interrupted'));
  if(mode==='stop')assert.equal(tool.status,'interrupted');else {assert.equal(tool.status,'completed');assert.equal(tool.detail,'CHILD_RESULT');}
  if(mode==='parallel'){assert.equal(parallelReplies.length,3);await until(()=>context.run.tools.length===3&&context.run.tools.every(t=>t.status==='completed'));}
  if(mode==='full')assert.equal(await fs.readFile(path.join(root,'native-proof.txt'),'utf8'),'native-ok');
  if(mode==='approval'){assert.equal(approvals.length,1);assert.equal(approvals[0].params.threadId,childId);}
  console.log(JSON.stringify({mode,passed:true,nativeThread:true,nickname:tool.analysisAgent.name,status:tool.status,requests:requests.length,approvals:approvals.length}));
 }finally{context.done=true;native.finish(context);rpc?.close();bridge?.close();server.closeAllConnections();server.close();await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
(async()=>{for(const mode of ['responses','chat','parallel','full','approval','stop'])await probe(mode);})().catch(e=>{console.error(e);process.exitCode=1;});
