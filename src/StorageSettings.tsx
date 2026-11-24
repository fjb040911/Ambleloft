import {useEffect,useState} from 'react';
import {Button} from './components/ui/button';
import {SettingsCard} from './SettingsPrimitives';
import ManagementDialog from './ManagementDialog';
import ReasoningStorage from './ReasoningStorage';
import {t} from './i18n';

const labels={records:'聊天记录与设置',tasks:'附件与任务文件',engine:'引擎、技能与扩展',backups:'更新备份',cache:'应用缓存',other:'其他本地数据'};
type Backup={id:string;fingerprint?:string;kind:'verified'|'legacy'|'unknown';bytes:number;eligible:boolean};
export interface StorageSnapshot {
  root:string;free:number;partial:boolean;reclaimable:number;
  groups:Record<keyof typeof labels,number>;backups:Backup[];
}
export type Cleanup={kind:'cache'}|{kind:'backups';backups:Pick<Backup,'id'|'fingerprint'>[]};
export function size(bytes:number){
  const units=['B','KiB','MiB','GiB','TiB'];
  let i=0;
  while(bytes>=1024 && i<units.length-1){bytes/=1024;i++;}
  return bytes.toLocaleString(undefined,{maximumFractionDigits:i?1:0})+' '+units[i];
}

export default function StorageSettings(){
  const api=window.desktop?.storage;
  const [data,setData]=useState<StorageSnapshot>(),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[result,setResult]=useState(''),[confirm,setConfirm]=useState<Backup|null>(null);
  useEffect(()=>{
    let live=true;
    if(api)void api.snapshot().then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[api]);
  async function refresh(cleanup?:Cleanup){
    if(!api||busy)return;
    setBusy(true);setError('');setResult('');
    try{
      if(cleanup){
        const {freed,skipped}=await api.clean(cleanup);
        setResult(t('已清理')+' '+size(freed)+(skipped?' · '+t('部分项目已跳过，请刷新后查看。'):''));
        setConfirm(null);
      }
      setData(await api.snapshot());
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <>
    <div className="section-heading"><h1>{t('存储空间')}</h1><Button variant="outline" disabled={busy||!api} onClick={()=>void refresh()}>{t('刷新')}</Button></div>
    {error&&<p role="alert">{error}</p>}{result&&<p role="status">{result}</p>}
    {!data?<p role="status">{t(!api?'请在桌面版中查看存储空间。':error?'无法读取存储信息':'正在统计本机数据…')}</p>:<>
      <p className="page-description">{t('本机数据')} {size(Object.values(data.groups).reduce((a,b)=>a+b,0))} · {t('磁盘可用')} {size(data.free)} · {t('预计可清理')} {size(data.reclaimable)}</p>
      {data.partial&&<p role="status">{t('部分文件正被占用或无法读取，统计值可能偏小。')}</p>}
      <SettingsCard title={t('数据占用')}>
        {(Object.keys(labels) as (keyof typeof labels)[]).map(key=><div className="setting-row" key={key}><span>{t(labels[key])}</span><span>{size(data.groups[key])}</span></div>)}
        <div className="settings-actions"><Button variant="outline" disabled={busy||!data.groups.cache} onClick={()=>void refresh({kind:'cache'})}>{t('清理应用缓存')}</Button>
        <Button variant="ghost" onClick={()=>void api?.open().then(message=>{if(message)setError(message);}).catch(e=>setError(e.message))}>{t('打开数据目录')}</Button></div>
        <small className="break-all">{data.root}</small>
      </SettingsCard>
      <ReasoningStorage revision={data} formatSize={size}/>
      <SettingsCard title={t('更新备份')}>
        <p>{t('保留最近两份备份。健康启动后自动清理较早的新版备份，旧版备份可手动清理。聊天记录、附件和任务产物受保护。')}</p>
        {!data.backups.length&&<small>{t('暂无更新备份')}</small>}
        {data.backups.map(item=><div className="setting-row" key={item.id}><span>{new Date(Number(item.id.slice(7))).toLocaleString()}<small>{t(item.kind==='unknown'?'未验证，已保护':item.kind==='legacy'?'旧版更新备份':'已验证备份')} · {size(item.bytes)}</small></span>
          {item.eligible?<Button disabled={busy} variant="outline" onClick={()=>setConfirm(item)}>{t('清理备份')}</Button>:<small>{t('保留')}</small>}</div>)}
      </SettingsCard>
    </>}
    {confirm&&<ManagementDialog title={t('清理这份更新备份？')} busy={busy} close={()=>setConfirm(null)}>
      <p>{confirm.id} · {size(confirm.bytes)}</p><p>{t('清理后将无法从这份备份恢复。')}</p>{error&&<p role="alert">{error}</p>}
      <div className="settings-actions"><Button disabled={busy} variant="outline" onClick={()=>setConfirm(null)}>{t('取消')}</Button>
      <Button disabled={busy} variant="destructive" onClick={()=>void refresh({kind:'backups',backups:[{id:confirm.id,fingerprint:confirm.fingerprint}]})}>{t('确认清理')}</Button></div>
    </ManagementDialog>}
  </>;
}
