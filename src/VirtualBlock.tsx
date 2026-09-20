import {useEffect,useRef,useState,type ReactNode} from 'react';

// Keep a measured placeholder so browser scroll position and anchor targets survive.
export default function VirtualBlock({children,enabled=false}:{children:ReactNode;enabled?:boolean}) {
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
