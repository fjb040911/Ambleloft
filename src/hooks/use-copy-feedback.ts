import {useEffect,useRef,useState} from 'react';
import {copyText} from '../clipboard';
export function useCopyFeedback(idle='复制'){
 const [status,setStatus]=useState(idle);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;clearTimeout(timer.current);},[]);
 const copy=async(text:string|(()=>Promise<void>))=>{
  const attempt=++generation.current;clearTimeout(timer.current);
  let next='已复制';try{if(typeof text==='function')await text();else await copyText(text);}catch{next='复制失败';}
  if(attempt!==generation.current)return;
  setStatus(next);timer.current=setTimeout(()=>setStatus(idle),2000);
 };
 return {status,copy};
}
