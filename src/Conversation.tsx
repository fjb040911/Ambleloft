import {Button} from './components/ui/button';
import ApprovalCard from './ApprovalCard';
import {MessageScrollerProvider,MessageScroller,MessageScrollerViewport,MessageScrollerContent,MessageScrollerItem,MessageScrollerButton,useMessageScroller,useMessageScrollerVisibility} from './components/ui/message-scroller';
import {createPortal} from 'react-dom';
import VirtualBlock from './VirtualBlock';
import QuestionQueue from './QuestionQueue';
import { t } from './i18n';
import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ChevronUp, Clock3 } from 'lucide-react';
import SkillTags from './SkillTags';
import ComposerControls, {type ComposerOptions} from './ComposerControls';
import type { ProviderCatalog, AgentRun, TurnTiming } from './types';
import Markdown from './Markdown';
import TurnActions from './TurnActions';
import { conversationTurns } from './conversation-turns';
import {TurnProgress} from './ProcessPanel';
import RunActivity from './RunActivity';
import DeliveredFiles from './DeliveredFiles';
import TurnNavigation from './TurnNavigation';
import TaskForms, {useTaskForms} from './TaskForms';
import {mergeHistory,groupByTurn} from './conversation-data';
import ChatComposer from './ChatComposer';
import TaskAppCard from './TaskAppCard';

