import {useEffect,useState} from 'react';
import PreviewDialog from './PreviewDialog';
import OfficePreview from './OfficePreview';
import FileTypeIcon from './FileTypeIcon';
import {t} from './i18n';
export default function OfficeArtifactPreview({runId,artifactId,path,name,close}:{runId:string;artifactId:string;path:string;name:string;close():void}){
 const [source,setSource]=useState<{base:string;relative:string;version:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false,running=false;
  const refresh=async()=>{if(running)return;running=true;try{
   const api=window.desktop?.projectFiles;if(!api)throw new Error(t('请在桌面应用中查看文件'));
   const context=await api.context({runId,artifactId});const prefix=context.root.replace(/\/$/,'')+'/';
   if(!path.startsWith(prefix))throw new Error(t('文件不在项目目录内'));
   const relative=path.slice(prefix.length),file=await api.read({runId,artifactId,path:relative});
   if(!cancelled){setSource({base:context.baseUrl,relative,version:file.version});setError('');}
  }catch(e){if(!cancelled)setError((e as Error).message);}finally{running=false;}};
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);return()=>{cancelled=true;clearInterval(timer);};
 },[runId,artifactId,path]);
 return <PreviewDialog name={name} icon={<FileTypeIcon name={name}/>} contentClass="is-office" zoomable={false} close={close}>{source&&<div className="office-inline-toolbar"><button className="secondary-button" onClick={()=>{void window.desktop?.projectFiles?.open({runId,artifactId,path:source.relative}).catch(e=>setError(e.message));}}>{t('使用外部应用打开')}</button></div>}{error&&<p role="alert">{error}</p>}{source&&<OfficePreview showRefresh context={{runId,artifactId}} path={source.relative} version={source.version} baseUrl={source.base}/>}</PreviewDialog>;
}
