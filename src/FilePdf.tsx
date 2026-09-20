import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,ZoomIn,ZoomOut} from 'lucide-react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {t} from './i18n';
GlobalWorkerOptions.workerSrc=workerUrl;
const assets=new URL('./pdfjs/',window.document.baseURI).href;
export default function FilePdf({url}:{url:string}) {
 const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null);
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(400),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let cancelled=false;setDocument(null);setPage(1);setError('');setLoading(true);const task=getDocument({url,enableXfa:false,useSystemFonts:true,cMapUrl:assets+'cmaps/',standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',iccUrl:assets+'iccs/'});task.promise.then(value=>{if(!cancelled)setDocument(value);}).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});return()=>{cancelled=true;void task.destroy();};},[url]);
 useEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(host.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!document||!canvas.current||width<=0)return;
  let cancelled=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  setLoading(true);setError('');
  document.getPage(page).then(async value=>{
   if(cancelled||!canvas.current)return;
   const natural=value.getViewport({scale:1});const scale=Math.min(4,Math.max(.1,(width-32)/natural.width*zoom));const viewport=value.getViewport({scale});const target=canvas.current;const ratio=Math.min(window.devicePixelRatio||1,2);
   target.width=Math.floor(viewport.width*ratio);target.height=Math.floor(viewport.height*ratio);target.style.width=viewport.width+'px';target.style.height=viewport.height+'px';
   render=value.render({canvas:target,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;if(!cancelled)setLoading(false);
  }).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
  return()=>{cancelled=true;render?.cancel();};
 },[document,page,zoom,width]);
 return <div className="file-pdf-viewer"><div className="file-pdf-controls"><button aria-label={t('上一页')} disabled={page<=1} onClick={()=>setPage(page-1)}><ChevronLeft size={16}/></button><span>{page} / {document?.numPages||'—'}</span><button aria-label={t('下一页')} disabled={!document||page>=document.numPages} onClick={()=>setPage(page+1)}><ChevronRight size={16}/></button><button aria-label={t('缩小页面')} disabled={zoom<=.5} onClick={()=>setZoom(Math.max(.5,zoom-.25))}><ZoomOut size={16}/></button><button aria-label={t('放大页面')} disabled={zoom>=3} onClick={()=>setZoom(Math.min(3,zoom+.25))}><ZoomIn size={16}/></button><button onClick={()=>setZoom(1)}>{t('适应窗口')}</button></div><div ref={host} className="file-pdf-pages" aria-busy={loading}>{error?<p role="alert">{error}</p>:<>{loading&&<span className="file-pdf-loading" role="status">{t('正在加载…')}</span>}<canvas ref={canvas} aria-label={t('PDF 文件预览')+' '+page}/></>}</div></div>;
}