export const runStatus = { preparing: '正在准备', running: '执行中', waiting: '等待审批', stopping: '正在停止', completed: '本轮已结束', failed: '执行失败', interrupted: '已停止 / 中断' };
export const isRunning = (run: AgentRun) => ['preparing', 'running', 'waiting', 'stopping'].includes(run.status);
function Duration({ timing }: { timing: TurnTiming }) {
  if (!timing.outcome) return null;
  const seconds = typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs) ? Math.max(0, Math.floor(timing.durationMs / 1000)) : null;
  return <span className="turn-duration"><Clock3 size={13} /><span>{seconds === null ? t("用时未完整记录") : <>{t("用时")} <strong>{Math.floor(seconds / 60)}</strong> {t("分")} <strong>{seconds % 60}</strong> {t("秒")}</>}{timing.outcome === 'failed' ? t(" · 执行失败") : timing.outcome === 'interrupted' ? t(" · 已中断") : ''}</span></span>;
}
function ConversationBody({ onFollowingChange, visible = true, floatingHost, run, send, stop, approve, submitting, catalog, openSettings, openFile, openChanges }: {
  onFollowingChange(following:boolean):void;
  openChanges(changes:import('./types').TurnFileChanges):void;
  visible?:boolean;
  floatingHost?:HTMLElement|null;
  openFile?(file: import('./types').DeliveredFile): void;
  run: AgentRun; send(prompt: string,options:ComposerOptions): Promise<void>; catalog:ProviderCatalog;openSettings(section:string):void; stop(): void;
  approve(id: string, decision: 'accept' | 'decline'): Promise<void>; submitting: boolean;
}) {
  const [options,setOptions]=useState<ComposerOptions>({providerId:run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id,model:run.model,permission:run.permission||'default'});
  const [prompt, setPrompt] = useState(''); const [pending,setPending]=useState<{id:string;decision:'accept'|'decline'}|null>(null);
  const approvalLock=useRef(false);const [approvalError,setApprovalError]=useState<{id:string;message:string}|null>(null);
  const [recentOpen,setRecentOpen]=useState(false);
  const [sendError,setSendError]=useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const {scrollToEnd,scrollToMessage}=useMessageScroller();
  const following=useRef(true);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const savedTop=useRef(0);
  const active = isRunning(run);
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
  const changesByTurn=useMemo(()=>groupByTurn(merged.fileChanges),[merged.fileChanges]);
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
  const sending=useRef(false);
  const submit = async () => { if ((!prompt.trim()&&!options.selectedSkillIds?.length) || active || submitting || sending.current) return; sending.current=true;try { setSendError('');await send(prompt,options); setPrompt(''); setOptions(current=>({...current,attachments:[],selectedSkillIds:[],confirmProviderChange:false})); jump(); } catch(error) { setSendError((error as Error).message); } finally {sending.current=false;} };
  const decide = async (id:string,decision:'accept'|'decline')=>{if(approvalLock.current)return;approvalLock.current=true;setPending({id,decision});setApprovalError(null);try{await approve(id,decision);}catch(e){setApprovalError({id,message:(e as Error).message});}finally{approvalLock.current=false;setPending(null);}};
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
            <VirtualBlock preserveState enabled={turns.length>30&&!turn.active}><>{turn.user.modelChange&&<div className="turn-duration">{t("已切换模型：")}{turn.user.modelChange}</div>}</><article className="message user" aria-label={t("你的消息")}><SkillTags snapshots={turn.user.skills}/><div className="user-text">{turn.user.text}</div></article>
            <TurnProgress paused={run.status==='waiting'||!!run.queued} onToggle={()=>{following.current=false;onFollowingChange(false);}} turn={turn} status={runStatus[run.status]} duration={turn.user.timing?.outcome&&!turn.active?<Duration timing={turn.user.timing}/>:null}/>
            {turn.final&&<article className="message assistant" aria-label={t("助手消息")}><Markdown text={turn.final.text||'…'}/></article>}
            <TaskForms flows={formsByTurn.get(turn.user.id)||[]} archived={!!run.archivedAt}/>
            {(appsByTurn.get(turn.user.id)||[]).map(app=><TaskAppCard key={app.id} app={app} runId={run.id} visible={visible&&!floatingHost} archived={!!run.archivedAt}/>)}
            <DeliveredFiles openFile={openFile} runId={run.id} files={turn.artifacts}/>{(changesByTurn.get(turn.user.id)||[]).filter(change=>change.files.length||change.notice).map(change=><Button key={change.turnKey} variant="outline" className="turn-changes-button" onClick={()=>openChanges(change)}>{t('查看本轮变更')} ({change.files.length}){change.notice?' · '+t('记录不完整'):''}</Button>)}{!turn.active&&<TurnActions turn={turn}/>}</VirtualBlock>

          </MessageScrollerItem>)}
          {run.error && <MessageScrollerItem messageId="error" className="error-banner" role="alert">{run.retrying&&<strong>{t('连接出现问题，正在重试')} · </strong>}{run.error}{run.status==='failed'&&<div className="settings-actions"><Button type="button" variant="outline" onClick={()=>openSettings('providers')}>{t('检查模型服务')}</Button><Button type="button" variant="outline" onClick={()=>{setPrompt('请核实当前任务已完成的操作，并从未完成的步骤继续。');jump();}}>{t('准备继续任务')}</Button></div>}</MessageScrollerItem>}
        </MessageScrollerContent>
      </MessageScrollerViewport><MessageScrollerButton aria-label={t("回到最新消息")} behavior="instant"/></MessageScroller>
    </div>
    <div className="conversation-dock">
      {sendError&&<p className="error-banner" role="alert">{sendError}</p>}
      {active&&run.approvals.length===0&&<RunActivity run={run} turn={turns.at(-1)} visible={visible} compact={!floatingHost||recentOpen}/>}
      <QuestionQueue run={run}/>
      {run.approvals.length > 0 && <div className={`approval-queue${run.approvals.length>1?' is-multiple':''}`} aria-label={t("待处理授权")}><div className="sr-only" role="status">{t("待处理授权 ·")}{run.approvals.length}</div>{run.approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} disabled={!!pending} pending={pending?.id===approval.id?pending.decision:undefined} error={approvalError?.id===approval.id?approvalError.message:undefined} decide={decision => void decide(approval.id,decision)} />)}{run.tools.filter(tool=>tool.type==='fileChange').length > 0 && <details className="approval-diffs"><summary>{t("文件变更记录")}</summary>{run.tools.filter(tool=>tool.type==='fileChange').map(tool=><pre key={tool.id}>{tool.detail}</pre>)}</details>}</div>}
      <ChatComposer followup value={prompt} onChange={setPrompt} onSubmit={()=>void submit()} disabled={submitting}
        label={t('继续对话')} placeholder={run.approvals.length?t('请先处理上方授权…'):t('继续这个任务…')}
        active={active} stopping={run.status==='stopping'} onStop={stop}
        canSend={!!prompt.trim()||!!options.selectedSkillIds?.length} sendLabel={t('发送后续消息')}
        skills={<SkillTags ids={options.selectedSkillIds} disabled={active||submitting} onRemove={id=>setOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/>}
        controls={<ComposerControls catalog={catalog} value={options} onChange={setOptions} disabled={active||submitting} previousBaseUrl={run.baseUrl} previousProviderId={run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id} openSettings={openSettings}/>}/>

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
