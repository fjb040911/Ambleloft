import {useEffect,useState} from 'react';
import {LoaderCircle,ShieldCheck} from 'lucide-react';
import type {AgentRun} from './types';
import type {ConversationTurn} from './conversation-turns';
import {t} from './i18n';
export const toolBusy=(status:string)=>['inProgress','running','pending'].includes(status);
export function toolSummary(tool:AgentRun['tools'][number]):string {
 if(tool.progress)return tool.progress;
 try {
  const data=JSON.parse(tool.detail);
  if(tool.type==='webSearch')return data.action?.url||data.query||data.action?.query||'';
  if(tool.type==='fileChange'&&Array.isArray(data))return data.map(item=>item.path?.split('/').pop()).filter(Boolean).join(' · ');
  if(tool.type==='mcpToolCall')return String(data.arguments?.query||data.arguments?.path||data.arguments?.url||tool.label);
 }catch{/* Command output is plain text. */}
 if(tool.type==='commandExecution'&&toolBusy(tool.status)){
  const line=tool.detail.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).at(-1);
  if(line)return line.slice(-240);
 }
 return tool.label;
}
export default function RunActivity({run,turn}:{run:AgentRun;turn?:ConversationTurn}) {
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[turn?.user.id]);
 const start=Date.parse(turn?.user.timing?.startedAt||run.createdAt);
 const elapsed=Math.max(0,Math.floor((now-(Number.isFinite(start)?start:now))/1000));
 const last=Date.parse(run.lastEventAt||turn?.user.timing?.startedAt||run.createdAt);
 const quiet=Math.max(0,Math.floor((now-(Number.isFinite(last)?last:now))/1000));
 const tools=turn?.tools.filter(tool=>toolBusy(tool.status))||[];
 const latest=turn?.messages.at(-1);
 if(run.queued)return <div className="run-activity" role="status">排队中 · 等待执行名额或工作目录释放</div>;
 const waiting=run.status==='waiting';const stopping=run.status==='stopping';
 let label=run.status==='preparing'?'正在准备':tools.length?'正在执行工具':turn?.final?'正在生成回答':latest?.kind==='reasoning'?'正在思考':latest?'等待模型继续响应':'等待模型响应';
 if(waiting)label=run.questions?.some(q=>q.blocking)?'等待你的回答':'需要你批准';else if(stopping)label='正在停止';else if(run.retrying)label='连接出现问题，正在重试';else if(quiet>=25)label='等待新的响应';
 const detail=tools.length>1?`${tools.length} ${t('项操作正在执行')}`:tools.length?toolSummary(tools[0]):'';
 return <div className={`run-activity ${waiting?'needs-approval':''}`} aria-label={t('当前运行状态')}><div role="status" aria-live="polite">{waiting?<ShieldCheck size={15}/>:<LoaderCircle size={15} className="activity-spinner"/>}<strong>{t(label)}</strong>{detail&&<span className="activity-target" title={detail}>{detail}</span>}</div><span className="activity-clock" aria-hidden="true">{quiet>=25&&!waiting&&!stopping?`${t('距上次更新')} ${quiet} ${t('秒')} · `:''}{elapsed<60?`${elapsed} ${t('秒')}`:`${Math.floor(elapsed/60)} ${t('分')} ${elapsed%60} ${t('秒')}`}</span></div>;
}
