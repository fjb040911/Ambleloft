import RunDiagnosticsButton from './RunDiagnosticsButton';
import UserMessage from './UserMessage';
import TaskRequestSurface from './TaskRequestSurface';
import ComposerAttachments from './ComposerAttachments';
import {TraceDescription} from './components/ui/trace';
import {Message,MessageContent} from './components/ui/message';
import PendingMessage from './PendingMessage';
import {unwrapInputResult} from './input-action-result';
import {Button} from './components/ui/button';
import ApprovalCard from './ApprovalCard';
import {MessageScrollerProvider,MessageScroller,MessageScrollerViewport,MessageScrollerContent,MessageScrollerItem,MessageScrollerButton,useMessageScroller,useMessageScrollerVisibility} from './components/ui/message-scroller';
import {createPortal} from 'react-dom';
import VirtualBlock from './VirtualBlock';
import SupplementalInputDock from './SupplementalInputDock';
import {PersistentInputRecord} from './InputProcessRecord';
import { t, useLanguage } from './i18n';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ChevronUp, Clock3 } from 'lucide-react';
import SkillTags from './SkillTags';
import ComposerControls, {type ComposerOptions} from './ComposerControls';
import type { ProviderCatalog, AgentRun, TurnTiming } from './types';
import Markdown from './Markdown';
import TurnActions from './TurnActions';
import { conversationTurns } from './conversation-turns';
import {TurnProgress} from './ProcessPanel';
import RunActivity from './RunActivity';
import TurnFiles from './TurnFiles';
import TurnNavigation from './TurnNavigation';
import TaskForms, {useTaskForms} from './TaskForms';
import {mergeHistory,groupByTurn} from './conversation-data';
import ChatComposer from './ChatComposer';
import {CreationGuide} from './CreationGuide';
import InputDeliveryPanel,{useInputDeliveries} from './InputDeliveryPanel';
import {interruptedQuestion} from '../core/inputs/interrupted-question.mjs';
import TaskAppCard from './TaskAppCard';

