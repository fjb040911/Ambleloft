const {test}=require('node:test'),assert=require('node:assert/strict');
const {StreamRedactor,StreamFields}=require('../electron/stream-redactor.cjs');
const {ByteLineReader,ByteWriter,writeChunk}=require('../electron/byte-stream.cjs');
const {PassThrough,Writable}=require('node:stream'),{EventEmitter}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Database}=require('../electron/database.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');

test('every secret boundary, overlapping keys and Unicode match whole-input redaction',()=>{
 const keys=['secret-key','secret-key-long','中文😀密钥','abab'],input='safe secret-key-long / 中文😀密钥 / abab / secret-key end';
 const expected='safe [REDACTED] / [REDACTED] / [REDACTED] / [REDACTED] end';
 for(let i=0;i<=input.length;i++){const redactor=new StreamRedactor(keys);assert.equal(redactor.write(input.slice(0,i))+redactor.write(input.slice(i))+redactor.end(),expected);}
 const redactor=new StreamRedactor('sk-private');assert.equal(redactor.write('safe sk-pri'),'safe ');assert.equal(redactor.carry,'sk-pri');assert.equal(redactor.write('vate end'),'[REDACTED] end');
});
test('incremental redaction scans only incoming bytes plus bounded prefix, never prior transcript',()=>{
 const redactor=new StreamRedactor(['secret-abcdef','秘密😀']),chunk='ordinary content '.repeat(100)+'se';let output='';
 for(let i=0;i<1000;i++){output+=redactor.write(chunk);assert.ok(redactor.carry.length<13);}output+=redactor.end();
 assert.equal(output,chunk.repeat(1000));assert.ok(redactor.scanned<=chunk.length*1000+13*1000);
});
test('authoritative replacements, cancellation and changing keys do not leak or duplicate carries',()=>{
 const fields=new StreamFields(),item={text:''};fields.append(item,'text','hello sec','secret');assert.equal(item.text,'hello ');
 fields.reset(item,'text');item.text='replacement';fields.append(item,'text',' new','secret');fields.finish();assert.equal(item.text,'replacement new');
 fields.append(item,'text',' sec','secret');fields.append(item,'text',' token','token');fields.finish(true);assert.equal(item.text,'replacement new [REDACTED] [REDACTED]');assert.equal(fields.fields.size,0);
});
test('parent, reasoning and child streams redact independently before every publication',()=>{
 const snapshots=[],runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.changed=run=>snapshots.push(structuredClone(run));
 const child={id:'child',type:'analysis',status:'running',nativeThreadId:'child',nativeTurnId:'ct',nativeMessages:{},nativeActivity:[{id:'cmd',text:'',status:'running'}]};
 const context={config:{apiKey:'secret'},turnKey:'u',run:{threadId:'root',turnId:'rt',messages:[],tools:[child],approvals:[],questions:[]},nativeThreads:new Map([['child',child]])};
 const event=(method,params)=>runtime.notification(context,{method,params});
 event('item/agentMessage/delta',{threadId:'root',turnId:'rt',itemId:'a',delta:'main sec'});
 event('item/agentMessage/delta',{threadId:'child',turnId:'ct',itemId:'b',delta:'child se'});
 event('item/reasoning/textDelta',{threadId:'root',turnId:'rt',itemId:'thought',contentIndex:0,delta:'reason secr'});
 event('item/commandExecution/outputDelta',{threadId:'child',turnId:'ct',itemId:'cmd',delta:'tool secr'});
 assert.equal(context.run.messages[0].text,'main ');assert.equal(child.detail,'child ');assert.equal(child.nativeActivity[0].text,'tool ');
 event('item/agentMessage/delta',{threadId:'root',turnId:'rt',itemId:'a',delta:'ret!'});
 event('item/agentMessage/delta',{threadId:'child',turnId:'ct',itemId:'b',delta:'cret!'});
 event('item/reasoning/textDelta',{threadId:'root',turnId:'rt',itemId:'thought',contentIndex:0,delta:'et!'});
 event('item/commandExecution/outputDelta',{threadId:'child',turnId:'ct',itemId:'cmd',delta:'et!'});
 assert.equal(context.run.messages[0].text,'main [REDACTED]!');assert.equal(context.run.messages[1].text,'reason [REDACTED]!');assert.equal(child.detail,'child [REDACTED]!');
 for(const snapshot of snapshots)assert.ok(!JSON.stringify(snapshot).includes('secret'));
});
test('byte reader yields, pauses at high water and preserves multi-agent/control order and Unicode',async()=>{
 const stream=new PassThrough({highWaterMark:64}),lines=[],errors=[],reader=new ByteLineReader(stream,line=>lines.push(line),e=>errors.push(e),{high:128,low:32,maxFrame:100,budget:32});
 const expected=Array.from({length:40},(_,i)=>JSON.stringify({thread:i%2?'child':'root',method:i%7?'delta':'approval',text:'中文😀',i}));
 let pauses=0;stream.on('pause',()=>pauses++);
 const producer=(async()=>{for(const line of expected){const bytes=Buffer.from(line+'\n');for(let i=0;i<bytes.length;i+=7)await writeChunk(stream,bytes.subarray(i,i+7));}stream.end();})();
 await Promise.all([producer,reader.finished]);assert.deepEqual(lines,expected);assert.equal(errors.length,0);assert.ok(pauses>0);assert.equal(reader.bytes,0);reader.close();
});
test('oversized incomplete frame fails explicitly and discards no accepted final lines on EOF',async()=>{
 const stream=new PassThrough(),lines=[];let failure;const reader=new ByteLineReader(stream,line=>lines.push(line),e=>failure=e,{high:128,low:32,maxFrame:16,budget:8});
 stream.end(Buffer.from('ok\n'+'x'.repeat(17)));await reader.finished;assert.equal(failure.code,'STREAM_BUFFER_LIMIT');assert.deepEqual(lines,['ok']);
 const other=new PassThrough(),result=[],valid=new ByteLineReader(other,line=>result.push(line),e=>{throw e;},{budget:2});other.end('a\nb\nfinal');await valid.finished;assert.deepEqual(result,['a','b','final']);valid.close();
});
test('writer respects drain, counts encoded bytes, reserves control capacity and cancels unsent work',()=>{
 const stream=new EventEmitter(),writes=[];stream.writableLength=0;let blocked=true;stream.write=data=>{writes.push(data.toString());if(blocked){stream.writableLength=data.length;return false;}return true;};
 const writer=new ByteWriter(stream,e=>{throw e;},{maxBytes:16,reserve:8});writer.send('12345678');const ticket=writer.send('中文');assert.equal(writer.bytes,6);
 assert.throws(()=>writer.send('123'),{code:'STREAM_BUFFER_LIMIT'});writer.send('stop',true);assert.equal(writes.length,1);assert.equal(writer.cancel(ticket),true);
 blocked=false;stream.writableLength=0;stream.emit('drain');assert.deepEqual(writes,['12345678','stop']);assert.equal(writer.bytes,0);writer.close();assert.equal(stream.listenerCount('drain'),0);
});
test('HTTP backpressure waits without buffering new chunks and cancellation releases listeners',async()=>{
 const metrics=require('../electron/performance-metrics.cjs').metrics,before=metrics.snapshot().current.bridgeWriteWaitMs?.count||0;
 let finish;const stream=new Writable({highWaterMark:1,write(chunk,encoding,callback){finish=callback;}}),controller=new AbortController(),waits=[];
 let done=false;const pending=writeChunk(stream,'chunk',controller.signal,value=>waits.push(value)).then(()=>{done=true;});await delay(1);assert.equal(done,false);finish();await pending;assert.deepEqual(waits,[true,false]);
 const cancelled=writeChunk(stream,'next',controller.signal);controller.abort(Error('cancel'));await assert.rejects(cancelled,/cancel/);assert.equal(stream.listenerCount('drain'),0);assert.equal(stream.listenerCount('close'),0);finish();stream.destroy();
});
test('database bytes apply hysteresis, reject overflow before submission and release on failure',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'byte-db-')),db=new Database(dir,{highBytes:100,lowBytes:20,maxBytes:1000});t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});await db.call('ready');
 const changes=[];db.subscribePressure((paused,bytes)=>changes.push({paused,bytes}));const request=db.request.bind(db);let release,entered;const started=new Promise(r=>entered=r);
 db.request=async(method,args)=>{if(method==='saveRunPatches'){entered();await new Promise(r=>release=r);throw Error('disk failed');}return request(method,args);};
 const run={id:'r',messages:[{id:'u',role:'user',text:'x'.repeat(100)}],tools:[],status:'running'};
 const pending=db.call('saveRunUpdates',[run]);await started;assert.equal(db.pressure,true);assert.ok(db.pendingBytes>=100);
 await assert.rejects(db.call('saveRunUpdates',[{...run,messages:[{id:'u',text:'y'.repeat(1000)}]}]),{code:'DATABASE_BACKPRESSURE'});
 release();await assert.rejects(pending,/disk failed/);assert.equal(db.pendingBytes,0);assert.equal(db.pressure,false);assert.ok(changes.some(v=>v.paused));
});
test('storage pressure gates new execution but preserves input, model and permission state',()=>{
 let callback;const database={pendingBytes:17*1024*1024,pressure:true,subscribePressure(listener){callback=listener;return()=>{};}},runtime=new AgentRuntime({directory:'/unused',database,publish(){}}),calls=[];
 const run={id:'r',messages:[],tools:[],questions:[{id:'q'}],approvals:[{id:'a'}],permissionChange:{state:'switching'},modelChange:{state:'applied'},conversation:{updates:[{state:'delivered'}]}};
 runtime.contexts.set('r',{run,rpc:{setBackpressure:value=>calls.push(value)}});callback();assert.equal(runtime.storagePressure,true);assert.equal(run.storageBackpressure,true);
 database.pendingBytes=0;database.pressure=false;callback();assert.deepEqual(calls,[true,false]);assert.equal(run.questions.length,1);assert.equal(run.permissionChange.state,'switching');assert.equal(run.conversation.updates[0].state,'delivered');
});
test('downstream pause excludes only blocked time from idle deadline',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const {inferenceDeadline}=require('../core/automation/inference-deadline.cjs');const deadline=inferenceDeadline(undefined,{timeoutMs:null,idleTimeoutMs:100});
 t.mock.timers.tick(60);deadline.pause();t.mock.timers.tick(1000);assert.equal(deadline.signal.aborted,false);deadline.resume();t.mock.timers.tick(39);assert.equal(deadline.signal.aborted,false);t.mock.timers.tick(2);assert.equal(deadline.signal.aborted,true);deadline.dispose();
});
test('closing a pressure-paused reader drains the pipe so stop/model reconnect cannot hang',async()=>{
 const stream=new PassThrough(),reader=new ByteLineReader(stream,()=>{},e=>{throw e;});reader.setBackpressure(true);
 stream.end('buffered\n');reader.close();await reader.finished;await new Promise(resolve=>stream.on('end',resolve));assert.equal(reader.bytes,0);
});
test('one failed save does not block other agents or clear their later dirty updates',async()=>{
 const saved=[],database={incrementalRuns:true,async call(method,runs){if(runs[0].id==='bad')throw Object.assign(Error('limit'),{code:'DATABASE_BACKPRESSURE'});saved.push(runs[0].id);}},runtime=new AgentRuntime({directory:'/unused',database,publish(){}});
 runtime.runs=[{id:'bad',messages:[],tools:[]},{id:'good',messages:[],tools:[]}];runtime.dirtyRuns=new Map([['bad',1],['good',1]]);runtime.streamBytes=new Map([['bad',1024],['good',1024]]);
 await assert.rejects(runtime.persistChanged(),error=>error.code==='DATABASE_BACKPRESSURE'&&error.runIds[0]==='bad');assert.deepEqual(saved,['good']);assert.equal(runtime.dirtyRuns.has('good'),false);assert.equal(runtime.streamBytes.has('good'),false);assert.equal(runtime.dirtyRuns.has('bad'),true);
});
test('a late delta after a completion or authoritative replacement rechecks only the field boundary',()=>{
 const fields=new StreamFields(),item={text:''};fields.append(item,'text','prefix se','secret');fields.finish();assert.equal(item.text,'prefix se');
 fields.append(item,'text','cret end','secret');fields.finish();assert.equal(item.text,'prefix [REDACTED] end');
 item.text='replacement sec';fields.append(item,'text','ret','secret');fields.finish();assert.equal(item.text,'replacement [REDACTED]');
});
test('a partial frame above low water can finish after draining a large backlog', {timeout:2000},async()=>{
 const stream=new PassThrough(),lines=[],reader=new ByteLineReader(stream,line=>lines.push(line),e=>{throw e;},{high:128,low:32,maxFrame:100,budget:256});
 stream.write('a'.repeat(60)+'\n'+'x'.repeat(80));await new Promise(resolve=>setImmediate(resolve));assert.equal(stream.isPaused(),false);
 stream.end('tail\n');await reader.finished;assert.deepEqual(lines,['a'.repeat(60),'x'.repeat(80)+'tail']);reader.close();
});
