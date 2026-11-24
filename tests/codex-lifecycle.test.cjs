const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream'),path=require('node:path');
const {initializeInOrder}=require('../electron/engine-initialization.cjs');
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:()=>resolve()};};
test('same home initializes serially; other homes and already initialized engines do not wait',async()=>{
 const gate=deferred(),events=[],home=path.resolve('initialization-test');
 const first=initializeInOrder(home,async()=>{events.push('first');await gate.promise;});
 const second=initializeInOrder(home,async()=>events.push('second'));
 await initializeInOrder(home+'-other',async()=>events.push('other'));assert.deepEqual(events,['first','other']);
 gate.resolve();await Promise.all([first,second]);assert.deepEqual(events,['first','other','second']);
 await assert.rejects(initializeInOrder(home,()=>{throw Error('failed')}),/failed/);
 assert.equal(await initializeInOrder(home,()=>42),42);
});
test('RPC close resolves on engine exit even when inherited stdio handles never close',async t=>{
 const cp=require('node:child_process'),spawn=cp.spawn;const children=[];
 cp.spawn=()=>{const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(data,enc,done){const m=JSON.parse(data.toString());if(m.id)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result:{}})+'\n'));done();}});child.kill=()=>{child.exitCode=0;queueMicrotask(()=>child.emit('exit',0,null));return true;};children.push(child);return child;};
 const modulePath=require.resolve('../electron/codex-rpc.cjs');delete require.cache[modulePath];const {CodexRPC}=require(modulePath);
 t.after(()=>{cp.spawn=spawn;delete require.cache[modulePath];});
 const rpc=new CodexRPC({executable:process.execPath,config:{model:'test',baseUrl:'http://127.0.0.1'},home:path.resolve('rpc-home'),cwd:process.cwd(),notification(){},request(){},exit(){}});
 await rpc.call('initialize',{},1000);rpc.setBackpressure(true);
 await Promise.race([rpc.close(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('waited for inherited handles')),500);timer.unref();})]);
 assert.equal(children[0].stdout.destroyed,true);assert.equal(children[0].stderr.destroyed,true);await rpc.close();
});
test('stopping an initialization waiting behind another engine never spawns it later',async t=>{
 const home=path.resolve('cancel-initialize'),gate=deferred(),first=initializeInOrder(home,()=>gate.promise);
 const {CodexRPC}=require('../electron/codex-rpc.cjs');
 const rpc=new CodexRPC({executable:'must-not-execute',config:{model:'test',baseUrl:'http://127.0.0.1'},home,cwd:process.cwd(),notification(){},request(){},exit(){}});
 const pending=rpc.call('initialize',{},1000),rejected=assert.rejects(pending,/停止/);await rpc.close();await rejected;gate.resolve();await first;await new Promise(r=>setImmediate(r));assert.equal(rpc.child,undefined);
});

test('large reply leases can be released and invalid scalar replies reject the waiter before close',async t=>{
 const fs=require('node:fs'),home=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'rpc-reply-')),cp=require('node:child_process'),spawn=cp.spawn;
 cp.spawn=()=>{const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(data,enc,done){const m=JSON.parse(data.toString());if(m.id)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result:m.method==='read'?{text:'x'.repeat(20000)}:m.method==='invalid'?'x'.repeat(20000):{}})+'\n'));done();}});child.kill=()=>{child.exitCode=0;queueMicrotask(()=>child.emit('exit',0,null));return true;};return child;};
 const modulePath=require.resolve('../electron/codex-rpc.cjs');delete require.cache[modulePath];const {CodexRPC}=require(modulePath);t.after(()=>{cp.spawn=spawn;delete require.cache[modulePath];fs.rmSync(home,{recursive:true,force:true});});
 const rpc=new CodexRPC({executable:process.execPath,config:{model:'test',baseUrl:'http://127.0.0.1'},home,cwd:process.cwd(),notification(){},request(){},exit(){}});
 await rpc.call('initialize',{},1000);const value=await rpc.call('read',{},1000);assert.equal(value.text.length,20000);assert.ok(rpc.reader.retainedBytes>0);rpc.releaseResult(value);assert.equal(rpc.reader.retainedBytes,0);assert.deepEqual(fs.readdirSync(home),[]);
 await assert.rejects(rpc.call('invalid',{},1000),/INVALID_RPC_RESULT/);await rpc.close();assert.equal(rpc.pending.size,0);assert.deepEqual(fs.readdirSync(home),[]);
});

test('runtime shutdown waits for engine cleanup after completed contexts were removed',async()=>{
 const {AgentRuntime}=require('../electron/agent-runtime.cjs'),gate=deferred();
 const runtime=new AgentRuntime({directory:'/unused',publish(){}});runtime.initialized=true;runtime.persist=async()=>{};
 runtime.closeEngine({close:()=>gate.promise});let finished=false;const closing=runtime.shutdown().then(()=>{finished=true;});await new Promise(r=>setImmediate(r));assert.equal(finished,false);gate.resolve();await closing;assert.equal(finished,true);assert.equal(runtime.engineClosures.size,0);
});
