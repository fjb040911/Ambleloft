import type {ReactNode,Ref} from 'react';
import {CodeBlock,CodeBlockHeader,CodeBlockTitle,CodeBlockActions,CodeBlockCopyButton,CodeBlockContent} from '../ui/code-block';
import {TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from '../ui/trace';
import {hasStackTrace,StackTrace} from './stack-trace';
import {t} from '../../i18n';

export function Tool({header,open,onOpenChange,expandable,children}:{header:ReactNode;open:boolean;onOpenChange:(open:boolean)=>void;expandable:boolean;children:ReactNode}){
  return <div data-slot="tool">{expandable?<TraceCollapsible open={open} onOpenChange={onOpenChange}>
    <TraceCollapsibleTrigger>{header}</TraceCollapsibleTrigger>
    <TraceCollapsibleContent className="flex flex-col gap-2">{open&&children}</TraceCollapsibleContent>
  </TraceCollapsible>:header}</div>;
}

export function ToolOutput({text,label,failed=false,viewport,onScroll}:{text:string;label:string;failed?:boolean;viewport?:Ref<HTMLPreElement>;onScroll?:()=>void}){
  if(failed&&hasStackTrace(text))return <StackTrace text={text}/>;
  return <CodeBlock size="sm" variant={failed?'destructive':'default'}>
    <CodeBlockHeader><CodeBlockTitle>{t(label)}</CodeBlockTitle>
      <CodeBlockActions><CodeBlockCopyButton value={text}/></CodeBlockActions>
    </CodeBlockHeader>
    <CodeBlockContent ref={viewport} onScroll={onScroll} wrap className="max-h-64" aria-label={t(label)}>{text}</CodeBlockContent>
  </CodeBlock>;
}

type CallDetails={arguments?:unknown;result?:unknown;error?:unknown};

// Persisted MCP records can also be partial text pages or older unstructured output.
export function readCallDetails(text:string):CallDetails|null{
  try{
    const data=JSON.parse(text);
    if(data && typeof data==='object' && Object.keys(data).every(key=>['arguments','result','error'].includes(key))
      && Object.values(data).some(value=>value!=null))return data;
  }catch{/* Render the original text when a complete record is unavailable. */}
  return null;
}
export function displayValue(value:unknown, failed=false):string{
  if(typeof value==='string')return value;
  if(failed && value && typeof value==='object' && 'stack' in value && typeof value.stack==='string' && hasStackTrace(value.stack)){
    const {stack,...metadata}=value;
    return Object.keys(metadata).length ? stack+'\n\n'+JSON.stringify(metadata,null,2) : stack;
  }
  return JSON.stringify(value,null,2);
}
