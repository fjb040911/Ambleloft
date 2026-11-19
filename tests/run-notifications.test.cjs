const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const compiled={exports:{}};
new Function('module',require('esbuild').transformSync(fs.readFileSync('src/run-notifications.ts','utf8'),{loader:'ts',format:'cjs'}).code)(compiled);
const {createRunNotifications}=compiled.exports;
function fixture(limits={}){
 let frame,timer,cancelled=0;const delivered=[];
 const queue=createRunNotifications({deliver:v=>delivered.push(v),sizeOf:v=>v.bytes||1,
  frame:fn=>(frame=fn,1),cancelFrame:()=>{frame=undefined;cancelled++;},
  timer:fn=>(timer=fn,2),cancelTimer:()=>{timer=undefined;cancelled++;},...limits});
 return {queue,delivered,frame:()=>frame?.(),timer:()=>timer?.(),cancelled:()=>cancelled};
}
test('100 Hz presentation merges latest state without losing concurrent runs',()=>{
 const f=fixture();for(let i=0;i<100;i++)f.queue.push({id:i%2?'child':'parent',sequence:i});
 assert.equal(f.delivered.length,0);assert.equal(f.queue.stats().entries,2);f.frame();
 assert.deepEqual(f.delivered,[{id:'parent',sequence:98},{id:'child',sequence:99}]);assert.equal(f.queue.stats().bytes,0);
});
test('terminal and control notifications flush immediately and cannot replay stale text',()=>{
 const f=fixture();f.queue.push({id:'run',state:'running'});f.queue.push({id:'run',state:'approval'},true);
 f.queue.push({id:'run',state:'completed'},true);f.frame();f.timer();
 assert.deepEqual(f.delivered.map(v=>v.state),['approval','completed']);
});
test('hidden window timer flushes even without a display frame; unsubscribe cancels both',()=>{
 const f=fixture();f.queue.push({id:'run'});f.timer();assert.equal(f.delivered.length,1);
 f.queue.push({id:'other'});f.queue.clear();f.frame();f.timer();assert.equal(f.delivered.length,1);assert.equal(f.queue.stats().entries,0);
});
test('byte and entry pressure flush rather than discard or retain unbounded text',()=>{
 const f=fixture({maxEntries:2,maxBytes:5});f.queue.push({id:'a',bytes:3});f.queue.push({id:'b',bytes:3});
 assert.deepEqual(f.delivered.map(v=>v.id),['a']);f.queue.push({id:'b',bytes:2});assert.equal(f.queue.stats().bytes,2);
 f.queue.push({id:'c',bytes:1});f.queue.push({id:'d',bytes:1});assert.deepEqual(f.delivered.map(v=>v.id),['a','b','c']);
 f.queue.push({id:'large',bytes:10});assert.equal(f.queue.stats().bytes,0);assert.deepEqual(f.delivered.map(v=>v.id),['a','b','c','d','large']);
});
