// Low-overhead control: no V8 profiler and no Chromium contentTracing session.
const fs=require('node:fs'),path=require('node:path');
async function start(app,page,out){
 await page.exposeFunction('__recordCorrelated',e=>fs.appendFileSync(path.join(out,'renderer-events.jsonl'),JSON.stringify(e)+'\n'));
 const observe=()=>{let last;requestAnimationFrame(function frame(now){if(last!==undefined&&now-last>120)void window.__recordCorrelated({at:Date.now(),kind:'frame-gap',ms:now-last,visible:document.visibilityState});last=now;requestAnimationFrame(frame);});};
 await page.addInitScript(observe);await page.evaluate(observe);
 await app.evaluate(async({app},out)=>{const fs=process.mainModule.require('fs'),path=process.mainModule.require('path');const events=[];const add=e=>{events.push({at:Date.now(),...e});if(events.length>1000)events.shift();fs.appendFile(path.join(out,'main-events.jsonl'),JSON.stringify(events.at(-1))+'\n',()=>{});};add({kind:'clock',monoMs:performance.now(),hrtimeUs:Number(process.hrtime.bigint()/1000n)});const stop=await process.mainModule.require(path.join(app.getAppPath(),'scripts/probes/heartbeat.cjs')).startHeartbeat({prepare:async()=>{},clock:()=>performance.now(),cpu:()=>process.cpuUsage(),onGap:e=>add({kind:'main-gap',...e})});global.__lightStop=()=>{stop();fs.writeFileSync(path.join(out,'main-events.json'),JSON.stringify({events}));};},out);
 return()=>app.evaluate(()=>global.__lightStop());
}
module.exports={start};
