import {Attachment,AttachmentMedia,AttachmentContent,AttachmentTitle,AttachmentDescription,AttachmentActions,AttachmentAction,AttachmentTrigger} from './components/ui/attachment';
import previewPolicy from '../electron/artifact-preview.json';
import {lazy,Suspense,useState} from 'react';
import {FolderOpen,Eye,FileDiff} from 'lucide-react';
import type {DeliveredFile} from './types';
import FileTypeIcon from './FileTypeIcon';
import ArtifactPreview from './ArtifactPreview';
import {t} from './i18n';
const OfficeArtifact=lazy(()=>import('./OfficeArtifactPreview'));
export default function DeliveredFiles({runId,files,openFile,reviewFile}:{runId:string;files:DeliveredFile[];reviewFile?(file:DeliveredFile):(()=>void)|undefined;openFile?(file:DeliveredFile):void}) {
 const [preview,setPreview]=useState<{name:string;text:string}|null>(null);
 const [office,setOffice]=useState<DeliveredFile|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState('');
 const access=async(file:DeliveredFile,showPreview=false)=>{setBusy(file.id);setError('');try{if(!window.desktop?.accessArtifact)throw new Error(t('请在桌面应用中查看文件'));const result=await window.desktop.accessArtifact({runId,id:file.id,preview:showPreview});if(showPreview&&result)setPreview(result);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const deliverables=files.filter(file=>file.kind==='delivery');
 if(!deliverables.length)return null;
 return <div className="delivered-files" aria-label={t('交付文件')}>{deliverables.map(file=><Attachment key={file.id} state={busy===file.id?"processing":"done"}><AttachmentMedia variant="icon"><FileTypeIcon name={file.name}/></AttachmentMedia><AttachmentContent title={file.path}><AttachmentTrigger aria-label={file.title||file.name} disabled={!!busy} onClick={()=>openFile?openFile(file):void access(file)}/><AttachmentTitle>{file.title||file.name}</AttachmentTitle><AttachmentDescription>{file.name} · {file.size<1024?`${file.size} B`:`${(file.size/1024).toFixed(1)} KB`}</AttachmentDescription></AttachmentContent><AttachmentActions>{(/\.(xlsx?|pptx?)$/i.test(file.name)&&file.size<=32*1024*1024)&&<AttachmentAction aria-label={`${t('预览')} ${file.name}`} disabled={!!busy} onClick={()=>openFile?openFile(file):setOffice(file)}><Eye size={17}/></AttachmentAction>}{(previewPolicy.extensions.includes(file.name.split('.').pop()?.toLowerCase()||'')&&file.size<=previewPolicy.maxBytes)&&<AttachmentAction aria-label={`${t('预览')} ${file.name}`} disabled={!!busy} onClick={()=>void access(file,true)}><Eye size={17}/></AttachmentAction>}<AttachmentAction aria-label={`${t('在访达中显示')} ${file.name}`} disabled={!!busy} onClick={()=>void access(file)}><FolderOpen size={17}/></AttachmentAction>{reviewFile?.(file)&&<AttachmentAction aria-label={`${t('查看本轮变更')} ${file.name}`} onClick={reviewFile(file)}><FileDiff size={17}/></AttachmentAction>}</AttachmentActions></Attachment>)}{error&&<p role="alert" className="error-banner">{error}</p>}{office&&<Suspense fallback={null}><OfficeArtifact artifactId={office.id} runId={runId} path={office.path} name={office.name} close={()=>setOffice(null)}/></Suspense>}{preview&&<ArtifactPreview name={preview.name} text={preview.text} close={()=>setPreview(null)}/>}</div>;
}
