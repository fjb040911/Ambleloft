const {test}=require('node:test'),assert=require('node:assert/strict');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {pageRun}=require('../electron/history-pages.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(t,projectRun){const events=[];const runtime=new AgentRuntime({directory:'/unused',publish:r=>events.push(r),projectRun});runtime.persist=async()=>{};t.after(()=>clearTimeout(runtime.saveTimer));return {runtime,events};}
test('stream publishes first frame synchronously and coalesces bursts with a trailing snapshot',async t=>{
 const {runtime,events}=fixture(t);const run={messages:[{text:'a'}]};runtime.changed(run,{stream:true});assert.equal(events.length,1);
 for(let i=0;i<100;i++){run.messages[0].text+='x';runtime.changed(run,{stream:true});}
 assert.equal(events.length,1);assert.equal(events[0].messages[0].text,'a');await delay(80);assert.equal(events.length,2);assert.equal(events[1].messages[0].text.length,101);
});
test('approval and terminal updates immediately flush pending text without a stale trailing event',async t=>{
 const {runtime,events}=fixture(t);const run={status:'running',messages:[]};runtime.changed(run,{stream:true});run.messages.push({text:'latest'});runtime.changed(run,{stream:true});run.status='waiting';run.approvals=[{id:'approve'}];runtime.changed(run);assert.equal(events.at(-1).approvals[0].id,'approve');assert.equal(events.at(-1).messages[0].text,'latest');run.status='completed';runtime.changed(run);const count=events.length;await delay(80);assert.equal(events.length,count);assert.equal(events.at(-1).status,'completed');
});
test('pagination happens before cloning and leaves authoritative history intact',t=>{
 const {runtime,events}=fixture(t,pageRun);const run={messages:[],tools:[],modelRequests:[{private:'diagnostic'}]};
 for(let i=0;i<300;i++){run.messages.push({id:'u'+i,role:'user',text:'task'},{id:'a'+i,role:'assistant',text:'answer'});run.tools.push({id:'t'+i,turnKey:'u'+i,detail:'x'.repeat(20000)});}
 // Old pages cannot be cloned; a successful publication proves projection came first.
 run.tools[0].notCloneable=()=>{};runtime.changed(run);assert.equal(events[0].messages.length,60);assert.equal(events[0].turnOffset,270);assert.equal(events[0].tools.length,30);assert.equal(events[0].modelRequests,undefined);assert.equal(run.tools.length,300);
 run.tools[299].detail='changed later';assert.equal(events[0].tools.at(-1).detail.length,20000);
});
