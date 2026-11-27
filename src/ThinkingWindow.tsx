import {useLayoutEffect,useRef} from 'react';
import {Brain} from 'lucide-react';
import {CodeBlock} from './components/ui/code-block';
import {Spinner} from './components/ui/spinner';
import {TraceLine,TraceIcon,TraceTitle,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import {useProcessDisclosure} from './process-disclosure';
import {useToolText,type TextSource} from './ToolText';
import {t} from './i18n';

export function ProcessIndicator({title,live=true}:{title:string;live?:boolean}){
 return <TraceLine className="process-entry-title" status={live?'running':undefined} role={live?'status':undefined}><TraceIcon>{live?<Spinner aria-hidden="true" role="presentation" className="motion-reduce:animate-none"/>:<Brain/>}</TraceIcon><TraceTitle>{title}</TraceTitle></TraceLine>;

}
export function ThinkingWindow({text,title,live,disclosureKey,source,collapsible=true,disclosure}:{source?:TextSource;text:string;title:string;live:boolean;disclosureKey?:string;collapsible?:boolean;disclosure?:{open:boolean;onOpenChange:(open:boolean)=>void}}) {
 const [expanded,setOpen]=useProcessDisclosure(disclosureKey);
 const open=!collapsible||(disclosure?.open??expanded);
 const body=useToolText({...source,text},open,true);
 const viewport=useRef<HTMLDivElement>(null);
 const content=useRef<HTMLPreElement>(null);
 const follow=useRef(true);
 const lastTop=useRef(0);
 const scrollToLatest=()=>{
  const el=viewport.current;
  // Hidden task panels have zero geometry; retain the user's follow preference.
  if(!el?.clientHeight||!follow.current)return;
  el.scrollTop=el.scrollHeight;
  lastTop.current=el.scrollTop;
 };
 useLayoutEffect(scrollToLatest,[body.text,open]);
 useLayoutEffect(()=>{
  const el=viewport.current;const body=content.current;
  if(!el||!body)return;
  const observer=new ResizeObserver(scrollToLatest);
  observer.observe(el);observer.observe(body);
  return()=>observer.disconnect();
 },[open]);
 const trackScroll=()=>{
  const el=viewport.current;
  if(!el?.clientHeight)return;
  const atEnd=el.scrollHeight-el.scrollTop-el.clientHeight<24;
  // Content growth and delayed programmatic scroll events must not cancel following.
  if(atEnd)follow.current=true;
  else if(el.scrollTop<lastTop.current)follow.current=false;
  lastTop.current=el.scrollTop;
 };
 const pauseForReading=()=>{
  if(viewport.current && viewport.current.scrollTop>0)follow.current=false;
 };
 const contentBody=open&&<>{body.controls}
  <CodeBlock variant="muted">
   <div ref={viewport} role="region" aria-label={t('思考过程')} tabIndex={0}
    className="thinking-window scroll-fade-y max-h-[180px] overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    onScroll={trackScroll} onWheel={event=>{if(event.deltaY<0)pauseForReading();}}
    onKeyDown={event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))pauseForReading();}}>
    <pre ref={content} className="m-0 px-3 py-2.5 whitespace-pre-wrap break-words font-sans text-sm">{body.text||t('等待输出…')}</pre>
   </div>
  </CodeBlock>
 </>;
 if(!collapsible)return <><ProcessIndicator title={t(title)} live={live}/>{contentBody}</>;
 return <TraceCollapsible open={open} onOpenChange={disclosure?.onOpenChange??setOpen}><TraceCollapsibleTrigger aria-label={t(title)}><ProcessIndicator title={t(title)} live={live}/></TraceCollapsibleTrigger><TraceCollapsibleContent>{contentBody}</TraceCollapsibleContent></TraceCollapsible>;
}
