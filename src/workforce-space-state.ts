import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import type {Space,SpaceSnapshot,WorkPlan,WorkPackage} from './workforce-types';
export type SpaceDestination={tab:'overview'|'discussion'|'documents'|'tasks'|'team';planId?:string;packageId?:string;planView?:'graph'|'list';requestId?:string;documentId?:string};
export type SpaceAttention={id:string;title:string;detail:string;kind:'input'|'review'|'failed'|'stale';target:SpaceDestination};
export type SpaceActivity={id:string;title:string;at:string;kind:'discussion'|'document'|'plan';target:SpaceDestination};
export const needsAttention=(p:WorkPackage)=>p.stale||['waiting','review','failed','interrupted','rejected','stale'].includes(p.status);
export function spaceSummary(space:Space,data:SpaceSnapshot){
 const plans=(data.plans||[]).filter(p=>p.spaceId===space.id),requests=data.requests.filter(r=>r.spaceId===space.id),documents=data.documents.filter(d=>d.spaceId===space.id);
 const attention:SpaceAttention[]=[],activity:SpaceActivity[]=[];
 const planRequests=new Set(plans.flatMap(p=>p.packages.flatMap(w=>w.attempts.map(a=>a.requestId))));
 for(const plan of plans){
  for(const p of plan.packages){if(needsAttention(p))attention.push({id:plan.id+':'+p.id,title:p.definition.title,detail:p.reason||plan.name,kind:p.stale||p.status==='stale'?'stale':p.status==='review'?'review':p.status==='waiting'?'input':'failed',target:{tab:'tasks',planId:plan.id,packageId:p.id}});}
  for(const event of plan.events)activity.push({id:plan.id+':'+event.seq,title:event.detail,at:event.at,kind:'plan',target:{tab:'tasks',planId:plan.id,packageId:event.packageId}});
  if(!plan.events.length)activity.push({id:plan.id,title:plan.name,at:plan.updatedAt,kind:'plan',target:{tab:'tasks',planId:plan.id}});
 }
 for(const r of requests){
  if(planRequests.has(r.id))continue;
  const followedUp=new Set(requests.filter(next=>next.replyTo===r.id).flatMap(next=>next.participants.map(p=>p.employeeId)));
  const stale=!!r.staleReferences?.length,failed=r.participants.some(p=>['failed','interrupted','error'].includes(p.status)&&!followedUp.has(p.employeeId));
  const input=r.participants.some(p=>p.status==='waiting');
  if(stale||failed||input)attention.push({id:r.id,title:r.prompt,detail:r.participants.filter(p=>p.error).map(p=>p.error).join(' · '),kind:stale?'stale':input?'input':'failed',target:{tab:'discussion',requestId:r.id}});
  activity.push({id:r.id,title:r.prompt,at:r.participants.reduce((at,p)=>p.updatedAt&&p.updatedAt>at?p.updatedAt:at,r.createdAt),kind:'discussion',target:{tab:'discussion',requestId:r.id}});
 }
 for(const d of documents)if(!d.deletedAt)activity.push({id:d.id,title:d.title,at:d.updatedAt,kind:'document',target:{tab:'documents',documentId:d.id}});
 attention.sort((a,b)=>({input:0,review:1,failed:2,stale:3}[a.kind]-{input:0,review:1,failed:2,stale:3}[b.kind]));
 activity.sort((a,b)=>b.at.localeCompare(a.at));
 return {plans,requests,documents:documents.filter(d=>!d.deletedAt),attention,activity,lastActivity:activity[0]?.at||space.createdAt};
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
  const navigation=tabs?.querySelector<HTMLElement>(':scope > [data-slot=tabs-list]');
  const storageKey='workforce.scroll:'+key;
  const previous=position.current;
  let restoredTop=previous?.key===key?previous.top:0;
  if(previous?.key!==key)try{restoredTop=Number(sessionStorage.getItem(storageKey)||0);}catch{}
  const measure=()=>{
   main.style.setProperty('--wf-space-viewport',`${scroller.clientHeight}px`);
   main.style.setProperty('--wf-space-navigation-height',`${navigation?.getBoundingClientRect().height||44}px`);
   const top=tabs?tabs.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop+scroller.scrollTop:0;
   // Empty discussion fills only the space below the visible heading. When
   // switching from a scrolled tab, retain just enough height to keep tabs pinned.
   const retained=Math.min(Math.max(0,restoredTop),Math.max(0,top));
   main.style.setProperty('--wf-space-available',`${Math.max(0,scroller.clientHeight-top+retained)}px`);
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
  const save=()=>{restoredTop=scroller.scrollTop;measure();position.current={key,tab,top:scroller.scrollTop};try{sessionStorage.setItem(storageKey,String(scroller.scrollTop));}catch{}};
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
