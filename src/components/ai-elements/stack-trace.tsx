import {useState} from 'react';
import {ListTree} from 'lucide-react';
import {TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent,TraceIcon,TraceLine,TraceTitle} from '../ui/trace';
import {t} from '../../i18n';

const frame=/^[ \t]*(?:at[ \t]+.+(?:\(.*\)|:\d+(?::\d+)?|<anonymous>)[ \t]*\r?$|File "[^"]+", line \d+|[^\s@]*@\S+:\d+:\d+)/m;

export function hasStackTrace(text:string){
  return text.includes('\n') && frame.test(text);
}

export function StackTrace({text}:{text:string}){
  const [open,setOpen]=useState(false);
  const lines=open?text.trimEnd().split(/\r?\n/):[];
  const title=text.match(/^[ \t]*(?:[\w.]*Error|[\w.]*Exception)(?:[ \t]*:.*|$)/m)?.[0]?.trim() || text.trimStart().split('\n',1)[0];
  return <div data-slot="stack-trace"><TraceCollapsible open={open} onOpenChange={setOpen}>
    <TraceCollapsibleTrigger aria-label={t('错误调用栈')+' · '+title}>
      <TraceLine status="error"><TraceIcon><ListTree/></TraceIcon><TraceTitle>{title}</TraceTitle></TraceLine>
    </TraceCollapsibleTrigger>
    <TraceCollapsibleContent>
      {open&&<pre aria-label={t('错误调用栈')} tabIndex={0} className="max-h-64 overflow-auto whitespace-pre-wrap wrap-anywhere font-mono text-xs">
        {lines.map((line,index)=><span key={index} className={/(?:node_modules[/\\]|node:internal[/\\])/.test(line)?'text-muted-foreground':'text-foreground'}>{line}{index+1<lines.length?'\n':''}</span>)}
      </pre>}
    </TraceCollapsibleContent>
  </TraceCollapsible></div>;
}
