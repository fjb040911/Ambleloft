import ComposerErrorNotice from './ComposerErrorNotice';
import {Button} from './components/ui/button';
import {useEffect,useState} from 'react';
import PreviewDialog from './PreviewDialog';
import OfficePreview from './OfficePreview';
import FileTypeIcon from './FileTypeIcon';
import {t} from './i18n';
export default function OfficeArtifactPreview({runId,artifactId,name,close}:{runId:string;artifactId:string;name:string;close():void}){
 const [source,setSource]=useState<{base:string;relative:string;version:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false,running=false;
  const refresh=async()=>{if(running)return;running=true;try{
   const api=window.desktop?.projectFiles;if(!api)throw new Error(t('请在桌面应用中查看文件'));
   const context=await api.context({runId,artifactId});const relative=context.artifactPath;
   if(!relative)throw new Error(t('找不到该交付文件'));
   const file=await api.read({runId,artifactId,path:relative});
   if(!cancelled){setSource({base:context.baseUrl,relative,version:file.version});setError('');}
  }catch(e){if(!cancelled){setSource(null);setError((e as Error).message);}}finally{running=false;}};
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);return()=>{cancelled=true;clearInterval(timer);};
 },[runId,artifactId]);
 return <PreviewDialog name={name} icon={<FileTypeIcon name={name}/>} contentClass="is-office" zoomable={false} close={close}>{source&&<div className="office-inline-toolbar"><Button variant="outline" onClick={()=>{void window.desktop?.projectFiles?.open({runId,artifactId,path:source.relative}).catch(e=>setError(e.message));}}>{t('使用外部应用打开')}</Button></div>}{error&&<ComposerErrorNotice message={error}/>}{source&&<OfficePreview showRefresh context={{runId,artifactId}} path={source.relative} version={source.version} baseUrl={source.base}/>}</PreviewDialog>;
}
