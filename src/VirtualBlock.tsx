import {useEffect,useRef,useState,type ReactNode} from 'react';

// Keep a measured placeholder so browser scroll position and anchor targets survive.
export default function VirtualBlock({children,enabled=false,preserveState=false,estimatedHeight=200}:{children:ReactNode;enabled?:boolean;preserveState?:boolean;estimatedHeight?:number}) {
 // Browser containment skips offscreen layout/paint without destroying form,
 // disclosure or chart state. Transcripts use measured unmounting instead.
 if(preserveState)return <RetainedBlock enabled={enabled} estimatedHeight={estimatedHeight}>{children}</RetainedBlock>;
 return <UnmountingBlock enabled={enabled} estimatedHeight={estimatedHeight}>{children}</UnmountingBlock>;
}
function RetainedBlock({children,enabled,estimatedHeight}:{children:ReactNode;enabled:boolean;estimatedHeight:number}) {
 const ref=useRef<HTMLDivElement>(null);const [visited,setVisited]=useState(!enabled);
 useEffect(()=>{
  if(!enabled){setVisited(true);return;}
  if(visited||!ref.current)return;
  const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisited(true);observer.disconnect();}},{rootMargin:'1000px'});
  observer.observe(ref.current);return()=>observer.disconnect();
 },[enabled,visited]);
 return <div ref={ref} style={enabled?{contentVisibility:'auto',containIntrinsicSize:'auto '+estimatedHeight+'px',...(!visited?{height:estimatedHeight}:{})}:undefined}>{visited||!enabled?children:null}</div>;
}
function UnmountingBlock({children,enabled,estimatedHeight}:{children:ReactNode;enabled:boolean;estimatedHeight:number}) {
 const ref=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(!enabled);const height=useRef(estimatedHeight);
 useEffect(()=>{
  const el=ref.current;if(!el||!enabled)return;
  const observer=new IntersectionObserver(([entry])=>{if(document.visibilityState==='hidden'||!el.getClientRects().length)return;setVisible(entry.isIntersecting||el.contains(document.activeElement));},{rootMargin:'800px'});
  observer.observe(el);return()=>observer.disconnect();
 },[enabled]);
 useEffect(()=>{
  const el=ref.current;if(!el||!visible)return;
  const observer=new ResizeObserver(()=>{if(el.offsetHeight)height.current=el.offsetHeight;});
  observer.observe(el);return()=>observer.disconnect();
 },[visible]);
 return <div ref={ref} data-virtualized={enabled&&!visible?'placeholder':undefined} style={!visible&&enabled?{height:height.current,overflowAnchor:'none'}:undefined}>{visible||!enabled?children:null}</div>;
}
