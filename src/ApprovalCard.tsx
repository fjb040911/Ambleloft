import {useState} from 'react';
import {Terminal,FilePenLine,Copy,Check,Folder,ShieldCheck} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardContent,CardFooter} from './components/ui/card';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './components/ui/dialog';
import {Spinner} from './components/ui/spinner';
import {useCopyFeedback} from './hooks/use-copy-feedback';
import type {AgentRun} from './types';
import {t} from './i18n';

export default function ApprovalCard({approval,disabled,pending,error,decide}:{approval:AgentRun['approvals'][number];disabled:boolean;pending?:'accept'|'decline';error?:string;decide(decision:'accept'|'decline'):void}){
 const [details,setDetails]=useState(false);const {status,copy}=useCopyFeedback('复制命令');
 let params:Record<string,unknown>={};let raw=approval.detail;
 try{const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))params=value;raw=JSON.stringify(value,null,2);}catch{/* Keep unstructured requests inspectable. */}
 const command=typeof params.command==='string'?params.command:'';
 const reason=typeof params.reason==='string'?params.reason:'';
 const cwd=typeof params.cwd==='string'?params.cwd:'';
 const fileChange=approval.method.includes('fileChange');
 return <><Card size="sm" role="region" aria-label={t('执行授权')} aria-busy={!!pending}>
  <CardHeader><div className="flex flex-wrap items-center gap-2"><ShieldCheck className="size-4 shrink-0"/><CardTitle>{t('需要你批准')}</CardTitle><Badge variant="outline">{t(fileChange?'文件修改':'终端操作')}</Badge><span className="ml-auto text-xs text-muted-foreground">{t('仅限本次请求')}</span></div></CardHeader>
  <CardContent className="flex max-h-[min(24vh,220px)] flex-col gap-2 overflow-y-auto">
   {reason&&<p className="text-sm break-words">{reason}</p>}
   {command?<div className="rounded-lg border border-border bg-muted/50"><div className="flex items-center justify-between gap-2 px-3 pt-1"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Terminal className="size-3.5"/>{t('待执行命令')}</span><Button variant="ghost" size="icon-xs" aria-label={t(status)} title={t(status)} onClick={()=>void copy(command)}>{status==='已复制'?<Check/>:<Copy/>}</Button><span className="sr-only" role="status">{status==='复制命令'?'':t(status)}</span></div><pre tabIndex={0} aria-label={t('待执行命令')} className="m-0 max-h-24 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 font-mono text-xs leading-relaxed">{command}</pre></div>:<p className="flex items-center gap-2 text-sm text-muted-foreground">{fileChange?<FilePenLine className="size-4 shrink-0"/>:<Terminal className="size-4 shrink-0"/>}{t('请查看请求详情，确认操作内容后再决定。')}</p>}
   {cwd&&<div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground"><Folder className="mt-0.5 size-3.5 shrink-0"/><span className="shrink-0">{t('工作目录')}</span><span className="min-w-0 break-all select-text">{cwd}</span></div>}
  </CardContent>
  {error&&<div className="px-3"><Alert variant="destructive"><AlertDescription>{t('提交未成功，请重试。')} {error}</AlertDescription></Alert></div>}
  <CardFooter className="flex-wrap justify-between gap-2 border-border"><Button variant="ghost" size="sm" onClick={()=>setDetails(true)}>{t('查看请求详情')}</Button><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={disabled} onClick={()=>decide('decline')}>{pending==='decline'&&<Spinner/>}{t(pending==='decline'?'正在拒绝…':'拒绝')}</Button><Button size="sm" disabled={disabled} onClick={()=>decide('accept')}>{pending==='accept'&&<Spinner/>}{t(pending==='accept'?'正在批准…':'批准本次')}</Button></div></CardFooter>
 </Card>
 <Dialog open={details} onOpenChange={setDetails}><DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl"><DialogHeader><DialogTitle>{t('授权请求详情')}</DialogTitle><DialogDescription>{t('此授权仅用于当前请求，不会开启完全访问。')}</DialogDescription></DialogHeader><pre tabIndex={0} className="min-h-0 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{raw}</pre></DialogContent></Dialog>
 </>;
}
