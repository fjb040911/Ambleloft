import {startTransition,useCallback,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';

const estimatedHeight=280;
const overscan=1300;
const contentPadding=14;
export const turnGap=24;
type Range={start:number;end:number;anchor:number};

function indexAt(offsets:number[],offset:number){
 let low=0,high=offsets.length-1;
 while(low<high){
  const mid=(low+high)>>1;
  if(offsets[mid+1]<=offset)low=mid+1;
  else high=mid;
 }
 return Math.min(low,offsets.length-2);
}
function rangeAt(offsets:number[],top:number,height:number):Range{
 const offset=top-contentPadding;
 return {start:indexAt(offsets,offset-overscan),end:indexAt(offsets,offset+height+overscan)+1,anchor:indexAt(offsets,offset)};
}

export function useTurnWindow(ids:readonly string[],viewport:RefObject<HTMLDivElement|null>,enabled:boolean,visible:boolean){
 const heights=useRef(new Map<string,number>());
 const nodes=useRef(new Map<string,HTMLElement>());
 const observer=useRef<ResizeObserver|null>(null);
 const [revision,measure]=useState(0);
 const [range,setRange]=useState<Range|null>(null);
 const renderedRange=useRef(range);renderedRange.current=range;
 const target=useRef<{id:string;offset:number}|null>(null);
 const layout=useMemo(()=>{
  const offsets=[0],positions=new Map<string,number>();
  ids.forEach((id,index)=>{
   positions.set(id,index);
   offsets.push(offsets[index]+(heights.current.get(id)??estimatedHeight));
  });
  return {offsets,positions,total:offsets.at(-1)!};
 },[ids,revision]);
 const latest=useRef({enabled,visible,layout});latest.current={enabled,visible,layout};

 const sync=useCallback(()=>{
  const el=viewport.current,{enabled,visible,layout}=latest.current;
  if(!enabled||!visible||!el?.clientHeight||target.current)return;
  const previous=renderedRange.current;
  let top=el.scrollTop;
  // A newly rendered row can grow before ResizeObserver updates the height
  // model. Translate the visible DOM position into that model so a corrected
  // scrollTop does not select a different window using stale estimates.
  const bounds=el.getBoundingClientRect();
  for(const [id,row] of nodes.current){
   const rect=row.getBoundingClientRect(),index=layout.positions.get(id);
   if(index===undefined||rect.bottom<=bounds.top||rect.top>=bounds.bottom)continue;
   const start=layout.offsets[index],end=layout.offsets[index+1];
   top=contentPadding+start+Math.min(end-start-1,bounds.top-rect.top);
   break;
  }
  const next=rangeAt(layout.offsets,top,el.clientHeight);
  if(previous?.start===next.start&&previous.end===next.end&&previous.anchor===next.anchor)return;
  const endOfViewport=indexAt(layout.offsets,top-contentPadding+el.clientHeight);
  if(!previous||next.anchor<previous.start||endOfViewport>=previous.end)setRange(next);
  else startTransition(()=>setRange(next));
 },[viewport]);
 const observe=useCallback((id:string,node:HTMLElement|null)=>{
  const previous=nodes.current.get(id);
  if(previous)observer.current?.unobserve(previous);
  if(node){nodes.current.set(id,node);observer.current?.observe(node);}
  else nodes.current.delete(id);
 },[]);

 useLayoutEffect(()=>{
  if(!enabled||!visible||!viewport.current)return;
  let frame=0;
  const element=viewport.current;
  const sizes=new ResizeObserver(entries=>{
   const el=viewport.current;
   if(!el?.clientHeight)return;
   let changed=false;
   for(const entry of entries){
    const id=(entry.target as HTMLElement).dataset.turnId;
    if(!id)continue;
    const height=entry.borderBoxSize?.[0]?.blockSize??(entry.target as HTMLElement).offsetHeight;
    if(!height)continue;
    const next=height+turnGap,previous=heights.current.get(id)??estimatedHeight;
    if(Math.abs(next-previous)<.25)continue;
    heights.current.set(id,next);changed=true;
   }
   if(changed)measure(value=>value+1);
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(sync);
  });
  observer.current=sizes;
  sizes.observe(element);
  for(const node of nodes.current.values())sizes.observe(node);
  return()=>{cancelAnimationFrame(frame);sizes.disconnect();observer.current=null;element.removeAttribute('data-turn-jump');target.current=null;};
 },[enabled,visible,viewport,sync]);

 useLayoutEffect(()=>{
  const el=viewport.current;
  if(!enabled||!visible||!el?.clientHeight)return;
  const reading=target.current,row=reading&&nodes.current.get(reading.id);
  if(reading&&row){
   // Measure the newly mounted neighborhood before switching back to range
   // calculations. Its real height can differ sharply from the estimates.
   let changed=false;
   for(const [id,node] of nodes.current){
    const height=node.getBoundingClientRect().height;
    const next=height+turnGap;
    if(height&&Math.abs(next-(heights.current.get(id)??estimatedHeight))>=.25){
     heights.current.set(id,next);changed=true;
    }
   }
   if(changed){measure(value=>value+1);return;}
   const delta=row.getBoundingClientRect().top-el.getBoundingClientRect().top-reading.offset;
   if(Math.abs(delta)>.5)el.scrollTop+=delta;
   target.current=null;
   el.removeAttribute('data-turn-jump');
  }
  sync();
 },[enabled,visible,layout,range,viewport,sync]);

 const goTo=(id:string,offset:number)=>{
  const index=layout.positions.get(id),el=viewport.current;
  if(index===undefined||!el)return false;
  target.current={id,offset};
  el.setAttribute('data-turn-jump','');
  const top=Math.max(0,Math.min(layout.offsets[index]+contentPadding-offset,layout.total+contentPadding-el.clientHeight));
  el.scrollTop=top;
  const next=rangeAt(layout.offsets,top,el.clientHeight);
  setRange({...next,start:Math.min(next.start,index),end:Math.max(next.end,index+1)});
  return true;
 };
 const read=()=>{
  const el=viewport.current;
  if(!el?.clientHeight)return;
  const viewportRect=el.getBoundingClientRect();
  for(let index=current.start;index<current.end;index++){
   const turnId=ids[index],row=nodes.current.get(turnId);
   if(!row)continue;
   const rect=row.getBoundingClientRect();
   if(rect.bottom>viewportRect.top&&rect.top<viewportRect.bottom)return {turnId,offset:rect.top-viewportRect.top};
  }
 };
 const current=range??rangeAt(layout.offsets,Math.max(0,layout.total-720),720);
 return {start:current.start,end:current.end,selected:ids[current.anchor]||'',before:layout.offsets[current.start]||0,
  after:Math.max(0,layout.total-(layout.offsets[current.end]??layout.total)),observe,sync,goTo,read};
}
