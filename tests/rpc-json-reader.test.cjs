const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {JsonFrame,RpcJsonReader}=require('../electron/rpc-json-reader.cjs');
const spool=require('../electron/text-spool.cjs');
const {writeChunk}=require('../electron/byte-stream.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
function directory(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rpc-json-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function parse(text,options={},size=7){const frame=new JsonFrame(options),bytes=Buffer.from(text);try{for(let i=0;i<bytes.length;i+=size)frame.write(bytes.subarray(i,i+size));return {frame,value:frame.finish()};}catch(e){frame.close();throw e;}}

test('incremental JSON preserves escaped/raw Unicode, lone surrogates, duplicate keys and own __proto__',t=>{
 const root=directory(t),source='{"__proto__":{"safe":true},"a":[null,true,false,-1.25e+4,"中文😀\\uD800 / \\\\ \\n \\t \\""],"same":1,"same":2}';
 const expected=JSON.parse(source);
 for(const size of [1,2,3,7,64]){const {frame,value}=parse(source,{root,stringLimit:4},size);try{assert.deepEqual(JSON.parse(JSON.stringify(value)),expected);assert.equal(Object.getPrototypeOf(value),Object.prototype);assert.ok(frame.store.files===1);}finally{frame.close();}}
 assert.deepEqual(fs.readdirSync(root),[]);
});

test('malformed JSON/UTF8 and structural exhaustion fail explicitly, cleaning partial spools',t=>{
 const root=directory(t);
 for(const text of ['{"x":1,}','[1,]','{"x" 1}','{"x":tru}','{"x":"\\q"}','{"x":"unfinished','{"x":01}','{}{}','{"x":1]'])assert.throws(()=>parse(text,{root,stringLimit:2}));
 assert.throws(()=>parse('{"id":"'+ 'x'.repeat(17000)+'"}',{root}),{code:'STREAM_BUFFER_LIMIT'});
 assert.throws(()=>parse('[0,0,0]',{root,maxNodes:3}),{code:'STREAM_BUFFER_LIMIT'});
 assert.throws(()=>parse('[[[]]]',{root,maxDepth:2}),{code:'STREAM_BUFFER_LIMIT'});
 assert.throws(()=>parse('{"text":"'+ 'x'.repeat(100)+'"}',{root,stringLimit:8,maxDisk:64}),{code:'STREAM_BUFFER_LIMIT'});
 assert.throws(()=>parse('{"a":1,"b":2}',{root,maxMetadata:100}),{code:'STREAM_BUFFER_LIMIT'});
 const frame=new JsonFrame({root});assert.throws(()=>frame.write(Buffer.from([0xff])));frame.close();
 assert.deepEqual(fs.readdirSync(root),[]);
});

test('below/at/above 8 MiB bodies and final controls stay ordered with bounded JSON metadata',async t=>{
 const root=directory(t),stream=new PassThrough({highWaterMark:65536}),seen=[],errors=[];
 const reader=new RpcJsonReader(stream,(message,frame)=>{if(message.params.item){const ref=spool.reference(message.params.item,'text');seen.push({method:message.method,length:ref?.length||message.params.item.text.length});assert.ok(frame.metadata<4096);assert.equal(frame.store.files,1);}else seen.push({method:message.method});},e=>errors.push(e),{root,high:131072,low:32768,budget:32768});
 let yielded=false;setImmediate(()=>yielded=true);
 for(const length of [8*1024*1024-1,8*1024*1024,8*1024*1024+1]){
  await writeChunk(stream,'{"method":"item/completed","params":{"item":{"text":"');
  for(let at=0;at<length;at+=16384)await writeChunk(stream,'a'.repeat(Math.min(16384,length-at)));
  await writeChunk(stream,'"}}}\n');
  await writeChunk(stream,'{"id":10,"method":"item/commandExecution/requestApproval","params":{}}\n{"method":"turn/completed","params":{"turn":{"id":"t","status":"completed"}}}\n');
 }
 stream.end();await reader.finished;assert.equal(yielded,true);assert.deepEqual(errors,[]);assert.deepEqual(seen.filter(v=>v.length).map(v=>v.length),[8388607,8388608,8388609]);assert.deepEqual(seen.map(v=>v.method),Array(3).fill(['item/completed','item/commandExecution/requestApproval','turn/completed']).flat());assert.equal(reader.bytes,0);assert.deepEqual(fs.readdirSync(root),[]);reader.close();
});

test('pressure stops parsing; cancellation of an incomplete huge string frees bytes/files and the pipe',async t=>{
 const root=directory(t),stream=new PassThrough(),seen=[],reader=new RpcJsonReader(stream,m=>seen.push(m),e=>{throw e},{root,budget:1024});
 stream.write('{"text":"'+'a'.repeat(32768));for(let i=0;i<40;i++)await tick();assert.equal(fs.readdirSync(root).length,1);
 reader.setBackpressure(true);stream.write('more');const before=reader.frameBytes;await tick();assert.equal(reader.frameBytes,before);
 reader.close();await reader.finished;assert.equal(reader.bytes,0);assert.deepEqual(fs.readdirSync(root),[]);assert.deepEqual(seen,[]);stream.end();
});

test('retained reply is readable until release, and exceeding its disk budget fails without silent dropping',async t=>{
 const root=directory(t),stream=new PassThrough(),frames=[],errors=[];
 const reader=new RpcJsonReader(stream,(m,f)=>{frames.push({m,f});return true},e=>errors.push(e),{root,stringLimit:8,maxRetainedBytes:200});
 stream.end(JSON.stringify({id:1,result:{text:'a'.repeat(60)}})+'\n'+JSON.stringify({id:2,result:{text:'b'.repeat(60)}})+'\n');await reader.finished;
 assert.equal(errors[0].code,'STREAM_BUFFER_LIMIT');assert.equal(frames.length,1,'over-budget reply was dispatched before rejection');assert.equal(reader.retainedBytes,0);assert.deepEqual(fs.readdirSync(root),[]);
 const other=new PassThrough();let lease;const good=new RpcJsonReader(other,(m,f)=>{lease={m,f};return true},e=>{throw e},{root,stringLimit:8});other.end(JSON.stringify({id:1,result:{text:'中文😀'.repeat(100)}})+'\n');await good.finished;assert.equal(lease.m.result.text,'中文😀'.repeat(100));good.release(lease.f);assert.equal(good.retainedBytes,0);assert.deepEqual(fs.readdirSync(root),[]);good.close();
});

test('short writes are retried, disk failures reject only the unacknowledged frame and clean raw data',async t=>{
 const root=directory(t),original=fs.writeSync;let calls=0;
 fs.writeSync=(fd,buffer,offset,length,...args)=>original(fd,buffer,offset,Math.min(length,7),...args);
 try{const {frame,value}=parse(JSON.stringify({text:'中文😀'.repeat(100)}),{root,stringLimit:8},100);assert.equal(value.text,'中文😀'.repeat(100));frame.close();}finally{fs.writeSync=original;}
 const stream=new PassThrough(),seen=[],errors=[],reader=new RpcJsonReader(stream,m=>seen.push(m.id),e=>errors.push(e),{root,stringLimit:8});
 fs.writeSync=(...args)=>{if(++calls>1)throw Object.assign(Error('synthetic disk failure'),{code:'ENOSPC'});return original(...args)};
 try{stream.end('{"id":1}\n'+JSON.stringify({id:2,text:'x'.repeat(100000)})+'\n');await reader.finished;assert.deepEqual(seen,[1]);assert.equal(errors[0].code,'ENOSPC');assert.deepEqual(fs.readdirSync(root),[]);}finally{fs.writeSync=original;reader.close();}
});

test('long authoritative bridge/parent/child/tool bodies are copied and redacted before raw spool cleanup',t=>{
 const root=directory(t),store=new spool.TextSpool(root);t.after(()=>store.close());
 const {AgentRuntime}=require('../electron/agent-runtime.cjs'),runtime=new AgentRuntime({directory:root,publish(){}});runtime.textSpool=store;runtime.changed=()=>{};
 const child={id:'child',type:'analysis',status:'running',nativeThreadId:'child',nativeTurnId:'ct',nativeMessages:{}};
 const context={textSpool:store,config:{apiKey:'s"e\\cret'},turnKey:'u',run:{threadId:'root',turnId:'rt',messages:[],tools:[child],approvals:[],questions:[]},nativeThreads:new Map([['child',child]])};
 const text=('中文😀 s"e\\cret \n').repeat(30000),expected=text.split('s"e\\cret').join('[REDACTED]');
 const deliver=message=>{const {frame,value}=parse(JSON.stringify(message),{root},32768),open=fs.openSync;fs.openSync=(file,flags,...args)=>{if(flags==='r'&&String(file).startsWith(frame.store?.directory||'impossible')&&/\bat read \(/.test(new Error().stack))throw Error('full raw RPC string was hydrated');return open(file,flags,...args);};try{runtime.notification(context,value);}finally{fs.openSync=open;frame.close();}};
 for(const [threadId,turnId,id] of [['root','rt','native'],['root','rt','msg_resp_00000000-0000-0000-0000-000000000000_part_0'],['child','ct','child-answer']])deliver({method:'item/completed',params:{threadId,turnId,item:{id,type:'agentMessage',text}}});
 deliver({method:'item/completed',params:{threadId:'root',turnId:'rt',item:{id:'thought',type:'reasoning',content:[text],summary:[]}}});
 deliver({method:'item/completed',params:{threadId:'root',turnId:'rt',item:{id:'cmd',type:'commandExecution',aggregatedOutput:text,status:'completed'}}});
 deliver({method:'item/completed',params:{threadId:'root',turnId:'rt',item:{id:'mcp',type:'mcpToolCall',arguments:{body:text},result:{content:[{text}]},status:'completed'}}});
 assert.equal(context.run.messages.find(m=>m.id==='native').text,expected);assert.equal(context.run.messages.find(m=>m.id.startsWith('msg_resp')).text,expected);assert.equal(child.detail,expected);assert.equal(context.run.messages.find(m=>m.id==='thought').text,expected);assert.equal(context.run.tools.find(m=>m.id==='cmd').detail,expected);const tool=JSON.parse(context.run.tools.find(m=>m.id==='mcp').detail);assert.equal(tool.arguments.body,expected);assert.equal(tool.result.content[0].text,expected);assert.ok(spool.reference(context.run.messages[0],'text'));
});

test('existing bridge request budget rejects oversize history explicitly without calling a model',async t=>{
 const http=require('node:http'),{startChatBridge}=require('../electron/chat-bridge.cjs');let upstreamCalls=0;
 const server=http.createServer((req,res)=>{if(req.url==='/chat/completions')upstreamCalls++;res.writeHead(404);res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const bridge=await startChatBridge({model:'fixture',baseUrl:'http://127.0.0.1:'+server.address().port,protocol:'chat'});t.after(()=>bridge.close());
 const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey},body:Buffer.alloc(32*1024*1024+1,32)});
 assert.equal(response.status,413);const body=await response.json();assert.equal(body.error.code,'request_body_limit');assert.match(body.error.message,/32 MiB/);assert.equal(upstreamCalls,0);
});
