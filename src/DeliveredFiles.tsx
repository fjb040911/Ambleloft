import previewPolicy from '../electron/artifact-preview.json';
import {useState} from 'react';
import {FolderOpen,Eye} from 'lucide-react';
import type {DeliveredFile} from './types';
import FileTypeIcon from './FileTypeIcon';
import ArtifactPreview from './ArtifactPreview';
import {t} from './i18n';
export default function DeliveredFiles({runId,files,openFile}:{runId:string;files:DeliveredFile[];openFile?(file:DeliveredFile):void}) {
 const [preview,setPreview]=useState<{name:string;text:string}|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState('');
 const access=async(file:DeliveredFile,showPreview=false)=>{setBusy(file.id);setError('');try{if(!window.desktop?.accessArtifact)throw new Error(t('请在桌面应用中查看文件'));const result=await window.desktop.accessArtifact({runId,id:file.id,preview:showPreview});if(showPreview&&result)setPreview(result);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 if(!files.length)return null;
 return <div className="delivered-files" aria-label={t('交付文件')}>{files.map(file=><div className="delivered-file" key={file.id}><FileTypeIcon name={file.name}/><div title={file.path}><button type="button" className="delivered-file-name" disabled={!!busy} onClick={()=>openFile?openFile(file):void access(file)}>{file.name}</button><small>{file.size<1024?`${file.size} B`:`${(file.size/1024).toFixed(1)} KB`}</small></div>{(previewPolicy.extensions.includes(file.name.split('.').pop()?.toLowerCase()||'')&&file.size<=previewPolicy.maxBytes)&&<button className="icon-button" aria-label={`${t('预览')} ${file.name}`} disabled={!!busy} onClick={()=>void access(file,true)}><Eye size={17}/></button>}<button className="icon-button" aria-label={`${t('在访达中显示')} ${file.name}`} disabled={!!busy} onClick={()=>void access(file)}><FolderOpen size={17}/></button></div>)}{error&&<p role="alert" className="error-banner">{error}</p>}{preview&&<ArtifactPreview name={preview.name} text={preview.text} close={()=>setPreview(null)}/>}</div>;
}
