const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const spool=require('../electron/text-spool.cjs'),{StreamFields}=require('../electron/stream-redactor.cjs');
const {range}=require('../electron/runtime-text-cache.cjs'),{pageRun}=require('../electron/history-pages.cjs');
const {RunDelivery}=require('../electron/run-delivery.cjs'),{createRunPublisher,applyRunEvent}=require('../electron/run-events.mjs');
const {packets}=require('../electron/stream-json.cjs');
function store(t){const s=new spool.TextSpool();t.after(()=>s.close());return s;}
function run(){return {id:'r',status:'running',messages:[{id:'u',role:'user',text:'task'},{id:'a',role:'assistant',text:''}],tools:[],approvals:[],questions:[]};}
test('active body stays append-backed, projections do not read it and all UTF-16 pages remain available',t=>{
 const s=store(t),r=run(),fields=new StreamFields(s),message=r.messages[1],delta='中文😀\ud800\n'.repeat(1000);
 for(let i=0;i<100;i++)fields.append(message,'text',delta,[]);fields.finish();
 const ref=spool.reference(message,'text');assert.equal(ref.length,delta.length*100);assert.ok(s.bytes<=1024*1024);assert.ok(ref.preview.length<=2048);
 const original=fs.readSync;let bytes=0;fs.readSync=(...args)=>{const n=original(...args);bytes+=n;return n;};let page;try{page=pageRun(r);}finally{fs.readSync=original;}
 assert.equal(bytes,0);assert.ok(page.messages[1].textPreview);assert.ok(JSON.stringify(page).length<10000);
 let restored='';for(let offset=0;offset<ref.length;offset+=64000)restored+=range(message,'text',offset).text;assert.equal(restored,delta.repeat(100));
});
test('redaction handles key rotation and resumed boundary across a spooled field without raw secret leakage',t=>{
 const s=store(t),fields=new StreamFields(s),item={text:''};fields.append(item,'text','x'.repeat(20000)+'sec',['secret']);fields.finish();
 fields.append(item,'text','ret then ne',['secret','new-key']);fields.append(item,'text','w-key',['new-key','secret']);fields.finish(true);
 assert.equal(item.text,'x'.repeat(20000)+'[REDACTED] then [REDACTED]');
});
test('queued immutable prefixes and joined reasoning persist incrementally while newer output and control updates continue',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'active-save-')),{Database}=require('../electron/database.cjs'),db=new Database(directory);await db.call('ready');t.after(async()=>{await db.close();fs.rmSync(directory,{recursive:true,force:true});});
 const s=db.getSpool(),r=run(),parts=['header',''],fields=new StreamFields(s);r.messages[1].summary=parts;
 const join=()=>fields.join(r.messages[1],'text',()=>parts.join('\n\n'),'main',()=>Object.keys(parts).map(k=>spool.part(parts,k)));
 fields.append(parts,1,'start '.repeat(5000),[]);join();const first=db.call('saveRunUpdates',[r]);
 fields.append(parts,1,'END 😀',[]);join();r.permissionChange={state:'applied',effective:'full-access'};r.modelChange={state:'applied',effective:'next'};r.questions=[{id:'pending-input',questions:[{id:'q',question:'补充要求'}]}];r.tools=[{id:'child',type:'analysis',status:'running',detail:'child output',nativeLifecycle:[{phase:'started'}]}];
 await first;assert.equal((await db.request('readRuns'))[0].messages[1].text,'header\n\n'+'start '.repeat(5000));await db.call('saveRunUpdates',[r]);
 const saved=(await db.request('readRuns'))[0];assert.equal(saved.messages[1].text,'header\n\n'+'start '.repeat(5000)+'END 😀');assert.deepEqual(saved.questions,r.questions);assert.deepEqual(saved.permissionChange,r.permissionChange);assert.deepEqual(saved.modelChange,r.modelChange);assert.deepEqual(saved.tools,r.tools);
 // A second append is an append patch, not a full derived-body rewrite.
 fields.append(parts,1,' MORE',[]);join();const batch=db.runPatches.prepare([r]);const change=batch.input.patches[0].upserts.find(i=>i.key==='a').texts.find(i=>i.field==='["text"]');assert.equal(change.mode,'append');assert.equal(spool.read(change.source,change.start),' MORE');
});
test('incremental joined hashing reads only the appended suffix and bounded preview',t=>{
 const s=store(t),parts=['header',''],owner={};spool.append(parts,1,'x'.repeat(200000),s);const bind=()=>spool.joined(owner,'text',()=>Object.keys(parts).map(k=>spool.part(parts,k)));bind();spool.reference(owner,'text');spool.append(parts,1,'new',s);bind();
 const original=fs.readSync;let bytes=0;fs.readSync=(...args)=>{const n=original(...args);bytes+=n;return n;};let ref;try{ref=spool.reference(owner,'text');}finally{fs.readSync=original;}
 assert.ok(bytes<10000);assert.equal(ref.hash,require('node:crypto').createHash('sha256').update('header\n\n'+'x'.repeat(200000)+'new','utf16le').digest('hex'));
});
test('streamed completed response serializes descriptors, split emoji, controls and tool arguments exactly with bounded packets',t=>{
 const s=store(t),part={text:''},call={arguments:''};const text='a'.repeat(16383)+'😀\ud800"\\\n'+'中文'.repeat(50000);spool.append(part,'text',text,s);spool.append(call,'arguments',JSON.stringify({input:text}),s);
 const done=Object.defineProperties({type:'response.output_text.done'},Object.getOwnPropertyDescriptors(part));const envelope={done,response:{output:[{content:[part]},call]}};
 const chunks=[...packets(envelope)];assert.ok(chunks.every(chunk=>chunk.length<=65536));assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),{done:{type:'response.output_text.done',text},response:{output:[{content:[{text}]},{arguments:JSON.stringify({input:text})}]}});
});
test('paused renderer holds one frame and coalesces updates without dropping final controls or child lifecycle',()=>{
 const publisher=createRunPublisher('s'),r=run(),sent=[],delivery=new RunDelivery(frame=>sent.push(frame),id=>publisher.snapshot(id));delivery.reset();delivery.push(publisher.encode(r));
 for(let i=0;i<1000;i++){r.messages[1].text='state '+i;delivery.push(publisher.encode(r));}
 r.questions=[{id:'follow-up'}];r.permissionChange={state:'applied'};r.modelChange={state:'applied'};r.tools=[{id:'child',nativeLifecycle:[{phase:'started'},{phase:'completed'}],status:'completed'}];delivery.push(publisher.encode(r));
 assert.equal(sent.length,1);assert.equal(delivery.pending.size,1);assert.ok(delivery.stats().inFlightBytes<=65536);delivery.ack({id:'forged',seq:0});assert.equal(sent.length,1);
 const documents=[];let buffers=[];for(let i=0;i<sent.length;i++){const frame=sent[i];buffers.push(frame.data);if(frame.done){documents.push(JSON.parse(Buffer.concat(buffers)));buffers=[];}delivery.ack(frame);}
 assert.equal(documents.length,2);assert.deepEqual(documents[1].run,r);assert.equal(delivery.current,null);assert.equal(delivery.pending.size,0);
});
test('reload replaces in-flight transfer, stale acknowledgments cannot release new credit, and close releases snapshots',()=>{
 const pub=createRunPublisher('s'),r=run(),sent=[],delivery=new RunDelivery(frame=>sent.push(frame),id=>pub.snapshot(id));delivery.push(pub.encode(r));assert.equal(sent.length,0);delivery.reset();const old=sent[0];r.status='waiting';delivery.push(pub.encode(r));delivery.reset();assert.notEqual(sent[1].id,old.id);delivery.ack(old);assert.equal(sent.length,2);delivery.close();assert.equal(delivery.current,null);assert.equal(delivery.pending.size,0);delivery.ack(sent[1]);assert.equal(sent.length,2);
});
test('publisher bounds bytes as well as task count and oversized snapshots remain reconstructible',()=>{
 const pub=createRunPublisher('s',{maxBytes:20000}),r=run();for(let i=0;i<20;i++)pub.encode({...r,id:'r'+i,messages:[{text:'x'.repeat(3000)}]});assert.ok(pub.stats().bytes<=20000);assert.ok(pub.stats().entries<20);
 const large={...r,messages:[{text:'x'.repeat(30000)}]},event=pub.encode(large);assert.deepEqual(applyRunEvent(undefined,event).run,large);assert.equal(pub.snapshot('r'),undefined);
});
test('preload reassembles arbitrary UTF-8 boundaries, acknowledges after delivery, and does not duplicate events',()=>{
 const {EventEmitter}=require('node:events'),vm=require('node:vm'),ipc=new EventEmitter(),sent=[];let desktop;ipc.send=(...args)=>sent.push(args);ipc.invoke=async()=>{};
 vm.runInNewContext(fs.readFileSync(require.resolve('../electron/preload.cjs'),'utf8'),{require:()=>({ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(_,value)=>desktop=value}}),TextDecoder,process:{isMainFrame:true},console});
 let received;desktop.onRunEvent(event=>{assert.equal(sent.at(-1)[1]?.seq,2);received=event;});const payload=Buffer.from(JSON.stringify({kind:'run-snapshot',run:{id:'r',text:'中文😀'}})),end=payload.length-3;
 for(const [seq,data] of [payload.subarray(0,end),payload.subarray(end,end+1),payload.subarray(end+1)].entries())ipc.emit('agent:frame',{}, {id:'one',seq,data,done:false});ipc.emit('agent:frame',{}, {id:'one',seq:3,data:Buffer.alloc(0),done:true});assert.equal(received.run.text,'中文😀');assert.equal(sent.at(-1)[1].seq,3);
 ipc.emit('agent:frame',{}, {id:'one',seq:3,data:Buffer.alloc(0),done:true});assert.equal(sent.length,5);
});
test('HTTP bridge emits exact large done/output/completed objects while leaving no request spool behind',async t=>{
 const http=require('node:http'),{startChatBridge,readSSE}=require('../electron/chat-bridge.cjs');
 const content='中文😀 '+('large output\n'.repeat(12000)),reasoning='review '.repeat(10000),args=JSON.stringify({value:'tool argument '.repeat(10000)});
 const before=new Set(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('amble-text-'+process.pid+'-')));
 const server=http.createServer(async(req,res)=>{if(req.url!=='/chat/completions'){res.writeHead(404);res.end();return;}for await(const chunk of req)void chunk;res.writeHead(200,{'Content-Type':'text/event-stream'});const send=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({choices:[{delta,finish_reason}]})+'\n\n');for(let at=0;at<content.length;at+=4096)send({content:content.slice(at,at+4096)});for(let at=0;at<reasoning.length;at+=4096)send({reasoning_content:reasoning.slice(at,at+4096)});send({tool_calls:[{index:0,id:'call',function:{name:'inspect',arguments:args}}]},'tool_calls');res.end('data: [DONE]\n\n');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const bridge=await startChatBridge({baseUrl:'http://127.0.0.1:'+server.address().port,model:'fixture',protocol:'chat'});t.after(()=>bridge.close());
 const response=await fetch(bridge.config.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bridge.config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'fixture',input:'check',tools:[{type:'function',name:'inspect',parameters:{type:'object',properties:{value:{type:'string'}}}}]})});assert.equal(response.status,200);const events=[];for await(const event of readSSE(response.body))events.push(JSON.parse(event));
 assert.equal(events.find(e=>e.type==='response.output_text.done').text,content);assert.equal(events.find(e=>e.type==='response.reasoning_text.done').text,reasoning);
 const final=events.at(-1);assert.equal(final.type,'response.completed');assert.equal(final.response.output.find(i=>i.type==='message').content[0].text,content);assert.equal(final.response.output.find(i=>i.type==='function_call').arguments,args);assert.equal(final.response.output.find(i=>i.type==='reasoning').content[0].text,reasoning);assert.ok(events.every((event,index)=>event.sequence_number===index));
 assert.deepEqual(new Set(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('amble-text-'+process.pid+'-'))),before);
});
test('partial disk writes retry the exact unwritten suffix without duplicates or dropped later blocks',t=>{
 const s=store(t),value=s.create(),text='中文😀\ud800'.repeat(40000),original=fs.writeSync;let calls=0;
 fs.writeSync=(fd,buffer,offset,length)=>{if(++calls===2)throw Object.assign(Error('disk full'),{code:'ENOSPC'});return original(fd,buffer,offset,Math.min(length,101));};
 try{assert.throws(()=>s.append(value,text),/disk full/);}finally{fs.writeSync=original;}
 assert.equal(s.bytes,text.length*2-101);const ref=s.snapshot(value);assert.equal(s.bytes,0);assert.equal(spool.read(ref),text);
});
test('adding a reasoning part preserves the acknowledged prefix and appends only the separator and new part',t=>{
 const s=store(t),parts=[''],owner={};spool.append(parts,0,'x'.repeat(200000),s);const bind=()=>spool.joined(owner,'text',()=>Object.keys(parts).map(k=>spool.part(parts,k)));bind();const before=spool.reference(owner,'text');parts.push('new thought');bind();const after=spool.reference(owner,'text');assert.ok(spool.prefix(before,after));assert.equal(spool.read(after,before.length),'\n\nnew thought');
 assert.equal(after.hash,require('node:crypto').createHash('sha256').update('x'.repeat(200000)+'\n\nnew thought','utf16le').digest('hex'));
});
