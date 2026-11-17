const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRunPublisher,applyRunEvent}=require('../electron/run-events.mjs');
const {previewTool,toolText}=require('../electron/tool-previews.cjs');
const base=()=>({id:'r',status:'running',messages:[{id:'u',role:'user',text:'task'},{id:'a',role:'assistant',text:'x'.repeat(20000)}],tools:[{id:'t',type:'commandExecution',detail:'output'}],approvals:[]});
test('delta retains unchanged identities, appends long text and transmits immediate control changes',()=>{
 const publisher=createRunPublisher('session');const run=base();let current=applyRunEvent(null,publisher.encode(structuredClone(run)));const original=current;
 run.messages[1].text+=' new';run.approvals=[{id:'approval',detail:'review'}];run.status='waiting';
 const event=publisher.encode(structuredClone(run));assert.ok(JSON.stringify(event).length<1000);current=applyRunEvent(current,event);
 assert.equal(current.run.messages[0],original.run.messages[0]);assert.equal(current.run.tools,original.run.tools);assert.equal(current.run.messages[1].text,run.messages[1].text);assert.equal(current.run.approvals[0].id,'approval');assert.equal(original.run.status,'running');
});
test('missing or corrupt deltas reject without mutation, snapshot restores latest state and old snapshots do not roll back',()=>{
 const publisher=createRunPublisher('session'),run=base();const first=publisher.encode(structuredClone(run));
 run.messages[1].text+=' one';publisher.encode(structuredClone(run));run.messages[1].text+=' two';const last=publisher.encode(structuredClone(run));
 assert.throws(()=>applyRunEvent(first,last),/revision gap/);const restored=applyRunEvent(first,publisher.snapshot('r'));assert.equal(restored.run.messages[1].text,run.messages[1].text);assert.equal(applyRunEvent(restored,first),restored);
 const next=structuredClone(last);next.baseRevision=first.revision;assert.throws(()=>applyRunEvent(first,next),/Invalid text delta/);assert.equal(first.run.messages[1].text.length,20000);
});
test('deletion, reordering and metadata removal remain authoritative',()=>{
 const pub=createRunPublisher('s'),run=base();run.error='old';let state=applyRunEvent(null,pub.encode(structuredClone(run)));delete run.error;run.messages.reverse();run.tools=[];run.status='completed';
 state=applyRunEvent(state,pub.encode(structuredClone(run)));assert.deepEqual(state.run,run);
});
test('tool previews are bounded without altering original records, output pages cover every character',()=>{
 const tool={id:'t',type:'analysis',detail:'abc'.repeat(100000),nativeMessages:{private:'duplicate'},nativeActivity:[{id:'step',text:'z'.repeat(10000)}]};const preview=previewTool(tool);
 assert.equal(preview.detail.length,2048);assert.equal(preview.nativeActivity[0].text.length,512);assert.equal(preview.nativeMessages,undefined);assert.equal(tool.detail.length,300000);
 let rebuilt='';for(let offset=0;offset<tool.detail.length;offset+=64000)rebuilt+=toolText({tools:[tool]},{toolId:'t',offset}).text;assert.equal(rebuilt,tool.detail);
 assert.equal(toolText({tools:[tool]},{toolId:'t',activityId:'step'}).text.length,10000);assert.throws(()=>toolText({tools:[tool]},{toolId:'t',limit:1000000}));
});
test('publisher accepts mutable runtime objects without mutating historical snapshots and bounds its cache',()=>{
 const publisher=createRunPublisher('s'),run=base();const first=publisher.encode(run);run.messages[1].text+=' mutable';const event=publisher.encode(run);
 assert.equal(first.run.messages[1].text.length,20000);assert.equal(applyRunEvent(first,event).run.messages[1].text,run.messages[1].text);
 for(let i=0;i<70;i++)publisher.encode({...base(),id:'other-'+i});assert.equal(publisher.snapshot('r'),undefined);
 const refreshed=publisher.encode(run);assert.equal(refreshed.kind,'run-snapshot');assert.ok(refreshed.revision>event.revision);
});
test('preload exposes raw deltas and keeps legacy snapshots ordered across unsubscribe',async()=>{
 const {EventEmitter}=require('node:events'),{readFileSync}=require('node:fs'),vm=require('node:vm');
 const ipc=new EventEmitter(),pending=[];let desktop;
 ipc.invoke=()=>new Promise(resolve=>pending.push(resolve));
 vm.runInNewContext(readFileSync(require.resolve('../electron/preload.cjs'),'utf8'),{require:()=>({ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(_name,api)=>desktop=api}}),process:{isMainFrame:true},console});
 const raw=[],legacy=[];const offRaw=desktop.onRunEvent(value=>raw.push(value)),off=desktop.onRun(value=>legacy.push(value));
 const pub=createRunPublisher('s'),run=base(),first=pub.encode(run);ipc.emit('agent:event',{},first);run.status='waiting';const delta=pub.encode(run);ipc.emit('agent:event',{},delta);
 assert.equal(raw[1],delta);assert.equal(legacy.length,1);off();const offNew=desktop.onRun(value=>legacy.push(value));pending.shift()(pub.snapshot('r'));await new Promise(resolve=>setImmediate(resolve));assert.equal(legacy.length,1);
 ipc.emit('agent:event',{},pub.snapshot('r'));ipc.emit('agent:event',{},first);assert.equal(legacy.length,2);assert.equal(legacy[1].status,'waiting');offRaw();offNew();assert.equal(ipc.listenerCount('agent:event'),0);
});
test('large MCP output is paged while structured input protocols remain intact',()=>{
 const detail=JSON.stringify({result:'large-output '.repeat(20000)});
 const tool={id:'mcp',type:'mcpToolCall',label:'search/server',detail};const preview=previewTool(tool);
 assert.equal(preview.detail.length,2048);assert.equal(preview.detailPreview,true);
 let full='';for(let offset=0;offset<detail.length;offset+=64000)full+=toolText({tools:[tool]},{toolId:'mcp',offset}).text;assert.equal(full,detail);
 for(const label of ['amble_extensions/input_request','amble_extensions/forms_present','amble_extensions/ui_present']){const input={...tool,label};assert.equal(previewTool(input),input);}
});
test('unchanged tool and native activity previews reuse hashes, changes invalidate them without stale status',()=>{
 const crypto=require('node:crypto');let hashes=0;const load=name=>{const module={exports:{}};require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../electron/'+name),'utf8'),{module,Buffer,require:id=>id==='node:crypto'?{createHash:(...args)=>{hashes++;return crypto.createHash(...args);}}:id==='./runtime-text-cache.cjs'?load('runtime-text-cache.cjs'):require(id)});return module.exports;};const {previewTool}=load('tool-previews.cjs');
 {const tool={type:'analysis',detail:'x'.repeat(10000),status:'running',nativeActivity:[{id:'n',text:'a'.repeat(1000)}]};const first=previewTool(tool);assert.equal(hashes,2);
 tool.status='completed';assert.equal(previewTool(tool).status,'completed');assert.equal(hashes,2);
 tool.detail+='next';const next=previewTool(tool);assert.equal(hashes,3);assert.notEqual(next.detailVersion,first.detailVersion);assert.equal(first.detail.endsWith('next'),false);
 tool.nativeActivity[0].text+='last';previewTool(tool);assert.equal(hashes,4);
 }
});
