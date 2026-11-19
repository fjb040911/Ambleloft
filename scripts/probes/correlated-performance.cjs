// Opt-in instrumentation for isolated synthetic probes, never user profiles.
const fs=require('node:fs'),path=require('node:path');
function observeRenderer(){
 const events=window.__correlatedEvents=[];const add=value=>{events.push({at:Date.now(),...value});if(events.length>200)events.shift();void window.__recordCorrelated?.(events.at(-1));};
 let previous;requestAnimationFrame(function frame(now){if(previous!==undefined&&now-previous>100)add({kind:'frame-gap',ms:now-previous,visible:document.visibilityState});previous=now;requestAnimationFrame(frame);});
 new PerformanceObserver(list=>{for(const e of list.getEntries())add({kind:'longtask',startEpoch:performance.timeOrigin+e.startTime,ms:e.duration});}).observe({type:'longtask'});
}
async function start(app,page,out){
 let previous=performance.now(),cpu=process.cpuUsage();const runnerTimer=setInterval(()=>{const now=performance.now(),ms=now-previous,used=process.cpuUsage(cpu);previous=now;cpu=process.cpuUsage();if(ms>120)fs.appendFileSync(path.join(out,'runner-events.jsonl'),JSON.stringify({at:Date.now(),kind:'runner-gap',ms,cpuMs:(used.user+used.system)/1000})+'\n');},50);
 await page.exposeFunction('__recordCorrelated',value=>fs.appendFileSync(path.join(out,'renderer-events.jsonl'),JSON.stringify(value)+'\n'));
 await page.addInitScript(observeRenderer);await page.evaluate(observeRenderer);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:5000});await cdp.send('Profiler.start');
 await app.evaluate(async({app,contentTracing},out)=>{
  const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path'),perf=process.mainModule.require('node:perf_hooks');
  const profiler=new(process.mainModule.require('node:inspector').Session)();profiler.connect();const post=(name,args={})=>new Promise((r,j)=>profiler.post(name,args,(e,v)=>e?j(e):r(v)));
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:5000});await post('Profiler.start');
  const events=[];let capturing=false,captures=0,stopped=false;
  const record=event=>{events.push({at:Date.now(),monoMs:performance.now(),...event});if(events.length>1000)events.shift();fs.appendFile(path.join(out,'main-events.jsonl'),JSON.stringify(events.at(-1))+'\n',()=>{});};
  record({kind:'clock',hrtimeUs:Number(process.hrtime.bigint()/1000n)});
  // Chromium uses record_mode; recording_mode silently filled and stopped.
  // The saturation probe checks actual late-event retention, not API success.
  const config={record_mode:'record-continuously',trace_buffer_size_in_kb:32768,included_categories:['toplevel','devtools.timeline','v8.execute','gpu','viz','cc','benchmark']};

  const observer=new perf.PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>20)record({kind:'gc',ms:e.duration});});observer.observe({entryTypes:['gc']});
  const stopHeartbeat=await process.mainModule.require(path.join(app.getAppPath(),'scripts/probes/heartbeat.cjs')).startHeartbeat({prepare:()=>contentTracing.startRecording(config),clock:()=>performance.now(),cpu:()=>process.cpuUsage(),onGap:({ms,cpuMs})=>{record({kind:'main-gap',ms,cpuMs,capturing});if(!capturing&&captures<3){capturing=true;const number=++captures;void contentTracing.stopRecording(path.join(out,'gap-'+number+'.trace.json')).then(()=>{record({kind:'trace-written',number});if(!stopped)return contentTracing.startRecording(config);}).catch(e=>record({kind:'trace-error',message:e.message})).finally(()=>{capturing=false;});}}});
  global.__correlatedStop=async()=>{stopped=true;stopHeartbeat();observer.disconnect();while(capturing)await new Promise(r=>setTimeout(r,20));try{await contentTracing.stopRecording(path.join(out,'tail.trace.json'));}catch{}const result=await post('Profiler.stop');profiler.disconnect();fs.writeFileSync(path.join(out,'main.cpuprofile'),JSON.stringify(result.profile));fs.writeFileSync(path.join(out,'main-events.json'),JSON.stringify({events,captures},null,2));};
 },out);
 return async()=>{clearInterval(runnerTimer);const rendererEvents=await page.evaluate(()=>window.__correlatedEvents);fs.writeFileSync(path.join(out,'renderer-events.json'),JSON.stringify(rendererEvents,null,2));const result=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(out,'renderer.cpuprofile'),JSON.stringify(result.profile));await cdp.detach();await app.evaluate(()=>global.__correlatedStop());};
}
module.exports={start};
