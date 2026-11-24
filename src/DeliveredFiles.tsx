import ComposerErrorNotice from './ComposerErrorNotice';
import {Attachment,AttachmentMedia,AttachmentContent,AttachmentTitle,AttachmentDescription,AttachmentActions,AttachmentAction,AttachmentTrigger} from './components/ui/attachment';
import {Badge} from './components/ui/badge';
import previewPolicy from '../electron/artifact-preview.json';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {FolderOpen,Eye,FileDiff,RefreshCw} from 'lucide-react';
import type {DeliveredFile} from './types';
import FileTypeIcon from './FileTypeIcon';
import ArtifactPreview from './ArtifactPreview';
import {t} from './i18n';

const OfficeArtifact=lazy(()=>import('./OfficeArtifactPreview'));
type Availability=Record<string,'available'|'missing'|'unavailable'>;

export default function DeliveredFiles({runId,files,openFile,reviewFile}:{runId:string;files:DeliveredFile[];reviewFile?(file:DeliveredFile):(()=>void)|undefined;openFile?(file:DeliveredFile):void}) {
 const [preview,setPreview]=useState<{name:string;text:string}|null>(null);
 const [office,setOffice]=useState<DeliveredFile|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 const root=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState<Availability>({}),[revision,setRevision]=useState(0);
 const refresh=()=>setRevision(value=>value+1);
 // Streamed run updates replace arrays even when their delivery IDs stay the same.
 const ids=JSON.stringify(files.map(f=>f.id));
 useEffect(()=>{
  const element=root.current,api=window.desktop;
  if(!element||!api?.artifactAvailability)return;
  let visible=false,sequence=0;
  const check=async()=>{
   if(!visible||document.hidden)return;
   const request=++sequence;
   try{
    const result=await api.artifactAvailability({runId,ids:JSON.parse(ids)});
    if(request===sequence)setStatus(result);
   }catch{if(request===sequence)setStatus({});}
  };
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible)void check();});
  observer.observe(element);
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return ()=>{sequence++;observer.disconnect();window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[runId,ids,revision]);
 const access=async(file:DeliveredFile,showPreview=false)=>{
  setBusy(file.id);setError('');
  try{
   if(!window.desktop?.accessArtifact)throw new Error(t('请在桌面应用中查看文件'));
   const result=await window.desktop.accessArtifact({runId,id:file.id,preview:showPreview});
   if(showPreview&&result)setPreview(result);
  }catch(e){setError((e as Error).message);refresh();}
  finally{setBusy('');}
 };
 if(!files.length)return null;
 return <div ref={root} className="delivered-files" aria-label={t('交付文件')}>{files.map(file=>{
  const missing=status[file.id]==='missing',unavailable=missing||status[file.id]==='unavailable';
  const canOffice=/\.(xlsx?|pptx?)$/i.test(file.name)&&file.size<=32*1024*1024;
  const canText=previewPolicy.extensions.includes(file.name.split('.').pop()?.toLowerCase()||'')&&file.size<=previewPolicy.maxBytes;
  const open=()=>{
   if(openFile)openFile(file);
   else if(canOffice)setOffice(file);
   else void access(file,canText);
  };
  const review=reviewFile?.(file);
  return <Attachment key={file.id} state={busy===file.id?'processing':'done'}>
   <AttachmentMedia variant="icon"><FileTypeIcon name={file.name}/></AttachmentMedia>
   <AttachmentContent title={file.path}>
    <AttachmentTrigger aria-label={file.title||file.name} disabled={unavailable||!!busy} onClick={open}/>
    <AttachmentTitle>{file.title||file.name}</AttachmentTitle>
    <AttachmentDescription>{unavailable&&<Badge variant="outline">{t(missing?'文件已缺失':'文件不可访问')}</Badge>} {file.name} · {file.size<1024?`${file.size} B`:`${(file.size/1024).toFixed(1)} KB`}</AttachmentDescription>
   </AttachmentContent>
   <AttachmentActions>
    {unavailable?<AttachmentAction aria-label={t('重新检查文件')+' '+file.name} title={t('重新检查文件')} onClick={refresh}><RefreshCw/></AttachmentAction>:<>
     {(canOffice||canText)&&<AttachmentAction aria-label={t('预览')+' '+file.name} disabled={!!busy} onClick={canText?()=>void access(file,true):open}><Eye/></AttachmentAction>}
     <AttachmentAction aria-label={t('在访达中显示')+' '+file.name} disabled={!!busy} onClick={()=>void access(file)}><FolderOpen/></AttachmentAction>
    </>}
    {review&&<AttachmentAction aria-label={t('查看本轮变更')+' '+file.name} onClick={review}><FileDiff/></AttachmentAction>}
   </AttachmentActions>
  </Attachment>;
 })}{error&&<ComposerErrorNotice message={error} dismiss={()=>setError('')}/>}
 {office&&<Suspense fallback={null}><OfficeArtifact artifactId={office.id} runId={runId} name={office.name} close={()=>{setOffice(null);refresh();}}/></Suspense>}
 {preview&&<ArtifactPreview name={preview.name} text={preview.text} close={()=>setPreview(null)}/>}</div>;
}
