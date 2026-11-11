const {randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {validate,confirmCrossing,choice}=require('../../electron/model-switch.cjs');
const {abortable}=require('../automation/inference-deadline.cjs');
const live=new Set(['preparing','started','running','waiting']);
const methods={
 async changeDiscussionModel(input){
  validate(input);if(this.closing)throw Error('应用正在关闭');
  this.discussionPermissionJobs ||= new Map();
  if(this.discussionPermissionJobs.has(input.requestId))throw Error('模型正在切换');
  // Reserve synchronously across windows before reading state.
  let release;const barrier=new Promise(r=>{release=r;});this.discussionPermissionJobs.set(input.requestId,barrier);
  let record;const results=[];
  try{
   const config=await abortable(this.workforce.providers.secret(input.providerId,input.model),AbortSignal.timeout(30000));
   const before=(await this.snapshot()).requests.find(r=>r.id===input.requestId);if(!before)throw Error('讨论不存在');
   const old=before.executionModel||{providerId:before.host?.providerId,model:before.host?.model};
   const oldConfig=await abortable(this.workforce.providers.secret(old.providerId,old.model),AbortSignal.timeout(30000));
   confirmCrossing({providerId:oldConfig.id,baseUrl:oldConfig.baseUrl},config,input);
   for(const p of before.participants){const run=this.runtime.runs.find(r=>r.id===p.runId);if(run)confirmCrossing(run,config,input);}
   record=await this.change(s=>{
    this.assertDiscussionAvailable(s,input.requestId);
    const r=s.requests.find(r=>r.id===input.requestId&&r.mode==='discussion');if(!r||r.liveStopped)throw Error('讨论已停止');
    this.writable(s,r.spaceId);
    const root=require('./discussion-host.cjs').rootOf(s.requests,r);if(s.discussionStates[root]?.status==='closed')throw Error('讨论已关闭');
    const participants=r.participants.map(p=>({...p,status:this.runtime.runs.find(run=>run.id===p.runId||run.collaboration?.requestId===r.id&&run.employee?.id===p.employeeId)?.status||p.status}));
    if(!require('./discussion-live.cjs').requestBusy({...r,participants}))throw Error('本轮已结束，请为下一轮选择模型');
    const value={id:randomUUID(),requested:choice(config),previous:choice(oldConfig),state:'switching',effective:null,startedAt:new Date().toISOString()};
    r.modelChange=value;r.executionModel=choice(config);r.modelRevision=(r.modelRevision||0)+1;if(r.host){r.host.model=config.model;r.host.providerId=config.id;}return value;
   });
   const reason=Object.assign(Error('MODEL_CHANGED'),{code:'MODEL_CHANGED'});
   this.discussionModelControllers?.get(input.requestId)?.abort(reason);
   this.discussionConversationModelControllers?.get(input.requestId)?.abort(reason);
   const done=new Set();const deadline=Date.now()+60000;
   while(true){
    const r=(await this.snapshot()).requests.find(r=>r.id===input.requestId);if(this.closing||!r||r.liveStopped)throw Error('讨论模型切换已停止');
    const targets=r.participants.filter(p=>p.runId&&live.has(p.status)&&!done.has(p.runId));
    for(const p of targets){done.add(p.runId);const result=await this.runtime.switchModel({runId:p.runId,providerId:config.id,model:config.model,confirmProviderChange:input.confirmProviderChange});results.push(result);if(!['applied','configured'].includes(result.state))throw Error(result.error||'专家模型未确认生效');}
    if(targets.length)continue;
    if(r.participants.some(p=>!p.runId&&live.has(p.status))){if(Date.now()>deadline)throw Error('专家启动尚未完成，模型未确认生效');await delay(25);continue;}
    await this.change(s=>{const r=s.requests.find(r=>r.id===input.requestId);if(r.liveStopped)throw Error('讨论已停止');Object.assign(r.modelChange,{runIds:[...done],state:results.some(result=>result.state==='configured')?'configured':'applied',effective:results.some(result=>result.state==='configured')?null:choice(config),finishedAt:new Date().toISOString()});});break;
   }
  }catch(e){
   if(record){await this.change(s=>{const r=s.requests.find(r=>r.id===input.requestId);if(r?.modelChange?.id===record.id)Object.assign(r.modelChange,{state:'failed',effective:null,error:(results.some(result=>result.state==='applied')?'部分专家已切换，本轮已停止 / Some experts changed models; this round was stopped: ':'')+e.message});});await this.stopDiscussionHost({requestId:input.requestId,skipPermissionWait:true});}
   else throw e;
  }finally{this.discussionPermissionJobs.delete(input.requestId);release();}
  return this.snapshot();
 }
};
module.exports={discussionModelMethods:methods};
