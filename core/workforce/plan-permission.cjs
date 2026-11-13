const {randomUUID}=require('node:crypto');
const live=new Set(['preparing','running','waiting']);
module.exports=async function changePlanPermission(input){
 this.permissionJobs ||= new Set();
 if(this.permissionJobs.has(input.id))throw Error('计划权限正在切换，请等待结果');
 this.permissionJobs.add(input.id);
 try{
  // Drain dispatch already in flight; block new dispatch until every receipt is saved.
  await this.active.get(input.id);
  const targets=await this.spaces.change(s=>{
   const plan=s.plans.find(p=>p.id===input.id);if(!plan)throw Error('计划不存在');this.spaces.writable(s,plan.spaceId);
   plan.commands ||= [];if(plan.commands.includes(input.commandId))return [];
   if(plan.revision!==input.expectedRevision)throw Error('计划已更新，请刷新');
   if(!['default','full','inherit'].includes(input.permission)||!input.packageId&&input.permission==='inherit')throw Error('权限模式无效');
   const node=input.packageId?plan.packages.find(p=>p.id===input.packageId):null;if(input.packageId&&!node)throw Error('任务不存在');
   const effective=input.permission==='inherit'?plan.permission||'default':input.permission;
   if(effective==='full'&&input.confirmed!==true)throw Error('请先确认允许完全访问');
   const selected=plan.packages.filter(p=>node?p.id===node.id:!p.permission);
   const targets=selected.map(p=>{
    const attempt=p.attempts.at(-1),run=this.runtime.runs.find(r=>r.id===attempt?.runId||attempt?.requestId&&r.collaboration?.requestId===attempt.requestId);
    const record={id:randomUUID(),requested:effective,previous:p.permission||plan.permission||'default',state:run&&live.has(run.status)?'switching':'configured',effective:null,startedAt:new Date().toISOString()};
    p.permissionChange=record;return {packageId:p.id,runId:record.state==='switching'?run.id:null,record};
   });
   if(node){if(input.permission==='inherit')delete node.permission;else node.permission=input.permission;}else plan.permission=input.permission;
   plan.commands.push(input.commandId);plan.updatedAt=new Date().toISOString();
   plan.events.push({seq:plan.events.length+1,type:'permission',packageId:node?.id,detail:(node?'节点':'计划默认')+'授权设置：'+input.permission,at:plan.updatedAt});return targets;
  });
  for(const target of targets){
   if(!target.runId)continue;
   let result;
   try{result=await this.runtime.switchPermission({runId:target.runId,permission:target.record.requested,confirmed:input.confirmed});}
   catch(e){result={state:'failed',effective:null,error:e.message};}
   await this.spaces.change(s=>{
    const plan=s.plans.find(p=>p.id===input.id),node=plan?.packages.find(p=>p.id===target.packageId);
    if(node?.permissionChange?.id!==target.record.id)return;
    Object.assign(node.permissionChange,result,{finishedAt:new Date().toISOString()});
    plan.events.push({seq:plan.events.length+1,type:'permission',packageId:node.id,detail:result.state==='applied'?'节点权限已生效：'+target.record.requested:'节点权限未确认生效：'+(result.error||result.state),at:new Date().toISOString()});
   });
  }
  return (await this.spaces.read()).plans.find(p=>p.id===input.id);
 }finally{this.permissionJobs.delete(input.id);this.dirty=true;}
};
