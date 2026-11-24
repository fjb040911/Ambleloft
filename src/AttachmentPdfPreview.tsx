import {useEffect,useState} from 'react';
import FilePdf from './FilePdf';
import {Alert,AlertDescription} from './components/ui/alert';
import {Spinner} from './components/ui/spinner';
import {t} from './i18n';
import './project-files.css';

export default function AttachmentPdfPreview({path}:{path:string}) {
 const [result,setResult]=useState<{data:Uint8Array}|{error:string}|null>(null);
 useEffect(()=>{
  let active=true;
  setResult(null);
  async function load(){
   try {
    const preview=await window.desktop?.readAttachmentPdf?.({path});
    if(active)setResult(preview??{error:'无法预览此 PDF'});
   } catch {
    if(active)setResult({error:'无法预览此 PDF'});
   }
  }
  void load();
  return ()=>{active=false;};
 },[path]);
 if(!result)return <Spinner className="m-auto" aria-label={t('正在加载…')}/>;
 if('error' in result)return <Alert variant="destructive"><AlertDescription>{t(result.error)}</AlertDescription></Alert>;
 return <FilePdf data={result.data}/>;
}
