import {toolBusy,toolSummary} from './RunActivity';
import Markdown from './Markdown';
import { t } from './i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Brain, Terminal, Globe, FilePenLine, Check, Circle, ChevronRight, LoaderCircle } from 'lucide-react';
import type { ConversationTurn } from './conversation-turns';
const statusText:Record<string,string>={inProgress:'进行中',running:'进行中',completed:'已完成',failed:'失败',declined:'已拒绝',pending:'待处理'};
export function TurnProgress({turn,status,duration,onToggle}:{onToggle():void;turn:ConversationTurn;status:string;duration:ReactNode}) {
 const [expanded,setExpanded]=useState(turn.outcome!=='completed');
 useEffect(()=>setExpanded(turn.outcome!=='completed'),[turn.outcome]);
 return <div className="turn-progress"><button type="button" className="turn-progress-toggle" aria-expanded={expanded} onClick={()=>{onToggle();setExpanded(!expanded);}}><ChevronRight size={14} className={expanded?'expanded':''}/><span>{t(turn.active?status:turn.outcome==='completed'?'本轮已结束':turn.outcome==='failed'?'执行失败':'已中断')}</span>{duration}{!turn.active&&turn.tools.length>0&&<small> · {turn.tools.length} {t('次工具调用')}</small>}</button>{expanded&&<ProcessPanel turn={turn}/>}</div>;
}
function ThinkingWindow({text,title,live}:{text:string;title:string;live:boolean}) {
 const viewport=useRef<HTMLDivElement>(null);
 const follow=useRef(true);
 useEffect(()=>{const el=viewport.current;if(el&&follow.current)el.scrollTop=el.scrollHeight;},[text]);
 return <><div className="process-entry-title">{live?<LoaderCircle size={14} className="activity-spinner"/>:<Brain size={14}/>}<span>{t(title)}</span></div>
 <div className="thinking-window" ref={viewport} tabIndex={0} role="region" aria-label={t('思考过程')} onScroll={()=>{const el=viewport.current!;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<24;}}><pre>{text||t('等待输出…')}</pre></div></>;
}
export default function ProcessPanel({ turn }: { turn: ConversationTurn }) {
 const entries=[
  ...turn.messages.filter(message=>message.id!==turn.final?.id&&(turn.active||message.kind!=='reasoning')).map((message,index)=>({id:'message-'+message.id,order:message.order??index,type:message.kind==='reasoning'?'reasoning':'progress',title:message.kind==='reasoning'?(message.reasoningFormat==='text'?'思考过程':'思考摘要'):'继续处理',text:message.text,status:'',summary:'',live:turn.active&&message.id===turn.messages.at(-1)?.id})),
  ...turn.tools.map((tool,index)=>({id:'tool-'+tool.id,order:tool.order??turn.messages.length+index,type:tool.type,title:tool.type==='commandExecution'?'执行命令':tool.type==='fileChange'?'修改文件':tool.type==='webSearch'?'搜索资料':tool.type==='plan'?'任务规划':tool.label,text:tool.type==='commandExecution'?tool.label+'\n'+tool.detail:tool.detail,status:!turn.active&&toolBusy(tool.status)?(turn.outcome==='completed'?'未确认完成':'已停止'):tool.status,summary:toolSummary(tool),live:turn.active&&toolBusy(tool.status)}))
 ].sort((a,b)=>a.order-b.order);
 if(!turn.active&&!entries.length&&!turn.plan?.steps.length)return null;
 return <section className="process-panel" aria-label={t('任务执行过程')}>
 {!!turn.plan?.steps.length&&<div className="task-plan" aria-label={t('任务清单')}><strong>{t('任务清单')} <small>{turn.plan.steps.filter(s=>s.status==='completed').length}/{turn.plan.steps.length}</small></strong><ul>{turn.plan.steps.map((step,index)=><li key={index} className={step.status}>{step.status==='completed'?<Check size={15}/>:step.status==='inProgress'?<Activity size={15}/>:<Circle size={15}/>}<span>{step.step}</span><small>{t(step.status==='inProgress'&&!turn.active?(turn.outcome==='completed'?'未确认完成':'已暂停'):statusText[step.status])}</small></li>)}</ul>{turn.plan.explanation&&<p>{turn.plan.explanation}</p>}</div>}
 <div className="process-log" aria-label={t('过程输出')}><div>
 {!entries.length&&turn.active&&<div className="process-entry"><div className="process-entry-title"><LoaderCircle size={14} className="activity-spinner"/><span>{t(turn.final?'正在生成回答':'等待模型响应')}</span></div><p className="process-empty">{t(turn.final?'正在接收回答内容。':'尚未收到模型的过程内容，收到后会在这里实时展示。')}</p></div>}
 {entries.map(entry=>{const tool=!['reasoning','progress'].includes(entry.type);const Icon=entry.type==='reasoning'?Brain:entry.type==='webSearch'?Globe:entry.type==='fileChange'?FilePenLine:Terminal;return <div className={`process-entry ${entry.type} ${entry.live?'is-live':''}`} key={entry.id}>{tool?<details><summary>{entry.live?<LoaderCircle size={13} className="activity-spinner"/>:<Icon size={13}/>}<span className="activity-tool-title">{t(entry.title)}</span><span className="activity-tool-summary" title={entry.summary}>{entry.summary}</span><small>{t(statusText[entry.status]||entry.status)}</small></summary><pre>{entry.text.slice(-12000)||t('等待输出…')}</pre></details>:entry.type==='reasoning'?<ThinkingWindow text={entry.text} title={entry.title} live={entry.live}/>:<div className="process-milestone"><Markdown text={entry.text||t('等待输出…')}/></div>}{tool&&entry.text.length>12000&&<small>{t('仅显示最后 12000 字，完整记录已保留。')}</small>}</div>;})}
 </div></div></section>;
}
