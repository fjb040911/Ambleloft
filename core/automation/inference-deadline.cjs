const MAX_INFERENCE_MS=300000;
function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const abort=()=>{cleanup();reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}
// Background inference has a shared absolute deadline. Interactive discussion
// explicitly passes null and relies on its idle timer plus user cancellation.
function inferenceDeadline(parent,{timeoutMs=180000,idleTimeoutMs}={}){
 const total=timeoutMs===null?null:Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,MAX_INFERENCE_MS):180000;
 const idle=Number.isFinite(idleTimeoutMs)&&idleTimeoutMs>0?Math.min(idleTimeoutMs,total??Infinity):null;
 const controller=new AbortController(),started=Date.now();let lastProgress=started,idleTimer,disposed=false;
 const signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
 const expire=code=>controller.abort(Object.assign(Error(code),{code,diagnostics:{elapsedMs:Date.now()-started,silentMs:Date.now()-lastProgress,timeoutMs:total,idleTimeoutMs:idle}}));
 const totalTimer=total===null?null:setTimeout(()=>expire('MODEL_TIMEOUT'),total);totalTimer?.unref?.();
 const touch=()=>{if(disposed||signal.aborted)return;lastProgress=Date.now();clearTimeout(idleTimer);if(idle){idleTimer=setTimeout(()=>expire('MODEL_RESPONSE_TIMEOUT'),idle);idleTimer.unref?.();}};
 const dispose=()=>{disposed=true;clearTimeout(totalTimer);clearTimeout(idleTimer);signal.removeEventListener('abort',dispose);};
 signal.addEventListener('abort',dispose,{once:true});
 if(signal.aborted)dispose();else touch();
 return {signal,touch,dispose,timeoutMs:total};
}
module.exports={inferenceDeadline,abortable,MAX_INFERENCE_MS};