export const runStatus = { preparing: '正在准备', running: '执行中', waiting: '等待审批', stopping: '正在停止', completed: '本轮已结束', failed: '执行失败', interrupted: '已停止 / 中断' };
export const isRunning = (run: AgentRun) => ['preparing', 'running', 'waiting', 'stopping'].includes(run.status);
function Duration({ timing }: { timing: TurnTiming }) {
  if (!timing.outcome) return null;
  const seconds = typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs) ? Math.max(0, Math.floor(timing.durationMs / 1000)) : null;
  return <TraceDescription className="trace-duration inline-flex items-center gap-2"><Clock3 size={13} /><span>{seconds === null ? t("用时未完整记录") : <>{t("用时")} <strong>{Math.floor(seconds / 60)}</strong> {t("分")} <strong>{seconds % 60}</strong> {t("秒")}</>}{timing.outcome === 'failed' ? t(" · 执行失败") : timing.outcome === 'interrupted' ? t(" · 已中断") : ''}</span></TraceDescription>;
}
function ConversationBody({ onOptionsChange,autoOpenPending=false,pendingInPanel=false,reworkMode=false,onFollowingChange, visible = true, floatingHost, run, send, stop, approve, submitting, catalog, openSettings, openFile, openReference, openChanges, embedded = false, embeddedPrompt, actionsOnly = false, hidePendingActions = false, refreshRun, selectedInput, onOpenInput }: {
  onOptionsChange?(options:ComposerOptions):void;
  pendingInPanel?:boolean;
  autoOpenPending?:boolean;
  reworkMode?:boolean;
  onFollowingChange(following:boolean):void;
  embedded?:boolean;
  actionsOnly?:boolean;
  hidePendingActions?:boolean;
  refreshRun?():void;
  selectedInput?:{id:string;key:number};
  onOpenInput?(id:string):void;
  embeddedPrompt?:string;
  openChanges(changes:import('./types').TurnFileChanges):void;
  visible?:boolean;
  floatingHost?:HTMLElement|null;
  openReference?(path:string):void;
  openFile?(file: import('./types').DeliveredFile): void;
  run: AgentRun; send(prompt: string,options:ComposerOptions): Promise<void>; catalog:ProviderCatalog;openSettings(section:string):void; stop(): void;
  approve(id: string, decision: 'accept' | 'decline'): Promise<void>; submitting: boolean;
}) {
  const language=useLanguage();
  const [options,setOptions]=useState<ComposerOptions>({providerId:run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id,model:run.model,permission:run.permission||'default'});
  useEffect(()=>{onOptionsChange?.(options);},[options,onOptionsChange]);
  const [prompt, setPrompt] = useState(''); const [pending,setPending]=useState<{id:string;decision:'accept'|'decline'}|null>(null);
  const approvalLock=useRef(false);const [approvalError,setApprovalError]=useState<{id:string;message:string}|null>(null);
  const [recentOpen,setRecentOpen]=useState(false),[pendingOpen,setPendingOpen]=useState(false);
  const [sendError,setSendError]=useState('');
  const [referenceError,setReferenceError]=useState('');
  const openReferenceFile=useCallback((href:string)=>{
    setReferenceError('');
    if(openReference){openReference(href);return;}
    let path=href.split('#')[0];try{path=decodeURIComponent(path);}catch{}
    if(window.desktop?.projectFiles)void window.desktop.projectFiles.open({runId:run.id,path}).catch(error=>setReferenceError((error as Error).message));
  },[openReference,run.id]);
  const scroll = useRef<HTMLDivElement>(null);
  const {scrollToEnd,scrollToMessage}=useMessageScroller();
  const following=useRef(true);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const savedTop=useRef(0);
  const active = isRunning(run);
  const currentProviderId=run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id;
  const modelPending=active&&(options.model!==run.model||options.providerId!==currentProviderId);
  const [older,setOlder]=useState<AgentRun|null>(null);
  const [loadingHistory,setLoadingHistory]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const merged=useMemo(()=>older?{...run,
    taskApps:mergeHistory(older.taskApps,run.taskApps,a=>a.id),
    fileChanges:mergeHistory(older.fileChanges,run.fileChanges,a=>a.turnKey),
    messages:mergeHistory(older.messages,run.messages,a=>a.id),
    tools:mergeHistory(older.tools,run.tools,a=>a.id),
    plans:mergeHistory(older.plans,run.plans,a=>a.turnKey),
    artifacts:mergeHistory(older.artifacts,run.artifacts,a=>a.id),
  }:run,[run,older]);
  const turns = useMemo(()=>conversationTurns(merged),[merged]);
  const forms=useTaskForms(run.id);
  const formsByTurn=useMemo(()=>groupByTurn(forms),[forms]);
  const appsByTurn=useMemo(()=>groupByTurn(merged.taskApps),[merged.taskApps]);
  const before=older?older.historyBefore:run.historyBefore;
  const loadOlder=async()=>{
   if(!before||!window.desktop?.getRunPage||loadingHistory)return;
   setLoadingHistory(true);setHistoryError('');
   try{const page=await window.desktop.getRunPage({id:run.id,before});setOlder(previous=>previous?{...page,taskApps:[...(page.taskApps||[]),...(previous.taskApps||[])],fileChanges:[...(page.fileChanges||[]),...(previous.fileChanges||[])],messages:[...page.messages,...previous.messages],tools:[...page.tools,...previous.tools],plans:[...(page.plans||[]),...(previous.plans||[])],artifacts:[...(page.artifacts||[]),...(previous.artifacts||[])]}:page);}catch(e){setHistoryError((e as Error).message);}finally{setLoadingHistory(false);}
  };
  const trackScroll = () => {
    const el=scroll.current;
    if(!visibleRef.current||!el?.clientHeight)return;
    savedTop.current=el.scrollTop;
    following.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;
    onFollowingChange(following.current);
  };
  const jumpTurn=(id:string)=>{scrollToMessage(id,{align:'start',scrollMargin:0,behavior:'instant'});};
  const jump=()=>{if(visibleRef.current)scrollToEnd({behavior:'instant'});};
  useLayoutEffect(()=>{
    if(!visible)return;
    if(following.current)scrollToEnd({behavior:'instant'});
    else if(scroll.current)scroll.current.scrollTop=savedTop.current;
  },[visible,floatingHost,recentOpen,scrollToEnd]);
  const deliveries=useInputDeliveries(run.id);
  const [inputSelection,setInputSelection]=useState<{id:string;key:number}>();
  const openInput=useCallback((id:string)=>{setInputSelection({id,key:Date.now()});onOpenInput?.(id);},[onOpenInput]);
  const [selectedInputs,setSelectedInputs]=useState<string[]>([]),[inputSending,setInputSending]=useState(false);
  const draftVersion=useRef(0),mutation=useRef<{text:string;id:string}|null>(null);
  const changePrompt=(value:string)=>{draftVersion.current++;setPrompt(value);};
  const inputAPI=window.desktop?.inputs;
  const resumeInputs=async(deliveryIds=selectedInputs)=>{
    if(!inputAPI||!deliveries.snapshot)throw Error(t('暂时无法读取补充消息，请重试'));
    unwrapInputResult(await inputAPI.action({action:'resume',runId:run.id,clientMutationId:crypto.randomUUID(),expectedPolicyGeneration:deliveries.snapshot.policy.generation,deliveryIds}));
    setSelectedInputs([]);await deliveries.refresh();
  };
  const sending=useRef(false);
  const [pendingMessage,setPendingMessage]=useState<{text:string;ids:Set<string>}|null>(null);
  useLayoutEffect(()=>{
    if(!pendingMessage||!visibleRef.current)return;
    // Explicit sending resumes following after the pending bubble is in the DOM.
    following.current=true;onFollowingChange(true);scrollToEnd({behavior:'instant'});
  },[pendingMessage,onFollowingChange,scrollToEnd]);
  const continueSelected=async()=>{if(sending.current||submitting||!selectedInputs.length)return;sending.current=true;setInputSending(true);setSendError('');try{await resumeInputs();}catch(error){setSendError((error as Error).message);await deliveries.refresh();}finally{sending.current=false;setInputSending(false);}};
  const submit = async () => {
    if((!prompt.trim()&&!options.selectedSkillIds?.length)||submitting||sending.current||run.status==='stopping'||run.archivedAt)return;
    if(active&&!inputAPI)return;
    const supplemental=!!inputAPI&&(active||mutation.current?.text===prompt);
    if(supplemental&&(options.attachments?.length||options.selectedSkillIds?.length)){setSendError(t('补充消息暂只支持文字，请移除附件和技能后发送'));return;}
    if(inputAPI&&(!deliveries.snapshot||deliveries.error)){setSendError(t('暂时无法读取补充消息，请重试'));return;}
    sending.current=true;setInputSending(true);const text=prompt,version=draftVersion.current;
    setPendingMessage({text,ids:new Set(run.messages.map(message=>message.id))});setPrompt('');
    try{
      setSendError('');
      if(supplemental){
        if(deliveries.snapshot?.policy.paused)await resumeInputs();
        if(!mutation.current||mutation.current.text!==text)mutation.current={text,id:crypto.randomUUID()};
        await inputAPI!.append({runId:run.id,clientMutationId:mutation.current.id,text});mutation.current=null;
      }else {
        // Stop ends the old turn. A new prompt must carry the selected model and
        // provider through startRun, not restart the old model via the input outbox.
        if(deliveries.snapshot?.policy.paused)await resumeInputs([]);
        await send(text,options);
      }
      // The submitted draft was cleared immediately; preserve any new typing.
      if(!supplemental)setOptions(current=>({...current,attachments:[],selectedSkillIds:[],confirmProviderChange:false}));
      jump();
    }catch(error){setPrompt(current=>draftVersion.current===version?text:[text,current].filter(Boolean).join('\n\n'));setSendError((error as Error).message);}finally{setPendingMessage(null);sending.current=false;setInputSending(false);void deliveries.refresh();}
  };
  const [requestOutcome,setRequestOutcome]=useState<{key:string;label:string}|null>(null);
  const decide = async (id:string,decision:'accept'|'decline')=>{if(approvalLock.current)return;approvalLock.current=true;setPending({id,decision});setApprovalError(null);try{await approve(id,decision);const fileChange=run.approvals.find(a=>a.id===id)?.method.includes('fileChange');setRequestOutcome({key:'approval:'+id,label:decision==='decline'?'已拒绝本次请求':fileChange?'已批准本次文件修改':'已批准本次命令'});}catch(e){setApprovalError({id,message:(e as Error).message});}finally{approvalLock.current=false;setPending(null);}};
  // Temporary status belongs inside a turn, not in the scroller's direct-child
  // anchor list. Replacing a pending item with a real turn at the same count
  // makes the scroller rediscover a historical anchor and jump backwards.
  const statusContent=<>
          {(deliveries.snapshot?.requests||[]).filter(r=>!r.turnKey&&turns.length>1&&!turns.some(candidate=>candidate.user.timing?.startedAt&&candidate.user.timing.startedAt<=r.createdAt)).map(r=><div key={r.id}><p className="text-xs text-muted-foreground">{t('早期补充记录')}</p><PersistentInputRecord request={r} deliveries={deliveries.snapshot?.deliveries||[]} onOpen={openInput}/></div>)}
          {pendingMessage&&!run.messages.some(message=>message.role==='user'&&!pendingMessage.ids.has(message.id))&&<PendingMessage text={pendingMessage.text}/>}
          {referenceError&&<div role="alert" className="error-banner">{referenceError}</div>}
          {run.error && <div className="error-banner" role="alert">{run.retrying&&<strong>{t('连接出现问题，正在重试')} · </strong>}{t(run.error)}{['failed','interrupted'].includes(run.status)&&<div className="settings-actions">{run.status==='failed'&&<Button type="button" variant="outline" onClick={()=>openSettings('providers')}>{t('检查模型服务')}</Button>}<RunDiagnosticsButton runId={run.id}/><Button type="button" variant="outline" onClick={()=>{setPrompt(t('请核实当前任务已完成的操作，并从未完成的步骤继续。'));jump();}}>{t('准备继续任务')}</Button></div>}</div>}
  </>;
  // Draft edits must not rebuild rich history or retained tool panels.
  const renderedTurns=useMemo(()=>new Map(turns.map(turn=>[turn.user.id,<><VirtualBlock preserveState enabled={turns.length>30&&!turn.active}><>{turn.user.modelChange&&<div className="turn-duration">{t("已切换模型：")}{turn.user.modelChange}</div>}</><UserMessage context={<SkillTags snapshots={turn.user.skills}/>} text={(deliveries.snapshot?.requests||[]).some(r=>r.deliveryId&&r.deliveryId===turn.user.formSubmissionId)?t('已提交补充信息'):turn.user.text}/>
            <TurnProgress allRequests={deliveries.snapshot?.requests||[]} requests={(deliveries.snapshot?.requests||[]).filter(r=>r.turnKey?r.turnKey===turn.user.id:turns.length===1||turn===turns.filter(candidate=>candidate.user.timing?.startedAt&&candidate.user.timing.startedAt<=r.createdAt).at(-1))} deliveries={deliveries.snapshot?.deliveries||[]} nativePending={(run.questions||[]).map(q=>q.id)} onOpenInput={openInput} paused={run.status==='waiting'||!!run.queued} onToggle={()=>{following.current=false;onFollowingChange(false);}} turn={turn} status={runStatus[run.status]} duration={turn.user.timing?.outcome&&!turn.active?<Duration timing={turn.user.timing}/>:null}/>
            {turn.final&&<Message role="article" aria-label={t("助手消息")}><MessageContent><Markdown text={turn.final.text||'…'} onFileLink={openReference||window.desktop?.projectFiles?openReferenceFile:undefined}/></MessageContent></Message>}
            <TaskForms flows={formsByTurn.get(turn.user.id)||[]} archived={!!run.archivedAt}/>
            {(appsByTurn.get(turn.user.id)||[]).map(app=><TaskAppCard key={app.id} app={app} runId={run.id} visible={visible&&!floatingHost} archived={!!run.archivedAt}/>)}
            <TurnFiles run={merged} turnKey={turn.user.id} openFile={openFile} openReference={openReference||window.desktop?.projectFiles?openReferenceFile:undefined} openChanges={openChanges}/>{!turn.active&&<TurnActions turn={turn} runId={run.id}/>}</VirtualBlock></>])),[turns,deliveries.snapshot,run.questions,run.status,run.queued,run.archivedAt,run.id,merged,formsByTurn,appsByTurn,visible,floatingHost,openInput,onFollowingChange,openReference,openReferenceFile,openFile,openChanges,language]);
  const renderTurn=(turn:typeof turns[number])=>renderedTurns.get(turn.user.id);
  const requestKeys=[...run.approvals.map(r=>'approval:'+r.id),...(run.questions||[]).map(r=>'question:'+r.id),...(deliveries.snapshot?.requests||[]).filter(r=>r.state==='pending').map(r=>'input:'+r.id)];
  const pendingCount=requestKeys.length;
  const [selectedRequest,setSelectedRequest]=useState<string|null>(null);
  const dismissedRequests=useRef(false);
  const currentRequest=selectedRequest||requestKeys[0];
  const requestActive=requestKeys.includes(currentRequest);
  const selectedApprovals=pendingInPanel?run.approvals.filter(r=>'approval:'+r.id===currentRequest):run.approvals;
  const requestRun=pendingInPanel?{...run,questions:(run.questions||[]).filter(r=>'question:'+r.id===currentRequest)}:run;
  const selectedRequests=pendingInPanel?(deliveries.snapshot?.requests||[]).filter(r=>'input:'+r.id===currentRequest):deliveries.snapshot?.requests||[];
  const previousRequests=useRef(new Set<string>());
  const requestSignature=JSON.stringify(requestKeys);
  useEffect(()=>{
    const keys=JSON.parse(requestSignature) as string[];
    const newBatch=keys.length>0&&!keys.some(key=>previousRequests.current.has(key));
    previousRequests.current=new Set(keys);
    if(!keys.length){setSelectedRequest(null);setPendingOpen(false);dismissedRequests.current=false;return;}
    // A genuinely new batch must not inherit the completed request or dismissal.
    // Existing queued requests still require an explicit next-item action.
    if(newBatch){setSelectedRequest(keys[0]);dismissedRequests.current=false;}
    if(autoOpenPending&&visible&&!hidePendingActions&&!run.archivedAt&&!dismissedRequests.current)setPendingOpen(true);
  },[autoOpenPending,visible,hidePendingActions,run.archivedAt,requestSignature]);
  const toggleRequests=(open:boolean)=>{setPendingOpen(open);if(!open)dismissedRequests.current=true;};
  const outboxPanel=<InputDeliveryPanel snapshot={deliveries.snapshot} hasUnansweredQuestion={!!run.questions?.length||!!interruptedQuestion(run.messages)} error={deliveries.error} selected={selectedInputs} onSelected={setSelectedInputs} onContinue={()=>void continueSelected()} busy={inputSending||submitting||run.status==='stopping'} onRefresh={()=>void deliveries.refresh()}/>;
  const pendingActions=<>      <SupplementalInputDock compact={pendingInPanel} run={requestRun} requests={selectedRequests} policy={deliveries.snapshot?.policy} refresh={deliveries.refresh} selection={selectedInput||inputSelection}/>
      {selectedApprovals.length > 0 && <div className={`flex min-w-0 flex-col gap-2 ${!pendingInPanel&&selectedApprovals.length>1?'max-h-[40vh] overflow-auto':''}`} aria-label={t("待处理授权")}><div className="sr-only" role="status">{t("待处理授权 ·")}{selectedApprovals.length}</div>{selectedApprovals.map(approval => <ApprovalCard key={approval.id} approval={approval} disabled={!!pending} pending={pending?.id===approval.id?pending.decision:undefined} error={approvalError?.id===approval.id?approvalError.message:undefined} decide={decision => void decide(approval.id,decision)} />)}{run.tools.filter(tool=>tool.type==='fileChange').length > 0 && <details className="p-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words"><summary>{t("文件变更记录")}</summary>{run.tools.filter(tool=>tool.type==='fileChange').map(tool=><pre key={tool.id}>{tool.detail}</pre>)}</details>}</div>}
      {!pendingInPanel&&outboxPanel}</>;
  const nextRequestKey=requestKeys[0];
  const nextApproval=run.approvals.find(r=>'approval:'+r.id===nextRequestKey);
  const nextQuestion=run.questions?.find(r=>'question:'+r.id===nextRequestKey);
  const nextInput=deliveries.snapshot?.requests?.find(r=>'input:'+r.id===nextRequestKey);
  let nextSummary=nextQuestion?.questions[0]?.question||nextInput?.template.title||'';
  if(nextApproval){try{const detail=JSON.parse(nextApproval.detail);nextSummary=[detail.command,detail.path,detail.filePath,detail.reason].find(value=>typeof value==='string'&&value.trim())||t('查看请求详情');}catch{nextSummary=t('查看请求详情');}}
  const nextType=nextApproval?t(nextApproval.method.includes('fileChange')?'文件修改':'终端操作'):t('待补充信息');
  const pendingSurface=pendingInPanel?<TaskRequestSurface title={requestActive?(currentRequest?.startsWith('approval:')?t('待处理授权'):t('待补充信息')):undefined} open={pendingOpen} onOpenChange={toggleRequests} count={pendingCount} floating={!actionsOnly&&!embedded} visible={visible&&!hidePendingActions}>
    {outboxPanel}
    {requestActive?pendingActions:<div className="flex min-w-0 flex-col gap-3 px-2 pb-2">
      <p className="m-0 text-sm text-muted-foreground" role="status">{t(requestOutcome&&requestOutcome.key===currentRequest?requestOutcome.label:'当前请求已处理')}</p>
      {pendingCount>0&&<section aria-label={t('下一项请求')} className="flex min-w-0 flex-col items-start gap-2">
        <p className="m-0 line-clamp-2 text-xs text-muted-foreground">{run.title} · {nextType}</p>
        <p className="m-0 line-clamp-3 max-w-full whitespace-pre-wrap break-all text-sm">{nextSummary}</p>
        <Button variant="outline" size="sm" onClick={()=>setSelectedRequest(nextRequestKey)}>{t('审核此项')}</Button>
      </section>}
    </div>}
    {requestActive&&pendingCount>1&&<div className="flex justify-end p-2"><Button variant="outline" onClick={()=>{const next=requestKeys[(requestKeys.indexOf(currentRequest)+1)%requestKeys.length];setSelectedRequest(next);}}>{t('查看下一项')} ({pendingCount})</Button></div>}
  </TaskRequestSurface>:pendingActions;
  if(actionsOnly){
    const hasRequest=!!run.approvals.length||!!run.questions?.length||!!deliveries.snapshot?.requests?.some(r=>r.state==='pending');
    return <section className="wf-run-actions" aria-label={t('需要你处理')}>
      {hasRequest&&<h3>{t(run.approvals.length?'请处理下方授权，任务将继续':'请在下方补充信息')}</h3>}
      {pendingSurface}
      {sendError&&<p className="error-banner" role="alert">{sendError}</p>}
      {run.status==='waiting'&&!hasRequest&&!deliveries.error&&<div role="status"><p>{t('正在等待操作，但尚未读取到具体请求。可以刷新或打开完整任务查看。')}</p><div className="settings-actions"><Button variant="outline" onClick={()=>{void deliveries.refresh();refreshRun?.();}}>{t('刷新待处理请求')}</Button><Button variant="ghost" onClick={()=>openSettings('task')}>{t('打开完整任务')}</Button></div></div>}
    </section>;
  }
  if(embedded)return <div className="discussion-expert-transcript" data-run-id={run.id}>
    {before&&<Button variant="outline" disabled={loadingHistory} onClick={()=>void loadOlder()}>{t(loadingHistory?'正在加载…':'加载更早的对话')}</Button>}{historyError&&<p role="alert">{historyError}</p>}
    {turns.map((turn,index)=><div className="conversation-turn" key={turn.user.id} data-embedded-first={index===0&&!before&&turn.user.text===embeddedPrompt||undefined}>{renderTurn(turn)}{turn===turns.at(-1)&&statusContent}</div>)}
    {!turns.length&&statusContent}
    {active&&run.approvals.length===0&&<RunActivity pendingInput={!!deliveries.snapshot?.requests?.some(r=>r.state==='pending')} run={run} turn={turns.at(-1)} visible={visible} compact/>}
    {!hidePendingActions&&pendingSurface}
  </div>;
  const view=<div className={`conversation-page${floatingHost?' file-chat-floating':''}${recentOpen?' recent-open':''}`}>
    {floatingHost&&<button className="file-chat-toggle" aria-label={t(recentOpen?'收起最近对话':'展开最近对话')} title={t(recentOpen?'收起最近对话':'展开最近对话')} aria-expanded={recentOpen} onClick={()=>{setRecentOpen(value=>!value);following.current=true;}}><span>{t(active?'进行中的对话':'最近对话')} · {run.title}</span><ChevronUp size={16} aria-hidden="true"/></button>}
    <div className="conversation-body" inert={!!floatingHost&&!recentOpen} aria-hidden={floatingHost&&!recentOpen?true:undefined}>
      <ScrollerNavigation offset={older?.turnOffset??run.turnOffset??0} turns={turns} jump={jumpTurn}/>
      <MessageScroller className="min-w-0 flex-1">
        {/* Keep utility controls outside the message list so prepend anchoring tracks turns. */}
        {(before||historyError)&&<div className="conversation-content w-full shrink-0 py-2 my-0">
          {before&&<div><Button variant="outline" disabled={loadingHistory} onClick={()=>void loadOlder()}>{t(loadingHistory?'正在加载…':'加载更早的对话')}</Button></div>}{historyError&&<p role="alert">{historyError}</p>}
        </div>}
        <MessageScrollerViewport className="conversation-scroll" aria-label={t('任务消息')} ref={scroll} onScroll={trackScroll}>
        <MessageScrollerContent className="conversation-content w-full gap-0 pt-[14px]" aria-busy={active}>
          {(floatingHost?turns.slice(-3):turns).map(turn => <MessageScrollerItem scrollAnchor messageId={turn.user.id} className="conversation-turn [content-visibility:visible]" key={turn.user.id} data-turn-id={turn.user.id} aria-label={`对话：${turn.user.text.slice(0,60)}`}>
            {renderTurn(turn)}
            {turn===turns.at(-1)&&statusContent}
          </MessageScrollerItem>)}
          {!turns.length&&<MessageScrollerItem messageId="conversation-status" className="[content-visibility:visible]">{statusContent}</MessageScrollerItem>}
        </MessageScrollerContent>
      </MessageScrollerViewport><MessageScrollerButton aria-label={t("回到最新消息")} behavior="instant"/></MessageScroller>
    </div>
    <div className="conversation-dock">
      {pendingInPanel&&pendingSurface}
      {sendError&&<p className="error-banner" role="alert">{sendError}</p>}
      {active&&run.approvals.length===0&&<RunActivity pendingInput={!!deliveries.snapshot?.requests?.some(r=>r.state==='pending')} run={run} turn={turns.at(-1)} visible={visible} compact={!floatingHost||recentOpen}/>}
      <CreationGuide hasPendingInput={!!run.questions?.length||!!deliveries.snapshot?.requests?.some(r=>r.state==='pending')} run={run} active={active||submitting} openSettings={openSettings} onPrompt={(text,skillId)=>{changePrompt(prompt.trim()?prompt+'\n\n'+text:text);setOptions(current=>({...current,selectedSkillIds:skillId?[skillId]:[]}));}}/>
      {!pendingInPanel&&pendingSurface}
      {modelPending&&<p className="m-0 px-3.5 text-xs text-muted-foreground" role="status">{t('所选模型将在下一轮生效；本轮及补充消息仍使用：')}{run.model}</p>}
      <ChatComposer attachments={<ComposerAttachments value={options} onChange={setOptions} disabled={active||submitting||inputSending}/>} selectedSkillIds={options.selectedSkillIds} onSelectSkill={id=>setOptions(current=>({...current,selectedSkillIds:[...new Set([...(current.selectedSkillIds||[]),id])].slice(0,20)}))} followup keepEditable allowActiveSend={!!inputAPI} showSendLabel={!!deliveries.snapshot?.policy.paused} value={prompt} onChange={changePrompt} onSubmit={()=>void submit()} disabled={submitting||inputSending} sending={submitting||inputSending}
        label={reworkMode?t('修改要求'):t('继续对话')} placeholder={reworkMode?t('说明需要修改的内容，提交后重新执行并验收'):run.approvals.length?t('请先处理上方授权…'):t('继续这个任务…')}
        active={active} stopping={run.status==='stopping'} onStop={stop}
        canSend={run.status!=='stopping'&&!run.archivedAt&&(!!prompt.trim()||!!options.selectedSkillIds?.length)} sendLabel={reworkMode?t('提交修改要求'):t(deliveries.snapshot?.policy.paused?'发送并继续':active?'发送补充':'发送后续消息')}
        skills={<SkillTags ids={options.selectedSkillIds} disabled={active||submitting||inputSending} onRemove={id=>setOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/>}
        controls={<ComposerControls catalog={catalog} value={options} onChange={setOptions} disabled={reworkMode||active||submitting||inputSending||!!run.archivedAt} modelDisabled={submitting||inputSending||run.status==='stopping'||!!run.archivedAt} modelPending={modelPending} previousBaseUrl={run.baseUrl} previousProviderId={run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id} openSettings={openSettings}/>}/>

    </div>
  </div>;
  return floatingHost?createPortal(view,floatingHost):view;
}

function ScrollerNavigation({turns,offset,jump}:Omit<ComponentProps<typeof TurnNavigation>,'selected'>){
 const {currentAnchorId}=useMessageScrollerVisibility();
 return <TurnNavigation turns={turns} offset={offset} selected={currentAnchorId||turns[0]?.user.id||''} jump={jump}/>;
}
export default function Conversation(props:Omit<ComponentProps<typeof ConversationBody>,'onFollowingChange'>){
 const [following,setFollowing]=useState(true);
 return <MessageScrollerProvider autoScroll={props.visible!==false&&following} defaultScrollPosition="end" scrollEdgeThreshold={60} scrollPreviousItemPeek={14}><ConversationBody {...props} onFollowingChange={setFollowing}/></MessageScrollerProvider>;
}
