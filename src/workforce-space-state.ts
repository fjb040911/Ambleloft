import {automationStage} from './workforce-automation-state';
import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import type {Space,SpaceSnapshot,WorkPlan,WorkPackage} from './workforce-types';
export type SpaceDestination={tab:'overview'|'discussion'|'documents'|'tasks'|'team';planId?:string;packageId?:string;detailTab?:'chat'|'review'|'info';requestId?:string;documentId?:string};
export type SpaceAttentionKind='approval'|'input'|'review'|'failed'|'stale'|'unknown';
export type SpaceAttention={id:string;title:string;detail:string;kind:SpaceAttentionKind;kinds:SpaceAttentionKind[];target:SpaceDestination};
export type SpaceActivity={id:string;title:string;at:string;kind:'discussion'|'document'|'plan';target:SpaceDestination};
export const needsAttention=(p:WorkPackage)=>p.stale||!(p.status==='interrupted'&&p.stopReason==='plan-pause')&&p.attempts.at(-1)?.automaticReview?.state!=='checking'&&['waiting','review','failed','interrupted','rejected','stale'].includes(p.status);
export type SpaceRuntimeState='archived'|'running'|'attention'|'unknown'|'stopping'|'paused'|'partial-paused'|'scheduling'|'ready'|'planning'|'completed'|'stopped'|'empty';
const executing=(status:string)=>['started','starting','preparing','running'].includes(status);
const attentionOrder:SpaceAttentionKind[]=['approval','input','review','failed','stale','unknown'];
export function spaceSummary(space:Space,data:SpaceSnapshot,requestKinds:Record<string,string>={}){
 const plans=(data.plans||[]).filter(p=>p.spaceId===space.id),requests=data.requests.filter(r=>r.spaceId===space.id),documents=data.documents.filter(d=>d.spaceId===space.id);
 const attention:SpaceAttention[]=[],activity:SpaceActivity[]=[];
 let running=0,checking=false,stopping=false;
 const planRunning:Record<string,number>={};
 const add=(item:Omit<SpaceAttention,'kind'|'kinds'>,kinds:SpaceAttentionKind[])=>{const sorted=attentionOrder.filter(k=>kinds.includes(k));if(sorted.length&&!space.archivedAt)attention.push({...item,kind:sorted[0],kinds:sorted});};
 const liveKinds=(runId:string|undefined,waiting:boolean):SpaceAttentionKind[]=>{
  const kind=requestKinds[runId||''];
  if(kind==='loading'){checking=true;return [];}
  if(kind==='unknown'||waiting&&kind==='')return ['unknown'];
  return kind==='approval-input'?['approval','input']:kind==='approval'?['approval']:kind==='input'||waiting&&kind===undefined?['input']:[];
 };
 const planRequests=new Set(plans.flatMap(p=>p.packages.flatMap(w=>w.attempts.map(a=>a.requestId))));
 for(const plan of plans){
  for(const p of plan.packages){
   const live=executing(p.status)||p.status==='waiting';
   const kinds:SpaceAttentionKind[]=live?liveKinds(p.attempts.at(-1)?.runId,p.status==='waiting'):[];
   if((executing(p.status)||plan.status==='running'&&!!automationStage(p))&&!kinds.length&&requestKinds[p.attempts.at(-1)?.runId||'']!=='loading'){running++;planRunning[plan.id]=(planRunning[plan.id]||0)+1;}
   if(p.status==='stopping')stopping=true;
   if(p.stale||p.status==='stale')kinds.push('stale');
   if(p.status==='review'&&p.attempts.at(-1)?.automaticReview?.state!=='checking')kinds.push('review');
   if(['failed','interrupted','rejected'].includes(p.status)&&!(p.status==='interrupted'&&p.stopReason))kinds.push('failed');
   add({id:plan.id+':'+p.id,title:p.definition.title,detail:p.reason||plan.name,target:{tab:'tasks',planId:plan.id,packageId:p.id,detailTab:p.status==='review'?'review':'chat'}},kinds);
  }
  for(const event of plan.events)activity.push({id:plan.id+':'+event.seq,title:event.detail,at:event.at,kind:'plan',target:{tab:'tasks',planId:plan.id,packageId:event.packageId}});
  if(!plan.events.length)activity.push({id:plan.id,title:plan.name,at:plan.updatedAt,kind:'plan',target:{tab:'tasks',planId:plan.id}});
 }
 const byId=new Map(requests.map(r=>[r.id,r])),roots=new Map<string,string>();
 const rootOf=(id:string)=>{const path:string[]=[];let r=byId.get(id);while(r&&!roots.has(r.id)&&!path.includes(r.id)){path.push(r.id);if(!r.replyTo||!byId.has(r.replyTo))break;r=byId.get(r.replyTo);}const root=r?roots.get(r.id)||r.id:id;for(const key of path)roots.set(key,root);return root;};
 const positions=new Map(requests.map((r,i)=>[r.id,i]));
 const newer=(a:typeof requests[number],b:typeof requests[number])=>a.createdAt>b.createdAt||a.createdAt===b.createdAt&&positions.get(a.id)!>positions.get(b.id)!;
 const latest=new Map<string,typeof requests[number]>(),followups=new Map<string,Set<string>>();
 for(const r of requests){if(r.intent==='explain-node')continue;const root=rootOf(r.id),previous=latest.get(root);if(!previous||newer(r,previous))latest.set(root,r);if(r.replyTo){const ids=followups.get(r.replyTo)||new Set<string>();r.participants.forEach(p=>ids.add(p.employeeId));followups.set(r.replyTo,ids);}}
 for(const r of requests){
  if(planRequests.has(r.id))continue;
  const root=rootOf(r.id),closed=['closed','deleted'].includes(data.discussionStates?.[root]?.status||'');
  const later=latest.get(root),hasLater=!!later&&newer(later,r);
  const followedUp=followups.get(r.id)||new Set<string>();
  const participants=r.participants.filter(p=>!followedUp.has(p.employeeId));
  const kinds:SpaceAttentionKind[]=[];
  if(!closed){
   for(const p of participants){
    const pending=executing(p.status)||p.status==='waiting'?liveKinds(p.runId,p.status==='waiting'):[];
    kinds.push(...pending);
    if(executing(p.status)&&!pending.length&&requestKinds[p.runId||'']!=='loading')running++;
    if(['failed','interrupted','error'].includes(p.status))kinds.push('failed');
   }
   if(r.staleReferences?.length)kinds.push('stale');
   if(!hasLater){
    const question=r.host?.question&&!r.host.question.answeredBy;
    const draft=(data.taskDrafts||[]).find(d=>d.id===r.host?.task?.draftId&&d.spaceId===space.id&&!d.planId&&!d.discardedAt);
    const draftInput=draft?.status==='needs-input'&&(draft.pendingQuestion||draft.assessment?.question||draft.relationGuide?.nodes.length);
    if(question||draftInput)kinds.push('input');
    else if(executing(r.host?.status||''))running++;
    if(['failed','error','interrupted'].includes(r.host?.status||''))kinds.push('failed');
   }
   add({id:r.id,title:r.prompt,detail:participants.filter(p=>p.error).map(p=>p.error).join(' · '),target:{tab:'discussion',requestId:r.id}},kinds);
  }
  // Token streaming is not a new project milestone.
  const at=r.participants.reduce((at,p)=>!executing(p.status)&&p.status!=='waiting'&&p.updatedAt&&p.updatedAt>at?p.updatedAt:at,r.host?.activity?.finishedAt||r.createdAt);
  activity.push({id:r.id,title:r.prompt,at,kind:'discussion',target:{tab:'discussion',requestId:r.id}});
 }
 for(const d of documents)if(!d.deletedAt)activity.push({id:d.id,title:d.title,at:d.updatedAt,kind:'document',target:{tab:'documents',documentId:d.id}});
 attention.sort((a,b)=>attentionOrder.indexOf(a.kind)-attentionOrder.indexOf(b.kind));
 activity.sort((a,b)=>b.at.localeCompare(a.at));
 const actionable=attention.filter(a=>a.kind!=='unknown');
 const sortedPlans=[...plans].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const unfinished=sortedPlans.filter(p=>!['completed','stopped'].includes(p.status));
 const currentPlans=unfinished.length?unfinished:sortedPlans.slice(0,1);
 const drafts=(data.taskDrafts||[]).filter(d=>d.spaceId===space.id&&!d.planId&&!d.discardedAt);
 const state=space.archivedAt?'archived':stopping||plans.some(p=>p.status==='pausing')?'stopping':running?'running':actionable.length?'attention':attention.length||checking?'unknown':unfinished.some(p=>p.status==='running')?'scheduling':unfinished.some(p=>p.status==='paused')?unfinished.every(p=>p.status==='paused')?'paused':'partial-paused':unfinished.length?'ready':drafts.length||!plans.length&&requests.length?'planning':sortedPlans[0]?.status==='completed'?'completed':sortedPlans[0]?.status==='stopped'?'stopped':'empty';
 return {plans,currentPlans,planRunning,requests,documents:documents.filter(d=>!d.deletedAt),attention,actionable,activity,lastActivity:activity[0]?.at||space.createdAt,running,state:state as SpaceRuntimeState,checking};
}
export function planNext(plan:WorkPlan){
 const blocked=plan.packages.find(p=>p.status==='pending'&&p.definition.dependencies.some(id=>plan.packages.find(d=>d.id===id)?.status!=='accepted'));
 return blocked?{item:blocked,dependencies:blocked.definition.dependencies.map(id=>plan.packages.find(p=>p.id===id)).filter((p):p is WorkPackage=>!!p&&p.status!=='accepted')}:null;
}
// UI-only state never updates a space's work activity or backend revision.
export function useSpacePreference<T>(key:string,initial:T){
 const read=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')??initial;}catch{return initial;}};
 const [value,setValue]=useState<T>(read);
 const previous=useRef(key);
 useEffect(()=>{if(previous.current!==key){previous.current=key;setValue(read());return;}try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}},[key,value]);
 return [value,setValue] as const;
}
export function spaceScroller(node:HTMLElement){
 let parent=node.parentElement;
 while(parent&&parent.dataset.wfNodeViewport!=='true'&&!/(auto|scroll)/.test(getComputedStyle(parent).overflowY))parent=parent.parentElement;
 return parent||document.scrollingElement as HTMLElement;
}
export function useSpaceScroll(key:string,active:boolean,tab:string){
 const ref=useRef<HTMLDivElement>(null);
 const position=useRef<{key:string;tab:string;top:number}|null>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!active||!node)return;
  const scroller=spaceScroller(node),main=node.parentElement!;
  const tabs=main.querySelector<HTMLElement>('.wf-space-tabs');
  const navigation=tabs?.querySelector<HTMLElement>(':scope > .wf-space-navigation');
  const storageKey='workforce.scroll:'+key;
  const previous=position.current;
  const measure=()=>{
   // Hidden kept-alive pages have no geometry. Never persist a zero viewport.
   if(!main.getClientRects().length||scroller.clientHeight<=0)return;
   main.style.setProperty('--wf-space-viewport',`${scroller.clientHeight}px`);
   main.style.setProperty('--wf-space-navigation-height',`${navigation?.getBoundingClientRect().height||44}px`);
   const top=tabs?tabs.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop+scroller.scrollTop:0;
   // Size from the viewport and document-space header offset only. Neither
   // streaming nor a restored scroll position may manufacture empty space.
   main.style.setProperty('--wf-space-available',`${Math.max(0,scroller.clientHeight-top)}px`);
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(scroller);if(navigation)observer.observe(navigation);
  if(previous?.key===key&&previous.tab!==tab&&tabs){
   const tabsTop=tabs.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop+scroller.scrollTop;
   // Preserve a partially visible heading; when pinned, show the new panel
   // from its beginning without moving the navigation or restoring old depth.
   scroller.scrollTop=Math.min(previous.top,Math.max(0,tabsTop));
  }else{
   try{scroller.scrollTop=Number(sessionStorage.getItem(storageKey)||0);}catch{}
  }
  const save=()=>{position.current={key,tab,top:scroller.scrollTop};try{sessionStorage.setItem(storageKey,String(scroller.scrollTop));}catch{}};
  save();scroller.addEventListener('scroll',save,{passive:true});
  return()=>{observer.disconnect();scroller.removeEventListener('scroll',save);};
 },[key,tab,active]);
 return ref;
}
// Mirrors the scheduler's work-only staleness propagation, including downstream packages.
export function documentImpact(plans:WorkPlan[],requests:SpaceSnapshot['requests'],id:string,revision:number){
 const packages:{planId:string;packageId:string;title:string;indirect:boolean}[]=[];
 const planRequestIds=new Set(plans.flatMap(p=>p.packages.flatMap(w=>w.attempts.map(a=>a.requestId))));
 for(const plan of plans){
  const direct=new Set(plan.packages.filter(p=>p.definition.mode==='work'&&p.definition.documentRefs.some(r=>r.id===id&&r.revision!==revision)).map(p=>p.id));
  const affected=new Set(direct);let changed=true;
  while(changed){changed=false;for(const p of plan.packages)if(!affected.has(p.id)&&p.definition.dependencies.some(id=>affected.has(id))){affected.add(p.id);changed=true;}}
  for(const p of plan.packages)if(affected.has(p.id))packages.push({planId:plan.id,packageId:p.id,title:p.definition.title,indirect:!direct.has(p.id)});
 }
 return {packages,requests:requests.filter(r=>!planRequestIds.has(r.id)&&r.mode==='work'&&r.documentRefs.some(ref=>ref.id===id&&ref.revision!==revision))};
}
