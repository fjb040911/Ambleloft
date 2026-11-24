import {useEffect,useState} from 'react';
import {Button} from './components/ui/button';
import {SettingsCard} from './SettingsPrimitives';
import ManagementDialog from './ManagementDialog';
import {t} from './i18n';

type Candidate={kind:'run'|'host';id:string;title:string;at:string;bytes:number;token:string};
export type ReasoningPreview={stats:{run:number;host:number;snapshot:number};candidates:Candidate[]};
export default function ReasoningStorage({formatSize,revision}:{formatSize:(bytes:number)=>string;revision:object}){
  const api=window.desktop?.storage;
  const [data,setData]=useState<ReasoningPreview>(),[preview,setPreview]=useState<ReasoningPreview>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    let live=true;
    api?.reasoningPreview().then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[api,revision]);
  async function review(){
    if(!api||busy)return;
    setError('');setNotice('');setBusy(true);
    try{const value=await api.reasoningPreview();setData(value);setPreview(value);}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  async function clean(){
    if(!api||!preview||busy)return;
    setError('');setBusy(true);
    try{
      const result=await api.cleanReasoning(preview.candidates.map(item=>item.token));
      setPreview(undefined);setData(undefined);
      setNotice(t('已清理思考正文')+' '+formatSize(result.bytes)+(result.skipped?' · '+t('已跳过发生变化的记录')+' '+result.skipped:''));
      setData(await api.reasoningPreview());
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  const eligible=(items:Candidate[])=>items.reduce((n,item)=>n+item.bytes,0);
  return <SettingsCard title={t('历史思考记录')}>
    <p>{t('仅手动清理。会话或所属空间须已归档，最后活动超过 90 天，且该轮已有最终答复。有关联计划时，须已完成验收。')}</p>
    {data&&<>
      {([['run','任务与专家思考'],['host','讨论主持人思考'],['snapshot','自动化快照中的思考（只读）']] as const).map(([key,label])=><div key={key} className="setting-row"><span>{t(label)}</span><span>{formatSize(data.stats[key])}</span></div>)}
      <div className="setting-row"><span>{t('符合条件的记录')} · {data.candidates.length} · {formatSize(eligible(data.candidates))}</span>
      <Button variant="outline" disabled={busy||!data.candidates.length} onClick={()=>void review()}>{t('预览清理')}</Button></div>
    </>}
    <small>{t('以上为正文占用。清理后的空间可由数据库复用，磁盘文件可能不会立即缩小。')}</small>
    {notice&&<p role="status">{notice}</p>}{error&&!preview&&<p role="alert">{error}</p>}
    {preview&&<ManagementDialog title={t('预览历史思考记录清理')} busy={busy} close={()=>setPreview(undefined)}>
      <p>{t('将移除以下记录中的思考正文，清理后无法在聊天中查看。对话结论、附件、任务产物和验收记录都会保留。')}</p>
      <ul>{preview.candidates.map(item=><li className="setting-row" key={item.token}><span className="min-w-0 break-words">{item.title}<small>{t(item.kind==='host'?'讨论主持人思考':'任务与专家思考')} · {new Date(item.at).toLocaleDateString()}</small></span><span className="shrink-0">{formatSize(item.bytes)}</span></li>)}</ul>
      {error&&<p role="alert">{error}</p>}
      <div className="settings-actions"><Button variant="outline" disabled={busy} onClick={()=>setPreview(undefined)}>{t('取消')}</Button>
      <Button variant="destructive" disabled={busy||!preview.candidates.length} onClick={()=>void clean()}>{t('确认清理')} · {formatSize(eligible(preview.candidates))}</Button></div>
    </ManagementDialog>}
  </SettingsCard>;
}
