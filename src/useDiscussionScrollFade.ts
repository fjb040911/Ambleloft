import {useLayoutEffect,type RefObject} from 'react';
import {spaceScroller} from './workforce-space-state';

// Adapt shadcn's scroll-fade mask to the shared page scroller. Moving scrolling
// into the transcript would break sticky space tabs and saved page positions.
export function useDiscussionScrollFade(ref:RefObject<HTMLDivElement|null>,enabled:boolean,narrow:boolean){
 useLayoutEffect(()=>{
  const transcript=ref.current;if(!transcript||!enabled)return;
  const scroller=spaceScroller(transcript);
  const navigation=transcript.closest('.wf-space-tabs')?.querySelector('.wf-space-navigation');
  const footer=transcript.parentElement?.querySelector('.wf-discussion-footer');
  let frame=0;
  const measure=()=>{
   frame=0;
   const rect=transcript.getBoundingClientRect(),viewport=scroller.getBoundingClientRect();
   const top=Math.max(0,viewport.top,navigation?.getBoundingClientRect().bottom??0);
   const bottom=Math.min(window.innerHeight,viewport.bottom,footer?.getBoundingClientRect().top??window.innerHeight);
   const start=Math.min(rect.height,Math.max(0,top-rect.top));
   const end=Math.max(start,Math.min(rect.height,bottom-rect.top));
   const depth=Math.min(16,(end-start)/2);
   transcript.style.setProperty('--discussion-fade-offset',`${start}px`);
   transcript.style.setProperty('--discussion-fade-height',`${end-start}px`);
   transcript.style.setProperty('--scroll-fade-t',`${depth*Math.min(1,start/96)}px`);
   transcript.style.setProperty('--scroll-fade-b',`${depth*Math.min(1,Math.max(0,rect.height-end)/96)}px`);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  // Observe geometry only; existing chat code still owns following and anchoring.
  const observer=new ResizeObserver(schedule);
  for(const element of [transcript,scroller,navigation,footer])if(element)observer.observe(element);
  scroller.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  measure();
  return()=>{
   cancelAnimationFrame(frame);observer.disconnect();
   scroller.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);
   for(const property of ['--discussion-fade-offset','--discussion-fade-height','--scroll-fade-t','--scroll-fade-b'])transcript.style.removeProperty(property);
  };
 // The responsive layout remounts the transcript when switching panel modes.
 },[ref,enabled,narrow]);
}
