import {useEffect,useState} from 'react';
import {Button} from './components/ui/button';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {t} from './i18n';
export default function GrowthSettings(){
 const api=window.desktop?.growth;
 const [state,setState]=useState<{policy:{enabled:number;dailyLimit:number};counts:{state:string;count:number}[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!api)return;let alive=true;const refresh=()=>{void api.status().then(s=>{if(alive)setState(s);}).catch(()=>{if(alive)setError(t('暂时无法读取自动沉淀设置'));});};refresh();const timer=setInterval(refresh,10000);return()=>{alive=false;clearInterval(timer);};},[api]);
 async function update(enabled:boolean,dailyLimit:number){if(!api||busy)return;setBusy(true);setError('');try{await api.policy({enabled,dailyLimit});setState(await api.status());}catch{setError(t('保存失败，请重试'));}finally{setBusy(false);}}
 if(!api)return null;
 return <section className="settings-group"><h2>{t('自动合作沉淀')}</h2><p>{t('空闲时使用专家配置的模型（未配置时使用默认模型）提炼获授权的历史资料，可能产生模型费用。仅保存带来源的摘录与个人理解，不自动采纳业务决定。')}</p>{state&&<><div className="setting-row"><span>{t(state.policy.enabled?'自动沉淀已开启':'自动沉淀已暂停')}<small>{t('暂停后仍可使用已有的有效背景。')}</small></span><Button variant="outline" disabled={busy} onClick={()=>void update(!state.policy.enabled,state.policy.dailyLimit)}>{t(state.policy.enabled?'暂停自动沉淀':'开启自动沉淀')}</Button></div><div className="setting-row"><label htmlFor="growth-daily-limit">{t('每日提炼上限（UTC）')}</label><NativeSelect id="growth-daily-limit" aria-label={t('每日提炼上限')} value={state.policy.dailyLimit} disabled={busy} onChange={e=>void update(!!state.policy.enabled,Number(e.target.value))}>{[...new Set([5,10,20,50,100,state.policy.dailyLimit])].sort((a,b)=>a-b).map(n=><NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}</NativeSelect></div><p className="text-xs text-muted-foreground">{t('已提炼片段')} {state.counts.find(c=>c.state==='completed')?.count||0} · {t('等待提炼')} {state.counts.filter(c=>['queued','blocked'].includes(c.state)).reduce((n,c)=>n+c.count,0)} · {t('失败或中断')} {state.counts.filter(c=>['failed','interrupted'].includes(c.state)).reduce((n,c)=>n+c.count,0)}</p></>}{error&&<p role="alert">{error}</p>}</section>;
}
