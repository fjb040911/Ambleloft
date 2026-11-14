const acceptance=require('./acceptance.cjs');
const {inferenceDeadline,abortable}=require('../automation/inference-deadline.cjs');
const active=new Set(['starting','preparing','running','waiting','stopping']);
const stamp=()=>new Date().toISOString();
const event=(plan,type,detail,packageId)=>{plan.events.push({seq:plan.events.length+1,type,detail,packageId,at:stamp()});plan.updatedAt=stamp();};
const eligiblePlan=(service,s,plan)=>!service.closed&&plan?.status==='running'&&service.contexts.has(plan.id)&&!s.spaces.find(v=>v.id===plan.spaceId)?.archivedAt;
function queue(planId){
 if(this.automationJobs.has(planId)||this.closed)return;
 const controller=new AbortController();
 const job={controller,promise:null};this.automationJobs.set(planId,job);
 job.promise=run.call(this,planId,controller.signal).catch(()=>{this.dirty=true;}).finally(()=>{this.automationJobs.delete(planId);});
}
async function run(planId,signal){
 const initial=await this.spaces.read(),plan=initial.plans.find(p=>p.id===planId);
 if(!eligiblePlan(this,initial,plan))return;
 for(const original of plan.packages){
  if(signal.aborted)return;
  const snapshot=await this.spaces.read(),current=snapshot.plans.find(p=>p.id===planId),p=current?.packages.find(p=>p.id===original.id),attempt=p?.attempts.at(-1);
  if(!eligiblePlan(this,snapshot,current))return;
  if(!attempt||p.stale)continue;
  const policy=acceptance.effective(current,p),execution=this.runtime.runs.find(r=>r.id===attempt.runId);
  if(policy.mode==='manual')continue;
  if(p.status==='failed'&&!attempt.autoRetryChecked){
   await this.spaces.change(s=>{
    const plan=s.plans.find(v=>v.id===planId),node=plan?.packages.find(v=>v.id===p.id),a=node?.attempts.at(-1);
    if(!eligiblePlan(this,s,plan)||node?.status!=='failed'||a?.id!==attempt.id||a.autoRetryChecked)return;
    a.autoRetryChecked=true;
    const transient=/429|rate.?limit|502|503|504|service unavailable|MODEL_RESPONSE_TIMEOUT|ECONNRESET/i.test(node.reason||'');
    // Never replay an unknown side effect, a user cancellation, or an approval.
    const safe=execution&&!(execution.tools?.length||execution.approvals?.length||execution.questions?.length)&&
     (node.definition.mode==='discussion'||(execution.workEvidence?.at(-1)?.input?.complete&&execution.workEvidence?.at(-1)?.output?.complete&&typeof execution.workEvidence.at(-1).input.digest==='string'&&execution.workEvidence.at(-1).input.digest===execution.workEvidence.at(-1).output.digest&&execution.workEvidence.at(-1).input.head===execution.workEvidence.at(-1).output.head));
    if(transient&&safe&&(node.autoRetries||0)<policy.maxRetries){node.autoRetries=(node.autoRetries||0)+1;node.retryAt=Date.now()+Math.min(60000,10000*2**(node.autoRetries-1));node.status='pending';node.reason=`模型服务暂不可用，稍后自动重试（${node.autoRetries}/${policy.maxRetries}）`;event(plan,'auto_retry',node.reason,node.id);}
    this.hasDeferredRetry=true;this.dirty=true;
   });continue;
  }
  if(p.status!=='review'||execution?.status!=='completed')continue;
  if(attempt.automaticReview){
   // Only one job owns a plan. A checking marker found before this job claims
   // anything is an orphan left by a failed database write, not a live review.
   if(attempt.automaticReview.state==='checking')await this.spaces.change(s=>{
    const node=s.plans.find(v=>v.id===planId)?.packages.find(v=>v.id===p.id),a=node?.attempts.at(-1);
    if(a?.id===attempt.id&&a.automaticReview?.state==='checking'){a.automaticReview={...a.automaticReview,state:'done',outcome:'indeterminate',reason:'自动验收中断，请人工核对',results:[]};node.reason=a.automaticReview.reason;}
   });
   continue;
  }
  const token={revision:current.revision,attemptId:attempt.id,resultHash:attempt.resultHash,definitionHash:acceptance.hash([current.acceptancePolicy,p.definition])};
  const claimed=await this.spaces.change(s=>{
   const plan=s.plans.find(v=>v.id===planId),node=plan?.packages.find(v=>v.id===p.id),a=node?.attempts.at(-1);
   if(!eligiblePlan(this,s,plan)||node?.status!=='review'||node.stale||a?.id!==token.attemptId||a.automaticReview)return false;
   a.automaticReview={state:'checking',at:stamp(),...token};node.reason='正在按约定指标自动验收';event(plan,'auto_review',node.reason,node.id);return true;
  });if(!claimed)continue;
  let report;
  const deadline=inferenceDeadline(signal,{timeoutMs:120000});
  try{
   if(execution.error)throw Error('执行记录存在错误，请核对：'+execution.error);
   if(policy.mode==='complete')report={outcome:'pass',results:[],reason:'按显式设置完成即放行，未核验交付质量'};
   else{
    await acceptance.verifyWorkspace(p,execution,this,deadline.signal);
    report=await abortable(acceptance.evaluate(this,current,p,execution,deadline.signal),deadline.signal);
    await acceptance.verifyWorkspace(p,execution,this,deadline.signal);
   }
  }catch(e){report={outcome:'indeterminate',results:[],reason:'自动验收未能确定结果：'+e.message};}
  finally{deadline.dispose();}
  await this.spaces.change(s=>{
   const plan=s.plans.find(v=>v.id===planId),node=plan?.packages.find(v=>v.id===p.id),a=node?.attempts.at(-1);
   if(!a||a.id!==token.attemptId||a.automaticReview?.state!=='checking')return;
   if(signal.aborted||!eligiblePlan(this,s,plan)){delete a.automaticReview;node.reason='自动验收已暂停，恢复计划后继续';return;}
   if(plan.revision!==token.revision||node.status!=='review'||node.stale||acceptance.hash([plan.acceptancePolicy,node.definition])!==token.definitionHash||execution.status!=='completed'||acceptance.resultHash(execution)!==token.resultHash||node.definition.documentRefs.some(r=>node.definition.mode==='work'&&s.documents.find(d=>d.id===r.id)?.adoptedRevision!==r.revision)){
    a.automaticReview={...token,state:'done',outcome:'indeterminate',reason:'执行结果或依据已变化，自动验收结果未应用',at:stamp(),results:[]};if(node.status==='review')node.reason=a.automaticReview.reason;this.dirty=true;return;
   }
   a.automaticReview={...token,...report,state:'done',at:stamp()};
   if(report.outcome==='pass'){
    node.status='accepted';node.reason='';node.acceptance={attemptId:a.id,resultHash:a.resultHash,note:report.reason,accepted:true,at:stamp(),source:policy.mode==='complete'?'completion-policy':'automatic-review'};a.review=structuredClone(node.acceptance);
   }else if(report.outcome==='fail'){
    const fingerprint=acceptance.hash(report.results.filter(r=>r.outcome==='fail').map(r=>r.id).sort());
    const previous=node.attempts.slice(0,-1).findLast(a=>a.automaticReview?.outcome==='fail');
    // Two consecutive identical unmet criteria stop automatic repair; an actual
    // reduction in the failed set permits the remaining bounded attempts.
    const stalled=previous?.automaticReview?.failureFingerprint===fingerprint;
    a.automaticReview.failureFingerprint=fingerprint;
    if(!stalled&&(node.autoRepairs||0)<policy.maxRepairs){node.autoRepairs=(node.autoRepairs||0)+1;node.status='pending';node.reason=`验收未通过，准备修复（${node.autoRepairs}/${policy.maxRepairs}）`;node.rework='按原验收标准修复以下问题并重新提供证据；先核对已有结果，不重复未知副作用，不得降低指标或扩大授权：\n'+report.reason;delete node.acceptance;}
    else{node.status='review';node.reason=stalled?'连续验收未见改善，已停止自动修复，请人工处理':'自动修复次数已用完，请人工处理';}
   }else node.reason=report.reason+'；请补充证据或人工验收';
   event(plan,'auto_review_'+report.outcome,node.reason||report.reason,node.id);this.dirty=true;
  });
 }
}
async function restart(input,context){
 if(this.restartJobs.has(input.id))throw Error('正在重跑此计划，请稍后再试');
 this.restartJobs.add(input.id);
 try{
  const prepared=await this.spaces.change(s=>{
   const plan=s.plans.find(p=>p.id===input.id);if(!plan)throw Error('计划不存在');this.spaces.writable(s,plan.spaceId);
   if(plan.commands?.includes(input.commandId))return {plan,duplicate:true};
   if(plan.revision!==input.expectedRevision)throw Error('计划已更新，请刷新');
   const node=plan.packages.find(p=>p.id===input.packageId);if(!node)throw Error('任务不存在');
   if(input.confirmed!==true)throw Error('请确认重跑节点及所有受影响的下游');
   if(plan.status==='pausing')throw Error('请等待暂停完成');
   const ids=acceptance.descendants(plan,node.id);
   require('./topic-task.cjs').assertAvailable(s,plan.spaceId,plan.source?.discussionId,{planId:plan.id});
   const missing=require('./project-relations.cjs').issues(plan.packages.map(p=>p.definition),s.spaces.find(v=>v.id===plan.spaceId),{onlyIds:ids});
   if(missing.length)throw Error('请先修订并确认项目关系：'+missing.join('；'));
   if(plan.packages.some(p=>ids.includes(p.id)&&(p.stale||p.definition.documentRefs.some(r=>p.definition.mode==='work'&&s.documents.find(d=>d.id===r.id)?.adoptedRevision!==r.revision))))throw Error('依据已变化，请先修订计划');
   const wasRunning=plan.status==='running';plan.status='paused';event(plan,'restart_preparing','正在停止受影响的节点，保留历史交付',node.id);
   return {plan,ids,wasRunning};
  });
  if(prepared.duplicate)return prepared.plan;
  this.automationJobs.get(input.id)?.controller.abort();
  await this.active.get(input.id);
  const snapshot=(await this.spaces.read()).plans.find(p=>p.id===input.id);
  const requestIds=new Set(snapshot.packages.filter(p=>prepared.ids.includes(p.id)).map(p=>p.attempts.at(-1)?.requestId));
  const runs=this.runtime.runs.filter(r=>requestIds.has(r.collaboration?.requestId));
  await Promise.all(runs.filter(r=>active.has(r.status)).map(r=>this.runtime.stop(r.id)));
  if(runs.some(r=>active.has(r.status)))throw Error('执行器尚未停止；计划已暂停，请稍后重试');
  await this.spaces.change(s=>{
   const plan=s.plans.find(p=>p.id===input.id);this.spaces.writable(s,plan.spaceId);
   if(plan.revision!==input.expectedRevision||plan.status!=='paused')throw Error('计划已变化，请重新确认重跑范围');
   for(const p of plan.packages.filter(p=>prepared.ids.includes(p.id))){p.status='pending';p.reason='';p.autoRepairs=0;p.autoRetries=0;delete p.retryAt;delete p.acceptance;delete p.stopReason;p.rework='用户要求从此处重新执行。历史记录保留但旧验收不再有效。先核对已有实际状态，仅重新执行所需操作；不要盲目重复副作用。'+(input.note?'\n修正要求：'+require('./contract.cjs').text(input.note,'修正要求',4000):'');}
   plan.commands||=[];plan.commands.push(input.commandId);event(plan,'restarted','已重置节点及下游：'+prepared.ids.join(', '),input.packageId);
   plan.status=prepared.wasRunning||input.resumePlan?'running':'paused';this.dirty=true;
  });
  await this.automationJobs.get(input.id)?.promise;
  this.contexts.set(input.id,context);await this.pulse(input.id);
  return (await this.spaces.read()).plans.find(p=>p.id===input.id);
 }finally{this.restartJobs.delete(input.id);}
}
module.exports={queue,restart};
