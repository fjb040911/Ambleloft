import {useLayoutEffect,useRef} from 'react';
import {t} from './i18n';
import './sidebar-resize.css';

// The existing Sidebar is fixed-position; resize its shared width token and gap
// together without rerendering the conversation on every pointer movement.
export default function SidebarResizeHandle({scope,defaultWidth,minWidth=200,maxWidth=420,offset=0,controls}:{scope:'home'|'settings';defaultWidth:number;minWidth?:number;maxWidth?:number;offset?:number;controls:string}) {
 const ref=useRef<HTMLDivElement>(null);
 const actions=useRef({apply:(_width:number)=>{},save:()=>{},current:defaultWidth});
 const drag=useRef<{x:number;width:number;pointer:number}|null>(null);
 useLayoutEffect(()=>{
  const handle=ref.current;const root=handle?.closest<HTMLElement>(scope==='home'?'.app-shell':'.settings-workspace');
  if(!handle||!root)return;
  const key=`atelier.sidebar-width.${scope}`;
  let preferred=defaultWidth;
  try{const raw=localStorage.getItem(key);const saved=Number(raw);if(raw&&Number.isFinite(saved))preferred=Math.max(minWidth,Math.min(maxWidth,saved));}catch{}
  const apply=(width:number)=>{
   const max=Math.max(minWidth,Math.min(maxWidth,window.innerWidth-offset-400));
   const next=Math.round(Math.max(minWidth,Math.min(max,width)));
   root.style.setProperty('--resizable-sidebar-width',`${next}px`);
   handle.setAttribute('aria-valuenow',String(next));handle.setAttribute('aria-valuemax',String(max));
   actions.current.current=next;
  };
  const save=()=>{preferred=actions.current.current;try{localStorage.setItem(key,String(preferred));}catch{}};
  actions.current={apply,save,current:defaultWidth};apply(preferred);
  const resize=()=>apply(preferred);
  window.addEventListener('resize',resize);
  return()=>{window.removeEventListener('resize',resize);document.documentElement.classList.remove('sidebar-resizing');drag.current=null;};
 },[scope,defaultWidth,minWidth,maxWidth,offset]);
 const finish=()=>{if(!drag.current)return;drag.current=null;actions.current.save();document.documentElement.classList.remove('sidebar-resizing');};
 return <div ref={ref} className="sidebar-resize-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={t(scope==='home'?'调整首页侧栏宽度':'调整设置侧栏宽度')} aria-controls={controls} aria-valuemin={minWidth} title={t('拖动调整宽度，双击恢复默认')} onPointerDown={event=>{
  if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={x:event.clientX,width:actions.current.current,pointer:event.pointerId};document.documentElement.classList.add('sidebar-resizing');
 }} onPointerMove={event=>{const start=drag.current;if(start&&start.pointer===event.pointerId)actions.current.apply(start.width+event.clientX-start.x);}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={()=>{actions.current.apply(defaultWidth);actions.current.save();}} onKeyDown={event=>{
  const step=event.shiftKey?32:8;
  const width=event.key==='ArrowLeft'?actions.current.current-step:event.key==='ArrowRight'?actions.current.current+step:event.key==='Home'?minWidth:event.key==='End'?maxWidth:event.key==='Enter'?defaultWidth:null;
  if(width===null)return;event.preventDefault();actions.current.apply(width);actions.current.save();
 }}/>;
}
