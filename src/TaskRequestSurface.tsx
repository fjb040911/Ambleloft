import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Button} from './components/ui/button';
import {Card,CardContent} from './components/ui/card';
import {Item,ItemContent,ItemTitle,ItemActions} from './components/ui/item';
import {t} from './i18n';

// Portal escapes the node's clipping ancestors without a backdrop or focus trap.
export default function TaskRequestSurface({title,open,onOpenChange,count,floating,visible,children}:{title?:string;open:boolean;onOpenChange(open:boolean):void;count:number;floating:boolean;visible:boolean;children:ReactNode}){
 const anchor=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null),bodyId=useId();
 const [bounds,setBounds]=useState<{left:number;width:number;bottom:number;maxHeight:number}|null>(null);
 useLayoutEffect(()=>{
  if(!floating||!visible)return;
  const el=anchor.current;if(!el)return;
  const chat=el.closest('.wf-node-conversation');
  const dock=el.closest('.conversation-dock');
  const measure=()=>{
   const r=el.getBoundingClientRect(),top=chat?.getBoundingClientRect().top||0;
   const available=Math.max(0,r.top-Math.max(8,top)-8);
   // Keep some transcript visible, even for long forms. Only the body scrolls.
   setBounds({left:r.left,width:r.width,bottom:window.innerHeight-r.top+4,maxHeight:Math.max(80,Math.min(480,available*.75))});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(el);if(chat)observer.observe(chat);if(dock)observer.observe(dock);
  window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
 },[floating,visible]);
 const panel=<Card size="sm" role="region" hidden={!visible} aria-label={t('处理任务请求')} className={`wf-request-surface min-w-0 gap-2 py-2 ${!visible?'hidden':''} ${floating?'is-floating z-40':''}`} style={floating&&bounds?{position:'fixed',...bounds}:undefined} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onOpenChange(false);toggle.current?.focus();}}}>
  <Item size="sm" className="shrink-0 flex-nowrap border-0 py-0">
   <ItemContent><ItemTitle role="status">{title||t('待处理请求')}{count>1&&<> · {count}</>}</ItemTitle></ItemContent>
   <ItemActions><Button ref={toggle} size="sm" variant="ghost" aria-controls={bodyId} aria-expanded={open} onClick={()=>onOpenChange(!open)}>{t(open?'收起请求':'查看并处理')}</Button></ItemActions>
  </Item>
  <CardContent id={bodyId} className="wf-request-body min-h-0 overflow-auto overscroll-contain" hidden={!open}>{(floating||open)&&children}</CardContent>
 </Card>;
 return <><div ref={anchor} className={floating?'wf-request-anchor':undefined}/>{count>0&&(floating?(bounds&&createPortal(panel,document.body)):panel)}</>;
}
