import {createPortal} from 'react-dom';
import VirtualBlock from './VirtualBlock';
import QuestionQueue from './QuestionQueue';
import { t } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronUp, Square, ShieldCheck, Clock3 } from 'lucide-react';
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

export const runStatus = { preparing: '正在准备', running: '执行中', waiting: '等待审批', stopping: '正在停止', completed: '本轮已结束', failed: '执行失败', interrupted: '已停止 / 中断' };
export const isRunning = (run: AgentRun) => ['preparing', 'running', 'waiting', 'stopping'].includes(run.status);
function Duration({ timing }: { timing: TurnTiming }) {
  if (!timing.outcome) return null;
  const seconds = typeof timing.durationMs === 'number' && Number.isFinite(timing.durationMs) ? Math.max(0, Math.floor(timing.durationMs / 1000)) : null;
  return <div className="turn-duration"><Clock3 size={13} /><span>{seconds === null ? t("用时未完整记录") : <>{t("用时")} <strong>{Math.floor(seconds / 60)}</strong> {t("分")} <strong>{seconds % 60}</strong> {t("秒")}</>}{timing.outcome === 'failed' ? t(" · 执行失败") : timing.outcome === 'interrupted' ? t(" · 已中断") : ''}</span></div>;
}
function Approval({ approval, pending, decide }: { approval: AgentRun['approvals'][number]; pending: boolean; decide(decision: 'accept' | 'decline'): void }) {
  let params: { command?: string; cwd?: string; reason?: string } = {};
  try { params = JSON.parse(approval.detail); } catch { /* Raw details remain available. */ }
  return <section className="approval-card" aria-label={t("执行授权")}><div className="approval-title"><ShieldCheck size={17} /><h2>{t("需要你批准")}{approval.method.includes('fileChange') ? t("文件修改") : t("执行命令")}</h2><span>{t("仅本次")}</span></div>
    {params.command && <pre className="approval-command">{params.command}</pre>}{params.reason && <p>{params.reason}</p>}{params.cwd && <p className="fine-print">{t("工作目录：")}{params.cwd}</p>}
    <details><summary>{t("查看完整请求")}</summary><pre>{approval.detail}</pre></details>
    <div className="settings-actions"><button type="button" className="secondary-button" disabled={pending} onClick={() => decide('decline')}>{t("拒绝")}</button><button type="button" className="primary-button" disabled={pending} onClick={() => decide('accept')}>{pending ? t("正在提交…") : t("批准本次")}</button></div>
  </section>;
}
export default function Conversation({ visible = true, floatingHost, run, send, stop, approve, submitting, catalog, openSettings, openFile, openChanges }: {
  openChanges(changes:import('./types').TurnFileChanges):void;
  visible?:boolean;
  floatingHost?:HTMLElement|null;
  openFile?(file: import('./types').DeliveredFile): void;
  run: AgentRun; send(prompt: string,options:ComposerOptions): Promise<void>; catalog:ProviderCatalog;openSettings(section:string):void; stop(): void;
  approve(id: string, decision: 'accept' | 'decline'): Promise<void>; submitting: boolean;
}) {
  const [options,setOptions]=useState<ComposerOptions>({providerId:run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id,model:run.model,permission:run.permission||'default'});
  const [prompt, setPrompt] = useState(''); const [pending, setPending] = useState('');
  const [recentOpen,setRecentOpen]=useState(false);
  const [sendError,setSendError]=useState('');
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null); const follow = useRef(true);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const savedTop=useRef(0);
  const active = isRunning(run);
  const [older,setOlder]=useState<AgentRun|null>(null);
  const [loadingHistory,setLoadingHistory]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const merged=older?{...run,fileChanges:[...(older.fileChanges||[]).filter(c=>!run.fileChanges?.some(n=>n.turnKey===c.turnKey)),...(run.fileChanges||[])],messages:[...older.messages.filter(m=>!run.messages.some(n=>n.id===m.id)),...run.messages],tools:[...older.tools.filter(m=>!run.tools.some(n=>n.id===m.id)),...run.tools],plans:[...(older.plans||[]).filter(m=>!run.plans?.some(n=>n.turnKey===m.turnKey)),...(run.plans||[])],artifacts:[...(older.artifacts||[]).filter(m=>!run.artifacts?.some(n=>n.id===m.id)),...(run.artifacts||[])]}:run;
  const turns = conversationTurns(merged);
  const before=older?older.historyBefore:run.historyBefore;
  const loadOlder=async()=>{
   if(!before||!window.desktop?.getRunPage||loadingHistory)return;
   setLoadingHistory(true);setHistoryError('');follow.current=false;
   const el=scroll.current;const height=el?.scrollHeight||0;const top=el?.scrollTop||0;
   try{const page=await window.desktop.getRunPage({id:run.id,before});setOlder(previous=>previous?{...page,fileChanges:[...(page.fileChanges||[]),...(previous.fileChanges||[])],messages:[...page.messages,...previous.messages],tools:[...page.tools,...previous.tools],plans:[...(page.plans||[]),...(previous.plans||[])],artifacts:[...(page.artifacts||[]),...(previous.artifacts||[])]}:page);requestAnimationFrame(()=>{if(el&&visibleRef.current)el.scrollTop=top+el.scrollHeight-height;});}catch(e){setHistoryError((e as Error).message);}finally{setLoadingHistory(false);}
  };
  const turnElements = useRef(new Map<string, HTMLElement>());
  const [selectedTurn, setSelectedTurn] = useState('');
  const trackScroll = () => {
    const el = scroll.current!;
    if(!visibleRef.current||!el.clientHeight)return;
    savedTop.current=el.scrollTop;
    const bottom = el.scrollHeight-el.scrollTop-el.clientHeight<60;
    follow.current=bottom; setAtBottom(bottom);
    const top=el.getBoundingClientRect().top+90;
    let selected=turns[0]?.user.id || '';
    for(const turn of turns) { const node=turnElements.current.get(turn.user.id); if(node && node.getBoundingClientRect().top<=top) selected=turn.user.id; }
    setSelectedTurn(bottom ? turns[turns.length-1]?.user.id || selected : selected);
  };
  const jumpTurn = (id: string) => {
    const node=turnElements.current.get(id); const el=scroll.current;
    if(!node||!el)return;
    follow.current=false; setAtBottom(false); setSelectedTurn(id);
    el.scrollTo({top:el.scrollTop+node.getBoundingClientRect().top-el.getBoundingClientRect().top-14,behavior:'instant'});
  };
  const jump = () => { follow.current = true; setAtBottom(true); if (visibleRef.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; };
  useLayoutEffect(() => {
    if(!visible)return;
    const el=scroll.current;
    if(!el)return;
    el.scrollTop=follow.current?el.scrollHeight:savedTop.current;
    let frame=0;
    const observer=new ResizeObserver(()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if(!visibleRef.current||!el.clientHeight)return;
        if(follow.current)el.scrollTop=el.scrollHeight;
      });
    });
    if(content.current)observer.observe(content.current);
    observer.observe(el);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[visible,floatingHost,recentOpen]);
  const submit = async () => { if ((!prompt.trim()&&!options.selectedSkillIds?.length) || active || submitting) return; try { setSendError('');await send(prompt,options); setPrompt(''); setOptions(current=>({...current,attachments:[],selectedSkillIds:[],confirmProviderChange:false})); jump(); } catch(error) { setSendError((error as Error).message); } };
  const decide = async (id: string, decision: 'accept' | 'decline') => { if (pending) return; setPending(id); try { await approve(id, decision); } catch { /* Parent displays failure. */ } finally { setPending(''); } };
  const view=<div className={`conversation-page${floatingHost?' file-chat-floating':''}${recentOpen?' recent-open':''}`}>
    {floatingHost&&<button className="file-chat-toggle" aria-label={t(recentOpen?'收起最近对话':'展开最近对话')} title={t(recentOpen?'收起最近对话':'展开最近对话')} aria-expanded={recentOpen} onClick={()=>{setRecentOpen(value=>!value);follow.current=true;}}><span>{t(active?'进行中的对话':'最近对话')} · {run.title}</span><ChevronUp size={16} aria-hidden="true"/></button>}
    <div className="conversation-body" inert={!!floatingHost&&!recentOpen} aria-hidden={floatingHost&&!recentOpen?true:undefined}>
      <TurnNavigation offset={older?.turnOffset??run.turnOffset??0} turns={turns} selected={selectedTurn || turns[0]?.user.id || ''} jump={jumpTurn} />
      <div className="conversation-scroll" ref={scroll} onScroll={trackScroll}>
        <div className="conversation-content" ref={content}>
          <div className="conversation-scope"><ShieldCheck size={14} />{t(run.permission==='full'?'完全访问 · 工作目录：':'默认权限 · 工作目录：')}{run.cwd}</div>
          {before&&<button className="secondary-button" disabled={loadingHistory} onClick={()=>void loadOlder()}>{t(loadingHistory?'正在加载…':'加载更早的对话')}</button>}{historyError&&<p role="alert">{historyError}</p>}
          <div className="messages">{(floatingHost?turns.slice(-3):turns).map(turn => <section className="conversation-turn" key={turn.user.id} data-turn-id={turn.user.id} aria-label={`对话：${turn.user.text.slice(0,60)}`} ref={node=>{if(node)turnElements.current.set(turn.user.id,node);else turnElements.current.delete(turn.user.id);}}>
            <VirtualBlock enabled={turns.length>30&&!turn.active}><>{turn.user.modelChange&&<div className="turn-duration">{t("已切换模型：")}{turn.user.modelChange}</div>}</><article className="message user" aria-label={t("你的消息")}><SkillTags snapshots={turn.user.skills}/><div className="user-text">{turn.user.text}</div></article>
            <TurnProgress onToggle={()=>{follow.current=false;setAtBottom(false);}} turn={turn} status={runStatus[run.status]} duration={turn.user.timing?.outcome&&!turn.active?<Duration timing={turn.user.timing}/>:null}/>
            {turn.final&&<article className="message assistant" aria-label={t("助手消息")}><Markdown text={turn.final.text||'…'}/></article>}
            <DeliveredFiles openFile={openFile} runId={run.id} files={turn.artifacts}/>{merged.fileChanges?.filter(change=>change.turnKey===turn.user.id&&(change.files.length||change.notice)).map(change=><button key={change.turnKey} className="secondary-button turn-changes-button" onClick={()=>openChanges(change)}>{t('查看本轮变更')} ({change.files.length}){change.notice?' · '+t('记录不完整'):''}</button>)}{!turn.active&&<TurnActions turn={turn}/>}</VirtualBlock>

          </section>)}</div>
          {run.error && <div className="error-banner" role="alert">{run.retrying&&<strong>{t('连接出现问题，正在重试')} · </strong>}{run.error}{run.status==='failed'&&<div className="settings-actions"><button type="button" className="secondary-button" onClick={()=>openSettings('providers')}>{t('检查模型服务')}</button><button type="button" className="secondary-button" onClick={()=>{setPrompt('请核实当前任务已完成的操作，并从未完成的步骤继续。');jump();}}>{t('准备继续任务')}</button></div>}</div>}
        </div>
      </div>
    </div>
    <div className="conversation-dock">
      {sendError&&<p className="error-banner" role="alert">{sendError}</p>}
      {active&&<RunActivity run={run} turn={turns.at(-1)}/>}
      {!atBottom && <button className="jump-latest secondary-button" onClick={jump}><ArrowDown size={14} />{t("回到最新消息")}</button>}
      <QuestionQueue run={run}/>
      {run.approvals.length > 0 && <div className="approval-queue" aria-label={t("待处理授权")}><div className="approval-count">{t("待处理授权 ·")}{run.approvals.length}</div>{run.approvals.map(approval => <Approval key={approval.id} approval={approval} pending={!!pending} decide={decision => void decide(approval.id,decision)} />)}{run.tools.filter(tool=>tool.type==='fileChange').length > 0 && <details className="approval-diffs"><summary>{t("文件变更记录")}</summary>{run.tools.filter(tool=>tool.type==='fileChange').map(tool=><pre key={tool.id}>{tool.detail}</pre>)}</details>}</div>}
      <form className="composer followup" aria-busy={submitting} onSubmit={event => { event.preventDefault(); void submit(); }}><SkillTags ids={options.selectedSkillIds} disabled={active||submitting} onRemove={id=>setOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/><textarea disabled={submitting} aria-label={t("继续对话")} placeholder={run.approvals.length ? t("请先处理上方授权…") : t("继续这个任务…")} value={prompt} maxLength={20000} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} /><div className="composer-bottom"><ComposerControls catalog={catalog} value={options} onChange={setOptions} disabled={active||submitting} previousBaseUrl={run.baseUrl} previousProviderId={run.providerId||catalog.providers.find(p=>p.baseUrl===run.baseUrl)?.id} openSettings={openSettings}/>{active ? <button type="button" className="send-button" aria-label={t("停止")} title={t(run.status === 'stopping' ? "正在停止" : "停止")} onClick={stop} disabled={run.status === 'stopping'}><Square size={13} fill="currentColor" /></button> : <button className="send-button" aria-label={t("发送后续消息")} disabled={(!prompt.trim()&&!options.selectedSkillIds?.length) || submitting}><ArrowUp size={17} /></button>}</div></form>
    </div>
  </div>;
  return floatingHost?createPortal(view,floatingHost):view;
}
