import {useLayoutEffect,useRef,type PointerEvent} from 'react';
import {t} from './i18n';

export default function FileResizer({kind,value,change}:{kind:'panel'|'tree';value:number;change(value:number):void}) {
 const ref=useRef<HTMLDivElement>(null),drag=useRef<{x:number;width:number}|null>(null);
 const current=useRef(value);const commit=useRef(change);commit.current=change;
 const geometry=()=>{
  const slot=ref.current!.closest<HTMLElement>('.file-panel-slot')!;
  const target=kind==='panel'?slot:ref.current!.parentElement!;
  const available=kind==='panel'?slot.parentElement!.clientWidth:slot.clientWidth;
  const max=kind==='panel'?Math.min(1400,window.innerWidth<=1100?available:Math.max(0,available-360)):Math.min(360,slot.clientWidth<590?available*.75:Math.max(0,available-280));
  return {slot,target,max,min:Math.min(kind==='panel'?400:170,max)};
 };
 const apply=(width:number)=>{
  const {slot,min,max}=geometry();current.current=Math.round(Math.max(min,Math.min(max,width)));
  slot.style.setProperty(kind==='panel'?'--file-panel-width':'--file-tree-width',`${current.current}px`);
  ref.current!.setAttribute('aria-valuenow',String(current.current));
 };
 useLayoutEffect(()=>{
  const {target,slot}=geometry();
  const sync=()=>{if(drag.current)return;const {min,max}=geometry();current.current=Math.round(target.getBoundingClientRect().width);ref.current?.setAttribute('aria-valuenow',String(current.current));ref.current?.setAttribute('aria-valuemin',String(Math.round(min)));ref.current?.setAttribute('aria-valuemax',String(Math.round(max)));};
  const observer=new ResizeObserver(sync);observer.observe(target);observer.observe(slot.parentElement!);sync();
  return()=>{observer.disconnect();document.documentElement.classList.remove('file-resizing');};
 },[kind,value]);
 const finish=(event:PointerEvent<HTMLDivElement>)=>{if(!drag.current)return;drag.current=null;delete event.currentTarget.dataset.resizing;commit.current(current.current);document.documentElement.classList.remove('file-resizing');};
 return <div ref={ref} className="file-resizer" role="separator" tabIndex={0} aria-label={t(kind==='panel'?'调整文件面板宽度':'调整文件树宽度')} aria-orientation="vertical" aria-controls={kind==='panel'?'project-file-panel':'project-file-tree'} title={t('拖动调整宽度，双击恢复默认')} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();const {target}=geometry();drag.current={x:event.clientX,width:target.getBoundingClientRect().width};event.currentTarget.dataset.resizing='true';document.documentElement.classList.add('file-resizing');event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(drag.current)apply(drag.current.width+drag.current.x-event.clientX);}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={()=>{apply(kind==='panel'?680:220);commit.current(current.current);}} onKeyDown={event=>{
  const {target,min,max}=geometry();const step=event.shiftKey?48:16;
  const next=event.key==='ArrowLeft'?target.getBoundingClientRect().width+step:event.key==='ArrowRight'?target.getBoundingClientRect().width-step:event.key==='Home'?min:event.key==='End'?max:event.key==='Enter'?(kind==='panel'?680:220):null;
  if(next!==null){event.preventDefault();apply(next);commit.current(current.current);}
 }}/>;
}
