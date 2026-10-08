const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const DEFAULTS={activation:10000,deactivation:5000,operation:30000,maximumOperation:120000,concurrency:4,queue:32,heartbeat:5000,missedHeartbeats:3,stable:300000,retry:[1000,5000,15000]};
const failure=(code,message,effectStatus='notStarted')=>Object.assign(new Error(message),{code,effectStatus});
class HostManager{
 constructor({service,adapter,limits={},publish=()=>{},clock=()=>performance.now()}){this.service=service;this.adapter=adapter;this.clock=clock;this.suspended=false;this.limits={...DEFAULTS,...limits};this.publish=publish;this.entries=new Map();this.closed=false;}
 entry(id){if(!this.entries.has(id))this.entries.set(id,{id,state:'dormant',failures:0,blocked:false,queue:[],running:new Map(),logs:'',context:{}});return this.entries.get(id);}
 snapshot(id){const e=this.entries.get(id);return e?{state:e.state,diagnostic:e.diagnostic||null,activeCalls:e.running.size,queuedCalls:e.queue.length}: {state:'dormant',activeCalls:0,queuedCalls:0};}
 changed(e){this.publish(e.id,this.snapshot(e.id));}
 installation(id){const item=this.service.items.find(i=>i.id===id);if(!item||item.kind!=='package'||!item.manifest?.main)throw failure('UNSUPPORTED','此扩展没有 Node 入口');if(!item.trusted)throw failure('UNTRUSTED','扩展代码尚未信任');if(!item.enabled||item.pending)throw failure('DISABLED','扩展已停用或正在更新');return item;}
 reconcile(id){const e=this.entry(id);if(this.closed)return;e.blocked=false;let item;try{item=this.installation(id);}catch{return;}
  if(item.manifest.activationEvents?.includes('onStartupFinished'))void this.activate(id).catch(()=>{});
 }
 async activate(id,{manual=false}={}){
  const e=this.entry(id);if(this.closed||e.blocked)throw failure('DISABLED','扩展宿主正在停止');
  if(e.retiring){await e.retiring;return this.activate(id,{manual});}
  if(e.state==='active')return e;if(e.starting)return e.starting;if(e.stopping){await e.stopping;return this.activate(id,{manual});}
  if(e.state==='paused'&&!manual)throw failure('HOST_UNAVAILABLE','扩展恢复已暂停，请手动重启');
  if(manual){e.failures=0;clearTimeout(e.retry);e.retry=null;}
  if(e.retry&&!manual)throw failure('HOST_UNAVAILABLE','扩展正在等待恢复');
  const item=this.installation(id);e.state='starting';e.diagnostic=null;e.token=randomUUID();const token=e.token;this.changed(e);
  e.starting=this.start(e,item,token).finally(()=>{e.starting=null;});return e.starting;
 }
 async start(e,item,token){
  try{
   const revision=item.revisions.find(r=>r.digest===item.active),directory=path.join(this.service.packages.root,revision.relativePath);
   const checked=await this.service.packages.prepare(directory,'directory');if(checked.digest!==item.active)throw failure('UNTRUSTED','扩展包内容已改变');
   if(e.blocked||this.closed||e.token!==token||this.installation(e.id).generation!==item.generation)throw failure('CANCELLED','激活已取消');
   e.item=item;e.logs='';e.context={};e.rpcCount=0;e.lastRpcId=0;
   const child=this.adapter.spawn(directory);e.child=child;
   const ready=new Promise((resolve,reject)=>{e.ready={resolve,reject};});
   let exitResolve;e.exited=new Promise(resolve=>{exitResolve=resolve;});
   child.on('message',message=>{void this.message(e,token,message).catch(()=>this.fail(e,token,'扩展协议错误'));});
   child.on('log',data=>{e.logs=(e.logs+String(data).slice(0,8192)).slice(-65536);});
   child.once('exit',()=>{exitResolve();if(e.token!==token)return;e.child=null;if(e.state!=='stopping')this.fail(e,token,'扩展进程已退出');});
   child.once('error',()=>this.fail(e,token,'扩展进程启动失败'));
   e.activationTimer=setTimeout(()=>this.fail(e,token,'扩展激活超时'),this.limits.activation);
   child.send({type:'initialize',token,id:e.id,revision:item.active,directory,manifest:item.manifest,dictionaries:item.dictionaries||{},locale:this.adapter.locale||'en'});
   await ready;if(e.token!==token||e.blocked)throw failure('CANCELLED','激活已取消');
   clearTimeout(e.activationTimer);e.state='active';e.lastPong=this.clock();e.lastHeartbeat=e.lastPong;
   e.heartbeat=setInterval(()=>this.checkHeartbeat(e,token),this.limits.heartbeat);
   e.stableTimer=setTimeout(()=>{e.failures=0;},this.limits.stable);this.changed(e);this.drain(e);return e;
  }catch(error){if(e.token===token&&!e.blocked&&e.state==='starting')this.fail(e,token,error.code==='UNTRUSTED'?'扩展包内容已改变': '扩展激活失败');throw error;}
 }
 // Heartbeat deadlines measure observable awake time, not wall-clock sleep time.
 suspend(){if(!this.closed)this.suspended=true;}
 resume(){
  if(this.closed)return;this.suspended=false;const now=this.clock();
  for(const e of this.entries.values())if(e.state==='active'&&!e.blocked){
   e.lastHeartbeat=now;e.heartbeatGraceUntil=now+this.limits.heartbeat*this.limits.missedHeartbeats;
   this.send(e,{type:'ping'});
  }
 }
 checkHeartbeat(e,token){
  if(this.closed||this.suspended||e.blocked||e.token!==token||e.state!=='active')return;
  const now=this.clock(),budget=this.limits.heartbeat*this.limits.missedHeartbeats;
  // A delayed host timer is not evidence that the child ignored probes. Give
  // IPC a fresh observation window, including when a power event was missed.
  if(now-e.lastHeartbeat>=budget)e.heartbeatGraceUntil=now+budget;
  e.lastHeartbeat=now;
  if(now-e.lastPong>=budget&&now>=(e.heartbeatGraceUntil||0)){this.fail(e,token,'扩展后台无响应');return;}
  this.send(e,{type:'ping'});
 }
 send(e,message){try{e.child?.send({...message,token:e.token});}catch{this.fail(e,e.token,'扩展通道已关闭');}}
 async message(e,token,m){
  if(e.token!==token||!m||m.token!==token||e.blocked)return;
  if(m.type==='pong'){e.lastPong=this.clock();return;}
  if(m.type==='ready'&&e.state==='starting'){
   const expected=(e.item.manifest.operations||[]).map(op=>op.handler);
   if(!Array.isArray(m.handlers)||m.handlers.length!==expected.length||new Set(m.handlers).size!==expected.length||!expected.every(name=>m.handlers.includes(name))){this.fail(e,token,'扩展 handler 注册不完整');return;}
   e.ready?.resolve();e.ready=null;return;
  }
  if(m.type==='activationError'){this.fail(e,token,'扩展 activate 失败，请检查扩展实现');return;}
  if(m.type==='result'){
   const call=e.running.get(m.id);if(!call||call.responding)return;call.responding=true;
   if(!call.done){if(m.error)this.finish(call,failure(require('./errors.cjs').publicCode(m.error),'扩展操作执行失败','unknown'));else {
     let valid=false;try{valid=await this.service.packages.validateValue(call.operation.outputSchema,m.value);}catch{}
     if(e.token!==token||e.blocked)this.finish(call,failure('CANCELLED','扩展状态已改变','unknown'));
     else if(!valid)this.finish(call,failure('INVALID_OUTPUT','扩展返回值不符合契约','unknown'));else this.finish(call,null,m.value);
   }}e.running.delete(m.id);this.drain(e);return;
  }
  if(m.type==='rpc'&&['starting','active'].includes(e.state)){
   if(typeof m.id!=='string'||!/^\d{1,15}$/.test(m.id)||Number(m.id)<=e.lastRpcId){this.fail(e,token,'扩展请求 ID 无效或重复');return;}
   e.lastRpcId=Number(m.id);if(e.rpcCount>=32)return this.send(e,{type:'rpcResult',id:m.id,error:'BUSY'});
   e.rpcCount++;try{
    if(Buffer.byteLength(JSON.stringify(m))>300*1024)throw failure('INVALID_ARGUMENT','请求过大');
    const context={id:e.id,generation:e.item.generation};let value;
    if(m.method==='storage'){
     const p=m.params;if(!p||!['kv','secret','configuration'].includes(p.kind))throw failure('INVALID_ARGUMENT','存储参数无效');
     if(p.kind==='configuration'&&p.write)throw failure('FORBIDDEN','扩展不可修改宿主配置');
     value=await this.service.storage(context,p.key,{kind:p.kind,write:p.write===true,value:p.value,expectedRevision:p.expectedRevision,deleteValue:p.remove===true});
    }else if(m.method==='authentication'){
     if(!this.service.authentication)throw failure('UNSUPPORTED','Authentication unavailable');
     value=await this.service.authentication.forExtension(context,m.params?.method,m.params?.input);
    }else if(m.method==='messages'){
     if(!this.service.messages)throw failure('UNSUPPORTED','Message service unavailable');
     value=await this.service.messages.forExtension(context,m.params?.method,m.params?.input);
    }else if(m.method==='context'){
     const p=m.params,decl=e.item.manifest.contextKeys?.find(k=>k.key===p?.key);
     if(!decl||typeof p.value!==decl.type||typeof p.value==='number'&&!Number.isFinite(p.value)||typeof p.value==='string'&&p.value.length>4096)throw failure('INVALID_ARGUMENT','上下文键无效');
     e.context[p.key]=p.value;this.changed(e);value=null;
    }else if(m.method==='resource'){
     const call=e.running.get(m.params?.invocationId);if(!call||call.done||call.responding||!call.resources)throw failure('FORBIDDEN','Invocation expired');value=await call.resources(m.params.method,m.params.input);if(call.done)throw failure('CANCELLED','Invocation ended');
    }else throw failure('UNSUPPORTED','当前阶段尚未开放此宿主接口');
    if(e.token===token&&!e.blocked)this.send(e,{type:'rpcResult',id:m.id,value});
   }catch(error){if(e.token===token&&!e.blocked)this.send(e,{type:'rpcResult',id:m.id,error:require('./errors.cjs').publicCode(error.code?error:{code:/^([A-Z_]+):/.exec(error.message)?.[1]})});}finally{if(e.token===token)e.rpcCount--;}
  }
 }
 finish(call,error,value){if(call.done)return;call.done=true;clearTimeout(call.timer);call.signal?.removeEventListener('abort',call.abort);error?call.reject(error):call.resolve(value);}
 async invoke(id,operationId,input,{signal,caller='page',projectId,form,message,timeout=this.limits.operation,guard,onDispatch,resources}={}){
  if(signal?.aborted)throw failure('CANCELLED','请求已取消');const e=await this.activate(id),token=e.token;
  const operation=e.item.manifest.operations?.find(op=>op.id===operationId);if(!operation)throw failure('NOT_FOUND','未声明此操作');
  // Internal transport only. A6 must authorize/confirm before calling this method.
  if(e.token!==token||e.state!=='active'||e.blocked)throw failure('CANCELLED','扩展状态已改变');
  if(signal?.aborted)throw failure('CANCELLED','请求已取消');if(e.running.size>=this.limits.concurrency&&e.queue.length>=this.limits.queue)throw failure('BUSY','扩展操作队列已满');
  if(!Number.isFinite(timeout)||timeout<=0||timeout>this.limits.maximumOperation)throw failure('INVALID_ARGUMENT','操作超时无效');
  return new Promise((resolve,reject)=>{
   const call={id:randomUUID(),operation,input,caller,projectId,form,message,signal,resolve,reject,guard,onDispatch,resources,done:false};
   const cancel=code=>{this.finish(call,failure(code,code==='TIMEOUT'?'操作超时':'操作已取消',call.started?'unknown':'notStarted'));e.queue=e.queue.filter(c=>c!==call);if(call.started)this.send(e,{type:'cancel',id:call.id});this.changed(e);};
   call.abort=()=>cancel('CANCELLED');signal?.addEventListener('abort',call.abort,{once:true});call.timer=setTimeout(()=>cancel('TIMEOUT'),timeout);e.queue.push(call);this.drain(e);
  });
 }
 drain(e){
  if(e.state!=='active'||e.blocked)return;
  while(e.queue.length&&e.running.size<this.limits.concurrency){const call=e.queue.shift();if(call.done)continue;e.running.set(call.id,call);void this.dispatch(e,call,e.token);}
  this.changed(e);
 }
 async dispatch(e,call,token){
  try{
   const valid=await this.service.packages.validateValue(call.operation.inputSchema,call.input);
   if(call.done||e.token!==token||e.blocked||e.state!=='active')return;
   if(!valid){this.finish(call,failure('INVALID_ARGUMENT','操作输入不符合契约'));return;}
   await call.guard?.();if(call.done||e.token!==token||e.blocked)return;
   await call.onDispatch?.();if(call.done||e.token!==token||e.blocked||e.state!=='active')return;call.started=true;this.send(e,{type:'invoke',id:call.id,handler:call.operation.handler,input:call.input,caller:call.caller,form:call.form,message:call.message,projectId:call.projectId});
  }catch(error){this.finish(call,error.code?error:failure('INVALID_ARGUMENT','操作输入校验失败'));}
  finally{if(!call.started){e.running.delete(call.id);this.drain(e);}}
 }
 authenticationChanged(){for(const e of this.entries.values())if(e.state==='active'&&!e.blocked)this.send(e,{type:'authenticationChanged'});}
 configurationChanged(id,value){const e=this.entries.get(id);if(e?.state==='active'&&!e.blocked)this.send(e,{type:'configurationChanged',value});}
 clearTimers(e){for(const key of ['activationTimer','heartbeat','stableTimer','retry']){clearTimeout(e[key]);e[key]=null;}}
 fail(e,token,message){
  if(e.token!==token||['stopping','stopped','failed','recovering','paused'].includes(e.state))return;
  this.clearTimers(e);e.state='failed';e.diagnostic=message;e.context={};e.ready?.reject(failure('ACTIVATION_FAILED',message));e.ready=null;
  for(const c of [...e.running.values(),...e.queue])this.finish(c,failure('HOST_UNAVAILABLE',message,c.started?'unknown':'notStarted'));e.queue=[];e.running.clear();
  const child=e.child;const exited=e.exited;e.token=randomUUID();child?.kill();
  const retry=e.failures++;e.state=retry<this.limits.retry.length?'recovering':'paused';this.changed(e);
  // Never overlap generations: recovery is scheduled only after confirmed process exit.
  e.retiring=Promise.resolve(exited).then(()=>{if(e.child===child)e.child=null;e.retiring=null;if(e.blocked||this.closed||e.state!=='recovering')return;e.retry=setTimeout(()=>{e.retry=null;if(!e.blocked&&!this.closed)void this.activate(e.id).catch(()=>{});},this.limits.retry[retry]);});
 }
 stop(id){const e=this.entry(id);e.blocked=true;this.clearTimers(e);if(e.stopping)return e.stopping;
  e.state='stopping';e.context={};e.ready?.reject(failure('CANCELLED','扩展已停止'));e.ready=null;
  for(const c of [...e.running.values(),...e.queue]){this.finish(c,failure('CANCELLED','扩展已停止',c.started?'unknown':'notStarted'));if(c.started)this.send(e,{type:'cancel',id:c.id});}e.queue=[];e.running.clear();this.changed(e);
  e.stopping=(async()=>{
   await e.starting?.catch(()=>{});
   if(e.child){this.send(e,{type:'shutdown'});const timer=setTimeout(()=>e.child?.kill(),this.limits.deactivation);await e.exited;clearTimeout(timer);e.child=null;}
   e.token=randomUUID();e.state='stopped';this.changed(e);
  })().finally(()=>{e.stopping=null;});return e.stopping;
 }
 async shutdown(){this.closed=true;await Promise.all([...this.entries.keys()].map(id=>this.stop(id)));}
}
module.exports={HostManager,DEFAULTS,failure};
