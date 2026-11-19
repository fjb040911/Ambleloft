// Saturate a tiny native trace buffer and verify the last marker survives.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
(async()=>{const app=await require('./electron-native-launch.cjs').launch({args:['.',`--user-data-dir=${path.join(out,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});try{
 const page=await app.firstWindow();await page.waitForFunction(()=>window.desktop);const results=[];
 for(const field of ['recording_mode','record_mode','legacy']){
  await app.evaluate(async({contentTracing},field)=>contentTracing.startRecording(field==='legacy'?{categoryFilter:'blink.user_timing',traceOptions:'record-continuously'}:{[field]:'record-continuously',trace_buffer_size_in_kb:4096,included_categories:['blink.user_timing']}),field);
  await page.reload();await page.waitForFunction(()=>window.desktop);await page.evaluate(async(batches)=>{for(let batch=0;batch<batches;batch++){for(let i=0;i<2000;i++)performance.mark('buffer-fill-'+batch+'-'+i);performance.clearMarks();await new Promise(r=>setTimeout(r,10));}performance.mark('late-ring-marker');},field==='legacy'?1000:100);
  await page.waitForTimeout(300);const file=path.join(out,field+'.json');await app.evaluate(async({contentTracing},file)=>contentTracing.stopRecording(file),file);
  const trace=JSON.parse(fs.readFileSync(file));results.push({field,events:trace.traceEvents.length,lateMarker:trace.traceEvents.some(e=>e.name==='late-ring-marker')});
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));assert.equal(results[1].lateMarker,true,'Bounded continuous buffer must retain late events');assert.equal(results[2].lateMarker,true,'Legacy continuous buffer must retain late events');assert.ok(results[2].events<2000000,'Legacy buffer must actually overwrite old events');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
