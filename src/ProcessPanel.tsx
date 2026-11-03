import ProcessTool from './ProcessTool';
import {Trace,TraceLine,TraceIcon,TraceTitle,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import InputToolRecord,{inputToolName} from './InputToolRecord';
import {InputProcessRecord,PersistentInputRecord} from './InputProcessRecord';
import type {PersistentInputRequest,InputDelivery} from './types';
type InputProps={allRequests?:PersistentInputRequest[];requests?:PersistentInputRequest[];deliveries?:InputDelivery[];onOpenInput?:(id:string)=>void;nativePending?:string[]};
import {commandPresentation} from './tool-presentation';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Spinner} from './components/ui/spinner';
import {toolBusy,toolSummary} from './RunActivity';
import Markdown from './Markdown';
import { t } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Folder, Search, ListCollapse, Activity, Brain, Terminal, Globe, FilePenLine, Check, Circle } from 'lucide-react';
import type { ConversationTurn } from './conversation-turns';
const statusText:Record<string,string>={inProgress:'进行中',running:'进行中',completed:'已完成',failed:'失败',declined:'已拒绝',pending:'待处理'};
export function TurnProgress({turn,status,duration,onToggle,paused=false,...inputs}:{paused?:boolean;onToggle():void;turn:ConversationTurn;status:string;duration:ReactNode}&InputProps) {
 const hasFailure=turn.outcome==='failed'||turn.tools.some(tool=>tool.status==='failed');
 const [expanded,setExpanded]=useState(turn.active||hasFailure);
 useEffect(()=>{setExpanded(turn.active||hasFailure);},[turn.active,hasFailure,turn.outcome]);
 const step=turn.plan?.steps.find(step=>step.status==='inProgress');
 const completed=turn.plan?.steps.filter(step=>step.status==='completed').length||0;
 return <Trace className="turn-progress my-2"><TraceCollapsible open={expanded} onOpenChange={open=>{onToggle();setExpanded(open);}}><TraceCollapsibleTrigger className="turn-progress-toggle"><TraceLine status={turn.active&&!paused?'running':hasFailure?'error':undefined}><TraceTitle>{t(turn.active?status:turn.outcome==='completed'?'本轮已结束':turn.outcome==='failed'?'执行失败':'已中断')}</TraceTitle>{turn.active&&step&&<TraceTitle>{step.step}</TraceTitle>}{turn.active&&!!turn.plan?.steps.length&&<TraceDescription>{completed}/{turn.plan.steps.length}</TraceDescription>}{duration}{!turn.active&&turn.tools.length>0&&<TraceDescription>{turn.tools.length} {t('次工具调用')}</TraceDescription>}</TraceLine></TraceCollapsibleTrigger><TraceCollapsibleContent keepMounted><ProcessPanel turn={turn} paused={paused} {...inputs}/></TraceCollapsibleContent></TraceCollapsible></Trace>;

}
export function ProcessIndicator({title,live=true}:{title:string;live?:boolean}){
 return <TraceLine className="process-entry-title" status={live?'running':undefined} role={live?'status':undefined}><TraceIcon>{live?<Spinner aria-hidden="true" role="presentation" className="motion-reduce:animate-none"/>:<Brain/>}</TraceIcon><TraceTitle>{title}</TraceTitle></TraceLine>;

}
export function ThinkingWindow({text,title,live}:{text:string;title:string;live:boolean}) {
 const [open,setOpen]=useState(true);
 useEffect(()=>{if(live)setOpen(true);},[live]);
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
 useLayoutEffect(scrollToLatest,[text]);
 useLayoutEffect(()=>{
  const el=viewport.current;const body=content.current;
  if(!el||!body)return;
  const observer=new ResizeObserver(scrollToLatest);
  observer.observe(el);observer.observe(body);
  return()=>observer.disconnect();
 },[]);
 const trackScroll=()=>{
  const el=viewport.current;
  if(!el?.clientHeight)return;
  const atEnd=el.scrollHeight-el.scrollTop-el.clientHeight<24;
  // Content growth and delayed programmatic scroll events must not cancel following.
  if(atEnd)follow.current=true;
  else if(el.scrollTop<lastTop.current)follow.current=false;
  lastTop.current=el.scrollTop;
 };
 return <TraceCollapsible open={open} onOpenChange={setOpen}><TraceCollapsibleTrigger><ProcessIndicator title={t(title)} live={live}/></TraceCollapsibleTrigger><TraceCollapsibleContent>
 <div className="thinking-window max-h-[180px] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring" ref={viewport} tabIndex={0} role="region" aria-label={t('思考过程')} onScroll={trackScroll} onWheel={event=>{if(event.deltaY<0)follow.current=false;}} onKeyDown={event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))follow.current=false;}}><pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm" ref={content}>{text||t('等待输出…')}</pre></div></TraceCollapsibleContent></TraceCollapsible>;
}
export default function ProcessPanel({ turn, paused=false,requests=[],allRequests=requests,deliveries=[],onOpenInput=()=>{},nativePending=[] }: { turn: ConversationTurn; paused?:boolean }&InputProps) {
 const entries=[
  ...requests.map(r=>({id:'request-'+r.id,order:r.order??Number.MAX_SAFE_INTEGER,command:'',iconKind:'',type:'supplemental',title:'',text:'',status:'',summary:'',live:false})),
  ...turn.messages.filter(message=>message.id!==turn.final?.id&&!deliveries.some(d=>d.id===message.formSubmissionId&&(d.source==='inputRequest'||requests.some(r=>r.id===d.requestId)))&&(turn.active||message.kind!=='reasoning')).map((message,index)=>({id:'message-'+message.id,order:message.order??index,command:'',iconKind:'',type:message.role==='user'?'input':message.kind==='reasoning'?'reasoning':'progress',title:message.kind==='reasoning'?(message.reasoningFormat==='text'?'思考过程':'思考摘要'):'继续处理',text:message.text,status:'',summary:'',live:message.role==='assistant'&&turn.active&&!paused&&message.id===turn.messages.at(-1)?.id})),
  ...turn.tools.map((tool,index)=>({id:'tool-'+tool.id,order:tool.order??turn.messages.length+index,command:tool.type==='commandExecution'?tool.label:'',type:tool.type,iconKind:tool.type==='commandExecution'?commandPresentation(tool).kind:tool.type,title:tool.type==='commandExecution'?commandPresentation(tool).title:tool.type==='contextCompaction'?(tool.status==='completed'?'上下文已压缩':turn.active&&toolBusy(tool.status)?'正在压缩上下文':'上下文压缩'):tool.type==='fileChange'?'修改文件':tool.type==='webSearch'?'搜索资料':tool.type==='plan'?'任务规划':tool.label,text:tool.detail,status:!turn.active&&toolBusy(tool.status)?(turn.outcome==='completed'?'未确认完成':'已停止'):tool.status,summary:toolSummary(tool),live:turn.active&&!paused&&toolBusy(tool.status)}))
 ].sort((a,b)=>a.order-b.order);
 if(!turn.active&&!entries.length&&!turn.plan?.steps.length)return null;
 return <section className="process-panel flex min-w-0 flex-col gap-2" aria-label={t('任务执行过程')}>
 {!!turn.plan?.steps.length&&<div className="flex min-w-0 flex-col gap-2" aria-label={t('任务清单')}><TraceLine><TraceTitle>{t('任务清单')}</TraceTitle><TraceDescription>{turn.plan.steps.filter(s=>s.status==='completed').length}/{turn.plan.steps.length}</TraceDescription></TraceLine><Trace>{turn.plan.steps.map((step,index)=><TraceLine key={index} status={step.status==='inProgress'&&turn.active&&!paused?'running':step.status==='pending'?'pending':undefined}><TraceIcon>{step.status==='completed'?<Check size={15}/>:step.status==='inProgress'?<Activity size={15}/>:<Circle size={15}/>}</TraceIcon><TraceTitle>{step.step}</TraceTitle><TraceDescription>{t(step.status==='inProgress'&&!turn.active?(turn.outcome==='completed'?'未确认完成':'已暂停'):statusText[step.status])}</TraceDescription></TraceLine>)}</Trace>{turn.plan.explanation&&<p className="text-sm text-muted-foreground">{turn.plan.explanation}</p>}</div>}
 <Trace aria-label={t('过程输出')}>
 {!entries.length&&!turn.final&&turn.active&&!paused&&<div className="process-entry"><Marker className="process-entry-title" role="status"><MarkerIcon><Spinner className="motion-reduce:animate-none"/></MarkerIcon><MarkerContent className="shimmer shimmer-spread-[2ch] motion-reduce:shimmer-none motion-reduce:animate-none">{t(turn.final?'正在生成回答':'等待模型响应')}</MarkerContent></Marker><p className="text-sm text-muted-foreground">{t(turn.final?'正在接收回答内容。':'尚未收到模型的过程内容，收到后会在这里实时展示。')}</p></div>}
 {entries.map(entry=>{const inputTool=turn.tools.find(tool=>'tool-'+tool.id===entry.id&&tool.type!=='commandExecution'&&inputToolName(tool.label));if(inputTool)return <div className="process-entry" key={entry.id}><InputToolRecord tool={inputTool} requests={allRequests}/></div>;const request=requests.find(r=>'request-'+r.id===entry.id);const native=turn.messages.find(m=>'message-'+m.id===entry.id)?.inputRecord;if(request)return <div className="process-entry" key={entry.id}><PersistentInputRecord request={request} deliveries={deliveries} onOpen={onOpenInput}/></div>;if(native)return <div className="process-entry" key={entry.id}><InputProcessRecord title={t('补充信息')} status={native.state==='answered'?'已提交 · 已送达':nativePending.includes(native.requestId)?'等待补充':'已失效'} questions={native.questions} onOpen={native.state==='pending'&&nativePending.includes(native.requestId)?()=>onOpenInput('native:'+native.requestId):undefined}/></div>;const tool=!['reasoning','progress','input'].includes(entry.type);const Icon=entry.iconKind==='read'?BookOpen:entry.iconKind==='listFiles'?Folder:entry.iconKind==='search'?Search:entry.type==='contextCompaction'?ListCollapse:entry.type==='reasoning'?Brain:entry.type==='webSearch'?Globe:entry.type==='fileChange'?FilePenLine:Terminal;return <div className={`process-entry ${entry.type} ${entry.live?'is-live':''}`} key={entry.id}>{entry.type==='contextCompaction'?<Marker role={entry.live?'status':undefined}><MarkerIcon>{entry.live?<Spinner className="motion-reduce:animate-none"/>:<ListCollapse/>}</MarkerIcon><MarkerContent>{t(entry.title)}</MarkerContent></Marker>:tool?<ProcessTool title={entry.title} summary={entry.summary} status={entry.status} live={entry.live} command={entry.command} output={entry.text} icon={entry.live?<Spinner className="motion-reduce:animate-none"/>:<Icon/>} steps={(turn.tools.find(tool=>'tool-'+tool.id===entry.id)?.commandActions||[]).filter(action=>action.type!=='unknown').map(action=>[action.name||action.query||action.type,action.path].filter(Boolean).join(' · '))}/>:entry.type==='reasoning'?<ThinkingWindow text={entry.text} title={entry.title} live={entry.live}/>:entry.type==='input'?<article className="message user bg-message text-message-foreground" aria-label={t('你的消息')}><div className="user-text">{entry.text}</div></article>:<div className="process-milestone"><Markdown context="trace" text={entry.text||t('等待输出…')}/></div>}</div>;})}
 </Trace></section>;
}
