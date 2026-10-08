import {useEffect,useRef,useState,type ReactNode} from 'react';

// Keep a measured placeholder so browser scroll position and anchor targets survive.
export default function VirtualBlock({children,enabled=false,preserveState=false}:{children:ReactNode;enabled?:boolean;preserveState?:boolean}) {
 // Browser containment skips offscreen layout/paint without destroying form,
 // disclosure or chart state. Keep the existing unmounting mode for sidebar rows.
 if(preserveState)return <RetainedBlock enabled={enabled}>{children}</RetainedBlock>;
 return <UnmountingBlock enabled={enabled}>{children}</UnmountingBlock>;
}
function RetainedBlock({children,enabled}:{children:ReactNode;enabled:boolean}) {
 const ref=useRef<HTMLDivElement>(null);const [visited,setVisited]=useState(!enabled);
 useEffect(()=>{
  if(!enabled){setVisited(true);return;}
  if(visited||!ref.current)return;
  const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisited(true);observer.disconnect();}},{rootMargin:'1000px'});
  observer.observe(ref.current);return()=>observer.disconnect();
 },[enabled,visited]);
 return <div ref={ref} style={enabled?{contentVisibility:'auto',containIntrinsicSize:'auto 200px',...(!visited?{height:200}:{})}:undefined}>{visited||!enabled?children:null}</div>;
}
function UnmountingBlock({children,enabled}:{children:ReactNode;enabled:boolean}) {
 const ref=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(true);const height=useRef(200);
 useEffect(()=>{
  const el=ref.current;if(!el||!enabled)return;
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'1000px'});
  observer.observe(el);return()=>observer.disconnect();
 },[enabled]);
 useEffect(()=>{
  const el=ref.current;if(!el||!visible)return;
  const observer=new ResizeObserver(()=>{if(el.offsetHeight)height.current=el.offsetHeight;});
  observer.observe(el);return()=>observer.disconnect();
 },[visible]);
 return <div ref={ref} style={!visible&&enabled?{height:height.current}:undefined}>{visible||!enabled?children:null}</div>;
}
