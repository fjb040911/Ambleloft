import {type ReactNode,useState} from 'react';
import {MessageSquare} from 'lucide-react';
import {Button} from './components/ui/button';
import {TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent,TraceLine,TraceIcon,TraceTitle,TraceDescription} from './components/ui/trace';
import {t} from './i18n';
import type {PersistentInputRequest,InputDelivery} from './types';

export function InputProcessRecord({title,status,questions,onOpen,children}:{children?:ReactNode;title:string;status:string;questions:{id:string;label:string;answer?:string}[];onOpen?:()=>void}){
 const [open,setOpen]=useState(false);
 return <TraceCollapsible open={open} onOpenChange={setOpen} aria-label={t('补充记录')}>
  <div className="flex flex-wrap items-center gap-2">
   <TraceCollapsibleTrigger><TraceLine><TraceIcon><MessageSquare/></TraceIcon><TraceTitle>{title}</TraceTitle><TraceDescription>{t(status)}</TraceDescription></TraceLine></TraceCollapsibleTrigger>
   {onOpen&&<Button variant="ghost" size="sm" onClick={onOpen}>{t('前往填写')}</Button>}
  </div>
  <TraceCollapsibleContent>{questions.length>0&&<dl className="m-0 flex max-h-96 flex-col gap-2 overflow-y-auto">
   {questions.map(q=><div key={q.id} className="flex flex-col gap-1 text-sm"><dt className="text-muted-foreground">{q.label}</dt><dd className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-medium">{q.answer??t('尚未回答')}</dd></div>)}
  </dl>}{children}</TraceCollapsibleContent>
 </TraceCollapsible>;
}
export function PersistentInputRecord({request:r,deliveries,onOpen}:{request:PersistentInputRequest;deliveries:InputDelivery[];onOpen(id:string):void}){
 const delivery=deliveries.find(d=>d.id===r.deliveryId);
 const status=r.state==='answered'?delivery?.state==='delivered'?'已提交 · 已送达':delivery?.state==='queued'?'已提交 · 等待发送':delivery?.state==='dispatching'?'已提交 · 正在发送':delivery?.state==='failed'?'已提交 · 发送失败':'已提交 · 送达待核实':r.state==='pending'?'等待补充':r.state==='cancelled'?'已取消':r.state==='expired'?'已失效':'已替换';
 return <InputProcessRecord title={r.template.title} status={status} onOpen={r.state==='pending'?()=>onOpen(r.id):undefined} questions={r.template.steps[0].fields.map(f=>{
  const value=r.answer?.values[f.name];
  return {id:f.name,label:r.answer?.displayLabels?.[f.name]||f.label,answer:value===undefined?undefined:f.options?.find(o=>o.value===value)?.label??(typeof value==='boolean'?t(value?'是':'否'):String(value))};
 })}>{!r.answer&&r.state!=='pending'&&r.draftTouched&&<TraceCollapsible><TraceCollapsibleTrigger><TraceLine><TraceTitle>{t('查看原填写')}</TraceTitle></TraceLine></TraceCollapsibleTrigger><TraceCollapsibleContent keepMounted><p className="text-sm text-muted-foreground">{t('未提交的填写，不作为回答。')}</p><dl className="flex flex-col gap-3 p-3">{r.template.steps[0].fields.filter(f=>r.draft[f.name]!==undefined).map(f=><div key={f.name}><dt className="text-sm text-muted-foreground">{f.label}</dt><dd className="m-0 whitespace-pre-wrap break-words">{f.options?.find(o=>o.value===r.draft[f.name])?.label??String(r.draft[f.name])}</dd></div>)}</dl></TraceCollapsibleContent></TraceCollapsible>}</InputProcessRecord>;
}
