import MessageBody from './MessageBody';
import {useToolText} from './ToolText';
import type {AgentRun} from './types';
import ProcessPlan from './ProcessPlan';
import {isConversationMessage,isCompletedPlan} from './conversation-message';
import {ProcessDisclosureScope,useProcessDisclosure} from './process-disclosure';
import UserMessage from './UserMessage';
import ProcessTool from './ProcessTool';
import AnalysisTask from './AnalysisTask';
import {Trace,TraceLine,TraceIcon,TraceTitle,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import InputToolRecord,{inputToolName} from './InputToolRecord';
import {InputProcessRecord,PersistentInputRecord} from './InputProcessRecord';
import type {PersistentInputRequest,InputDelivery} from './types';
type InputProps={allRequests?:PersistentInputRequest[];requests?:PersistentInputRequest[];deliveries?:InputDelivery[];onOpenInput?:(id:string)=>void;nativePending?:string[]};
import {commandPresentation,toolBusy,toolSummary} from './tool-presentation';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Spinner} from './components/ui/spinner';
import Markdown from './Markdown';
import { t } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Folder, Search, ListCollapse, Brain, Terminal, Globe, FilePenLine } from 'lucide-react';
import type { ConversationTurn } from './conversation-turns';
export function TurnProgress(props:Parameters<typeof TurnProgressContent>[0]) {
 return <ProcessDisclosureScope><TurnProgressContent {...props}/></ProcessDisclosureScope>;
}
function TurnProgressContent({turn,status,duration,onToggle,paused=false,...inputs}:{paused?:boolean;onToggle():void;turn:ConversationTurn;status:string;duration:ReactNode}&InputProps) {
 const hasFailure=turn.outcome==='failed'||turn.tools.some(tool=>tool.status==='failed');
 const [expanded,setExpanded]=useProcessDisclosure('turn-progress',turn.active||turn.outcome==='failed');
 const previousState=useRef({active:turn.active,outcome:turn.outcome});
 useEffect(()=>{const previous=previousState.current;previousState.current={active:turn.active,outcome:turn.outcome};if(previous.active!==turn.active||previous.outcome!==turn.outcome)setExpanded(turn.active||turn.outcome==='failed');},[turn.active,turn.outcome]);
 const compact=turn.outcome==='completed'&&!hasFailure;
 const step=turn.plan?.steps.find(step=>step.status==='inProgress');
 const completed=turn.plan?.steps.filter(step=>step.status==='completed').length||0;
 const reasoningSteps=turn.messages.filter(message=>message.kind==='reasoning').length;
 const summary=turn.active?status:turn.outcome==='completed'?'本轮已结束':turn.outcome==='failed'?'执行失败':'已中断';
 const agents=turn.tools.filter(tool=>tool.type==='analysis');
 return <Trace className="turn-progress my-2">
  <TraceCollapsible open={expanded} onOpenChange={open=>{onToggle();setExpanded(open);}}>
   <TraceCollapsibleTrigger className="turn-progress-toggle">
    <TraceLine status={hasFailure?'error':turn.active&&!paused?'running':undefined}>
     {compact ? (duration || <TraceTitle>{t(summary)}</TraceTitle>) : <><TraceIcon><Brain/></TraceIcon><TraceTitle>{t(summary)}</TraceTitle></>}
     {turn.active&&step&&<TraceTitle>{step.step}</TraceTitle>}
     {turn.active&&!!turn.plan?.steps.length&&<TraceDescription>{completed}/{turn.plan.steps.length}</TraceDescription>}
     {!compact&&duration}
     {!compact&&reasoningSteps>0&&<TraceDescription>{reasoningSteps} {t('个思考步骤')}</TraceDescription>}
     {!compact&&!turn.active&&turn.tools.length>0&&<TraceDescription>{turn.tools.length} {t('次工具调用')}</TraceDescription>}
     {!compact&&!turn.active&&agents.length>0&&<TraceDescription>{agents.length} {t('子代理')}</TraceDescription>}
    </TraceLine>
   </TraceCollapsibleTrigger>
   <TraceCollapsibleContent>{expanded&&<ProcessPanel turn={turn} paused={paused} {...inputs}/>}</TraceCollapsibleContent>
  </TraceCollapsible>
  {!expanded&&<PendingProcessInputs turn={turn} {...inputs}/>}
  {!expanded&&(!compact||!turn.final)&&agents.map(tool=><AnalysisTask key={tool.id} tool={tool}/>)}
 </Trace>;

}
// Actionable requests remain reachable even when the execution history is unmounted.
function PendingProcessInputs({turn,requests=[],deliveries=[],nativePending=[],onOpenInput=()=>{}}:{turn:ConversationTurn}&InputProps){
 return <>{requests.filter(request=>request.state==='pending').map(request=><PersistentInputRecord key={request.id} request={request} deliveries={deliveries} onOpen={onOpenInput}/>)}{turn.messages.filter(message=>message.inputRecord?.state==='pending'&&nativePending.includes(message.inputRecord.requestId)).map(message=>{const record=message.inputRecord!;return <InputProcessRecord key={message.id} title={t('补充信息')} status="等待补充" questions={record.questions} onOpen={()=>onOpenInput('native:'+record.requestId)}/>;})}</>;
}
export function ProcessIndicator({title,live=true}:{title:string;live?:boolean}){
 return <TraceLine className="process-entry-title" status={live?'running':undefined} role={live?'status':undefined}><TraceIcon>{live?<Spinner aria-hidden="true" role="presentation" className="motion-reduce:animate-none"/>:<Brain/>}</TraceIcon><TraceTitle>{title}</TraceTitle></TraceLine>;

}
export function ThinkingWindow({text,title,live,disclosureKey,message,collapsible=true}:{message?:AgentRun['messages'][number];text:string;title:string;live:boolean;disclosureKey?:string;collapsible?:boolean}) {
 const [expanded,setOpen]=useProcessDisclosure(disclosureKey);
 const open=!collapsible||expanded;
 const body=useToolText({messageId:message?.id,text,preview:message?.textPreview,version:message?.textVersion},open);
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
 const contentBody=open&&<>{body.controls}<div className="thinking-window scroll-fade-y max-h-[180px] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring" ref={viewport} tabIndex={0} role="region" aria-label={t('思考过程')} onScroll={trackScroll} onWheel={event=>{if(event.deltaY<0)follow.current=false;}} onKeyDown={event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))follow.current=false;}}><pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm" ref={content}>{body.text||t('等待输出…')}</pre></div></>;
 if(!collapsible)return <><ProcessIndicator title={t(title)} live={live}/>{contentBody}</>;
 return <TraceCollapsible open={open} onOpenChange={setOpen}><TraceCollapsibleTrigger aria-label={t(title)}><ProcessIndicator title={t(title)} live={live}/></TraceCollapsibleTrigger><TraceCollapsibleContent>{contentBody}</TraceCollapsibleContent></TraceCollapsible>;
}
export default function ProcessPanel({ turn, showAnalysis=true, paused=false,requests=[],allRequests=requests,deliveries=[],onOpenInput=()=>{},nativePending=[] }: { turn: ConversationTurn; paused?:boolean; showAnalysis?:boolean }&InputProps) {
 const hasPendingInput=!!nativePending.length||allRequests.some(request=>request.state==='pending');
 const toolsByEntry=new Map(turn.tools.map(tool=>['tool-'+tool.id,tool]));
 const messagesByEntry=new Map(turn.messages.map(message=>['message-'+message.id,message]));
 const requestsByEntry=new Map(requests.map(request=>['request-'+request.id,request]));
 const entries=[
  ...requests.map(r=>({id:'request-'+r.id,order:r.order??Number.MAX_SAFE_INTEGER,command:'',iconKind:'',type:'supplemental',title:'',text:'',status:'',summary:'',live:false})),
  ...turn.messages.filter(message=>(!isConversationMessage(message)||isCompletedPlan(message,turn))&&message.id!==turn.final?.id&&!deliveries.some(d=>d.id===message.formSubmissionId&&(d.source==='inputRequest'||requests.some(r=>r.id===d.requestId)))).map((message,index)=>({id:'message-'+message.id,order:message.order??index,command:'',iconKind:'',type:message.role==='user'?'input':message.kind==='reasoning'?'reasoning':'progress',title:message.kind==='reasoning'?(message.reasoningFormat==='text'?'思考过程':'思考摘要'):'继续处理',text:message.text,status:'',summary:'',live:message.role==='assistant'&&turn.active&&!paused&&message.id===turn.messages.at(-1)?.id})),
  ...turn.tools.map((tool,index)=>({id:'tool-'+tool.id,order:tool.order??turn.messages.length+index,command:tool.type==='commandExecution'?tool.label:'',type:tool.type,iconKind:tool.type==='commandExecution'?commandPresentation(tool).kind:tool.type,title:tool.type==='commandExecution'?commandPresentation(tool).title:tool.type==='contextCompaction'?(tool.status==='completed'?'上下文已压缩':turn.active&&toolBusy(tool.status)?'正在压缩上下文':'上下文压缩'):tool.type==='fileChange'?'修改文件':tool.type==='webSearch'?'搜索资料':tool.type==='plan'?'任务规划':tool.label,text:tool.detail,status:!turn.active&&toolBusy(tool.status)?(turn.outcome==='completed'?'未确认完成':'已停止'):tool.status,summary:toolSummary(tool),live:turn.active&&!paused&&toolBusy(tool.status)}))
 ].sort((a,b)=>a.order-b.order);
 if(!turn.active&&!entries.length&&!turn.plan?.steps.length)return null;
 return <section className="process-panel flex min-w-0 flex-col gap-2" aria-label={t('任务执行过程')}>
 {turn.plan&&<ProcessPlan plan={turn.plan} active={turn.active} paused={paused} outcome={turn.outcome}/>}
 <Trace aria-label={t('过程输出')}>
 {!entries.length&&!turn.final&&turn.active&&!paused&&!hasPendingInput&&<div className="process-entry"><Marker className="process-entry-title" role="status"><MarkerIcon><Spinner className="motion-reduce:animate-none"/></MarkerIcon><MarkerContent shimmer>{t(turn.final?'正在生成回答':'等待模型响应')}</MarkerContent></Marker><p className="text-sm text-muted-foreground">{t(turn.final?'正在接收回答内容。':'尚未收到模型的过程内容，收到后会在这里实时展示。')}</p></div>}
 {entries.map(entry=>{if(messagesByEntry.get(entry.id)?.reasoningCleared)return <small className="process-entry" key={entry.id}>{t('本轮思考记录已清理')}</small>;const analysis=(toolsByEntry.get(entry.id)?.type==='analysis'?toolsByEntry.get(entry.id):undefined);if(analysis)return showAnalysis?<AnalysisTask key={entry.id} tool={analysis}/>:null;const inputTool=(toolsByEntry.get(entry.id)?.type!=='commandExecution'&&inputToolName(toolsByEntry.get(entry.id)?.label||'')?toolsByEntry.get(entry.id):undefined);if(inputTool)return <div className="process-entry" key={entry.id}><InputToolRecord tool={inputTool} requests={allRequests}/></div>;const request=requestsByEntry.get(entry.id);const native=messagesByEntry.get(entry.id)?.inputRecord;if(request)return <div className="process-entry" key={entry.id}><PersistentInputRecord request={request} deliveries={deliveries} onOpen={onOpenInput}/></div>;if(native)return <div className="process-entry" key={entry.id}><InputProcessRecord title={t('补充信息')} status={native.state==='answered'?'已提交 · 已送达':nativePending.includes(native.requestId)?'等待补充':'已失效'} questions={native.questions} onOpen={native.state==='pending'&&nativePending.includes(native.requestId)?()=>onOpenInput('native:'+native.requestId):undefined}/></div>;const tool=!['reasoning','progress','input'].includes(entry.type);const Icon=entry.iconKind==='read'?BookOpen:entry.iconKind==='listFiles'?Folder:entry.iconKind==='search'?Search:entry.type==='contextCompaction'?ListCollapse:entry.type==='reasoning'?Brain:entry.type==='webSearch'?Globe:entry.type==='fileChange'?FilePenLine:Terminal;return <div className={`process-entry ${entry.type} ${entry.live?'is-live':''}`} key={entry.id}>{entry.type==='contextCompaction'?<Marker role={entry.live?'status':undefined}><MarkerIcon>{entry.live?<Spinner className="motion-reduce:animate-none"/>:<ListCollapse/>}</MarkerIcon><MarkerContent>{t(entry.title)}</MarkerContent></Marker>:tool?<ProcessTool source={{toolId:toolsByEntry.get(entry.id)?.id||'',preview:toolsByEntry.get(entry.id)?.detailPreview,version:toolsByEntry.get(entry.id)?.detailVersion}} disclosureKey={entry.id} title={entry.title} summary={entry.summary} status={entry.status} live={entry.live} command={entry.command} output={entry.text} icon={entry.live?<Spinner className="motion-reduce:animate-none"/>:<Icon/>} steps={(toolsByEntry.get(entry.id)?.commandActions||[]).filter(action=>action.type!=='unknown').map(action=>[action.name||action.query||action.type,action.path].filter(Boolean).join(' · '))}/>:entry.type==='reasoning'?<ThinkingWindow message={messagesByEntry.get(entry.id)} disclosureKey={turn.active?entry.id:entry.id+'-history'} text={entry.text} title={entry.title} live={entry.live}/>:entry.type==='input'?<UserMessage message={messagesByEntry.get(entry.id)} text={entry.text}/>:<div className="process-milestone">{messagesByEntry.get(entry.id)?<MessageBody message={messagesByEntry.get(entry.id)!} context="trace"/>:<Markdown context="trace" text={entry.text||t('等待输出…')}/>}</div>}</div>;})}
 </Trace></section>;
}
