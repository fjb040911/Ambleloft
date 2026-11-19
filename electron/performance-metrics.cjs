const {monitorEventLoopDelay}=require('node:perf_hooks');
const allowed=new Set(['rpcReadBytes','rpcReadPauses','rpcWriteBytes','rpcFrameBytes','rpcJsonMetadataBytes','rpcSpoolWrittenBytes','bridgeWritePauses','bridgeWriteWaitMs','databasePendingBytes','databaseBackpressure','databaseMs','databaseLockMs','databaseCommitMs','databaseTextWriteMs','databaseFingerprintMs','databaseIndexMs','databaseSnapshotMs','databaseQueueWaitMs','databasePending','pageRunMs','spaceSnapshotMs','spaceStatusQueries','spacePreviewQueries','spaceFullQueries','workforceSnapshotMs']);
function createMetrics(limit=360){
 const samples=[],exits=[],responsiveness=[];let counters={};
 return {
  record(name,value){if(!allowed.has(name)||!Number.isFinite(value)||value<0)return;const metric=counters[name]||={count:0,total:0,max:0};metric.count++;metric.total+=value;metric.max=Math.max(metric.max,value);},
  sample(memory,lag){const {rss,heapUsed,heapTotal,external,arrayBuffers}=memory;samples.push({at:new Date().toISOString(),memory:{rss,heapUsed,heapTotal,external,arrayBuffers},eventLoopMs:lag,metrics:counters});counters={};if(samples.length>limit)samples.shift();},
  exited(reason,exitCode){if(!['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure'].includes(reason))reason='unknown';exits.push({at:new Date().toISOString(),reason,exitCode:Number.isInteger(exitCode)?exitCode:null});if(exits.length>20)exits.shift();},
  responsiveness(state,contentsId){if(!['unresponsive','responsive'].includes(state)||!Number.isSafeInteger(contentsId)||contentsId<0)return;responsiveness.push({at:new Date().toISOString(),state,contentsId});if(responsiveness.length>20)responsiveness.shift();},
  snapshot(){return structuredClone({scope:'main-process; renderer lifecycle events',intervalMs:10000,samples,exits,responsiveness,current:counters});},
 };
}
const metrics=createMetrics();
function startMetrics(){
 const histogram=monitorEventLoopDelay({resolution:20});histogram.enable();
 const sample=()=>{metrics.sample(process.memoryUsage(),{p95:histogram.percentile(95)/1e6,max:histogram.max/1e6});histogram.reset();};
 sample();const timer=setInterval(sample,10000);timer.unref();
 return()=>{clearInterval(timer);histogram.disable();};
}
module.exports={metrics,createMetrics,startMetrics};
