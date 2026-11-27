import type {ReactNode} from 'react';
import {CodeBlock,CodeBlockActions,CodeBlockCopyButton,CodeBlockContent} from '../ui/code-block';
import {TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from '../ui/trace';
import {hasStackTrace,StackTraceFrames} from './stack-trace';
import {t} from '../../i18n';

export function Tool({header,open,onOpenChange,expandable,children}:{header:ReactNode;open:boolean;onOpenChange:(open:boolean)=>void;expandable:boolean;children:ReactNode}){
  return <div data-slot="tool">{expandable?<TraceCollapsible open={open} onOpenChange={onOpenChange}>
    <TraceCollapsibleTrigger>{header}</TraceCollapsibleTrigger>
    <TraceCollapsibleContent className="flex flex-col gap-2">{open&&children}</TraceCollapsibleContent>
  </TraceCollapsible>:header}</div>;
}

export function ToolOutput({text,label,failed=false,showLabel=false,copyText=text}:{text:string;label:string;failed?:boolean;showLabel?:boolean;copyText?:string}){
  if(failed&&hasStackTrace(text))return <StackTraceFrames text={text}/>;
  return <div className="flex min-w-0 flex-col gap-1">
    {showLabel&&<span className="text-xs text-muted-foreground">{t(label)}</span>}
    <CodeBlock size="sm" variant="muted">
      <CodeBlockContent wrap className="max-h-64" aria-label={t(label)}>{text}</CodeBlockContent>
      <CodeBlockActions><CodeBlockCopyButton value={copyText} aria-label={t('复制')+' · '+t(label)}/></CodeBlockActions>
    </CodeBlock>
  </div>;
}

// Unwrap pure MCP text results. Keep mixed media and extension metadata intact.
export function mcpResultText(value:unknown):string|undefined{
  if(!value||typeof value!=='object'||!('content' in value))return;
  // Older runtime records serialize these optional fields even when absent.
  if(Object.entries(value).some(([key,data])=>key!=='content'&&!(key==='isError'&&typeof data==='boolean')&&!(data===null&&(key==='structuredContent'||key==='_meta'))))return;
  const blocks=value.content;
  if(!Array.isArray(blocks)||!blocks.length||!blocks.every(block=>block?.type==='text'&&typeof block.text==='string'&&Object.keys(block).length===2))return;
  return blocks.map(block=>block.text).join('\n\n');
}

// Old failures only saved a code. Use the contract listed in that turn if it
// positively identifies an empty-string violation. Installed schemas may have changed.
function recordedEmptyStringIssue(catalog:string,args:unknown):string|undefined{
  if(!args||typeof args!=='object'||!('operationId' in args)||!('input' in args))return;
  const input=args.input;
  if(!input||typeof input!=='object'||Array.isArray(input))return;
  const listText=mcpResultText(readCallDetails(catalog)?.result);
  if(!listText)return;
  let list;
  try{list=JSON.parse(listText);}catch{return;}
  if(!Array.isArray(list))return;
  const schema=list.find(operation=>operation?.id===args.operationId)?.inputSchema;
  if(schema?.type!=='object'||!schema.properties)return;
  for(const [name,value] of Object.entries(input)){
    const field=Object.hasOwn(schema.properties,name)&&schema.properties[name];
    if(value!==''||field?.type!=='string'||!(field.minLength>=1))continue;
    const path=/^[A-Za-z_$][\w$]*$/.test(name)?'input.'+name:'input['+JSON.stringify(name)+']';
    return path+' '+t('不能为空字符串，请填写有效内容。')+
      (schema.required?.includes(name)?'':t('如无需指定此可选字段，请省略它。'));
  }
}

// Extension calls return application errors inside MCP text content.
export function extensionFailure(text:string,args?:unknown,catalog?:string){
  try{
    const payload=JSON.parse(text);
    if(payload?.ok!==false||typeof payload.error?.message!=='string')return;
    const {message,code,effectStatus}=payload.error;
    const legacy=code==='INVALID_ARGUMENT'&&message===code;
    const hint=legacy&&catalog&&effectStatus==='notStarted'?recordedEmptyStringIssue(catalog,args):undefined;
    const reason=legacy?hint??t('工具参数无效。'):message;
    return {reason,notStarted:effectStatus==='notStarted'};
  }catch{return;}
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
