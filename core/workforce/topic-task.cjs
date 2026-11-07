// A topic owns one unfinished top-level task. Shared documents are not ownership.
const activeNode=p=>['starting','preparing','running','waiting','stopping'].includes(p.status);
const ended=p=>['completed','stopped'].includes(p.status)&&!p.packages.some(activeNode);
function root(state,spaceId,id){
 const seen=new Set();let r=state.requests.find(r=>r.id===id&&r.spaceId===spaceId);
 while(r?.replyTo&&!seen.has(r.id)){seen.add(r.id);const parent=state.requests.find(p=>p.id===r.replyTo&&p.spaceId===spaceId);if(!parent)break;r=parent;}
 return r?.id||id;
}
function owned(state,spaceId,discussionId){
 if(!discussionId)return {plans:[],drafts:[]};
 const topic=root(state,spaceId,discussionId);
 const plans=state.plans.filter(p=>p.spaceId===spaceId&&p.source?.discussionId&&root(state,spaceId,p.source.discussionId)===topic);
 const drafts=state.taskDrafts.filter(d=>d.spaceId===spaceId&&d.discussionId&&root(state,spaceId,d.discussionId)===topic&&!d.planId&&!d.discardedAt);
 return {plans,drafts};
}
const blocked=()=>Error('本话题已有未结束任务，请继续当前任务，或另开话题 / Finish the current task or start another topic');
function assertAvailable(state,spaceId,discussionId,{planId,draftId}={}){
 const {plans,drafts}=owned(state,spaceId,discussionId);
 if(plans.some(p=>p.id!==planId&&!ended(p))||drafts.some(d=>d.id!==draftId&&(!d.basePlanId||d.basePlanId!==planId&&!ended(plans.find(p=>p.id===d.basePlanId)||{status:'missing',packages:[]}))))throw blocked();
}
module.exports={root,owned,ended,assertAvailable,blocked};
