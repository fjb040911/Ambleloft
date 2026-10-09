import {commandPresentation} from './tool-presentation';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Button} from './components/ui/button';
import {Spinner} from './components/ui/spinner';
import {toolBusy,toolSummary} from './RunActivity';
import Markdown from './Markdown';
import { t } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Folder, Search, ListCollapse, Activity, Brain, Terminal, Globe, FilePenLine, Check, Circle, ChevronRight, LoaderCircle } from 'lucide-react';
import type { ConversationTurn } from './conversation-turns';
const statusText:Record<string,string>={inProgress:'进行中',running:'进行中',completed:'已完成',failed:'失败',declined:'已拒绝',pending:'待处理'};
export function TurnProgress({turn,status,duration,onToggle,paused=false}:{paused?:boolean;onToggle():void;turn:ConversationTurn;status:string;duration:ReactNode}) {
 const hasFailure=turn.outcome==='failed'||turn.tools.some(tool=>tool.status==='failed');
 const [expanded,setExpanded]=useState(turn.active||hasFailure);
 useEffect(()=>{setExpanded(turn.active||hasFailure);},[turn.active,hasFailure,turn.outcome]);
 const step=turn.plan?.steps.find(step=>step.status==='inProgress');
 const completed=turn.plan?.steps.filter(step=>step.status==='completed').length||0;
 return <div className="turn-progress"><Button variant="ghost" size="sm" className="turn-progress-toggle" aria-expanded={expanded} onClick={()=>{onToggle();setExpanded(!expanded);}}><ChevronRight size={14} className={expanded?'expanded':''}/><span>{t(turn.active?status:turn.outcome==='completed'?'本轮已结束':turn.outcome==='failed'?'执行失败':'已中断')}</span>{turn.active&&step&&<span className="turn-step-summary">{step.step}</span>}{turn.active&&!!turn.plan?.steps.length&&<small>{completed}/{turn.plan.steps.length}</small>}{duration}{!turn.active&&turn.tools.length>0&&<small>{turn.tools.length} {t('次工具调用')}</small>}</Button>{expanded&&<ProcessPanel turn={turn} paused={paused}/>}</div>;
}
function ThinkingWindow({text,title,live}:{text:string;title:string;live:boolean}) {
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
 return <><Marker className="process-entry-title" role={live?'status':undefined}><MarkerIcon>{live?<Spinner className="motion-reduce:animate-none"/>:<Brain/>}</MarkerIcon><MarkerContent className={live?'shimmer shimmer-spread-[2ch] motion-reduce:shimmer-none motion-reduce:animate-none':undefined}>{t(title)}</MarkerContent></Marker>
 <div className="thinking-window" ref={viewport} tabIndex={0} role="region" aria-label={t('思考过程')} onScroll={trackScroll} onWheel={event=>{if(event.deltaY<0)follow.current=false;}} onKeyDown={event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))follow.current=false;}}><pre ref={content}>{text||t('等待输出…')}</pre></div></>;
}
export default function ProcessPanel({ turn, paused=false }: { turn: ConversationTurn; paused?:boolean }) {
 const entries=[
  ...turn.messages.filter(message=>message.id!==turn.final?.id&&(turn.active||message.kind!=='reasoning')).map((message,index)=>({id:'message-'+message.id,order:message.order??index,command:'',iconKind:'',type:message.kind==='reasoning'?'reasoning':'progress',title:message.kind==='reasoning'?(message.reasoningFormat==='text'?'思考过程':'思考摘要'):'继续处理',text:message.text,status:'',summary:'',live:turn.active&&!paused&&message.id===turn.messages.at(-1)?.id})),
  ...turn.tools.map((tool,index)=>({id:'tool-'+tool.id,order:tool.order??turn.messages.length+index,command:tool.type==='commandExecution'?tool.label:'',type:tool.type,iconKind:tool.type==='commandExecution'?commandPresentation(tool).kind:tool.type,title:tool.type==='commandExecution'?commandPresentation(tool).title:tool.type==='contextCompaction'?(tool.status==='completed'?'上下文已压缩':turn.active&&toolBusy(tool.status)?'正在压缩上下文':'上下文压缩'):tool.type==='fileChange'?'修改文件':tool.type==='webSearch'?'搜索资料':tool.type==='plan'?'任务规划':tool.label,text:tool.detail,status:!turn.active&&toolBusy(tool.status)?(turn.outcome==='completed'?'未确认完成':'已停止'):tool.status,summary:toolSummary(tool),live:turn.active&&!paused&&toolBusy(tool.status)}))
 ].sort((a,b)=>a.order-b.order);
 if(!turn.active&&!entries.length&&!turn.plan?.steps.length)return null;
 return <section className="process-panel" aria-label={t('任务执行过程')}>
 {!!turn.plan?.steps.length&&<div className="task-plan" aria-label={t('任务清单')}><strong>{t('任务清单')} <small>{turn.plan.steps.filter(s=>s.status==='completed').length}/{turn.plan.steps.length}</small></strong><ul>{turn.plan.steps.map((step,index)=><li key={index} className={step.status}>{step.status==='completed'?<Check size={15}/>:step.status==='inProgress'?<Activity size={15}/>:<Circle size={15}/>}<span>{step.step}</span><small>{t(step.status==='inProgress'&&!turn.active?(turn.outcome==='completed'?'未确认完成':'已暂停'):statusText[step.status])}</small></li>)}</ul>{turn.plan.explanation&&<p>{turn.plan.explanation}</p>}</div>}
 <div className="process-log" aria-label={t('过程输出')}><div>
 {!entries.length&&!turn.final&&turn.active&&!paused&&<div className="process-entry"><Marker className="process-entry-title" role="status"><MarkerIcon><Spinner className="motion-reduce:animate-none"/></MarkerIcon><MarkerContent className="shimmer shimmer-spread-[2ch] motion-reduce:shimmer-none motion-reduce:animate-none">{t(turn.final?'正在生成回答':'等待模型响应')}</MarkerContent></Marker><p className="process-empty">{t(turn.final?'正在接收回答内容。':'尚未收到模型的过程内容，收到后会在这里实时展示。')}</p></div>}
 {entries.map(entry=>{const tool=!['reasoning','progress'].includes(entry.type);const Icon=entry.iconKind==='read'?BookOpen:entry.iconKind==='listFiles'?Folder:entry.iconKind==='search'?Search:entry.type==='contextCompaction'?ListCollapse:entry.type==='reasoning'?Brain:entry.type==='webSearch'?Globe:entry.type==='fileChange'?FilePenLine:Terminal;return <div className={`process-entry ${entry.type} ${entry.live?'is-live':''}`} key={entry.id}>{entry.type==='contextCompaction'?<Marker role={entry.live?'status':undefined}><MarkerIcon>{entry.live?<Spinner className="motion-reduce:animate-none"/>:<ListCollapse/>}</MarkerIcon><MarkerContent>{t(entry.title)}</MarkerContent></Marker>:tool?<details data-status={entry.status}><summary>{entry.live?<LoaderCircle size={13} className="activity-spinner"/>:<Icon size={13}/>}<span className="activity-tool-title">{t(entry.title)}</span><span className="activity-tool-summary" title={entry.summary}>{entry.summary}</span><small className="activity-tool-status">{t(statusText[entry.status]||entry.status)}</small><ChevronRight className="tool-disclosure" size={14}/></summary>{entry.command&&<pre aria-label={t('执行命令')} tabIndex={0}>{entry.command}</pre>}<pre aria-label={t("工具输出")} tabIndex={0}>{entry.text.slice(-12000)||t('等待输出…')}</pre></details>:entry.type==='reasoning'?<ThinkingWindow text={entry.text} title={entry.title} live={entry.live}/>:<div className="process-milestone"><Markdown text={entry.text||t('等待输出…')}/></div>}{tool&&entry.text.length>12000&&<small>{t('仅显示最后 12000 字，完整记录已保留。')}</small>}</div>;})}
 </div></div></section>;
}
