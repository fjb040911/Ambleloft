import type {SpaceRequest,SpaceDocument,WorkPlan,TaskDraft} from './workforce-types';

// Analysis steps also use discussion-mode runs, but their execution requests
// belong to a plan, not to the user-created topic list or its conversation.
export function topicDiscussions(requests:SpaceRequest[],plans:WorkPlan[]){
 const executions=new Set(plans.flatMap(p=>p.packages.flatMap(n=>n.attempts.map(a=>a.requestId))));
 return requests.filter(r=>r.mode==='discussion'&&!executions.has(r.id));
}

export function discussionRoot(request:SpaceRequest,discussions:SpaceRequest[]){
 let current=request;const seen=new Set<string>();
 while(current.replyTo&&!seen.has(current.id)){seen.add(current.id);const parent=discussions.find(r=>r.id===current.replyTo);if(!parent)break;current=parent;}
 return current.id;
}
// Counts and detail lists must use the same associations. Revisions never count as documents.
export function topicContext(id:string,discussions:SpaceRequest[],documents:SpaceDocument[],plans:WorkPlan[],drafts:TaskDraft[]){
 const rounds=discussions.filter(r=>discussionRoot(r,discussions)===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const roundIds=new Set(rounds.map(r=>r.id));
 const runIds=new Set(rounds.flatMap(r=>r.participants.flatMap(p=>p.runId?[p.runId]:[])));
 const references=new Set(rounds.flatMap(r=>r.documentRefs.map(ref=>ref.id)));
 const generated=(d:SpaceDocument)=>!!d.sourceDiscussionId&&roundIds.has(d.sourceDiscussionId)||!!d.sourceRunId&&runIds.has(d.sourceRunId)||d.versions.some(v=>!!v.sourceRunId&&runIds.has(v.sourceRunId));
 const relatedDocuments=documents.filter(d=>!d.deletedAt&&(generated(d)||references.has(d.id)));
 const documentIds=new Set(relatedDocuments.map(d=>d.id));
 const relatedPlans=plans.filter(p=>!!p.source?.discussionId&&roundIds.has(p.source.discussionId)||p.packages.some(pkg=>pkg.definition.documentRefs.some(ref=>documentIds.has(ref.id))||pkg.attempts.some(a=>roundIds.has(a.requestId))));
 const relatedDrafts=drafts.filter(d=>!!d.discussionId&&roundIds.has(d.discussionId)&&!d.planId);
 const brief=rounds.filter(r=>r.host?.brief&&(r.host.brief.goal.trim()||r.host.brief.items.length)).at(-1);
 return {rounds,documents:relatedDocuments,plans:relatedPlans,drafts:relatedDrafts,brief,generated};
}
export type TopicContext=ReturnType<typeof topicContext>;

export const taskEnded=(p:WorkPlan)=>['completed','stopped'].includes(p.status)&&!p.packages.some(n=>['starting','preparing','running','waiting','stopping'].includes(n.status));
export function topicTask(context?:TopicContext){
 const plans=(context?.plans||[]).filter(p=>context?.rounds.some(r=>r.id===p.source?.discussionId));
 const unfinished=plans.filter(p=>!taskEnded(p));
 const discarded=(context?.drafts||[]).filter(d=>d.discardedAt);
 const drafts=(context?.drafts||[]).filter(d=>!d.discardedAt&&(!d.basePlanId||unfinished.some(p=>p.id===d.basePlanId)));
 const plan=unfinished[0];
 const draft=plan?drafts.find(d=>d.basePlanId===plan.id):drafts[0];
 const attention=plan?.packages.find(p=>p.stale||['review','rejected','failed','interrupted','waiting','blocked'].includes(p.status));
 const status=plan?(plan.status==='paused'||plan.status==='pausing'?'paused':attention?'attention':plan.status==='draft'?'pending':'running'):draft?'confirm':plans.length||discarded.length?'ended':'none';
 const outstanding=drafts.filter(d=>!d.basePlanId).length+unfinished.length;
 return {discarded,plans,unfinished,drafts,plan,draft,attention,status,conflict:outstanding>1,history:plans.filter(taskEnded)};
}
// Presentation only: an unfinished draft still occupies this topic even while
// its goal is being clarified. Never use this label to allow another task.
export function topicTaskDisplayStatus(task:ReturnType<typeof topicTask>){
 return task.status==='confirm'&&task.draft?.status!=='ready'?'collecting':task.status;
}
export function topicTaskLabel(status:string,L:(zh:string,en:string)=>string){return ({none:L('未生成','Not created'),collecting:L('梳理中','Clarifying'),confirm:L('待确认','To confirm'),pending:L('待执行','Ready to start'),running:L('执行中','Running'),paused:L('已暂停','Paused'),attention:L('待处理','Needs attention'),ended:L('已结束','Ended')})[status]||status;}
export function topicTaskVisualState(task:ReturnType<typeof topicTask>){
 return task.conflict?'conflict':task.plan?.status==='pausing'?'pausing':task.status==='attention'?(task.attention?.stale?'stale':task.attention?.status||'attention'):topicTaskDisplayStatus(task);
}
