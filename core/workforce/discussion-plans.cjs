// Discussion is a client of the task services. It can prepare proposals and read
// execution facts, but only explicit UI actions may apply or start a plan.
const {randomUUID}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
function context(service,state,spaceId,discussionId,target={}){
 const plans=state.plans.filter(p=>p.spaceId===spaceId&&p.source?.discussionId===discussionId);
 const drafts=state.taskDrafts.filter(d=>d.spaceId===spaceId&&d.discussionId===discussionId&&!d.planId);
 const draft=target.draftId?drafts.find(d=>d.id===target.draftId):target.planId?undefined:drafts[0];
 const plan=target.planId?plans.find(p=>p.id===target.planId):draft?.basePlanId?plans.find(p=>p.id===draft.basePlanId):draft?undefined:plans[0];
 if(target.draftId&&!draft||target.planId&&!plan)throw Error('所选计划不属于当前话题，或草稿已更新 / Refresh the selected topic plan');
 if(draft&&target.draftRevision!==undefined&&target.draftRevision!==draft.revision||plan&&target.planRevision!==undefined&&target.planRevision!==plan.revision)throw Error('计划已更新，请查看最新流程后重试 / The plan changed; review the latest workflow');
 if(target.packageId&&!(draft?.value.packages||plan?.packages.map(p=>p.definition)||[]).some(p=>p.id===target.packageId))throw Error('所选节点已变化，请重新选择 / Select the node again');
 const progress=plan?{planId:plan.id,revision:plan.revision,name:plan.name,status:plan.status,observedAt:new Date().toISOString(),nodes:plan.packages.map(p=>{
  const a=p.attempts.at(-1),run=service.runtime.runs.find(r=>r.id===a?.runId||a?.requestId&&r.collaboration?.requestId===a.requestId);
  return {id:p.id,title:p.definition.title,status:p.stale?'stale':p.status,reason:p.reason||'',dependencies:p.definition.dependencies,runId:run?.id||a?.runId||null,executionStatus:run?.status||null,approvalCount:run?.approvals?.length||0,inputCount:run?.questions?.length||0,lastEventAt:run?.lastEventAt||null,accepted:!!p.acceptance?.accepted,output:(run?.messages||[]).filter(m=>m.role==='assistant'&&m.phase==='final_answer').map(m=>m.text).join('\n').slice(-1500)};
 })}:null;
 return {draft: draft?{id:draft.id,revision:draft.revision,status:draft.status,sourceFromRequestId:draft.sourceFromRequestId,value:draft.value,basePlanId:draft.basePlanId,basePlanRevision:draft.basePlanRevision,missing:draft.assessment?.missing||[],summary:draft.assessment?.summary||''}:null,plan:plan?{id:plan.id,revision:plan.revision,name:plan.name,goal:plan.goal,value:{name:plan.name,goal:plan.goal,packages:plan.packages.map(p=>p.definition)}}:null,selectedPackageId:target.packageId||null,progress,availablePlans:plans.map(p=>({id:p.id,name:p.name,status:p.status,revision:p.revision}))};
}
async function prepare(service,{spaceId,discussionId,request,input,current,signal,newPlan}){
 signal.throwIfAborted();
 // Do not let a model response based on an old draft overwrite a manual edit.
 const state=await service.snapshot();
 context(service,state,spaceId,discussionId,{...(current.draft?{draftId:current.draft.id,draftRevision:current.draft.revision}:{}),...(current.plan?{planId:current.plan.id,planRevision:current.plan.revision}:{})});
 const stale=!!current.draft?.basePlanId&&current.draft.basePlanRevision!==current.plan?.revision;
 const draft=await service.createTaskDraft({spaceId,discussionId,commandId:request.id,newPlan:!!newPlan,...(!newPlan&&current.draft&&!stale?{draftId:current.draft.id,expectedRevision:current.draft.revision}:{}),...(!newPlan&&(!current.draft||stale)&&current.plan?{basePlanId:current.plan.id,basePlanRevision:current.plan.revision}:{}),refreshSource:true});
 signal.throwIfAborted();
 const selected=current.selectedPackageId?`\n当前明确选择的节点：${current.selectedPackageId}。` :'';
 const result=await service.guideTask({id:draft.id,expectedRevision:draft.revision,requestId:randomUUID(),providerId:input.providerId,model:input.model,locale:input.locale,message:request.prompt+selected},{signal,discussion:true});
 signal.throwIfAborted();
 const before=current.draft?.value||current.plan?.value;
 const changes=before?{added:result.value.packages.filter(p=>!before.packages.some(q=>q.id===p.id)).map(p=>p.title),removed:before.packages.filter(p=>!result.value.packages.some(q=>q.id===p.id)).map(p=>p.title),changed:result.value.packages.filter(p=>before.packages.some(q=>q.id===p.id&&!isDeepStrictEqual(q,p))).map(p=>p.title),goalChanged:before.goal!==result.value.goal}:null;
 return {draftId:result.id,draftRevision:result.revision,basePlanId:result.basePlanId,basePlanRevision:result.basePlanRevision,summary:result.assessment.summary,changes,status:result.status};
}
async function observe(service,current){
 if(!current.progress)return;
 await Promise.all(current.progress.nodes.map(async node=>{
  if(!node.runId)return;
  try{
   const rows=service.runtime.inputRequests?await service.runtime.inputRequests.list(node.runId):await service.database.call('inputRequest',{action:'list',runId:node.runId});
   const pending=rows.filter(r=>r.state==='pending'&&!r.sourceInvalid);
   node.inputCount+=pending.length;
   // Unsubmitted answers are private drafts, not decisions or progress evidence.
   node.pendingInputs=pending.map(r=>({title:r.template?.title||'',reason:r.reason||''}));
  }catch{node.inputStateUnknown=true;}
 }));
}
module.exports={context,prepare,observe};
