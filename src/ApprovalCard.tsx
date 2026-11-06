import {useId,useState} from 'react';
import {Terminal,FilePenLine,Copy,Check} from 'lucide-react';
import {Item,ItemMedia,ItemContent,ItemTitle,ItemDescription,ItemActions,ItemFooter} from './components/ui/item';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import {Spinner} from './components/ui/spinner';
import {useCopyFeedback} from './hooks/use-copy-feedback';
import type {AgentRun} from './types';
import {t} from './i18n';

// shadcn AI Elements Confirmation composition: Item + Button.
export default function ApprovalCard({approval,disabled,pending,error,decide}:{approval:AgentRun['approvals'][number];disabled:boolean;pending?:'accept'|'decline';error?:string;decide(decision:'accept'|'decline'):void}){
 const [details,setDetails]=useState(false),detailsId=useId();const {status,copy}=useCopyFeedback('复制命令');
 let params:Record<string,unknown>={},raw=approval.detail;
 try{const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))params=value;raw=JSON.stringify(value,null,2);}catch{/* Keep unstructured requests inspectable. */}
 const command=typeof params.command==='string'?params.command:'';
 const reason=typeof params.reason==='string'?params.reason:'';
 const cwd=typeof params.cwd==='string'?params.cwd:'';
 const fileChange=approval.method.includes('fileChange');
 return <Item variant="outline" size="sm" role="region" aria-label={t('执行授权')} aria-busy={!!pending} className="min-w-0 items-start">
  <ItemMedia variant="icon">{fileChange?<FilePenLine/>:<Terminal/>}</ItemMedia>
  <ItemContent className="min-w-0">
   <ItemTitle>{t(fileChange?'允许修改文件？':command?'允许执行此命令？':'需要你批准')}</ItemTitle>
   <ItemDescription>{t('仅限本次请求')}</ItemDescription>
   {typeof params.subagent==='string'&&<ItemDescription>{t('发起专家')} · {params.subagent}</ItemDescription>}
   {reason&&<ItemDescription className="line-clamp-none break-words">{reason}</ItemDescription>}
   {command&&<div className="flex min-w-0 items-start gap-2"><pre tabIndex={0} aria-label={t('待执行命令')} className="m-0 max-h-24 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{command}</pre><Button variant="ghost" size="icon-xs" aria-label={t(status)} title={t(status)} onClick={()=>void copy(command)}>{status==='已复制'?<Check/>:<Copy/>}</Button><span className="sr-only" role="status">{status==='复制命令'?'':t(status)}</span></div>}
   {!command&&<ItemDescription className="line-clamp-none">{t('请查看请求详情，确认操作内容后再决定。')}</ItemDescription>}
   {cwd&&<ItemDescription className="line-clamp-none break-all">{t('工作目录')} · {cwd}</ItemDescription>}
  </ItemContent>
  <ItemFooter className="flex-wrap gap-2">
   <Button variant="ghost" size="sm" aria-expanded={details} aria-controls={detailsId} onClick={()=>setDetails(value=>!value)}>{t(details?'收起请求详情':'查看请求详情')}</Button>
   <ItemActions className="ml-auto"><Button variant="outline" size="sm" disabled={disabled} onClick={()=>decide('decline')}>{pending==='decline'&&<Spinner/>}{t(pending==='decline'?'正在拒绝…':'拒绝')}</Button><Button size="sm" disabled={disabled} onClick={()=>decide('accept')}>{pending==='accept'&&<Spinner/>}{t(pending==='accept'?'正在批准…':'批准本次')}</Button></ItemActions>
  </ItemFooter>
  {details&&<ItemContent id={detailsId} role="region" aria-label={t('授权请求详情')} className="w-full basis-full min-w-0">
   <ItemTitle>{t('授权请求详情')}</ItemTitle><ItemDescription className="line-clamp-none">{t('此授权仅用于当前请求，不会开启完全访问。')}</ItemDescription>
   <pre tabIndex={0} className="m-0 max-h-[24vh] overflow-auto overscroll-contain whitespace-pre-wrap break-all font-mono text-xs">{raw}</pre>
  </ItemContent>}
  {error&&<Alert variant="destructive" className="basis-full"><AlertDescription>{t('提交未成功，请重试。')} {error}</AlertDescription></Alert>}
 </Item>;
}
