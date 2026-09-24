import {useEffect,useLayoutEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {Folder,ChevronDown,Check} from 'lucide-react';
import type {Project} from './types';
import {t} from './i18n';

export default function ProjectPicker({projects,value,onChange,disabled}:{projects:Project[];value:string;onChange(value:string):void;disabled:boolean}){
 const [open,setOpen]=useState(false);const id=useId();
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const options=[{id:'',name:t('不关联项目'),path:''},...projects];
 const selected=options.find(option=>option.id===value)||options[0];
 const close=(restore=false)=>{setOpen(false);if(restore)trigger.current?.focus();};
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useLayoutEffect(()=>{
  if(!open)return;
  const element=popup.current!;
  const position=()=>{const rect=trigger.current!.getBoundingClientRect();const width=Math.min(320,window.innerWidth-24);const above=rect.top>window.innerHeight-rect.bottom;Object.assign(element.style,{position:'fixed',width:`${width}px`,left:`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`,top:above?'auto':`${rect.bottom+8}px`,bottom:above?`${window.innerHeight-rect.top+8}px`:'auto',maxHeight:`${Math.max(40,Math.min(380,(above?rect.top:window.innerHeight-rect.bottom)-20))}px`,transformOrigin:above?'left bottom':'left top'});};
  position();element.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  const outside=(event:PointerEvent)=>{if(!element.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);document.addEventListener('pointerdown',outside);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);document.removeEventListener('pointerdown',outside);};
 },[open]);
 return <><button ref={trigger} type="button" className="project-picker-trigger" disabled={disabled} role="combobox" aria-label={t('当前项目')} aria-haspopup="listbox" aria-controls={open?id:undefined} aria-expanded={open} title={selected.path||selected.name} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);}}}><Folder size={17}/><span>{selected.name}</span><ChevronDown size={13}/></button>
 {open&&createPortal(<div ref={popup} id={id} className="composer-popover project-picker-popover" role="listbox" aria-label={t('当前项目')} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))close();}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  const items=Array.from(popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]'));const index=items.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
  else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==' '){const next=items.slice(index+1).concat(items.slice(0,index+1)).find(item=>item.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));next?.focus();}
 }}>{options.map(option=><button type="button" role="option" aria-selected={option.id===value} tabIndex={-1} key={option.id} title={option.path||option.name} onClick={()=>{onChange(option.id);close(true);}}><span>{option.name}</span>{option.id===value&&<Check size={16}/>}</button>)}</div>,document.body)}</>;
}
