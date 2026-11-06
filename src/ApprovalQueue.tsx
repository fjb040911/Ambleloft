import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ShieldCheck} from 'lucide-react';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './components/ui/collapsible';
import {Button} from './components/ui/button';
import {Checkbox} from './components/ui/checkbox';
import {Alert,AlertDescription} from './components/ui/alert';
import ApprovalCard from './ApprovalCard';
import type {AgentRun} from './types';
import {t} from './i18n';
type Approval=AgentRun['approvals'][number];
const signature=(a:Approval)=>JSON.stringify([a.id,a.method,a.detail]);
function summary(a:Approval){try{const p=JSON.parse(a.detail);return {text:p.command||p.path||p.filePath||p.reason||t('查看请求详情'),source:p.subagent||''};}catch{return {text:t('查看请求详情'),source:''};}}

// A selection is a snapshot of explicit request identities and contents, never a permission rule.
export default function ApprovalQueue({approvals,source,disabled,decide}:{approvals:Approval[];source:string;disabled:boolean;decide(id:string,decision:'accept'|'decline'):Promise<void>}){
 const items=[...new Map(approvals.map(a=>[a.id,a])).values()];
 const [open,setOpen]=useState(true),[expanded,setExpanded]=useState<string|null>(items[0]?.id||null);
 const [selected,setSelected]=useState<string[]>([]),[pending,setPending]=useState<{id:string;decision:'accept'|'decline'}|null>(null),[error,setError]=useState(''),[outcome,setOutcome]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const lock=useRef(false),latest=useRef({items,disabled});latest.current={items,disabled};
 const expandedId=expanded!==null&&!items.some(a=>a.id===expanded)?items[0]?.id:expanded;
 const selectedItems=items.filter(a=>selected.includes(signature(a)));
 const submit=async(batch:Approval[],decision:'accept'|'decline')=>{
  if(lock.current||disabled)return;lock.current=true;setError('');setOutcome('');let done=0;
  try{for(const item of batch){
   if(!alive.current||latest.current.disabled)break;
   const current=latest.current.items.find(a=>a.id===item.id);
   if(!current||signature(current)!==signature(item))continue;
   setPending({id:item.id,decision});await decide(item.id,decision);done++;
   setSelected(values=>values.filter(value=>value!==signature(item)));
  }setOutcome(t(decision==='accept'?'已批准所选请求':'已拒绝所选请求')+' · '+done);
  }catch(e){setError(t('提交未成功，请重试。')+' '+(e as Error).message);}finally{lock.current=false;setPending(null);}
 };
 return <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 rounded-lg border border-border bg-background" aria-label={t('待处理授权')}>
  <div className="flex min-w-0 items-center gap-2 px-3 py-2">
   <ShieldCheck className="size-4 shrink-0"/><span className="min-w-0 flex-1 text-sm" role="status">{t('待处理授权')} · {items.length}</span>
   <CollapsibleTrigger render={<Button variant="ghost" size="sm"/>}>{t(open?'收起请求':'查看并处理')}<ChevronDown data-icon="inline-end"/></CollapsibleTrigger>
  </div>
  <CollapsibleContent>
   <p className="m-0 px-3 pb-2 text-xs text-muted-foreground truncate" title={source}>{source}</p>
   <div className="max-h-[min(32vh,320px)] overflow-auto overscroll-contain px-2" role="region" aria-label={t('授权请求队列')}>
    {items.map(a=>{const info=summary(a),current=expandedId===a.id||items.length===1;return <div key={a.id} className="min-w-0 pb-2">
     {items.length>1&&<div className="flex min-w-0 items-center gap-3 px-2 py-1">
      <Checkbox aria-label={t('选择授权请求')+' '+a.id} checked={selected.includes(signature(a))} disabled={disabled||!!pending} onCheckedChange={checked=>setSelected(values=>checked?[...values,signature(a)]:values.filter(value=>value!==signature(a)))}/>
      <Button variant="ghost" className="min-w-0 flex-1 justify-start" aria-expanded={current} onClick={()=>setExpanded(current?null:a.id)}><span className="truncate">{info.source&&info.source+' · '}{String(info.text)}</span><ChevronDown data-icon="inline-end"/></Button>
     </div>}
     {current&&<ApprovalCard approval={a} disabled={disabled||!!pending} error={items.length===1?error:undefined} pending={pending?.id===a.id?pending.decision:undefined} decide={decision=>void submit([a],decision)}/>}
    </div>;})}
   </div>
   {items.length>1&&<div className="flex flex-wrap items-center justify-end gap-2 p-3">
    <span className="mr-auto text-xs text-muted-foreground">{t('仅处理所选请求，不包含后续请求')} · {selectedItems.length}</span>
    <Button variant="outline" size="sm" disabled={disabled||!!pending||!selectedItems.length} onClick={()=>void submit(selectedItems,'decline')}>{t('拒绝所选项')}</Button>
    <Button size="sm" disabled={disabled||!!pending||!selectedItems.length} onClick={()=>void submit(selectedItems,'accept')}>{t('批准所选项')}</Button>
   </div>}
   {error&&items.length>1&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
   {outcome&&<p className="m-0 px-3 pb-2 text-xs text-muted-foreground" role="status">{outcome}</p>}
  </CollapsibleContent>
 </Collapsible>;
}
