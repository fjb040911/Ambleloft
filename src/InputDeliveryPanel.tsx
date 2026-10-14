import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,AlertTitle,AlertDescription} from './components/ui/alert';
import {Button} from './components/ui/button';
import {Checkbox} from './components/ui/checkbox';
import {Field,FieldGroup,FieldLabel,FieldLegend,FieldSet} from './components/ui/field';
import {Badge} from './components/ui/badge';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {Check,ChevronDown,Pause,Send} from 'lucide-react';
import type {InputDelivery,PersistentInputRequest} from './types';
import {t} from './i18n';

type Snapshot={policy:{paused:boolean;generation:number};deliveries:InputDelivery[];requests?:PersistentInputRequest[]};
export function useInputDeliveries(runId:string){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState('');
 const sequence=useRef(0);
 const refresh=useCallback(async()=>{const api=window.desktop?.inputs;if(!api)return;const version=++sequence.current;try{const value=await api.list({runId});if(version===sequence.current){setSnapshot(value);setError('');}}catch(error){if(version===sequence.current){const missingHandler=/No handler registered for ['"]input:list['"]/.test(error instanceof Error?error.message:String(error));setError(t(missingHandler?'应用更新尚未完成，请退出并重新打开 Ambleloft':'暂时无法读取补充消息，请重试'));}}},[runId]);
 useEffect(()=>{void refresh();const off=window.desktop?.inputs?.onChanged(event=>{if(event.runId===runId)void refresh();});return()=>{sequence.current++;off?.();};},[runId,refresh]);
 return {snapshot,error,refresh};
}
const labels={queued:'排队中',dispatching:'正在投递',delivered:'已送达',failed:'发送失败',unknown:'待核实'};
export default function InputDeliveryPanel({snapshot,selected,onSelected,onContinue,busy,error,onRefresh}:{snapshot:Snapshot|null;selected:string[];onSelected(ids:string[]):void;onContinue():void;busy:boolean;error:string;onRefresh():void}){
 const [open,setOpen]=useState(false),[checking,setChecking]=useState(''),[notice,setNotice]=useState('');
 const reconcile=async(item:InputDelivery)=>{setChecking(item.id);setNotice('');try{const result=await window.desktop!.inputs!.action({action:'reconcile',runId:item.runId,deliveryId:item.id});setNotice(result.state==='delivered'?'已确认送达':'暂未找到送达记录，不会自动重发。');onRefresh();}catch{setNotice('暂时无法核实，请稍后重试。');}finally{setChecking('');}};
 if(error)return <Alert variant="destructive"><AlertTitle>{error}</AlertTitle><AlertDescription><Button size="sm" variant="outline" onClick={onRefresh}>{t('重试')}</Button></AlertDescription></Alert>;
 if(!snapshot)return null;
 const pending=snapshot.deliveries.filter(item=>item.state!=='delivered'),latest=snapshot.deliveries.find(item=>item.state==='delivered');
 if(!pending.length&&!snapshot.policy.paused&&!latest)return null;
 const selectable=pending.filter(item=>item.state==='queued'&&(snapshot.policy.paused||item.held));
 const description=snapshot.policy.paused?(pending.length?'未发送的内容已保留。勾选需要发送的内容，再继续任务。':'输入补充内容，发送后继续任务。'):pending.some(item=>item.state==='unknown')?'有内容需要核实，请查看记录后再决定下一步。':pending.some(item=>item.state==='failed')?'有内容未能发送，原文已保留。':selectable.length?'部分内容仍暂停发送，可展开后选择继续。':'可以继续编辑，下方内容将按顺序送达。';
 if(!pending.length&&!snapshot.policy.paused)return <div role="status" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Check className="size-3.5" aria-hidden="true"/>{t('补充消息已送达')}</div>;
 return <Alert role="region" aria-label={t('补充消息')} className="input-delivery-panel mb-3 rounded-2xl border-border px-4 py-3 shadow-sm">
  {snapshot.policy.paused?<Pause aria-hidden="true"/>:<Send aria-hidden="true"/>}
  <AlertTitle>{t(snapshot.policy.paused?'任务已暂停':'补充消息')}</AlertTitle>
  <AlertDescription className="flex flex-col gap-3">
   <p>{t(description)}</p>{notice&&<p role="status">{t(notice)}</p>}
   {!!pending.length&&<Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger render={<Button size="sm" variant="ghost"/>}>{t('查看投递记录')} ({pending.length})<ChevronDown data-icon="inline-end" className={open?'rotate-180':undefined}/></CollapsibleTrigger>
    <CollapsibleContent>
    <FieldSet className="max-h-[min(24vh,192px)] overflow-y-auto px-1 py-3"><FieldLegend className="sr-only">{t('选择继续发送的内容')}</FieldLegend><FieldGroup>
     {pending.map(item=><Field key={item.id} orientation="horizontal">
      {selectable.includes(item)&&<Checkbox id={`delivery-${item.id}`} checked={selected.includes(item.id)} disabled={busy} onCheckedChange={checked=>onSelected(checked?[...selected,item.id]:selected.filter(id=>id!==item.id))}/>}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5"><FieldLabel htmlFor={selectable.includes(item)?`delivery-${item.id}`:undefined} className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.text}</FieldLabel><Badge variant="secondary">{t(item.state==='queued'&&(snapshot.policy.paused||item.held)?'已暂停':labels[item.state])}</Badge>{item.state==='unknown'&&<><p>{t('可能已经送达，暂不自动重发。请先查看任务记录。')}</p><Button size="sm" variant="outline" disabled={!!checking} onClick={()=>void reconcile(item)}>{t(checking===item.id?'正在核实…':'核实是否送达')}</Button></>}{item.state==='failed'&&<p>{t('内容仍保留，可复制到输入框修改后发送。')}</p>}</div>
     </Field>)}
    </FieldGroup></FieldSet>
    </CollapsibleContent>
   </Collapsible>}
   {!!selectable.length&&open&&<div className="flex justify-end"><Button size="sm" disabled={busy||!selected.length} onClick={onContinue}>{t('继续发送所选内容')} ({selected.length})</Button></div>}
  </AlertDescription>
 </Alert>;
}
