import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,PanelLeft,StickyNote} from 'lucide-react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {t} from './i18n';
GlobalWorkerOptions.workerSrc=workerUrl;
const assets=new URL('./pdfjs/',window.document.baseURI).href;
function PageCanvas({document,page,scale,thumbnail=false}:{document:PDFDocumentProxy;page:number;scale:number;thumbnail?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;setError('');
  document.getPage(page).then(async value=>{if(cancelled||!canvas.current)return;const viewport=value.getViewport({scale});const target=canvas.current;const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16000000/(viewport.width*viewport.height)));
   target.width=Math.max(1,Math.floor(viewport.width*ratio));target.height=Math.max(1,Math.floor(viewport.height*ratio));target.style.width=viewport.width+'px';target.style.height=viewport.height+'px';
   render=value.render({canvas:target,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;
  }).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;render?.cancel();};
 },[document,page,scale]);
 return error?<p role="alert">{error}</p>:<canvas ref={canvas} aria-label={t(thumbnail?'幻灯片缩略图':'幻灯片')+' '+page}/>;
}
function Thumbnail({document,page,width,selected,onClick}:{document:PDFDocumentProxy;page:number;width:number;selected:boolean;onClick():void}){
 const ref=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <button ref={ref} className={selected?'selected':''} aria-label={t('跳转到幻灯片')+' '+page} aria-current={selected?'page':undefined} onClick={onClick}><span>{page}</span>{visible?<PageCanvas document={document} page={page} scale={130/width} thumbnail/>:<span className="slide-placeholder"/>}</button>;
}
export default function PresentationPreview({url,slides,legacy}:{url:string;slides:{number:number;notes:string}[];legacy?:boolean}){
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState('fit'),[tree,setTree]=useState(true),[notes,setNotes]=useState(true),[error,setError]=useState('');
 const [loadedNotes,setLoadedNotes]=useState(slides);
 const [size,setSize]=useState({width:960,height:540}),[bounds,setBounds]=useState({width:500,height:500});
 const host=useRef<HTMLDivElement>(null),current=useRef<ReturnType<typeof getDocument>|null>(null);
 useEffect(()=>{
  let cancelled=false;setError('');const task=getDocument({url,enableXfa:false,useSystemFonts:true,cMapUrl:assets+'cmaps/',standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',iccUrl:assets+'iccs/'});
  task.promise.then(async next=>{const first=await next.getPage(1);if(cancelled){void task.destroy();return;}const view=first.getViewport({scale:1});const previous=current.current;current.current=task;setSize({width:view.width,height:view.height});setDocument(next);setLoadedNotes(slides);setPage(p=>Math.min(p,next.numPages));if(previous)setTimeout(()=>void previous.destroy(),0);}).catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;if(current.current!==task)void task.destroy();};
 },[url]);
 useEffect(()=>()=>{void current.current?.destroy();},[]);
 useEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(entries=>setBounds({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));observer.observe(host.current);return()=>observer.disconnect();},[]);
 const fit=Math.max(.05,Math.min((bounds.width-40)/size.width,(bounds.height-40)/size.height));
 const scale=zoom==='fit'?fit:Number(zoom);
 const mismatch=!!document&&!legacy&&document.numPages!==loadedNotes.length;
 return <div className="presentation-viewer"><div className="presentation-toolbar">
  <button className="icon-button" aria-label={t('显示/隐藏幻灯片缩略图')} aria-pressed={tree} onClick={()=>setTree(!tree)}><PanelLeft size={16}/></button>
  <button className="icon-button" aria-label={t('上一页')} disabled={page<=1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={16}/></button><span>{page} / {document?.numPages||'—'}</span><button className="icon-button" aria-label={t('下一页')} disabled={!document||page>=document.numPages} onClick={()=>setPage(n=>n+1)}><ChevronRight size={16}/></button>
  <select aria-label={t('幻灯片缩放')} value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">{t('适应窗口')} ({Math.round(fit*100)}%)</option>{[.25,.5,1,2].map(n=><option value={n} key={n}>{n*100}%</option>)}</select>
  <button className="icon-button" aria-label={t('显示/隐藏演讲者备注')} aria-pressed={notes} onClick={()=>setNotes(!notes)}><StickyNote size={16}/></button>
 </div>{error&&<p className="file-warning" role="alert">{error}</p>}
 <div className="presentation-body">{tree&&<nav className="slide-thumbnails" aria-label={t('幻灯片导航')}>{document&&Array.from({length:document.numPages},(_,i)=><Thumbnail key={url+':'+i} document={document} page={i+1} width={size.width} selected={page===i+1} onClick={()=>setPage(i+1)}/>)}</nav>}
  <div className="slide-detail"><div className="slide-stage" ref={host}>{document?<PageCanvas document={document} page={page} scale={scale}/>:<p role="status">{t('正在加载…')}</p>}</div>
   {notes&&<section className="speaker-notes" aria-label={t('演讲者备注')}><h4>{t('演讲者备注')}</h4><p>{legacy?t('旧版 PPT 暂不支持提取备注，请另存为 PPTX。'):mismatch?t('转换后的页数不匹配，暂不展示备注以避免错页。'):loadedNotes[page-1]?.notes||t('此页没有演讲者备注')}</p></section>}
  </div>
 </div></div>;
}
