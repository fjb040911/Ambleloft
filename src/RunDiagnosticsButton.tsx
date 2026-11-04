import {useState} from 'react';
import {Download} from 'lucide-react';
import {Button} from './components/ui/button';
import {t, useLanguage} from './i18n';

export default function RunDiagnosticsButton({runId}:{runId:string}) {
  const language=useLanguage();
  const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('');
  if(!window.desktop?.exportRunDiagnostics)return null;
  return <div className="flex flex-col items-start gap-2">
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={async()=>{
      setBusy(true);setResult('');setError('');
      try { const saved=await window.desktop!.exportRunDiagnostics!({id:runId,language});if(saved?.saved)setResult(t('诊断数据已导出')); }
      catch {setError(t('诊断数据导出失败，请重试'));}
      finally {setBusy(false);}
    }}><Download data-icon="inline-start"/>{t(busy?'正在导出…':'导出诊断数据')}</Button>
    {result&&<p role="status">{result}</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}
