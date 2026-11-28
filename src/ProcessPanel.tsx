import {useTraceSweep} from './useTraceSweep';
import MessageBody from './MessageBody';
import {ThinkingWindow} from './ThinkingWindow';
import type {AgentRun} from './types';
import ProcessPlan from './ProcessPlan';
import {isConversationMessage,isCompletedPlan} from './conversation-message';
import {ProcessDisclosureScope,useProcessDisclosure} from './process-disclosure';
import UserMessage from './UserMessage';
import ProcessTool from './ProcessTool';
import AnalysisTask from './AnalysisTask';
import LiveTraceActivity from './LiveTraceActivity';
import {Trace,TraceLine,TraceIcon,TraceTitle,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import InputToolRecord,{inputToolName} from './InputToolRecord';
import {InputProcessRecord,PersistentInputRecord} from './InputProcessRecord';
import type {PersistentInputRequest,InputDelivery} from './types';
type InputProps={allRequests?:PersistentInputRequest[];requests?:PersistentInputRequest[];deliveries?:InputDelivery[];onOpenInput?:(id:string)=>void;nativePending?:string[]};
import {commandPresentation,toolBusy,toolSummary} from './tool-presentation';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Spinner} from './components/ui/spinner';
import { t } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Folder, Search, ListCollapse, Check, Brain, Terminal, Globe, FilePenLine } from 'lucide-react';
import type { ConversationTurn } from './conversation-turns';
export function TurnProgress(props:Parameters<typeof TurnProgressContent>[0]) {
 return <ProcessDisclosureScope><TurnProgressContent {...props}/></ProcessDisclosureScope>;
}
function TurnProgressContent({turn,status,duration,onToggle,paused=false,...inputs}:{paused?:boolean;onToggle():void;turn:ConversationTurn;status:string;duration:ReactNode}&InputProps) {
 const hasFailure=turn.outcome==='failed'||turn.tools.some(tool=>tool.status==='failed');
 const defaultExpanded=turn.active||turn.outcome==='failed';
 const [chosenExpanded,setExpanded]=useProcessDisclosure('turn-progress',defaultExpanded);
 const previousState=useRef({active:turn.active,outcome:turn.outcome});
 const transitioned=previousState.current.active!==turn.active||previousState.current.outcome!==turn.outcome;
 // Apply the end-of-turn fold in the same render: a long replay should only
 // mount when opened, even on the frame that switches out of the live trace.
 const expanded=transitioned?defaultExpanded:chosenExpanded;
 useEffect(()=>{
  if(!transitioned)return;
  previousState.current={active:turn.active,outcome:turn.outcome};
  setExpanded(defaultExpanded);
 },[turn.active,turn.outcome,transitioned,defaultExpanded,setExpanded]);
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
type RunMessage = AgentRun['messages'][number];
type RunTool = AgentRun['tools'][number];
type Entry =
 | {kind:'message'; value:RunMessage; order:number}
 | {kind:'tool'; value:RunTool; order:number}
 | {kind:'request'; value:PersistentInputRequest; order:number};

function keepLiveTool(tool:RunTool) {
 if(tool.type==='analysis'||tool.type==='deliverable')return true;
 const input=tool.type==='commandExecution'?null:inputToolName(tool.label);
 return !!input&&input!=='input_list'&&input!=='input_capabilities';
}

// Keep the first busy tool until it finishes. Later concurrent starts must not
// displace it or repeatedly move the reader's viewport.
function visibleTrace(turn:ConversationTurn,requests:PersistentInputRequest[],deliveries:InputDelivery[]) {
 const entries:Entry[]=requests.map(value=>({kind:'request',value,order:value.order??Number.MAX_SAFE_INTEGER}));
 let busyTool:Extract<Entry,{kind:'tool'}>|undefined;
 let latestOrder=-1;
 let historyMessageIndex=0;
 let latestStep:Entry|undefined;
 for(const [index,value] of turn.messages.entries()){
  const order=value.order??index;
  latestOrder=Math.max(latestOrder,order);
  if((isConversationMessage(value)&&!isCompletedPlan(value,turn))||value.id===turn.final?.id)continue;
  if(value.formSubmissionId&&deliveries.some(d=>d.id===value.formSubmissionId&&(d.source==='inputRequest'||requests.some(r=>r.id===d.requestId))))continue;
  const entry:Entry={kind:'message',value,order:turn.active?order:value.order??historyMessageIndex};
  historyMessageIndex++;
  if(!turn.active||value.kind!=='reasoning'||value.inputRecord||value.role==='user')entries.push(entry);
  else if(!value.reasoningCleared&&(!value.status||toolBusy(value.status))&&(!latestStep||order>=latestStep.order))latestStep=entry;
 }
 for(const [index,value] of turn.tools.entries()){
  const order=value.order??turn.messages.length+index;
  latestOrder=Math.max(latestOrder,order);
  if(!turn.active||keepLiveTool(value)){
   entries.push({kind:'tool',value,order});
  }else if(toolBusy(value.status)){
   const pending=value.status==='pending';
   const previousPending=busyTool?.value.status==='pending';
   if(!busyTool||(previousPending&&!pending)||(pending===previousPending&&order<busyTool.order)){
    busyTool={kind:'tool',value,order};
   }
  }else if(['failed','error','denied','declined','rejected'].includes(value.status)&&(!latestStep||order>=latestStep.order)){
   latestStep={kind:'tool',value,order};
  }
 }
 const activity=busyTool??(latestStep?.order===latestOrder?latestStep:undefined);
 return {entries:entries.sort((a,b)=>a.order-b.order),activity,latestOrder};
}

// A single renderer update may contain only the completed version of a fast tool.
// Keep one readable receipt and at most one newer candidate during a burst.
const toolReceiptMs=1200;
function useToolReceipt(tools:RunTool[],enabled:boolean,busyTool:boolean){
 const previous=useRef<Set<string>|null>(null);
 const pending=useRef<string|undefined>(undefined);
 const [shown,setShown]=useState<string>();
 useLayoutEffect(()=>{
  if(!enabled){
   previous.current=null;
   pending.current=undefined;
   setShown(undefined);
   return;
  }
  const completed=previous.current??new Set<string>();
  let newest:RunTool|undefined;
  for(const tool of tools){
   if(tool.status!=='completed'){
    completed.delete(tool.id);
    continue;
   }
   if(completed.has(tool.id))continue;
   completed.add(tool.id);
   if(previous.current&&!keepLiveTool(tool)&&(!newest||(tool.order??0)>=(newest.order??0)))newest=tool;
  }
  previous.current=completed;
  if(busyTool){
   // Finish the visible receipt, then hand off directly to the active tool.
   pending.current=undefined;
   return;
  }
  if(!newest)return;
  if(shown)pending.current=newest.id;
  else setShown(newest.id);
 },[tools,enabled,shown,busyTool]);
 useEffect(()=>{
  if(!shown)return;
  const timer=window.setTimeout(()=>{
   const next=pending.current;
   pending.current=undefined;
   setShown(next);
  },toolReceiptMs);
  return ()=>window.clearTimeout(timer);
 },[shown]);
 return enabled&&shown?tools.find(tool=>tool.id===shown&&tool.status==='completed'):undefined;
}

function ToolReceipt({tool,highlight}:{tool:RunTool;highlight:boolean}){
 const sweep=useTraceSweep<HTMLSpanElement>(highlight?tool.id:undefined);
 const command=tool.type==='commandExecution'?commandPresentation(tool):undefined;
 const title=command?.kind==='read'?'已读取文件':command?.kind==='search'?'已搜索':command?.kind==='listFiles'?'已浏览目录':command?'已运行':'已完成';
 const label=command?.summary||tool.progress||tool.label;
 return <Marker className="process-entry" role="status">
  <MarkerIcon><Check/></MarkerIcon>
  <span ref={sweep} className="min-w-0 truncate" title={label}>{t(title)} {label}</span>
 </Marker>;
}

export default function ProcessPanel({turn,showAnalysis=true,paused=false,requests=[],allRequests=requests,deliveries=[],onOpenInput=()=>{},nativePending=[]}:{turn:ConversationTurn;paused?:boolean;showAnalysis?:boolean}&InputProps) {
 const {entries,activity,latestOrder}=visibleTrace(turn,requests,deliveries);
 const latestMessage=turn.messages.at(-1);
 const streamingCommentary=!!latestMessage?.text&&latestMessage.role==='assistant'&&!latestMessage.kind
  &&!latestMessage.inputRecord&&!isConversationMessage(latestMessage)
  &&(latestMessage.order??turn.messages.length-1)===latestOrder
  &&(!latestMessage.status||toolBusy(latestMessage.status));
 const canShowReceipt=turn.active&&!paused&&!turn.final&&!nativePending.length&&!allRequests.some(r=>r.state==='pending');
 const startingSubagents=turn.active&&!paused&&(turn.startingSubagents||turn.tools.some(tool=>tool.nativeThreadId&&tool.status==='pending'));
 const toolInSlot=activity?.kind==='tool'?activity.value:undefined;
 const busyTool=!!toolInSlot&&toolBusy(toolInSlot.status);
 const recentTool=useToolReceipt(turn.tools,!startingSubagents&&canShowReceipt&&(!toolInSlot||busyTool),busyTool);
 let waitLabel:string|undefined;
 if(canShowReceipt&&!activity){
  if(turn.tools.some(tool=>tool.type==='analysis'&&['running','inProgress'].includes(tool.status)))waitLabel='子代理工作中';
  else if(streamingCommentary&&latestMessage?.status)waitLabel='正在接收进展';
 }
 // Use identities and event order, never streamed text or progress counters.
 const last=entries.at(-1);
 const candidate=last?.order===latestOrder?last:undefined;
 const prose=candidate?.kind==='message'&&candidate.value.role==='assistant'&&!candidate.value.kind&&!candidate.value.inputRecord?candidate.value:undefined;
 const agent=candidate?.kind==='tool'&&candidate.value.type==='analysis'?candidate.value:undefined;
 const deliverable=candidate?.kind==='tool'&&candidate.value.type==='deliverable'?candidate.value:undefined;
 const highlight=canShowReceipt&&!startingSubagents;
 const receiptWins=!!recentTool&&(recentTool.order??latestOrder)>=latestOrder;
 const foreground=highlight&&!receiptWins;
 const proseSweep=useTraceSweep<HTMLDivElement>(foreground&&prose?prose.id:undefined);
 const slotWins=foreground&&!prose&&!agent&&!deliverable;
 const compactionSweep=useTraceSweep<HTMLSpanElement>(slotWins&&toolInSlot?.type==='contextCompaction'?toolInSlot.id:undefined);
 if(!turn.active&&!entries.length&&!turn.plan?.steps.length)return null;
 function renderEntry(entry:Entry){
  const key=entry.kind+'-'+entry.value.id;
  if(entry.kind==='request')return <div className="process-entry" key={key}><PersistentInputRecord request={entry.value} deliveries={deliveries} onOpen={onOpenInput}/></div>;
  if(entry.kind==='message'){
   const message=entry.value,native=message.inputRecord;
   if(message.reasoningCleared)return <small className="process-entry" key={key}>{t('本轮思考记录已清理')}</small>;
   if(native){
    const pending=native.state==='pending'&&nativePending.includes(native.requestId);
    return <div className="process-entry" key={key}>
     <InputProcessRecord title={t('补充信息')} status={native.state==='answered'?'已提交 · 已送达':pending?'等待补充':'已失效'}
      questions={native.questions} onOpen={pending?()=>onOpenInput('native:'+native.requestId):undefined}/>
    </div>;
   }
   if(message.role==='user')return <div className="process-entry input" key={key}><UserMessage message={message} text={message.text}/></div>;
   const live=turn.active&&!paused&&entry.order===latestOrder&&(!activity||entry===activity);
   if(message.kind==='reasoning')return <div className="process-entry reasoning" key={key}>
    <ThinkingWindow source={{messageId:message.id,preview:message.textPreview,version:message.textVersion}}
     sweepKey={slotWins&&live?key:undefined} disclosureKey={turn.active?key:key+'-history'} text={message.text}
     title={live?'思考中':message.reasoningFormat==='text'?'思考过程':'思考摘要'} live={live}/>
   </div>;
   return <div className={'process-entry progress'+(live&&streamingCommentary?' is-live':'')} key={key}>
    <div ref={message===prose?proseSweep:undefined} className="process-milestone"><MessageBody message={message} context="trace"/></div>
   </div>;
  }
  const tool=entry.value;
  if(tool.type==='analysis')return showAnalysis?<AnalysisTask key={key} tool={tool} highlight={foreground&&tool===agent} trackLifecycle={highlight}/>:null;
  if(tool.type!=='commandExecution'&&inputToolName(tool.label))return <div className="process-entry" key={key}><InputToolRecord tool={tool} requests={allRequests}/></div>;
  const live=turn.active&&!paused&&toolBusy(tool.status);
  if(tool.type==='contextCompaction')return <div className="process-entry contextCompaction" key={key}><Marker role={live?'status':undefined}><MarkerIcon>{live?<Spinner className="motion-reduce:animate-none"/>:<ListCollapse/>}</MarkerIcon><MarkerContent ref={compactionSweep}>{t(tool.status==='completed'?'上下文已压缩':live?'正在压缩上下文':'上下文压缩')}</MarkerContent></Marker></div>;
  const command=tool.type==='commandExecution'?commandPresentation(tool):undefined;
  const title=command?.title??(tool.type==='fileChange'?'修改文件':tool.type==='webSearch'?'搜索资料':tool.type==='plan'?'任务规划':tool.label);
  const Icon=command?.kind==='read'?BookOpen:command?.kind==='listFiles'?Folder:command?.kind==='search'?Search:tool.type==='webSearch'?Globe:tool.type==='fileChange'?FilePenLine:Terminal;
  const status=!turn.active&&toolBusy(tool.status)?(turn.outcome==='completed'?'未确认完成':'已停止'):tool.status;
  return <div className={`process-entry ${tool.type}${live?' is-live':''}`} key={key}>
   <ProcessTool highlight={(slotWins&&live&&tool===toolInSlot)||(foreground&&tool===deliverable)} type={tool.type} source={{toolId:tool.id,preview:tool.detailPreview,version:tool.detailVersion}}
    disclosureKey={key} title={title} summary={command?.summary??toolSummary(tool)} status={status} live={live}
    command={command?tool.label:''} output={tool.detail} icon={live?<Spinner className="motion-reduce:animate-none"/>:<Icon/>}
    operationCatalog={tool.label==='extension_invoke_operation'?operationCatalog:undefined}
    steps={(tool.commandActions||[]).filter(action=>action.type!=='unknown').map(action=>[action.name||action.query||action.type,action.path].filter(Boolean).join(' · '))}/>
  </div>;
 }
 let operationCatalog:string|undefined;
 return <section className="process-panel flex min-w-0 flex-col gap-2" aria-label={t('任务执行过程')}>
  {turn.plan&&<ProcessPlan plan={turn.plan} active={turn.active} paused={paused} outcome={turn.outcome}/>}
  <Trace aria-label={t('过程输出')}>
   {entries.map(entry=>{
    if(entry.kind==='tool'&&entry.value.type==='mcpToolCall'&&entry.value.label==='extension_list_operations')operationCatalog=entry.value.status==='completed'&&!entry.value.detailPreview?entry.value.detail:undefined;
    return renderEntry(entry);
   })}
   {turn.active&&<LiveTraceActivity
    highlight={canShowReceipt&&(!!startingSubagents||slotWins)} label={startingSubagents?t('正在启动子代理'):waitLabel?t(waitLabel):undefined}
    waiting={canShowReceipt} hasProgress={!!turn.tools.length||turn.messages.some(m=>!isConversationMessage(m))}>
    {startingSubagents?null:recentTool?<ToolReceipt tool={recentTool} highlight={highlight&&receiptWins}/>:activity?renderEntry(activity):null}
   </LiveTraceActivity>}
  </Trace>
 </section>;
}
