import {useState} from 'react';
import {Files,ChevronDown,ChevronUp} from 'lucide-react';
import {Button} from './components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from './components/ui/card';
import type {TurnFileChanges} from './types';
import {t} from './i18n';
import './file-changes.css';
export default function TurnChanges({changes,open,openFile}:{changes:TurnFileChanges;open():void;openFile?:(path:string)=>void}){
 const [expanded,setExpanded]=useState(false);
 const totalsKnown=changes.files.length>0&&changes.files.every(file=>typeof file.additions==='number'&&typeof file.deletions==='number');
 return <Card className="turn-changes-summary my-3 gap-3" aria-label={t('本轮文件变更')}>
  <CardHeader className="flex flex-row flex-wrap items-center gap-3"><Files className="size-5 shrink-0 text-muted-foreground"/><div className="min-w-0 flex-1"><CardTitle>{t('本轮文件变更')} · {changes.files.length}</CardTitle>{totalsKnown&&<div className="mt-1 text-xs"><span className="diff-added">+{changes.files.reduce((n,f)=>n+f.additions!,0)}</span>{' '}<span className="diff-deleted">−{changes.files.reduce((n,f)=>n+f.deletions!,0)}</span></div>}</div><Button size="sm" variant="outline" onClick={open}>{t('查看本轮变更')}</Button></CardHeader>
  <CardContent className="flex min-w-0 flex-col gap-1">{changes.notice&&<p role="status" className="text-xs text-muted-foreground">{t(changes.notice)}</p>}
   {(expanded?changes.files:changes.files.slice(0,3)).map(file=><div key={file.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">{openFile&&file.status!=='deleted'?<button className="change-file-link" title={file.path} onClick={()=>openFile(file.path)}>{file.path}</button>:<span className="min-w-0 flex-1 truncate" title={file.path}>{file.path}</span>}<span className="shrink-0 text-xs text-muted-foreground">{t({added:'已新增',modified:'已修改',deleted:'已删除'}[file.status])}</span>{file.additions!==undefined&&<span className="diff-added text-xs">+{file.additions}</span>}{file.deletions!==undefined&&<span className="diff-deleted text-xs">−{file.deletions}</span>}</div>)}
   {changes.files.length>3&&<Button variant="ghost" size="sm" className="mt-1 self-start" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{t(expanded?'收起显示':'展开显示')}{!expanded&&` (${changes.files.length-3})`}{expanded?<ChevronUp/>:<ChevronDown/>}</Button>}
  </CardContent>
 </Card>;
}
