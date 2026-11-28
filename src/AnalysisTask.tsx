import {useTraceSweep} from './useTraceSweep';
import {ThinkingWindow} from './ThinkingWindow';
import ProcessTool from './ProcessTool';
import {commandPresentation,toolBusy} from './tool-presentation';
import {useToolText} from './ToolText';
import {useProcessDisclosure} from './process-disclosure';
import {useLayoutEffect,useRef,useState} from 'react';
import {BookOpen,Play,Terminal,Folder,Search,Wrench} from 'lucide-react';
import {Trace,TraceLine,TraceIcon,TraceTitle,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import {Badge} from './components/ui/badge';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import type {AgentRun} from './types';
import {t} from './i18n';
import Markdown from './Markdown';

type Tool=AgentRun['tools'][number];
const colors=['#4f91ee','#ed7188','#9a78dc','#39a59b','#d79540','#6685aa'];
function identity(tool:Tool){
 const fallback=Array.from(tool.id).reduce((hash,char)=>(hash*31+char.charCodeAt(0))>>>0,0)%colors.length;
 return {name:tool.analysisTitle||tool.analysisAgent?.name||tool.label,avatar:Number.isInteger(tool.analysisAgent?.avatar)?Math.abs(tool.analysisAgent!.avatar)%colors.length:fallback};
}
function AgentAvatar({name,variant}:{name:string;variant:number}){
 const petals=4+variant%3;
 return <svg role="img" aria-label={`${name} · ${t('子代理头像')}`} data-avatar={variant} width="24" height="24" viewBox="0 0 24 24" className="shrink-0" style={{color:colors[variant]}}>
  {Array.from({length:petals},(_,i)=><ellipse key={i} cx="12" cy="6.5" rx="4" ry="5.5" transform={`rotate(${i*360/petals} 12 12)`} fill="currentColor" fillOpacity={.6+i*.3/petals} stroke="var(--background, white)" strokeWidth=".7"/>)}
  <circle cx="12" cy="12" r="2.4" fill="currentColor"/>
 </svg>;
}
export default function AnalysisTask({tool,highlight=false,trackLifecycle=false}:{tool:Tool;highlight?:boolean;trackLifecycle?:boolean}) {
 const [open,setOpen]=useProcessDisclosure('agent-'+tool.id);
 const detail=useToolText({toolId:tool.id,text:tool.detail,preview:tool.detailPreview,version:tool.detailVersion},open);
 const [error,setError]=useState(''),[stopping,setStopping]=useState(false);
 const active=['pending','running','waiting'].includes(tool.status),agent=identity(tool);
 const labels:Record<string,string>={pending:tool.nativeThreadId?'初始化中':'排队中',running:'开始工作',waiting:'等待输入',inProgress:'进行中',completed:'已完成',failed:'失败',interrupted:'已停止'};
 // A child may finish after a later sibling started. Its terminal event
 // is new even though the card retains its original position in the trace.
 const initialStatus=useRef<string|null>(tool.status);
 useLayoutEffect(()=>{if(tool.status!==initialStatus.current)initialStatus.current=null;},[tool.status]);
 const changed=trackLifecycle&&tool.status!==initialStatus.current;
 const sweep=useTraceSweep<HTMLSpanElement>(highlight||changed?tool.id+':'+tool.status:undefined);
 const started=tool.nativeLifecycle?.find(event=>event.status==='running');
 async function stop(){setStopping(true);setError('');try{if(!window.desktop)throw Error(t('停止分析不可用'));await window.desktop.stopRun(tool.id);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setStopping(false);}}
 return <Trace className="analysis-agent my-2" data-agent-id={tool.analysisAgent?.id||tool.id}>
  {started&&tool.status!=='running'&&<Button variant="ghost" size="sm" className="w-fit max-w-full justify-start" onClick={()=>setOpen(true)} aria-label={`${agent.name} · ${t('开始工作')}`}><Play data-icon="inline-start"/><span className="truncate">{agent.name} · {t('开始工作')}</span><time dateTime={started.at} className="shrink-0 text-xs text-muted-foreground">{new Date(started.at).toLocaleTimeString()}</time></Button>}
  <TraceCollapsible open={open} onOpenChange={setOpen}>
   <TraceCollapsibleTrigger>
    <TraceLine status={tool.status==='running'?'running':tool.status==='pending'?'pending':tool.status==='failed'?'error':undefined}>
     <TraceIcon aria-hidden={false}><AgentAvatar name={agent.name} variant={agent.avatar}/></TraceIcon>
     <TraceTitle ref={sweep} title={agent.name}>{agent.name}</TraceTitle>
     <TraceDescription role="status">{t(labels[tool.status]||tool.status)}</TraceDescription>
    </TraceLine>
   </TraceCollapsibleTrigger>
   <TraceCollapsibleContent className="flex flex-col gap-3">
    {open&&<>
    <div className="flex flex-wrap gap-2"><Badge variant="secondary">{t('子代理')}</Badge><Badge variant="outline">{t(tool.nativeThreadId?'继承当前任务权限':'只读分析')}</Badge></div>
    {tool.analysisTask&&<p>{tool.analysisTask}</p>}
    {!!tool.nativeLifecycle?.length&&<ol className="m-0 list-none p-0 text-xs text-muted-foreground" aria-label={t('执行记录')}>{tool.nativeLifecycle.map((event,index)=><li key={index}>{new Date(event.at).toLocaleTimeString()} · {t(event.status==='running'?'开始工作':labels[event.status]||event.status)}</li>)}</ol>}
    {!!tool.nativeActivity?.length&&<div className="flex min-w-0 flex-col gap-2" aria-label={t('执行详情')}>{tool.nativeActivity.map(activity=><ActivityDetails key={activity.id} activity={activity} toolId={tool.id} disclosureKey={'agent-'+tool.id+'-activity-'+activity.id} parentStatus={tool.status}/>)}</div>}
    {tool.nativeIdentityError&&<Alert><AlertDescription>{t('子代理名称读取失败')}: {tool.nativeIdentityError}</AlertDescription></Alert>}
    {!!tool.analysisReads?.length&&<Trace>{tool.analysisReads.map((read,index)=><TraceLine key={index}><TraceIcon><BookOpen/></TraceIcon><TraceTitle title={read}>{read}</TraceTitle></TraceLine>)}</Trace>}
    <Markdown context="trace" text={detail.text}/>{detail.controls}
    {active&&<div><Button variant="outline" size="sm" disabled={stopping} onClick={()=>void stop()}>{t(stopping?'正在停止':'停止分析')}</Button></div>}
    </>}
   </TraceCollapsibleContent>
  </TraceCollapsible>
  {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
 </Trace>;
}

type Activity=NonNullable<Tool['nativeActivity']>[number];

function activityType(activity:Activity){
 if(activity.type)return activity.type;
 // Older native records kept the tool name or shell invocation as their title.
 if(activity.title==='Reasoning')return 'reasoning';
 if(/^(?:(?:[^\s]*[/\\])?(?:zsh|bash|sh)\s+-[a-z]*c\s|.*?\b(?:powershell|pwsh|cmd)(?:\.exe)?\s+(?:-|\/c\b))/i.test(activity.title))return 'commandExecution';
 return 'tool';
}

function ActivityDetails({activity,disclosureKey,toolId,parentStatus}:{toolId:string;disclosureKey:string;activity:Activity;parentStatus:string}){
 const type=activityType(activity);
 const busy=toolBusy(activity.status);
 const finished=['completed','failed','interrupted'].includes(parentStatus);
 const live=busy&&!finished;
 const status=busy&&finished?(parentStatus==='completed'?'未确认完成':'已停止'):activity.status;
 const source={toolId,activityId:activity.id,preview:activity.textPreview,version:activity.textVersion};
 if(type==='reasoning')return <ThinkingWindow source={source} text={activity.text} disclosureKey={disclosureKey} title="思考过程" live={live}/>;
 const command=type==='commandExecution'?activity.title:'';
 const presentation=command?commandPresentation({label:command,status}):null;
 const icon=presentation?.kind==='read'?<BookOpen/>:presentation?.kind==='listFiles'?<Folder/>:presentation?.kind==='search'?<Search/>:command?<Terminal/>:<Wrench/>;
 return <ProcessTool type={type} source={source} disclosureKey={disclosureKey} title={presentation?.title||activity.title}
  summary={presentation?.summary||''} status={status} live={live} command={command} output={activity.text} icon={icon}/>;
}
