import {inputToolTitle} from './InputToolRecord';
import {commandPresentation} from './tool-presentation';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Spinner} from './components/ui/spinner';
import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import type {AgentRun} from './types';
import type {ConversationTurn} from './conversation-turns';
import {t} from './i18n';
export const toolBusy=(status:string)=>['inProgress','running','pending'].includes(status);
export function toolSummary(tool:AgentRun['tools'][number]):string {
 if(tool.type==='commandExecution')return commandPresentation(tool).summary;
 if(tool.type==='contextCompaction')return '';
 const inputTitle=inputToolTitle(tool.label);if(inputTitle)return t(inputTitle);
 if(tool.progress)return tool.progress;
 try {
  const data=JSON.parse(tool.detail);
  if(tool.type==='webSearch')return data.action?.url||data.query||data.action?.query||'';
  if(tool.type==='fileChange'&&Array.isArray(data))return data.map(item=>item.path?.split('/').pop()).filter(Boolean).join(' · ');
  if(tool.type==='mcpToolCall')return String(data.arguments?.query||data.arguments?.path||data.arguments?.url||tool.label);
 }catch{/* Command output is plain text. */}
 return tool.label;
}
export default function RunActivity({run,turn,visible=true,compact=false,pendingInput=false}:{run:AgentRun;turn?:ConversationTurn;visible?:boolean;compact?:boolean;pendingInput?:boolean}) {
 const hasInput=pendingInput||!!run.questions?.length;
 const waiting=run.status==='waiting'||!!run.questions?.some(q=>q.blocking!==false);
 const stopping=run.status==='stopping';
 const needsInput=hasInput&&!stopping;
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!visible||needsInput||waiting)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[turn?.user.id,visible,needsInput,waiting]);
 const start=Date.parse(turn?.user.timing?.startedAt||run.createdAt);
 const elapsed=Math.max(0,Math.floor((now-(Number.isFinite(start)?start:now))/1000));
 const last=Date.parse(run.lastEventAt||turn?.user.timing?.startedAt||run.createdAt);
 const quiet=Math.max(0,Math.floor((now-(Number.isFinite(last)?last:now))/1000));
 const tools=turn?.tools.filter(tool=>toolBusy(tool.status))||[];
 const latest=turn?.messages.at(-1);
 if(run.queued)return <div className="run-activity" role="status">{t('排队中 · 等待执行名额或工作目录释放')}</div>;
 let label=run.status==='preparing'?'正在准备':tools.length?'正在执行工具':turn?.final?'正在生成回答':latest?.kind==='reasoning'?'正在思考':latest?'等待模型继续响应':'等待模型响应';
 if(tools.length===1&&tools[0].type==='commandExecution')label=commandPresentation(tools[0]).title;
 if(tools.length===1&&tools[0].type==='contextCompaction')label='正在压缩上下文';
 if(stopping)label='正在停止';else if(needsInput)label=waiting?'等待你的回答':'有待补充信息';else if(waiting)label='需要你批准';else if(run.retrying)label='连接出现问题，正在重试';else if(quiet>=25)label='等待新的响应';
 if(compact&&!hasInput&&!waiting&&!stopping&&!run.retrying&&quiet<25)label='任务进行中，可随时停止';
 // A running turn may be parked on an asynchronous question. Its wall-clock
 // age is not model inference time; don't animate that age as active generation.
 const attention=!stopping&&(waiting||needsInput);
 const detail=needsInput&&!waiting?t('任务尚未结束，可先处理上方请求'):tools.length>1?`${tools.length} ${t('项操作正在执行')}`:tools.length?toolSummary(tools[0]):'';
 return <div className={`run-activity ${attention?'needs-approval':''}`} aria-label={t('当前运行状态')}><Marker className="grid! grid-cols-[16px_minmax(0,1fr)]! gap-x-2! gap-y-1! text-xs!" role="status" aria-live="polite"><MarkerIcon>{attention?<ShieldCheck/>:<Spinner className="motion-reduce:animate-none"/>}</MarkerIcon><MarkerContent className={attention?undefined:'shimmer shimmer-spread-[2ch] motion-reduce:shimmer-none motion-reduce:animate-none'}>{t(label)}</MarkerContent>{detail&&<span className="activity-target" title={detail}>{detail}</span>}</Marker>{!attention&&<span className="activity-clock" aria-hidden="true" title={t('包含等待与工具执行时间，不代表模型调用时长')}>{quiet>=25&&!stopping?`${t('距上次更新')} ${quiet} ${t('秒')} · `:''}{t('本轮历时')} {elapsed<60?`${elapsed} ${t('秒')}`:`${Math.floor(elapsed/60)} ${t('分')} ${elapsed%60} ${t('秒')}`}</span>}</div>;
}
