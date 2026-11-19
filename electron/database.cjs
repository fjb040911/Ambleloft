const {metrics}=require('./performance-metrics.cjs');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
function retainedBytes(value,seen=new Set()){
 if(typeof value==='string')return value.length*2;if(!value||typeof value!=='object')return 8;if(seen.has(value))return 0;seen.add(value);
 if(ArrayBuffer.isView(value))return value.byteLength;let bytes=32;for(const key of Object.keys(value))bytes+=key.length*2+retainedBytes(value[key],seen);return bytes;
}
class Database {
 constructor(directory,{highBytes=16*1024*1024,lowBytes=4*1024*1024,maxBytes=64*1024*1024}={}){
  this.pendingBytes=0;this.highBytes=highBytes;this.lowBytes=lowBytes;this.maxBytes=maxBytes;this.pressure=false;this.pressureListeners=new Set();
  this.file=path.join(directory,'atelier.sqlite');
  this.worker=new Worker(path.join(__dirname,'database-worker.cjs'),{workerData:{file:path.join(directory,'atelier.sqlite')}});
  this.incrementalRuns=true;this.runPatches=require('./run-patches.cjs').createRunPatches();this.operations=Promise.resolve();this.queuedCalls=0;
  this.pending=new Map();this.sequence=0;this.failed=null;this.closed=false;
  const fail=error=>{this.failed=error;for(const p of this.pending.values())p.reject(error);this.pending.clear();};
  this.worker.on('error',fail);this.worker.on('exit',code=>{if(!this.closed)fail(new Error(`数据库进程已退出（${code}）`));});
  this.worker.on('message',message=>{if(message.fatal){fail(new Error(message.fatal));return;}const p=this.pending.get(message.id);if(!p)return;this.pending.delete(message.id);this.lastTimings=message.timings||{};for(const [name,value]of Object.entries(this.lastTimings))metrics.record(name,value);metrics.record('databaseMs',performance.now()-p.started);if(message.error)p.reject(Object.assign(new Error(message.error),{code:message.code}));else p.resolve(message.value);});
 }
 call(method,args,options){
  let captured,saveOptions;
  try{if(['saveRuns','saveRunUpdates','commitTurn','commitRunStart'].includes(method)){
   const runs=Array.isArray(args)?args:args.runs;
   saveOptions={replace:method==='saveRuns'||method==='commitTurn'&&!args.partial||method==='commitRunStart'&&!args.partial,terminal:method==='commitTurn'?{runId:args.runId,turnId:args.turnId}:undefined,start:method==='commitRunStart'?{runId:runs[0]?.id,draftId:args.draftId,expectedRevision:args.expectedRevision}:undefined};
   captured=this.runPatches.capture(runs,options?.hints);
  }}catch(error){return Promise.reject(error);}
  const bytes=captured?captured.reduce((total,run)=>total+(run.metadata?.length||0)*2+(run.entries||[]).reduce((n,entry)=>n+entry.value.data.length*2+[...entry.value.texts.values()].reduce((a,text)=>a+(typeof text==='string'?text.length*2:retainedBytes(text)),0),0),0):retainedBytes(args);
  const reserve=method==='saveRunUpdates'?0:4*1024*1024;
  if(this.pendingBytes+bytes>this.maxBytes+reserve)return Promise.reject(Object.assign(Error('数据库保存队列超过字节上限，当前操作未提交，请稍后重试。'),{code:'DATABASE_BACKPRESSURE'}));
  this.pendingBytes+=bytes;this.updatePressure();
  const queuedAt=performance.now();metrics.record('databasePending',++this.queuedCalls);
  const operation=this.operations.then(async()=>{
   metrics.record('databaseQueueWaitMs',performance.now()-queuedAt);
   if(method==='readRuntimeRuns'){const state=await this.request('readRuntimeState');this.textCache??=new(require('./runtime-text-cache.cjs').RuntimeTextCache)(this.file);const runs=this.textCache.attach(state);this.runPatches.seed(runs);return runs;}
   if(method==='readRuns'){const state=await this.request('readRunState');if(!this.textCache)this.runPatches.seed(state.runs,state.legacy);return state.runs;}
   if(captured){
    const batch=this.runPatches.prepareCaptured(captured,saveOptions);
    const result=await this.request('saveRunPatches',batch.input);batch.commit();this.textCache?.compact(captured);return result;
   }
   return this.request(method,args);
  });const tracked=operation.finally(()=>{this.queuedCalls--;this.pendingBytes-=bytes;this.updatePressure();});this.operations=tracked.catch(()=>{});return tracked;
 }
 getSpool(){return this.textSpool??=new(require('./text-spool.cjs').TextSpool)(path.dirname(this.file));}
 subscribePressure(listener){this.pressureListeners.add(listener);return()=>this.pressureListeners.delete(listener);}
 updatePressure(){metrics.record('databasePendingBytes',this.pendingBytes);const next=this.pendingBytes>=this.highBytes||this.pressure&&this.pendingBytes>this.lowBytes;if(next!==this.pressure){this.pressure=next;metrics.record('databaseBackpressure',next?1:0);}for(const listener of this.pressureListeners)listener(this.pressure,this.pendingBytes);}
 request(method,args){if(this.failed)return Promise.reject(this.failed);if(this.closed)return Promise.reject(new Error('数据库已关闭'));return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject,started:performance.now()});try{this.worker.postMessage({id,method,args});}catch(error){this.pending.delete(id);reject(error);}});}
 async close(){if(this.closed)return;try{await this.call('close');}finally{this.closed=true;this.pressureListeners.clear();this.textCache?.close();await this.worker.terminate();this.textSpool?.close();}}
}
module.exports={Database};
