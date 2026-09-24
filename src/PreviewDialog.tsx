import {useEffect,useLayoutEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Maximize2,Minimize2,ZoomIn,ZoomOut,RotateCcw,X} from 'lucide-react';
import {t} from './i18n';

// Modal order is independent of React ancestry and any zoomed document content.
const previewStack:HTMLDialogElement[]=[];

export default function PreviewDialog({name,children,icon,contentClass,initialMaximized=false,maximizedOnly=false,close}:{name:string;children:ReactNode;icon?:ReactNode;contentClass:string;initialMaximized?:boolean;maximizedOnly?:boolean;close():void}) {
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 const body=useRef<HTMLDivElement>(null);
 const returnFocus=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  const element=body.current;if(!element||!maximizedOnly)return;
  const update=()=>{element.style.setProperty('--preview-fit-width',`${Math.max(1,element.clientWidth-48)}px`);element.style.setProperty('--preview-fit-height',`${Math.max(1,element.clientHeight-48)}px`);};
  const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect();
 },[maximizedOnly]);
 const [maximized,setMaximized]=useState(initialMaximized||maximizedOnly),[zoom,setZoom]=useState(100);
 const transition=useRef<Animation|null>(null);
 const previousBounds=useRef<{rect:DOMRect;radius:string}|null>(null);
 const toggleMaximized=()=>{
  const element=dialog.current;
  if(element){
   // Capture the presentation before canceling so a reversal starts where it is visible.
   previousBounds.current={rect:element.getBoundingClientRect(),radius:getComputedStyle(element).borderRadius};
   element.getAnimations().forEach(animation=>animation.cancel());
  }
  setMaximized(value=>!value);
 };
 useLayoutEffect(()=>{
  const element=dialog.current,previous=previousBounds.current;
  previousBounds.current=null;
  if(!element||!previous||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const target=element.getBoundingClientRect();
  transition.current=element.animate([
   {transform:`translate(${previous.rect.x-target.x}px, ${previous.rect.y-target.y}px) scale(${previous.rect.width/target.width}, ${previous.rect.height/target.height})`,borderRadius:previous.radius},
   {transform:'translate(0, 0) scale(1, 1)',borderRadius:getComputedStyle(element).borderRadius},
  ],{duration:260,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
 },[maximized]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const finish=()=>transition.current?.cancel();
  media.addEventListener('change',finish);window.addEventListener('resize',finish);
  return()=>{finish();media.removeEventListener('change',finish);window.removeEventListener('resize',finish);};
 },[]);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  returnFocus.current??=document.activeElement as HTMLElement|null;
  previewStack.push(element);element.showModal();
  return()=>{
   const wasTop=previewStack.at(-1)===element;
   const index=previewStack.indexOf(element);if(index!==-1)previewStack.splice(index,1);
   element.close();
   queueMicrotask(()=>{
    const previous=returnFocus.current;if(!wasTop||!previous?.isConnected)return;
    const top=previewStack.at(-1);
    if(top?top.contains(previous):!document.querySelector('dialog[open]'))previous.focus({preventScroll:true});
   });
  };
 },[]);
 return createPortal(<dialog ref={dialog} className={`modal delivered-preview-dialog${maximized?' is-maximized':''}`} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();event.stopPropagation();if(previewStack.at(-1)===dialog.current)close();}} onClick={event=>{
  event.stopPropagation();
  if(event.target!==event.currentTarget)return;
  const rect=event.currentTarget.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
 }}>
  <header className="artifact-preview-heading">
   {icon}<h2 id={titleId} title={name}>{name}</h2>
   <div className="artifact-preview-toolbar" role="toolbar" aria-label={t('文件预览工具栏')}>
    {maximized&&<><button className="icon-button" aria-label={t('缩小')} title={t('缩小')} disabled={zoom<=50} onClick={()=>setZoom(value=>Math.max(50,value-10))}><ZoomOut size={18}/></button><output aria-live="polite">{zoom}%</output><button className="icon-button" aria-label={t('放大')} title={t('放大')} disabled={zoom>=200} onClick={()=>setZoom(value=>Math.min(200,value+10))}><ZoomIn size={18}/></button><button className="icon-button" aria-label={t('还原尺寸')} title={t('还原尺寸')} disabled={zoom===100} onClick={()=>setZoom(100)}><RotateCcw size={18}/></button><span className="artifact-preview-divider"/></>}
    {!maximizedOnly&&<button className="icon-button" aria-label={t(maximized?'退出最大化':'最大化')} title={t(maximized?'退出最大化':'最大化')} onClick={toggleMaximized}>{maximized?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>}
    <button className="icon-button" aria-label={t('关闭')} title={t('关闭')} onClick={close}><X size={18}/></button>
   </div>
  </header>
  <div ref={body} className={`artifact-preview-body ${contentClass}`}>
   <div className="artifact-preview-content" style={{zoom:zoom/100} as CSSProperties}>
    {children}
   </div>
  </div>
 </dialog>,document.body);
}
