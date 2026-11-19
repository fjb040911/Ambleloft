const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRunPublication}=require('../electron/run-publication.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
const {applyRunEvent}=require('../electron/run-events.mjs');
const {pageRun}=require('../electron/history-pages.cjs');
const {RunDelivery}=require('../electron/run-delivery.cjs');
const {RuntimeTextCache}=require('../electron/runtime-text-cache.cjs');

const messageHint=id=>JSON.stringify(['messages',id]);
function fixture(){
 const run={id:'r',status:'running',messages:[{id:'u',role:'user',text:'question'},{id:'a',role:'assistant',turnKey:'u',text:'reply'}],tools:[],approvals:[]};
 const window=()=>{
  const details=[],summaries=[],forgotten=[];
  return {runDetails:new Set(),details,summaries,forgotten,
   delivery:{push:event=>details.push(event),forget:id=>forgotten.push(id)},
   window:{webContents:{send:(_channel,value)=>summaries.push(value)}}};
 };
 const first=window(),second=window();
 const publication=createRunPublication({epoch:'test',findRun:id=>id===run.id?run:undefined,windows:()=>[first,second]});
 return {run,first,second,publication};
}
test('visible windows share a single incremental projection while background windows receive controls',()=>{
 const {run,first,second,publication}=fixture();
 publication.publish(run);
 assert.deepEqual(first.summaries[0].messages,[]);
 assert.equal(first.summaries[0].summaryOnly,true);
 assert.equal(publication.stats().fullProjections,0);
 publication.subscribe(first,[run.id]);
 let state=applyRunEvent(null,first.details[0]);
 run.messages[1].text+=' visible';
 publication.publish(run,new Set([messageHint('a')]));
 state=applyRunEvent(state,first.details.at(-1));
 assert.deepEqual(state.run,pageRun(run));
 assert.equal(publication.stats().incrementalProjections,1);
 assert.equal(second.details.length,0);
 assert.equal(second.summaries.length,1);
 run.status='waiting';run.approvals.push({id:'approval'});run.questions=[{id:'question'}];
 publication.publish(run);
 assert.equal(second.summaries.at(-1).status,'waiting');
 assert.deepEqual(second.summaries.at(-1).approvals,run.approvals);
 assert.deepEqual(second.summaries.at(-1).questions,run.questions);
 publication.subscribe(second,[run.id]);
 run.messages[1].text+=' both';
 publication.publish(run,new Set([messageHint('a')]));
 assert.equal(first.details.at(-1),second.details.at(-1));
 assert.equal(publication.stats().incrementalProjections,2);
});
test('opening a background run catches up from current state and structural changes rebuild the page',()=>{
 const {run,first,publication}=fixture();
 publication.subscribe(first,[run.id]);
 publication.subscribe(first,[]);
 assert.deepEqual(first.forgotten,[run.id]);
 run.messages[1].text='updated while hidden';
 publication.publish(run,new Set([messageHint('a')]));
 assert.equal(publication.stats().skippedStreams,1);
 assert.equal(first.details.length,1);
 publication.subscribe(first,[run.id]);
 const snapshot=first.details.at(-1);
 assert.equal(snapshot.kind,'run-snapshot');
 assert.deepEqual(snapshot.run,pageRun(run));
 run.messages.push({id:'b',role:'assistant',turnKey:'u',text:'new segment'});
 publication.publish(run,new Set([messageHint('b')]));
 assert.deepEqual(applyRunEvent(snapshot,first.details.at(-1)).run,pageRun(run));
 assert.equal(publication.stats().fullProjections,3);
});
test('stream coalescing accumulates changed IDs and an immediate control flush supersedes them',async t=>{
 const calls=[];
 const runtime=new AgentRuntime({directory:'/unused',publishChanges:(_run,items)=>calls.push(items)});
 t.after(()=>clearTimeout(runtime.saveTimer));
 const run={id:'r',messages:[],tools:[]};
 runtime.changed(run);
 runtime.changed(run,{stream:true,items:[['messages','a']]});
 runtime.changed(run,{stream:true,items:[['messages','b'],['messages','a']]});
 await new Promise(resolve=>setTimeout(resolve,80));
 assert.deepEqual([...calls[1]],[messageHint('a'),messageHint('b')]);
 runtime.changed(run,{stream:true,items:[['messages','a']]});
 runtime.changed(run);
 assert.equal(calls.at(-1),null);
});
test('storage compaction invalidates an unchanged tool preview before the next text delta',()=>{
 const {run,first,publication}=fixture();
 const tool={id:'t',turnKey:'u',type:'analysis',status:'completed',detail:'x'.repeat(3000)};
 run.tools.push(tool);
 publication.subscribe(first,[run.id]);
 const snapshot=first.details[0];
 const cache=new RuntimeTextCache('/unused');
 cache.database=()=>({prepare:()=>({get:()=>({length:tool.detail.length,revision:'persisted'})})});
 cache.compact([{id:run.id,source:run,entries:[{collection:'tools',key:tool.id,source:tool,value:{texts:new Map([['["detail"]',tool.detail]])}}]}]);
 run.messages[1].text+=' next';
 publication.publish(run,new Set([messageHint('a')]));
 assert.equal(publication.stats().fullProjections,2);
 assert.equal(applyRunEvent(snapshot,first.details.at(-1)).run.tools[0].detailVersion,'persisted');
});
test('unsubscribing drops the rest of a transfer after the outstanding packet is acknowledged',()=>{
 const sent=[],snapshots=new Map();
 const delivery=new RunDelivery(frame=>sent.push(frame),id=>snapshots.get(id));
 const first={kind:'run-snapshot',epoch:'test',revision:1,run:{id:'a',text:'x'.repeat(130000)}};
 const next={kind:'run-snapshot',epoch:'test',revision:1,run:{id:'b'}};
 snapshots.set('b',next);
 delivery.reset();delivery.push(first);delivery.push(next);delivery.forget('a');
 assert.equal(sent.length,1);
 delivery.ack(sent[0]);
 assert.equal(sent[1].seq,0);
 assert.notEqual(sent[1].id,sent[0].id);
 assert.deepEqual(JSON.parse(sent[1].data),next);
});
