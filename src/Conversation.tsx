import {Alert,AlertDescription} from './components/ui/alert';
import {readReading,saveReading} from './conversation-view-state';
import {useComposerReceipt} from './useComposerReceipt';
import {useDraftState,restoreComposerOptions} from './useDraftState';
import MessageBody from './MessageBody';
import {ProcessDisclosureScope} from './process-disclosure';
import {RunDetailsContext} from './ToolText';
import {InvestigationDetails} from './Investigation';
import {useExpertChat,ExpertRecipient,ExpertTranscript} from './ExpertChat';
import {isConversationMessage,isCompletedPlan} from './conversation-message';
import RunDiagnosticsButton from './RunDiagnosticsButton';
import RenderErrorBoundary from './RenderErrorBoundary';
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
import {createPortal,flushSync} from 'react-dom';
import VirtualBlock from './VirtualBlock';
import {turnGap,useTurnWindow} from './useTurnWindow';
import {captureTurnScrollAnchor,restoreTurnScrollAnchor} from './turn-scroll-anchor';
import SupplementalInputDock from './SupplementalInputDock';
import {PersistentInputRecord} from './InputProcessRecord';
import { t, useLanguage } from './i18n';
import { Component, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { ChevronUp } from 'lucide-react';
import SkillTags from './SkillTags';
import ModelStatus from './ModelStatus';
import PermissionStatus from './PermissionStatus';
import ComposerControls, {type ComposerOptions} from './ComposerControls';
import type { ProviderCatalog, AgentRun, TurnTiming } from './types';
import Markdown from './Markdown';
import TurnActions from './TurnActions';
import { conversationTurns, type ConversationTurn } from './conversation-turns';
import {TurnProgress} from './ProcessPanel';
import TurnFiles from './TurnFiles';
import TurnNavigation from './TurnNavigation';
import TaskForms, {useTaskForms} from './TaskForms';
import {mergeHistory,groupByTurn,retainRunHistory} from './conversation-data';
import ChatComposer from './ChatComposer';
import {CreationGuide} from './CreationGuide';
import InputDeliveryPanel,{useInputDeliveries} from './InputDeliveryPanel';
import {interruptedQuestion} from '../core/inputs/interrupted-question.mjs';
import TaskAppCard from './TaskAppCard';

import {isRunning,runStatus} from './run-status';
export {isRunning,runStatus} from './run-status';
function Duration({ timing }: { timing: TurnTiming }) {
  if (!timing.outcome) return null;
  const seconds = typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs) ? Math.max(0, Math.floor(timing.durationMs / 1000)) : null;
  return <TraceDescription className="trace-duration inline-flex items-center gap-2"><span>{seconds === null ? t("用时未完整记录") : <>{t("用时")} {Math.floor(seconds / 60)} {t("分")} {seconds % 60} {t("秒")}</>}{timing.outcome === 'failed' ? t(" · 执行失败") : timing.outcome === 'interrupted' ? t(" · 已中断") : ''}</span></TraceDescription>;
}
function ConversationBody({ onOptionsChange,autoOpenPending=true,inputsInPanel=false,reworkMode=false,onFollowingChange, visible = true, floatingHost, run, send, stop, approve, submitting, catalog, openSettings, openFile, openReference, openChanges, embedded = false, embeddedPrompt, actionsOnly = false, hidePendingActions = false, refreshRun, selectedInput, onOpenInput }: {
  onOptionsChange?(options:ComposerOptions):void;
  autoOpenPending?:boolean;
  // Form placement varies by host; approval review always uses the shared surface.
  inputsInPanel?:boolean;
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
  const [options,setOptions,optionsStorageError]=useDraftState<ComposerOptions>('run:'+run.id+':options',{providerId:run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id,model:run.model,permission:run.permission||'default'},restoreComposerOptions);
  useEffect(()=>{onOptionsChange?.(options);},[options,onOptionsChange]);
  const [prompt, setPrompt, draftStorageError] = useDraftState('run:'+run.id+':text',''); const [pending,setPending]=useState<{id:string;decision:'accept'|'decline'}|null>(null);
  const receipt=useComposerReceipt('run:'+run.id,r=>{setPrompt(current=>current===r.text?current:[r.text,current].filter(Boolean).join('\n\n'));setOptions(current=>({...current,attachments:[...(r.options.attachments||[]),...(current.attachments||[])].filter((f,i,a)=>a.findIndex(x=>x.path===f.path)===i),selectedSkillIds:[...new Set([...(r.options.selectedSkillIds||[]),...(current.selectedSkillIds||[])])]}));},(_,r)=>{if(r)setOptions(current=>({...current,attachments:current.attachments?.filter(f=>!r.options.attachments?.some(sent=>sent.path===f.path)),selectedSkillIds:current.selectedSkillIds?.filter(id=>!r.options.selectedSkillIds?.includes(id))}));});
  const approvalLock=useRef(false);const [approvalError,setApprovalError]=useState<{id:string;message:string}|null>(null);
  const [recentOpen,setRecentOpen]=useState(false),[pendingOpen,setPendingOpen]=useState(false);
  const [modelBusy,setModelBusy]=useState(false);
  useEffect(()=>{setOptions(current=>({...current,model:run.model,providerId:run.providerId||current.providerId}));},[run.id,run.model,run.providerId]);
  const changeModel=async(next:ComposerOptions)=>{if(modelBusy)return;setModelBusy(true);try{const result=await window.desktop!.switchRunModel!({runId:run.id,providerId:next.providerId!,model:next.model!,confirmProviderChange:next.confirmProviderChange});if(result.state==='failed')return;if(!['applied','configured'].includes(result.state))throw Error(result.error||'模型未确认生效');setOptions(current=>({...current,model:next.model,providerId:next.providerId}));}finally{setModelBusy(false);}};
  const [permissionBusy,setPermissionBusy]=useState(false);
  useEffect(()=>{setOptions(current=>({...current,permission:run.permission||'default'}));},[run.id,run.permission]);
  const changePermission=async(permission:'default'|'full')=>{if(permissionBusy)return;setPermissionBusy(true);try{const result=await window.desktop!.switchRunPermission!({runId:run.id,permission,confirmed:permission==='full'});if(result.state!=='applied')throw Error(result.error||'权限未确认生效');setOptions(current=>({...current,permission}));}finally{setPermissionBusy(false);}};
  const [sendError,setSendError]=useState('');
  const [referenceError,setReferenceError]=useState('');
  const openReferenceFile=useCallback((href:string)=>{
    setReferenceError('');
    if(openReference){openReference(href);return;}
    let path=href.split('#')[0];try{path=decodeURIComponent(path);}catch{}
    if(window.desktop?.projectFiles)void window.desktop.projectFiles.open({runId:run.id,path}).catch(error=>setReferenceError((error as Error).message));
  },[openReference,run.id]);
  const scroll = useRef<HTMLDivElement>(null);
  const {scrollToEnd,scrollToMessage,scrollToStart}=useMessageScroller();
  const readingRecovery=useRef(readReading(run.id));
  const following=useRef(readingRecovery.current?.following!==false);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const savedTop=useRef(readingRecovery.current?.top||0);
  const active = isRunning(run);
  const currentProviderId=run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id;
  const modelPending=active&&!window.desktop?.switchRunModel&&(options.model!==run.model||options.providerId!==currentProviderId);
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
  const previousTurns=useRef(new Map<string,ConversationTurn>());
  const turns = useMemo(()=>{
   const next=actionsOnly?[]:conversationTurns(merged);
   const retained=next.map(turn=>{const previous=previousTurns.current.get(turn.user.id);return previous&&sameTurn(previous,turn)?previous:turn;});
   previousTurns.current=new Map(retained.map(turn=>[turn.user.id,turn]));return retained;
  },[merged,actionsOnly]);
  const turnIds=useMemo(()=>turns.map(turn=>turn.user.id),[turns]);
  const windowed=!floatingHost&&turns.length>24;
  const windowRef=useRef<TurnWindowHandle|null>(null);
  const [selection]=useState(createTurnSelection);
  const forms=useTaskForms(run.id);
  const formsByTurn=useMemo(()=>groupByTurn(forms),[forms]);
  const appsByTurn=useMemo(()=>groupByTurn(merged.taskApps),[merged.taskApps]);
  const before=older?older.historyBefore:run.historyBefore;
  const loadOlder=async()=>{
   if(!before||!window.desktop?.getRunPage||loadingHistory)return;
   setLoadingHistory(true);setHistoryError('');
   try{const page=await window.desktop.getRunPage({id:run.id,before});
    if(!following.current&&!readingRecovery.current){
     const anchor=windowed?windowRef.current?.read():undefined;
     readingRecovery.current=anchor?{...anchor,top:scroll.current?.scrollTop||0,following:false}:readReading(run.id);
    }
    setOlder(previous=>previous?{...page,taskApps:[...(page.taskApps||[]),...(previous.taskApps||[])],fileChanges:[...(page.fileChanges||[]),...(previous.fileChanges||[])],messages:[...page.messages,...previous.messages],tools:[...page.tools,...previous.tools],plans:[...(page.plans||[]),...(previous.plans||[])],artifacts:[...(page.artifacts||[]),...(previous.artifacts||[])]}:page);}catch(e){setHistoryError((e as Error).message);}finally{setLoadingHistory(false);}
  };
  const trackScroll = () => {
    const el=scroll.current;
    if(!visibleRef.current||!el?.clientHeight)return;
    if(windowed)windowRef.current?.sync();
    if(readingRecovery.current)return;
    // A delayed scroll event after content growth must not cancel following.
    if(el.scrollHeight-el.scrollTop-el.clientHeight<60)following.current=true;
    else if(el.scrollTop<savedTop.current)following.current=false;
    savedTop.current=el.scrollTop;
    onFollowingChange(following.current);
    if(following.current){
      const turnId=turns.at(-1)?.user.id;
      if(turnId)saveReading(run.id,{turnId,offset:0,top:el.scrollTop,following:true});
      return;
    }
    if(windowed){
      const anchor=windowRef.current?.read();
      if(anchor)saveReading(run.id,{...anchor,top:el.scrollTop,following:false});
      return;
    }
    const top=el.getBoundingClientRect().top,anchor=[...el.querySelectorAll<HTMLElement>('[data-turn-id]')].find(node=>node.getBoundingClientRect().bottom>top);
    if(anchor)saveReading(run.id,{turnId:anchor.dataset.turnId!,offset:anchor.getBoundingClientRect().top-top,top:el.scrollTop,following:false});
  };
  const trackScrollRef=useRef(trackScroll);trackScrollRef.current=trackScroll;
  const windowChanged=useCallback(()=>trackScrollRef.current(),[]);
  const jumpTurn=(id:string)=>{
    readingRecovery.current=null;following.current=false;onFollowingChange(false);
    if(windowed){
      scrollToStart({behavior:'instant'});
      windowRef.current?.goTo(id,14);
    }else scrollToMessage(id,{align:'start',scrollMargin:0,behavior:'instant'});
  };
  const jump=()=>{if(visibleRef.current)scrollToEnd({behavior:'instant'});};
  useLayoutEffect(()=>{
    if(!visible)return;
    if(following.current)scrollToEnd({behavior:'instant'});
    else if(scroll.current)scroll.current.scrollTop=savedTop.current;
  },[visible,floatingHost,recentOpen,scrollToEnd]);
  useLayoutEffect(()=>{
    const saved=readingRecovery.current;if(!visible||!saved)return;
    if(saved.following){readingRecovery.current=null;return;}
    following.current=false;onFollowingChange(false);
    const element=scroll.current;if(!element)return;
    const anchor=windowed?null:[...element.querySelectorAll<HTMLElement>('[data-turn-id]')].find(node=>node.dataset.turnId===saved.turnId);
    const hasTurn=windowed?turnIds.includes(saved.turnId):!!anchor;
    if(!hasTurn&&before&&!historyError){if(!loadingHistory)void loadOlder();return;}
    let frame=0,cancelled=false,attempts=0;
    const restore=()=>{if(cancelled)return;if(element.hasAttribute('data-pending-scroll')&&attempts++<60){frame=requestAnimationFrame(restore);return;}
      if(!windowed||!windowRef.current?.goTo(saved.turnId,saved.offset)){
        element.scrollTop=anchor?element.scrollTop+anchor.getBoundingClientRect().top-element.getBoundingClientRect().top-saved.offset:saved.top;
      }
      savedTop.current=element.scrollTop;frame=requestAnimationFrame(()=>{
        if(!cancelled){readingRecovery.current=null;savedTop.current=element.scrollTop;}
      });
    };frame=requestAnimationFrame(restore);return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[visible,turnIds,before,loadingHistory,historyError,onFollowingChange,windowed]);
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
  const [pendingMessage,setPendingMessage]=useState<{text:string;attachments?:ComposerOptions["attachments"];ids:Set<string>}|null>(null);
  useLayoutEffect(()=>{
    if(!pendingMessage||!visibleRef.current)return;
    // Explicit sending resumes following after the pending bubble is in the DOM.
    following.current=true;onFollowingChange(true);scrollToEnd({behavior:'instant'});
  },[pendingMessage,onFollowingChange,scrollToEnd]);
  const continueSelected=async()=>{if(sending.current||submitting||!selectedInputs.length)return;sending.current=true;setInputSending(true);setSendError('');try{await resumeInputs();}catch(error){setSendError((error as Error).message);await deliveries.refresh();}finally{sending.current=false;setInputSending(false);}};
  const expertChat=useExpertChat(run.conversationId,run.projectId,visible&&!embedded&&!run.collaboration);
  const submit = async () => {
    if(expertChat.busy)return;
    if(expertChat.selected){if(active||run.archivedAt)return;if(options.attachments?.length||options.selectedSkillIds?.length){setSendError('专家讨论暂只支持文字，请移除附件和技能');return;}const sentText=prompt;const result=await expertChat.submit(sentText);if(result)setPrompt(current=>current===sentText?'':current);return;}
    if((!prompt.trim()&&!options.selectedSkillIds?.length&&!options.attachments?.length)||submitting||sending.current||receipt.pending||run.status==='stopping'||run.archivedAt)return;
    if(active&&!inputAPI)return;
    const supplemental=!!inputAPI&&(active||mutation.current?.text===prompt);
    if(supplemental&&(options.attachments?.length||options.selectedSkillIds?.length)){setSendError(t('补充消息暂只支持文字，请移除附件和技能后发送'));return;}
    if(inputAPI&&(!deliveries.snapshot||deliveries.error)){setSendError(t('暂时无法读取补充消息，请重试'));return;}
    const text=prompt.trim()?prompt:(!options.selectedSkillIds?.length&&options.attachments?.length?t('请查看所附文件。'):prompt);let requestId:string;try{requestId=receipt.begin(text,options,supplemental?'append':'start',run.id);}catch{setSendError(t('草稿暂时无法保存，刷新前请先复制输入内容。'));return;}sending.current=true;setInputSending(true);
    setPendingMessage({text,attachments:options.attachments,ids:new Set(run.messages.map(message=>message.id))});setPrompt('');
    try{
      setSendError('');
      if(supplemental){
        if(deliveries.snapshot?.policy.paused)await resumeInputs();
        mutation.current={text,id:requestId};
        await inputAPI!.append({runId:run.id,clientMutationId:mutation.current.id,text});mutation.current=null;
      }else {
        // Stop ends the old turn. A new prompt must carry the selected model and
        // provider through startRun, not restart the old model via the input outbox.
        if(deliveries.snapshot?.policy.paused)await resumeInputs([]);
        await send(text,{...options,clientMutationId:requestId});
      }
      receipt.accepted();
      // The submitted draft was cleared immediately; preserve any new typing.
      if(!supplemental)setOptions(current=>({...current,attachments:[],selectedSkillIds:[],confirmProviderChange:false}));
      jump();
    }catch(error){await receipt.uncertain();setSendError((error as Error).message);}finally{setPendingMessage(null);sending.current=false;setInputSending(false);void deliveries.refresh();}
  };
  const [requestOutcome,setRequestOutcome]=useState<{key:string;label:string}|null>(null);
  const decide = async (id:string,decision:'accept'|'decline')=>{if(approvalLock.current||!visibleRef.current||run.archivedAt||!isRunning(run)||run.status==='stopping'||!run.approvals.some(a=>a.id===id))return;approvalLock.current=true;setPending({id,decision});setApprovalError(null);try{await approve(id,decision);const fileChange=run.approvals.find(a=>a.id===id)?.method.includes('fileChange');setRequestOutcome({key:'approval:'+id,label:decision==='decline'?'已拒绝本次请求':fileChange?'已批准本次文件修改':'已批准本次命令'});}catch(e){setApprovalError({id,message:(e as Error).message});}finally{approvalLock.current=false;setPending(null);}};
  // Temporary status belongs inside a turn, not in the scroller's direct-child
  // anchor list. Replacing a pending item with a real turn at the same count
  // makes the scroller rediscover a historical anchor and jump backwards.
  // Older installations persisted switch feedback across subsequent turns.
  const latestUser=turns.at(-1)?.user;
  const change=run.modelChange;
  const fromOlderTurn=change?.turnKey ? !!latestUser && change.turnKey!==latestUser.id
    : !!(change?.startedAt && latestUser?.timing?.startedAt && Date.parse(change.startedAt)<Date.parse(latestUser.timing.startedAt));
  const modelChange=fromOlderTurn ? undefined : change;
  const statusContent=<>
          {active&&(run.storageBackpressure||run.queued)&&<p role="status" className="text-sm text-muted-foreground">{t(run.storageBackpressure?'正在保存输出 · 暂缓接收，保存后自动继续':'排队中 · 等待执行名额或工作目录释放')}</p>}
          {(deliveries.snapshot?.requests||[]).filter(r=>!r.turnKey&&turns.length>1&&!turns.some(candidate=>candidate.user.timing?.startedAt&&candidate.user.timing.startedAt<=r.createdAt)).map(r=><div key={r.id}><p className="text-xs text-muted-foreground">{t('早期补充记录')}</p><PersistentInputRecord request={r} deliveries={deliveries.snapshot?.deliveries||[]} onOpen={openInput}/></div>)}
          {pendingMessage&&!run.messages.some(message=>message.role==='user'&&!pendingMessage.ids.has(message.id))&&<PendingMessage attachments={pendingMessage.attachments} text={pendingMessage.text}/>}
          {referenceError&&<Alert variant="destructive"><AlertDescription>{referenceError}</AlertDescription></Alert>}
          {run.error && <Alert variant="destructive"><AlertDescription>{run.retrying&&<strong>{t('连接出现问题，正在重试')} · </strong>}{t(run.error)}{['failed','interrupted'].includes(run.status)&&<div className="settings-actions">{run.status==='failed'&&<Button type="button" variant="outline" onClick={()=>openSettings('providers')}>{t('检查模型服务')}</Button>}<RunDiagnosticsButton runId={run.id}/><Button type="button" variant="outline" onClick={()=>{setPrompt(t('请核实当前任务已完成的操作，并从未完成的步骤继续。'));jump();}}>{t('准备继续任务')}</Button></div>}</AlertDescription></Alert>}
  </>;
  // Draft edits must not rebuild rich history or retained tool panels.
  // The enclosing discussion already renders its prompt. Omit only the matching
  // first prompt; later turns and paged history must retain their user messages.
  const toggleProcess=useCallback(()=>{following.current=false;onFollowingChange(false);},[onFollowingChange]);
  const fileActions=useRef({openFile,openReference:openReference||window.desktop?.projectFiles?openReferenceFile:undefined,openChanges});
  fileActions.current={openFile,openReference:openReference||window.desktop?.projectFiles?openReferenceFile:undefined,openChanges};
  const stableFiles=useMemo(()=>({openFile:(file:import('./types').DeliveredFile)=>fileActions.current.openFile?.(file),openReference:(path:string)=>fileActions.current.openReference?.(path),openChanges:(changes:import('./types').TurnFileChanges)=>fileActions.current.openChanges(changes)}),[]);
  const renderTurn=(turn:ConversationTurn)=>{
   const requests=(deliveries.snapshot?.requests||[]).filter(r=>r.turnKey?r.turnKey===turn.user.id:turns.length===1||turn===turns.filter(candidate=>candidate.user.timing?.startedAt&&candidate.user.timing.startedAt<=r.createdAt).at(-1));
   const flows=formsByTurn.get(turn.user.id)||[],apps=appsByTurn.get(turn.user.id)||[];
   // Overscan keeps row geometry available for scrolling. Rich historical
   // content can wait until it nears the viewport, including inside that window.
   // The latest/live and actionable turns stay measured.
   return <ProcessDisclosureScope storageKey={'run:'+run.id+':turn:'+turn.user.id}><VirtualBlock enabled={windowed&&turn!==turns.at(-1)&&!turn.active&&!requests.some(r=>r.state==='pending')}>
    <TurnTranscript turn={turn} run={{...merged,messages:[],tools:turn.tools,artifacts:turn.artifacts,fileChanges:merged.fileChanges?.filter(batch=>batch.turnKey===turn.user.id)}} requests={requests} allRequests={deliveries.snapshot?.requests||[]} deliveries={deliveries.snapshot?.deliveries||[]} nativePending={(run.questions||[]).map(q=>q.id)} onOpenInput={openInput} onToggle={toggleProcess} paused={turn.active&&(run.status==='waiting'||!!run.queued)} status={turn.active?runStatus[run.status]:''} hidePrompt={!!(embedded&&!before&&turn===turns[0]&&turn.user.text===embeddedPrompt)} language={language} {...stableFiles} openFile={openFile?stableFiles.openFile:undefined} openReference={openReference||window.desktop?.projectFiles?stableFiles.openReference:undefined}/>
   </VirtualBlock><TaskForms flows={flows} archived={!!run.archivedAt}/>{apps.map(app=><TaskAppCard key={app.id} app={app} runId={run.id} visible={visible&&!floatingHost} archived={!!run.archivedAt}/>)}</ProcessDisclosureScope>;
  };
  const actionableApprovals=active&&run.status!=='stopping'&&!run.archivedAt?[...new Map(run.approvals.map(a=>[a.id,a])).values()]:[];
  const requestKeys=[...actionableApprovals.map(r=>'approval:'+r.id),...(inputsInPanel?(run.questions||[]).map(r=>'question:'+r.id):[]),...(inputsInPanel?(deliveries.snapshot?.requests||[]).filter(r=>r.state==='pending').map(r=>'input:'+r.id):[])];
  const pendingCount=requestKeys.length;
  const [selectedRequest,setSelectedRequest]=useState<string|null>(null);
  const dismissedRequests=useRef(false);
  const currentRequest=selectedRequest||requestKeys[0];
  const requestActive=requestKeys.includes(currentRequest);
  const selectedApproval=actionableApprovals.find(r=>'approval:'+r.id===currentRequest);
  const requestRun={...run,questions:(run.questions||[]).filter(r=>'question:'+r.id===currentRequest)};
  const selectedRequests=(deliveries.snapshot?.requests||[]).filter(r=>'input:'+r.id===currentRequest);
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
  const inlineInputs=!inputsInPanel&&<SupplementalInputDock run={run} requests={deliveries.snapshot?.requests||[]} policy={deliveries.snapshot?.policy} refresh={deliveries.refresh} selection={selectedInput||inputSelection}/>;
  const pendingActions=<>
    {inputsInPanel&&<SupplementalInputDock compact run={requestRun} requests={selectedRequests} policy={deliveries.snapshot?.policy} refresh={deliveries.refresh} selection={selectedInput||inputSelection}/>}
    {selectedApproval&&<ApprovalCard key={selectedApproval.id} approval={selectedApproval} disabled={!!pending||!visible||run.status==='stopping'||!!run.archivedAt} pending={pending?.id===selectedApproval.id?pending.decision:undefined} error={approvalError?.id===selectedApproval.id?approvalError.message:undefined} decide={decision=>void decide(selectedApproval.id,decision)}/>}
  </>;
  const nextRequestKey=requestKeys[0];
  const nextApproval=actionableApprovals.find(r=>'approval:'+r.id===nextRequestKey);
  const nextQuestion=run.questions?.find(r=>'question:'+r.id===nextRequestKey);
  const nextInput=deliveries.snapshot?.requests?.find(r=>'input:'+r.id===nextRequestKey);
  let nextSummary=nextQuestion?.questions[0]?.question||nextInput?.template.title||'';
  if(nextApproval){try{const detail=JSON.parse(nextApproval.detail);nextSummary=[detail.command,detail.path,detail.filePath,detail.reason].find(value=>typeof value==='string'&&value.trim())||t('查看请求详情');}catch{nextSummary=t('查看请求详情');}}
  const nextType=nextApproval?t(nextApproval.method.includes('fileChange')?'文件修改':'终端操作'):t('待补充信息');
  const pendingSurface=<TaskRequestSurface title={requestActive?(currentRequest?.startsWith('approval:')?t('待处理授权'):t('待补充信息')):undefined} open={pendingOpen} onOpenChange={toggleRequests} count={pendingCount} floating={!actionsOnly&&!embedded} visible={visible&&!hidePendingActions&&(!floatingHost||recentOpen)}>
    {requestActive?pendingActions:<div className="flex min-w-0 flex-col gap-3 px-2 pb-2">
      <p className="m-0 text-sm text-muted-foreground" role="status">{t(requestOutcome&&requestOutcome.key===currentRequest?requestOutcome.label:'当前请求已处理')}</p>
      {pendingCount>0&&<section aria-label={t('下一项请求')} className="flex min-w-0 flex-col items-start gap-2">
        <p className="m-0 line-clamp-2 text-xs text-muted-foreground">{run.title} · {nextType}</p>
        <p className="m-0 line-clamp-3 max-w-full whitespace-pre-wrap break-all text-sm">{nextSummary}</p>
        <Button variant="outline" size="sm" onClick={()=>setSelectedRequest(nextRequestKey)}>{t('审核此项')}</Button>
      </section>}
    </div>}
    {requestActive&&pendingCount>1&&<div className="flex justify-end p-2"><Button variant="outline" onClick={()=>{const next=requestKeys[(requestKeys.indexOf(currentRequest)+1)%requestKeys.length];setSelectedRequest(next);}}>{t('查看下一项')} ({pendingCount})</Button></div>}
  </TaskRequestSurface>;
  if(actionsOnly){
    const hasRequest=!!run.approvals.length||!!run.questions?.length||!!deliveries.snapshot?.requests?.some(r=>r.state==='pending');
    return <section className="wf-run-actions" aria-label={t('需要你处理')}>
      {hasRequest&&<h3>{t(run.approvals.length?'请处理下方授权，任务将继续':'请在下方补充信息')}</h3>}
      {inlineInputs}{outboxPanel}{pendingSurface}
      {(draftStorageError||optionsStorageError)&&<Alert variant="destructive"><AlertDescription>{t(draftStorageError||optionsStorageError)}</AlertDescription></Alert>}
      {receipt.pending&&<p role="status">{t('正在确认发送结果…')}</p>}
      {sendError&&<Alert variant="destructive"><AlertDescription>{sendError}</AlertDescription></Alert>}
      {run.status==='waiting'&&!hasRequest&&!deliveries.error&&<div role="status"><p>{t('正在等待操作，但尚未读取到具体请求。可以刷新或打开完整任务查看。')}</p><div className="settings-actions"><Button variant="outline" onClick={()=>{void deliveries.refresh();refreshRun?.();}}>{t('刷新待处理请求')}</Button><Button variant="ghost" onClick={()=>openSettings('task')}>{t('打开完整任务')}</Button></div></div>}
    </section>;
  }
  if(embedded)return <div className="discussion-expert-transcript" data-run-id={run.id}>
    <PermissionStatus value={run.permissionChange}/><ModelStatus value={modelChange}/>
    {before&&<Button variant="outline" disabled={loadingHistory} onClick={()=>void loadOlder()}>{t(loadingHistory?'正在加载…':'加载更早的对话')}</Button>}{historyError&&<Alert variant="destructive"><AlertDescription>{historyError}</AlertDescription></Alert>}
    {turns.map(turn=><div className="conversation-turn" key={turn.user.id}>{renderTurn(turn)}{turn===turns.at(-1)&&statusContent}</div>)}
    {!turns.length&&statusContent}

    {!hidePendingActions&&<>{inlineInputs}{outboxPanel}{pendingSurface}</>}
  </div>;
  const view=<div className={`conversation-page${floatingHost?' file-chat-floating':''}${recentOpen?' recent-open':''}`}>
    {floatingHost&&<Button variant="ghost" className="file-chat-toggle" aria-label={t(recentOpen?'收起最近对话':'展开最近对话')} title={t(recentOpen?'收起最近对话':'展开最近对话')} aria-expanded={recentOpen} onClick={()=>{setRecentOpen(value=>!value);following.current=true;}}><span>{t(active?'进行中的对话':'最近对话')} · {run.title}</span><ChevronUp data-icon="inline-end" aria-hidden="true"/></Button>}
    <div className="conversation-body" inert={!!floatingHost&&!recentOpen} aria-hidden={floatingHost&&!recentOpen?true:undefined}>
      {windowed?<WindowedNavigation offset={older?.turnOffset??run.turnOffset??0} turns={turns} selection={selection} jump={jumpTurn}/>:<ScrollerNavigation offset={older?.turnOffset??run.turnOffset??0} turns={turns} jump={jumpTurn}/>}
      <MessageScroller className="min-w-0 flex-1">
        {/* Keep utility controls outside the message list so prepend anchoring tracks turns. */}
        {(before||historyError)&&<div className="conversation-content w-full shrink-0 py-2 my-0">
          {before&&<div><Button variant="outline" disabled={loadingHistory} onClick={()=>void loadOlder()}>{t(loadingHistory?'正在加载…':'加载更早的对话')}</Button></div>}{historyError&&<Alert variant="destructive"><AlertDescription>{historyError}</AlertDescription></Alert>}
        </div>}
        <MessageScrollerViewport className="conversation-scroll" aria-label={t('任务消息')} ref={scroll} onScroll={trackScroll} preserveScrollOnPrepend={!windowed} data-turn-window={windowed?'':undefined} style={windowed?{overflowAnchor:'none'}:undefined}>
        {/* Bound anchor jumps to real content. The primitive's optional spacer would
            otherwise keep short/folded final turns pinned above a blank viewport. */}
        <MessageScrollerContent spacerClassName="hidden" className="conversation-content w-full gap-0 pt-[14px]" aria-busy={active}>
          {windowed?<WindowedTurns handle={windowRef} viewport={scroll} ids={turnIds} turns={turns} visible={visible} selection={selection} onRangeChange={windowChanged} renderTurn={renderTurn} status={statusContent}/>:(floatingHost?turns.slice(-3):turns).map(turn => <ConversationScrollItem following={following.current} messageId={turn.user.id} className="conversation-turn [content-visibility:visible]" key={turn.user.id} data-turn-id={turn.user.id} aria-label={`对话：${turn.user.text.slice(0,60)}`}>
            {renderTurn(turn)}
            {turn===turns.at(-1)&&statusContent}
          </ConversationScrollItem>)}
          {!turns.length&&<MessageScrollerItem messageId="conversation-status" className="[content-visibility:visible]">{statusContent}</MessageScrollerItem>}
          {(!!expertChat.state?.turns.length||!!expertChat.error)&&<MessageScrollerItem messageId="expert-discussion"><ExpertTranscript chat={expertChat}/></MessageScrollerItem>}
        </MessageScrollerContent>
      </MessageScrollerViewport><MessageScrollerButton aria-label={t("回到最新消息")} behavior="instant" onClick={()=>{
        // Enable following before the primitive handles this click. Waiting for
        // the resulting scroll event can miss the next streamed content resize.
        following.current=true;flushSync(()=>onFollowingChange(true));
      }}/></MessageScroller>
    </div>
    <div className="conversation-dock">
      {receipt.pending&&<p role="status">{t('正在确认发送结果…')}</p>}
      <CreationGuide hasPendingInput={!!run.questions?.length||!!deliveries.snapshot?.requests?.some(r=>r.state==='pending')} run={run} active={active||submitting} openSettings={openSettings} onPrompt={(text,skillId)=>{changePrompt(prompt.trim()?prompt+'\n\n'+text:text);setOptions(current=>({...current,selectedSkillIds:skillId?[skillId]:[]}));}}/>
      {inlineInputs}{outboxPanel}{pendingSurface}
      {(draftStorageError||optionsStorageError)&&<Alert variant="destructive"><AlertDescription>{t(draftStorageError||optionsStorageError)}</AlertDescription></Alert>}
      {sendError&&<Alert variant="destructive"><AlertDescription>{sendError}</AlertDescription></Alert>}

      {modelPending&&<p className="m-0 px-3.5 text-xs text-muted-foreground" role="status">{t('所选模型将在下一轮生效；本轮及补充消息仍使用：')}{run.model}</p>}
      <ExpertRecipient chat={expertChat}/>
      <ChatComposer expertMentions={expertChat.mentions} onPasteAttachments={files=>setOptions(current=>({...current,attachments:[...(current.attachments||[]),...files].filter((file,index,all)=>all.findIndex(other=>other.path===file.path)===index)}))} attachments={<ComposerAttachments value={options} onChange={setOptions} disabled={active||submitting||inputSending}/>} selectedSkillIds={options.selectedSkillIds} onSelectSkill={id=>setOptions(current=>({...current,selectedSkillIds:[...new Set([...(current.selectedSkillIds||[]),id])].slice(0,20)}))} followup keepEditable allowActiveSend={!!inputAPI} showSendLabel={!!deliveries.snapshot?.policy.paused} value={prompt} onChange={changePrompt} onSubmit={()=>void submit()} disabled={submitting||inputSending||expertChat.busy} sending={submitting||inputSending||expertChat.busy}
        label={reworkMode?t('修改要求'):t('继续对话')} placeholder={reworkMode?t('说明需要修改的内容，提交后重新执行并验收'):run.approvals.length?t('请先处理上方授权…'):t('继续这个任务…')}
        active={active} stopping={run.status==='stopping'} onStop={stop}
        canSend={run.status!=='stopping'&&!run.archivedAt&&(!!prompt.trim()||!!options.selectedSkillIds?.length||!!options.attachments?.length)} sendLabel={expertChat.selected?'发送给专家':reworkMode?t('提交修改要求'):t(deliveries.snapshot?.policy.paused?'发送并继续':active?'发送补充':'发送后续消息')}
        skills={<SkillTags ids={options.selectedSkillIds} disabled={active||submitting||inputSending} onRemove={id=>setOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/>}
        controls={expertChat.selected?<span className="px-2 text-xs text-muted-foreground">使用专家默认模型</span>:<ComposerControls permissionChange={run.permissionChange} modelChange={modelChange} catalog={catalog} permissionDisabled={modelBusy||run.modelChange?.state==='switching'||reworkMode||submitting||inputSending||!!run.archivedAt||permissionBusy||run.permissionChange?.state==='switching'||run.status==='stopping'||active&&!window.desktop?.switchRunPermission} onPermissionChange={active?changePermission:undefined} value={active?{...options,permission:run.permission||'default'}:options} onChange={setOptions} disabled={reworkMode||active||submitting||inputSending||!!run.archivedAt} onModelChange={active&&window.desktop?.switchRunModel?changeModel:undefined} modelDisabled={modelBusy||permissionBusy||run.modelChange?.state==='switching'||run.permissionChange?.state==='switching'||submitting||inputSending||run.status==='stopping'||!!run.archivedAt} modelPending={modelPending} previousBaseUrl={run.baseUrl} previousProviderId={run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id} openSettings={openSettings}/>}/>

    </div>
  </div>;
  return floatingHost?createPortal(view,floatingHost):view;
}

type TurnWindowHandle=Pick<ReturnType<typeof useTurnWindow>,'sync'|'read'|'goTo'>;
function createTurnSelection(){
 let selected='';
 const listeners=new Set<()=>void>();
 return {
  get:()=>selected,
  set(id:string){if(id!==selected){selected=id;for(const listener of listeners)listener();}},
  subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);},
 };
}
type TurnSelection=ReturnType<typeof createTurnSelection>;
function WindowedNavigation({selection,...props}:Omit<ComponentProps<typeof TurnNavigation>,'selected'>&{selection:TurnSelection}){
 const selected=useSyncExternalStore(selection.subscribe,selection.get);
 return <TurnNavigation {...props} selected={selected||props.turns[0]?.user.id||''}/>;
}
function WindowedTurns({handle,viewport,ids,turns,visible,selection,onRangeChange,renderTurn,status}:{
 handle:RefObject<TurnWindowHandle|null>;viewport:RefObject<HTMLDivElement|null>;
 ids:string[];turns:ConversationTurn[];visible:boolean;selection:TurnSelection;onRangeChange():void;
 renderTurn(turn:ConversationTurn):ReactNode;status:ReactNode;
}){
 const window=useTurnWindow(ids,viewport,true,visible);
 useImperativeHandle(handle,()=>window,[window]);
 useLayoutEffect(()=>{
  if(visible){selection.set(window.selected);onRangeChange();}
 },[visible,window.start,window.end,window.selected,selection,onRangeChange]);
 return <AnchoredTurnRange viewport={viewport} firstId={ids[window.start]} lastId={ids[window.end-1]} before={window.before}>
  <div aria-hidden="true" style={{height:window.before,overflowAnchor:'none'}}/>
  {turns.slice(window.start,window.end).map(turn=><WindowTurn key={turn.user.id} id={turn.user.id} prompt={turn.user.text} observe={window.observe}>
   {renderTurn(turn)}
   {turn===turns.at(-1)&&status}
  </WindowTurn>)}
  <div aria-hidden="true" style={{height:window.after,overflowAnchor:'none'}}/>
 </AnchoredTurnRange>;
}
type AnchoredRangeProps={viewport:RefObject<HTMLDivElement|null>;firstId?:string;lastId?:string;before:number;children:ReactNode};
class AnchoredTurnRange extends Component<AnchoredRangeProps>{
 getSnapshotBeforeUpdate(previous:AnchoredRangeProps){
  const {viewport,firstId,lastId,before}=this.props;
  if(previous.firstId===firstId&&previous.lastId===lastId&&previous.before===before)return null;
  return captureTurnScrollAnchor(viewport.current);
 }
 componentDidUpdate(_previous:AnchoredRangeProps,_state:unknown,anchor:ReturnType<typeof captureTurnScrollAnchor>){
  restoreTurnScrollAnchor(anchor);
 }
 render(){return <div className="flex flex-col">{this.props.children}</div>;}
}
function WindowTurn({id,prompt,observe,children}:{id:string;prompt:string;observe(id:string,node:HTMLElement|null):void;children:React.ReactNode}){
 const ref=useCallback((node:HTMLDivElement|null)=>observe(id,node),[id,observe]);
 return <MessageScrollerItem ref={ref} messageId={id} data-turn-id={id} className="conversation-turn [content-visibility:visible]" style={{marginBottom:turnGap}} aria-label={`对话：${prompt.slice(0,60)}`}>{children}</MessageScrollerItem>;
}
function ConversationScrollItem({following,...props}:ComponentProps<typeof MessageScrollerItem>&{following:boolean}){
 // The primitive anchors newly appended items even when autoScroll is false.
 // Defer that anchor while reading history; keep existing anchors for navigation.
 const [anchor,setAnchor]=useState(following);
 if(following&&!anchor)setAnchor(true);
 return <MessageScrollerItem {...props} scrollAnchor={anchor||following}/>;
}
function ScrollerNavigation({turns,offset,jump}:Omit<ComponentProps<typeof TurnNavigation>,'selected'>){
 const {currentAnchorId}=useMessageScrollerVisibility();
 return <TurnNavigation turns={turns} offset={offset} selected={currentAnchorId||turns[0]?.user.id||''} jump={jump}/>;
}
function RetainedConversation(props:Omit<ComponentProps<typeof ConversationBody>,'onFollowingChange'>){
 const [following,setFollowing]=useState(()=>readReading(props.run.id)?.following!==false);
 const [history,setHistory]=useState({input:props.run,value:props.run});
 let run=history.value;
 // Adjust before committing children so a rolling page never removes mounted
 // history for one frame. All transcript hosts share this boundary.
 if(history.input!==props.run){run=props.actionsOnly?props.run:retainRunHistory(history.value,props.run);setHistory({input:props.run,value:run});}
 if(run.originHandoff)return <InvestigationDetails id={run.originHandoff.id}/>;
 return <RunDetailsContext.Provider value={props.run.id}><RenderErrorBoundary key={props.run.id} runId={props.run.id}><ProcessDisclosureScope storageKey={'run:'+props.run.id}><MessageScrollerProvider autoScroll={props.visible!==false&&following} defaultScrollPosition="end" scrollEdgeThreshold={60} scrollPreviousItemPeek={14}><FrozenConversationBody {...props} run={run} onFollowingChange={setFollowing}/></MessageScrollerProvider></ProcessDisclosureScope></RenderErrorBoundary></RunDetailsContext.Provider>;
}

// Keep history accumulation outside this boundary so background pagination cannot
// drop turns. Local draft and scroll state stay mounted while text updates pause.
const FrozenConversationBody=memo(ConversationBody,(previous,next)=>previous.run.id===next.run.id&&previous.visible===false&&next.visible===false);

function sameItems(a:readonly unknown[]|undefined,b:readonly unknown[]|undefined){return a===b||(a?.length||0)===(b?.length||0)&&(a||[]).every((item,index)=>item===b?.[index]);}
function sameTurn(a:ConversationTurn,b:ConversationTurn){return a.user===b.user&&a.final===b.final&&a.active===b.active&&a.outcome===b.outcome&&a.plan===b.plan&&a.model===b.model&&sameItems(a.messages,b.messages)&&sameItems(a.tools,b.tools)&&sameItems(a.artifacts,b.artifacts);}
type TurnTranscriptProps={turn:ConversationTurn;run:AgentRun;requests:import('./types').PersistentInputRequest[];allRequests:import('./types').PersistentInputRequest[];deliveries:import('./types').InputDelivery[];nativePending:string[];onOpenInput(id:string):void;onToggle():void;paused:boolean;status:string;hidePrompt:boolean;language:string;openFile?(file:import('./types').DeliveredFile):void;openReference?(path:string):void;openChanges(changes:import('./types').TurnFileChanges):void};
const TurnTranscript=memo(function TurnTranscript({turn,run,requests,allRequests,deliveries,nativePending,onOpenInput,onToggle,paused,status,hidePrompt,openFile,openReference,openChanges}:TurnTranscriptProps){
 return <>
  {turn.user.modelChange&&<div className="turn-duration">{t('已切换模型：')}{turn.user.modelChange}</div>}
  {!hidePrompt&&<UserMessage message={turn.user.formSubmissionId?undefined:turn.user} context={<SkillTags snapshots={turn.user.skills}/>} text={allRequests.some(r=>r.deliveryId&&r.deliveryId===turn.user.formSubmissionId)?t('已提交补充信息'):turn.user.text}/>}
  {turn.messages.filter(message=>isConversationMessage(message)&&!isCompletedPlan(message,turn)&&message.id!==turn.final?.id).map(message=>message.role==='user'?<UserMessage key={message.id} message={message} text={message.text}/>:<Message key={message.id} role="article" aria-label={t('助手消息')}><MessageContent><MessageBody message={message}/></MessageContent></Message>)}
  <TurnProgress allRequests={allRequests} requests={requests} deliveries={deliveries} nativePending={nativePending} onOpenInput={onOpenInput} paused={paused} onToggle={onToggle} turn={turn} status={status} duration={turn.user.timing?.outcome&&!turn.active?<Duration timing={turn.user.timing}/>:null}/>
  {turn.final&&<Message role="article" aria-label={t('助手消息')}><MessageContent><MessageBody message={turn.final} onFileLink={openReference}/></MessageContent></Message>}
  <TurnFiles run={run} turnKey={turn.user.id} openFile={openFile} openReference={openReference} openChanges={openChanges}/>{!turn.active&&<TurnActions turn={turn} runId={run.id}/>}
 </>;
},(a,b)=>a.turn===b.turn&&a.paused===b.paused&&a.status===b.status&&a.hidePrompt===b.hidePrompt&&a.language===b.language&&a.run.id===b.run.id&&a.run.cwd===b.run.cwd&&a.run.archivedAt===b.run.archivedAt&&sameItems(a.run.fileChanges,b.run.fileChanges)&&sameItems(a.requests,b.requests)&&sameItems(a.allRequests,b.allRequests)&&sameItems(a.deliveries,b.deliveries)&&sameItems(a.nativePending,b.nativePending)&&a.onOpenInput===b.onOpenInput&&a.onToggle===b.onToggle&&a.openFile===b.openFile&&a.openReference===b.openReference&&a.openChanges===b.openChanges);

const MemoConversation=memo(RetainedConversation);
export default function Conversation(props:ComponentProps<typeof RetainedConversation>){
 const latest=useRef(props);latest.current=props;
 const handlers=useRef<Record<string,(...args:any[])=>any>>({});
 const forwarded={...props};
 for(const key of ['send','stop','approve','openSettings','openFile','openReference','openChanges','onOpenInput','onOptionsChange'] as const){
  if(typeof props[key]!=='function')continue;
  handlers.current[key]??=(...args:any[])=>(latest.current[key] as ((...values:any[])=>any)|undefined)?.(...args);
  (forwarded as Record<string,unknown>)[key]=handlers.current[key];
 }
 return <MemoConversation {...forwarded}/>;
}
