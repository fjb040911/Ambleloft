import {useEffect,useRef,useState} from 'react';
import {File,ImageOff,X,ZoomIn,Minimize} from 'lucide-react';
import {Attachment,AttachmentMedia,AttachmentContent,AttachmentTitle,AttachmentDescription,AttachmentActions,AttachmentAction,AttachmentTrigger} from './components/ui/attachment';
import {Dialog,DialogTrigger,DialogContent,DialogTitle,DialogHeader} from './components/ui/dialog';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import {Spinner} from './components/ui/spinner';
import {t} from './i18n';
import {isImageAttachment,type ChatAttachment} from './message-attachments';

// Cache only small thumbnails, never full image data or failed reads.
const thumbnails=new Map<string,Promise<string>>();
async function readImage(path:string,thumbnail=false){
 if(!window.desktop?.readAttachmentImage)throw Error(t('图片预览不可用，请重启应用后重试'));
 return (await window.desktop.readAttachmentImage({path,thumbnail})).dataUrl;
}
function thumbnailFor(path:string){
 let pending=thumbnails.get(path);
 if(!pending){pending=readImage(path,true).catch(error=>{thumbnails.delete(path);throw error;});thumbnails.set(path,pending);if(thumbnails.size>80)thumbnails.delete(thumbnails.keys().next().value!);}
 return pending;
}
function ImagePreview({file}:{file:ChatAttachment}){
 const [src,setSrc]=useState(''),[error,setError]=useState(''),[actual,setActual]=useState(false);
 useEffect(()=>{let cancelled=false;readImage(file.path).then(url=>{if(!cancelled)setSrc(url);}).catch(error=>{if(!cancelled)setError(t(error.message));});return()=>{cancelled=true;};},[file.path]);
 return <><DialogHeader className="pr-10"><DialogTitle className="truncate">{file.name}</DialogTitle></DialogHeader>
  <div className="flex min-h-40 max-h-[70vh] overflow-auto" aria-busy={!src&&!error}>
   {error?<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>:src?<img src={src} alt={file.name} className={actual?'m-auto max-w-none shrink-0':'m-auto max-h-[70vh] max-w-full object-contain'} onError={()=>setError(t('无法预览此图片'))}/>:<Spinner className="m-auto" aria-label={t('正在加载图片…')}/>}
  </div>
  {src&&!error&&<div className="flex justify-end"><Button variant="outline" size="sm" onClick={()=>setActual(value=>!value)}>{actual?<Minimize data-icon="inline-start"/>:<ZoomIn data-icon="inline-start"/>}{t(actual?'适应窗口':'原始尺寸')}</Button></div>}
 </>;
}
function ImageAttachment({file,compact,onRemove,disabled}:{file:ChatAttachment;compact?:boolean;onRemove?:()=>void;disabled?:boolean}){
 const ref=useRef<HTMLDivElement>(null),[src,setSrc]=useState(''),[error,setError]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{
  let cancelled=false;const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))return;observer.disconnect();thumbnailFor(file.path).then(url=>{if(!cancelled)setSrc(url);}).catch(()=>{if(!cancelled)setError(true);});});
  if(ref.current)observer.observe(ref.current);return()=>{cancelled=true;observer.disconnect();};
 },[file.path]);
 return <Dialog open={open} onOpenChange={setOpen}><Attachment ref={ref} orientation="vertical" className={compact?'has-data-[slot=attachment-content]:w-24':'has-data-[slot=attachment-content]:w-36'} state={error?'error':'done'}>
  <AttachmentMedia variant="image">{error?<ImageOff/>:src?<img src={src} alt={file.name} loading="lazy" onError={()=>setError(true)}/>:<Spinner aria-label={t('正在加载图片…')}/>}</AttachmentMedia>
  <AttachmentContent><AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>{error&&<AttachmentDescription>{t('图片不可用')}</AttachmentDescription>}</AttachmentContent>
  <DialogTrigger render={<AttachmentTrigger aria-label={`${t('预览图片')} ${file.name}`}/>}/>
  {onRemove&&<AttachmentActions><AttachmentAction variant="secondary" aria-label={`${t('移除附件')} ${file.name}`} disabled={disabled} onClick={onRemove}><X/></AttachmentAction></AttachmentActions>}
 </Attachment><DialogContent className="sm:max-w-[min(960px,calc(100vw-2rem))]" aria-describedby={undefined}><ImagePreview file={file}/></DialogContent></Dialog>;
}
export default function ChatAttachments({files,compact=false,onRemove,disabled}:{files:ChatAttachment[];compact?:boolean;onRemove?:(path:string)=>void;disabled?:boolean}){
 if(!files.length)return null;
 return <div data-slot="chat-attachments" className="flex min-w-0 max-w-full flex-wrap items-start gap-2" aria-label={t('附件')}>{files.map(file=>isImageAttachment(file)?<ImageAttachment key={file.path} file={file} compact={compact} disabled={disabled} onRemove={onRemove?()=>onRemove(file.path):undefined}/>:<Attachment size="sm" key={file.path} title={file.path}><AttachmentMedia variant="icon"><File/></AttachmentMedia><AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle></AttachmentContent>{onRemove&&<AttachmentActions><AttachmentAction aria-label={`${t('移除附件')} ${file.name}`} disabled={disabled} onClick={()=>onRemove(file.path)}><X/></AttachmentAction></AttachmentActions>}</Attachment>)}</div>;
}
