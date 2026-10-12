// Real pinned Codex, isolated profile, local deterministic inference. No live API calls.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {CodexRPC,findCodex}=require('../../electron/codex-rpc.cjs');
const {probeVersion}=require('../../electron/engine.cjs');
const {startChatBridge}=require('../../electron/chat-bridge.cjs');
const {createAgentChannel}=require('../../core/extensions/agent-channel.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await sleep(25);}throw Error('probe timeout');}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-async-input-'));let rpc,bridge,channel,mode,requests=[],pending=[],events=[],held,formShown=false,independentDone=false;
 const server=http.createServer(async(req,res)=>{try{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);
 const tools=(body.tools||[]).flatMap(t=>t.type==='namespace'?t.tools.map(x=>({...x,namespace:t.name})):[t.function||t]);
 const emit=item=>{if(mode==='form-chat'){res.writeHead(200,{'Content-Type':'text/event-stream'});const delta=item.type==='function_call'?{tool_calls:[{index:0,id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}]}:{content:'probe done'};res.end('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason:item.type==='function_call'?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');return;}res.writeHead(200,{'Content-Type':'text/event-stream'});const response={id:'r'+Date.now(),object:'response',status:'in_progress',output:[]};let seq=0;const send=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:seq++,...data})}\n\n`);send('response.created',{response});send('response.output_item.added',{output_index:0,item});send('response.output_item.done',{output_index:0,item});send('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}});res.end();};
 const final=()=>emit({id:'msg'+requests.length,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'probe done',annotations:[]}]});
 if(mode.startsWith('form-')&&requests.length<=2){const name=requests.length===1?'forms_present':'extension_list_operations';const tool=tools.find(t=>t.name?.startsWith(name));assert.ok(tool,'MCP tool not exposed');emit({id:'fc'+requests.length,call_id:'call'+requests.length,type:'function_call',name:tool.name,...(tool.namespace?{namespace:tool.namespace}:{}),arguments:JSON.stringify(requests.length===1?{key:'fixture.form'}:{}),status:'completed'});
 }else if(mode.startsWith('form-')&&requests.length===3){held=final;}else if(requests.length===1&&mode.startsWith('question')){
 const tool=tools.find(t=>t.name=== (mode==='question-async'?'request_user_input_async':'request_user_input'));
 console.log(JSON.stringify({mode,availableQuestions:tools.filter(t=>/request_user/.test(t.name)).map(t=>t.name),found:!!tool}));
 if(!tool){final();return;}
 emit({id:'fc1',call_id:'call1',type:'function_call',name:tool.name,...(tool.namespace?{namespace:tool.namespace}:{}),arguments:JSON.stringify({questions:[{id:'choice',header:'Choice',question:'Choose a format',options:[{label:'A',description:'A format'},{label:'B',description:'B format'}]}]}),status:'completed'});
 }else if((mode==='steer'&&requests.length===1)||(mode==='question-async'&&requests.length===2)){held=final;}else final();
 }catch(e){res.destroy(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const executable=await findCodex();console.log(JSON.stringify({engine:await probeVersion(executable),platform:process.platform,arch:process.arch}));
 try{for(mode of ['question','question-async','steer','form-responses','form-chat']){
 requests=[];pending=[];events=[];held=null;formShown=false;independentDone=false;const home=path.join(root,mode);await fs.mkdir(home);
 bridge=await startChatBridge({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture',protocol:mode==='form-chat'?'chat':'responses',apiKey:''},'async-probe',mode!=='form-chat');
 channel=mode.startsWith('form-')?await createAgentChannel({list:async()=>{assert.equal(formShown,true);independentDone=true;return 'INDEPENDENT_WORK_DONE';},invoke:async()=>{},forms:{list:async()=>[],present:async()=>{formShown=true;return {id:'form-request-1',status:'editing'};}}}):null;
 rpc=new CodexRPC({executable,config:bridge.config,extensionMcp:channel?.config,home,cwd:root,notification:m=>events.push(m),request:m=>pending.push(m),exit:()=>{}});
 await rpc.call('initialize',{clientInfo:{name:'amble_async_probe',version:'1'}});rpc.send({method:'initialized',params:{}});
 const {thread}=await rpc.call('thread/start',{model:'fixture',modelProvider:'atelier',cwd:root,sandbox:'read-only',approvalPolicy:'never'});
 const started=await rpc.call('turn/start',{threadId:thread.id,input:[{type:'text',text:'Probe asynchronous input.'}]});
 if(mode==='question'){
 await until(()=>pending.length);console.log(JSON.stringify({mode,request:pending[0]}));await sleep(2000);assert.equal(requests.length,1,'blocking question advanced without answer');rpc.send({id:pending[0].id,result:{answers:{choice:{answers:['ANSWER_SENTINEL']}}}});await until(()=>events.some(e=>e.method==='turn/completed'));assert.ok(JSON.stringify(requests.at(-1)).includes('ANSWER_SENTINEL'));console.log(JSON.stringify({mode,passed:true,requests:requests.length}));
 }else if(mode==='question-async'){
 await until(()=>pending.length||events.some(e=>e.method==='turn/completed'));
 if(pending.length){console.log(JSON.stringify({mode,request:pending[0]}));await until(()=>held);assert.equal(requests.length,2);rpc.send({id:pending[0].id,result:{answers:{choice:{answers:['ASYNC_ANSWER_SENTINEL']}}}});held();await until(()=>events.some(e=>e.method==='turn/completed'));console.log(JSON.stringify({mode,requests:requests.length,answerSeen:JSON.stringify(requests.at(-1)).includes('ASYNC_ANSWER_SENTINEL')}));}
 }else{
 await until(()=>held);if(mode.startsWith('form-')){assert.ok(formShown&&independentDone);assert.ok(JSON.stringify(requests.at(-1)).includes('INDEPENDENT_WORK_DONE'));}await assert.rejects(rpc.call('turn/steer',{threadId:thread.id,expectedTurnId:'wrong',input:[{type:'text',text:'WRONG_SENTINEL'}]}));
 const accepted=await rpc.call('turn/steer',{threadId:thread.id,expectedTurnId:started.turn.id,clientUserMessageId:'answer-1',input:[{type:'text',text:'STEER_ANSWER_SENTINEL'}]});assert.equal(accepted.turnId,started.turn.id);held();await until(()=>events.some(e=>e.method==='turn/completed'));
 assert.ok(JSON.stringify(requests.at(-1)).includes('STEER_ANSWER_SENTINEL'));assert.equal(events.filter(e=>e.method==='turn/started').length,1);
 const history=await rpc.call('thread/read',{threadId:thread.id,includeTurns:true});assert.ok(history.thread.turns.some(t=>t.items.some(i=>i.type==='userMessage'&&i.clientId==='answer-1')),'submitted client id must be readable for reconciliation');
 await assert.rejects(rpc.call('turn/steer',{threadId:thread.id,expectedTurnId:started.turn.id,input:[{type:'text',text:'late'}]}));
 assert.equal(events.find(e=>e.method==='turn/completed').params.turn.status,'completed');
 const inferenceRequestsBeforeLateAnswer=requests.length;
 const next=await rpc.call('turn/start',{threadId:thread.id,input:[{type:'text',text:'LATE_ANSWER_SENTINEL'}]});assert.notEqual(next.turn.id,started.turn.id);await until(()=>events.filter(e=>e.method==='turn/completed').length===2);assert.ok(JSON.stringify(requests.at(-1)).includes('LATE_ANSWER_SENTINEL'));assert.ok(JSON.stringify(requests.at(-1)).includes('STEER_ANSWER_SENTINEL'));
 rpc.close();rpc=new CodexRPC({executable,config:bridge.config,home,cwd:root,notification:()=>{},request:()=>{},exit:()=>{}});await rpc.call('initialize',{clientInfo:{name:'amble_reconcile_probe',version:'1'}});rpc.send({method:'initialized',params:{}});const persisted=await rpc.call('thread/read',{threadId:thread.id,includeTurns:true});assert.ok(persisted.thread.turns.some(t=>t.items.some(i=>i.type==='userMessage'&&i.clientId==='answer-1')),'client id must survive engine restart');
 console.log(JSON.stringify({mode,passed:true,inferenceRequestsBeforeLateAnswer,formShown,independentDone,sameTurnSteer:true,wrongAndCompletedTurnRejected:true,lateAnswerNewTurn:true}));
 }
 rpc.close();rpc=null;channel?.close();channel=null;bridge?.close();bridge=null;
 }}finally{rpc?.close();channel?.close();bridge?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
