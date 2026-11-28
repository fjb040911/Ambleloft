import {useLayoutEffect,useRef} from 'react';

// A discussion includes the host and multiple expert transcripts. Give them
// one animation owner without rerendering the transcript on each handoff.
const owners=new WeakMap<Element,()=>void>();

export function useTraceSweep<T extends HTMLElement>(eventKey?:string){
 const target=useRef<T>(null);
 useLayoutEffect(()=>{
  const node=target.current;
  if(!node||!eventKey)return;
  const scope=node.closest('[data-trace-scope]')??node.closest('.turn-progress')??node;
  owners.get(scope)?.();
  node.dataset.traceSweeping='';
  // Two successive events can reuse the same status span in one React commit.
  const animation=node.getAnimations().find(a=>(a as CSSAnimation).animationName==='tw-shimmer');
  if(animation)animation.currentTime=0;
  const stop=()=>{
   if(owners.get(scope)!==stop)return;
   owners.delete(scope);
   delete node.dataset.traceSweeping;
   window.clearTimeout(timer);
  };
  // Bound the lifetime even when the tab is hidden or motion is disabled.
  const timer=window.setTimeout(stop,2000);
  owners.set(scope,stop);
  return stop;
 },[eventKey]);
 return target;
}
