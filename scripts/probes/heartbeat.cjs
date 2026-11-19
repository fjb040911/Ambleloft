// Probe-only monitor: setup latency is not an event-loop interval.
async function startHeartbeat({prepare,clock,cpu,onGap,schedule=setInterval,cancel=clearInterval,interval=50,threshold=120}) {
 await prepare();
 let previous=clock(),lastCpu=cpu();
 const timer=schedule(()=>{const now=clock(),used=cpu(),ms=now-previous;const cpuMs=(used.user-lastCpu.user+used.system-lastCpu.system)/1000;previous=now;lastCpu=used;if(ms>threshold)onGap({ms,cpuMs});},interval);
 return()=>cancel(timer);
}
module.exports={startHeartbeat};
