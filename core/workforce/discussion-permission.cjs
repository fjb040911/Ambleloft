const {randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {validate}=require('../../electron/permission-switch.cjs');
const live=new Set(['preparing','started','running','waiting']);
const methods={
 async changeDiscussionPermission(input){
  validate(input);if(this.closing)throw Error('应用正在关闭');
  this.discussionPermissionJobs ||= new Map();
  if(this.discussionPermissionJobs.has(input.requestId))throw Error('权限正在切换');
  // Reserve synchronously across windows before reading state.
  let release;const barrier=new Promise(r=>{release=r;});this.discussionPermissionJobs.set(input.requestId,barrier);
  let record;const results=[];
  try{
   record=await this.change(s=>{
    this.assertDiscussionAvailable(s,input.requestId);
    const r=s.requests.find(r=>r.id===input.requestId&&r.mode==='discussion');if(!r||r.liveStopped)throw Error('讨论已停止');
    this.writable(s,r.spaceId);
    const root=require('./discussion-host.cjs').rootOf(s.requests,r);if(s.discussionStates[root]?.status==='closed')throw Error('讨论已关闭');
    const participants=r.participants.map(p=>({...p,status:this.runtime.runs.find(run=>run.id===p.runId||run.collaboration?.requestId===r.id&&run.employee?.id===p.employeeId)?.status||p.status}));
    if(!require('./discussion-live.cjs').requestBusy({...r,participants}))throw Error('本轮已结束，请为下一轮选择权限');
    const value={id:randomUUID(),requested:input.permission,previous:r.composer?.permission||'default',state:'switching',effective:null,startedAt:new Date().toISOString()};
    r.permissionChange=value;r.executionPermission=input.permission;if(r.composer)r.composer.permission=input.permission;return value;
   });
   const done=new Set();const deadline=Date.now()+60000;
   while(true){
    const r=(await this.snapshot()).requests.find(r=>r.id===input.requestId);if(this.closing||!r||r.liveStopped)throw Error('讨论权限切换已停止');
    const targets=r.participants.filter(p=>p.runId&&live.has(p.status)&&!done.has(p.runId));
    for(const p of targets){done.add(p.runId);const result=await this.runtime.switchPermission({runId:p.runId,permission:input.permission,confirmed:input.confirmed});results.push(result);if(result.state!=='applied')throw Error(result.error||'专家权限未确认生效');}
    if(targets.length)continue;
    if(r.participants.some(p=>!p.runId&&live.has(p.status))){if(Date.now()>deadline)throw Error('专家启动尚未完成，权限未确认生效');await delay(25);continue;}
    await this.change(s=>{const r=s.requests.find(r=>r.id===input.requestId);if(r.liveStopped)throw Error('讨论已停止');Object.assign(r.permissionChange,{state:results.length?'applied':'configured',effective:results.length?input.permission:null,finishedAt:new Date().toISOString()});});break;
   }
  }catch(e){
   if(record){await this.change(s=>{const r=s.requests.find(r=>r.id===input.requestId);if(r?.permissionChange?.id===record.id)Object.assign(r.permissionChange,{state:'failed',effective:null,error:(results.some(result=>result.state==='applied')?'部分专家已切换，本轮已停止 / Some experts changed permissions; this round was stopped: ':'')+e.message});});await this.stopDiscussionHost({requestId:input.requestId,skipPermissionWait:true});}
   else throw e;
  }finally{this.discussionPermissionJobs.delete(input.requestId);release();}
  return this.snapshot();
 }
};
module.exports={discussionPermissionMethods:methods};
