import {useState} from 'react';
import {Layers,ListTree} from 'lucide-react';
import {TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent,TraceIcon,TraceLine,TraceTitle} from '../ui/trace';
import {CodeBlock,CodeBlockContent,CodeBlockActions,CodeBlockCopyButton} from '../ui/code-block';
import {t} from '../../i18n';

const frame=/^[ \t]*(?:at[ \t]+.+(?:\(.*\)|:\d+(?::\d+)?|<anonymous>)[ \t]*\r?$|File "[^"]+", line \d+|[^\s@]*@\S+:\d+:\d+)/m;

export function hasStackTrace(text:string){
  return text.includes('\n') && frame.test(text);
}

export function StackTraceFrames({text}:{text:string}){
  const lines=text.trimEnd().split(/\r?\n/);
  const detailLines:string[]=[],frameworkLines:string[]=[];
  for(const line of lines){
    const internal=frame.test(line)&&/(?:node_modules[/\\]|node:internal[/\\])/.test(line);
    (internal?frameworkLines:detailLines).push(line);
  }
  return <div className="flex min-w-0 flex-col gap-2">
    <CodeBlock size="sm" variant="muted">
      <CodeBlockContent wrap className="max-h-64" aria-label={t('错误调用栈')}>{detailLines.join('\n')}</CodeBlockContent>
      <CodeBlockActions><CodeBlockCopyButton value={text}/></CodeBlockActions>
    </CodeBlock>
    {frameworkLines.length>0&&<TraceCollapsible>
      <TraceCollapsibleTrigger><TraceLine><TraceIcon><Layers/></TraceIcon><TraceTitle>{t('框架调用')} · {frameworkLines.length}</TraceTitle></TraceLine></TraceCollapsibleTrigger>
      <TraceCollapsibleContent><CodeBlock size="sm" variant="muted"><CodeBlockContent wrap className="max-h-64">{frameworkLines.join('\n')}</CodeBlockContent></CodeBlock></TraceCollapsibleContent>
    </TraceCollapsible>}
  </div>;
}

export function StackTrace({text}:{text:string}){
  const [open,setOpen]=useState(false);
  const title=text.match(/^[ \t]*(?:[\w.]*Error|[\w.]*Exception)(?:[ \t]*:.*|$)/m)?.[0]?.trim() || text.trimStart().split('\n',1)[0];
  return <div data-slot="stack-trace"><TraceCollapsible open={open} onOpenChange={setOpen}>
    <TraceCollapsibleTrigger aria-label={t('错误调用栈')+' · '+title}>
      <TraceLine status="error"><TraceIcon><ListTree/></TraceIcon><TraceTitle>{title}</TraceTitle></TraceLine>
    </TraceCollapsibleTrigger>
    <TraceCollapsibleContent>{open&&<StackTraceFrames text={text}/>}</TraceCollapsibleContent>
  </TraceCollapsible></div>;
}
