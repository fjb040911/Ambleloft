import {useEffect,useId,useState} from 'react';
import type {AutomationState,AutomationPolicy,ProviderConfig} from './types';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Switch} from './components/ui/switch';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Alert,AlertDescription} from './components/ui/alert';
import {Badge} from './components/ui/badge';
import {Skeleton} from './components/ui/skeleton';
import {Empty,EmptyHeader,EmptyTitle} from './components/ui/empty';
import {Separator} from './components/ui/separator';
import {t} from './i18n';
import {useConfirm} from './Confirmation';
const statusName=(status:string)=>t(({queued:'等待执行',running:'运行中',succeeded:'已完成',failed:'失败',unknown:'结果不明',cancelled:'已取消',pending:'等待投递',delivering:'投递中',dead:'需要处理'} as Record<string,string>)[status]||status);
export default function ExtensionAutomation({id,onDirtyChange,onBusyChange}:{id:string;onDirtyChange(dirty:boolean):void;onBusyChange?(busy:boolean):void}){
 const confirm=useConfirm();
 const prefix=useId(),[state,setState]=useState<AutomationState>(),[policy,setPolicy]=useState<AutomationPolicy>(),[providers,setProviders]=useState<ProviderConfig[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const api=window.desktop!.extensions!.automation!;
 useEffect(()=>{let live=true;Promise.all([api({id}),window.desktop!.listProviders()]).then(([value,catalog])=>{if(live){setState(value);setPolicy(value.policy);setProviders(catalog.providers);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id]);
 useEffect(()=>{onDirtyChange(!!policy&&!!state&&JSON.stringify(policy)!==JSON.stringify(state.policy));},[policy,state,onDirtyChange]);
 const act=async(input:Parameters<typeof api>[0])=>{setBusy(true);setError('');setSaved(false);try{const value=await api(input);setState(value);if(input.action==='policy'){setPolicy(value.policy);setSaved(true);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="flex max-w-3xl flex-col gap-6" aria-label={t('后台自动化')}>
  <div><h2>{t('后台自动化')}</h2><p className="text-sm text-muted-foreground">{t('扩展可读取已授权的轮次并生成摘要。作业不调用工具，也不会向原聊天发送消息。')}</p></div>
  {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  {saved&&<p role="status">{t('已保存')}</p>}
  {!policy?<Skeleton className="h-32 w-full"/>:<form onSubmit={event=>{event.preventDefault();void act({id,action:'policy',policy});}}><FieldGroup>
   <Field orientation="horizontal" className="pr-3"><FieldLabel htmlFor={prefix+'enabled'}>{t('允许后台模型作业')}</FieldLabel><Switch id={prefix+'enabled'} checked={!policy.paused} disabled={busy} onCheckedChange={checked=>{setSaved(false);setPolicy({...policy,paused:!checked});}}/></Field>
   <FieldDescription>{t('关闭后停止派发并取消正在等待的模型请求；已发出的请求仍可能计费。应用退出后不会继续运行。')}</FieldDescription>
   <Field><FieldLabel htmlFor={prefix+'provider'}>{t('模型服务')}</FieldLabel><NativeSelect className="w-full" id={prefix+'provider'} value={policy.providerId} disabled={busy} onChange={event=>setPolicy({...policy,providerId:event.target.value,model:providers.find(p=>p.id===event.target.value)?.models?.[0]||''})}><NativeSelectOption value="">{t('请选择模型服务')}</NativeSelectOption>{providers.map(p=><NativeSelectOption key={p.id} value={p.id}>{p.name||p.model}</NativeSelectOption>)}</NativeSelect></Field>
   <Field><FieldLabel htmlFor={prefix+'model'}>{t('模型')}</FieldLabel><NativeSelect className="w-full" id={prefix+'model'} value={policy.model} disabled={busy} onChange={event=>setPolicy({...policy,model:event.target.value})}><NativeSelectOption value="">{t('请选择模型')}</NativeSelectOption>{providers.find(p=>p.id===policy.providerId)?.models?.map(model=><NativeSelectOption key={model} value={model}>{model}</NativeSelectOption>)}</NativeSelect></Field>
   <Field><FieldLabel htmlFor={prefix+'limit'}>{t('每 24 小时调用上限')}</FieldLabel><Input id={prefix+'limit'} type="number" min={1} max={100} required value={policy.dailyLimit} disabled={busy} onChange={event=>setPolicy({...policy,dailyLimit:Number(event.target.value)})}/><FieldDescription>{t('每个作业最多生成 2048 tokens。失败和结果不明的请求也计入额度；额度用完后排队等待。')}</FieldDescription></Field>
   <div><Button type="submit" disabled={busy||!policy.paused&&(!policy.providerId||!policy.model)}>{t('保存设置')}</Button></div>
  </FieldGroup></form>}
  <Separator/>
  <div className="flex items-center justify-between gap-3"><h3>{t('最近作业与事件')}</h3><Button variant="outline" size="sm" disabled={busy} onClick={()=>void act({id})}>{t('刷新')}</Button></div>
  {state&&!state.jobs.length&&!state.events.length&&<Empty><EmptyHeader><EmptyTitle>{t('暂无后台活动')}</EmptyTitle></EmptyHeader></Empty>}
  {!!state?.jobs.length&&<div><Button variant="ghost" size="sm" disabled={busy} onClick={async()=>{if(await confirm({title:t('清理已结束的作业？'),description:t('删除 7 天前的成功、失败或取消记录，同时清除其幂等键。结果不明的记录会保留。'),action:t('清理记录')}))void act({id,action:'cleanupJobs'});}}>{t('清理 7 天前的作业记录')}</Button></div>}
  {state?.jobs.map(job=><div key={job.id} className="flex flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{statusName(job.status)}</Badge><span className="text-sm">{new Date(job.createdAt).toLocaleString()} · {job.model}</span></div><p className="break-all text-xs text-muted-foreground">{job.eventKey}</p>{job.status==='unknown'&&<Alert><AlertDescription>{t('模型请求已发出，但结果无法确认。不会自动重试，请先核实服务端记录。')}</AlertDescription></Alert>}{['unknown','failed'].includes(job.status)&&<div><Button variant="outline" size="sm" disabled={busy} onClick={async()=>{if(await confirm({title:t('重新生成摘要？'),description:t('这会发送一次新的模型请求，可能重复计费。原作业及其状态将保留。'),action:t('重新生成')}))void act({id,action:'retryJob',jobId:job.id});}}>{t('重新生成')}</Button></div>}{job.error&&<p className="text-sm">{job.error}</p>}{job.result!==undefined&&<details><summary>{t('查看结果')}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(job.result,null,2)}</pre></details>}</div>)}
  {state?.events.map(event=><div key={event.id} className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{statusName(event.status)}</Badge><span className="min-w-0 break-all text-sm">{event.data.type} · {event.data.dropped??event.attempts}</span>{event.status==='dead'&&<><Button variant="outline" size="sm" disabled={busy||event.data.type==='queue.overflow'} onClick={()=>void act({id,action:'retry',eventId:event.id})}>{t('重新投递')}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void act({id,action:'discard',eventId:event.id})}>{t('丢弃事件')}</Button></>}</div>)}
 </section>;
}
