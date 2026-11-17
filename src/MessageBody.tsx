import {useState} from 'react';
import type {AgentRun} from './types';
import {useToolText} from './ToolText';
import Markdown from './Markdown';
import {Button} from './components/ui/button';
import {t} from './i18n';
export default function MessageBody({message,plain=false,onFileLink,context}:{message:AgentRun['messages'][number];plain?:boolean;onFileLink?:(path:string)=>void;context?:'trace'}){
 const [open,setOpen]=useState(false);
 const body=useToolText({messageId:message.id,text:message.text,preview:message.textPreview,version:message.textVersion},open);
 return <>{message.textPreview&&<div className="my-2 flex flex-wrap items-center gap-2 text-xs"><span>{t(open?'正在分段查看全文':'正文较长，当前显示末尾片段')}</span><Button variant="ghost" size="sm" onClick={()=>setOpen(value=>!value)}>{t(open?'收起全文':'分段查看全文')}</Button></div>}{body.controls}{plain?<span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{body.text}</span>:<Markdown text={body.text||'…'} onFileLink={onFileLink} context={context}/>}</>;
}
