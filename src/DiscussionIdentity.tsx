import {Message, MessageContent, MessageHeader} from './components/ui/message';
import {flushSync} from 'react-dom';
import type {ReactNode} from 'react';
import {Check,Clock,LoaderCircle,Pause,TriangleAlert,MoreHorizontal} from 'lucide-react';
import {Avatar,AvatarFallback} from './components/ui/avatar';
import {Badge} from './components/ui/badge';
import {Button} from './components/ui/button';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle} from './components/ui/popover';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './components/ui/dropdown-menu';
import {useCopy} from './WorkforceInputs';
import LiveTraceActivity from './LiveTraceActivity';
import Markdown from './Markdown';
import type {SpaceParticipant,SpaceRequest} from './workforce-types';
import type {AgentRun} from './types';

export const speakerName=(p:SpaceParticipant,fallback?:string)=>p.contribution?.author.name||p.role?.name||fallback||p.employeeId;
export const contributionAnchor=(r:SpaceRequest,p:SpaceParticipant)=>`wf-contribution-${encodeURIComponent(r.id)}-${encodeURIComponent(p.employeeId)}`;
export function DiscussionStatus({participant,run}:{participant:SpaceParticipant;run?:AgentRun}){
 const L=useCopy(),status=run?.status||participant.status;
 const [label,Icon]=status==='completed'?[L('已完成','Completed'),Check]:['failed','error'].includes(status)?[L('失败','Failed'),TriangleAlert]:status==='interrupted'?[L('已停止','Stopped'),Pause]:status==='waiting'?[L('等待处理','Needs input'),Pause]:status==='stopping'?[L('正在停止','Stopping'),LoaderCircle]:run?.queued?[L('排队中','Queued'),Clock]:status==='running'?[L('分析中','Analyzing'),LoaderCircle]:['preparing','started'].includes(status)?[L('准备中','Preparing'),Clock]:[L('状态未知','Unknown status'),Clock];
 return <Badge variant={['failed','error'].includes(status)?'destructive':'secondary'} className="wf-discussion-status"><Icon aria-hidden="true"/>{label}</Badge>;
}
// A participant can arrive before its run ID or the first transcript page.
export function ExpertOutputPreview({participant:p}:{participant:SpaceParticipant}){
 const L=useCopy();
 const starting=!p.runId&&['preparing','started'].includes(p.status);
 const awaiting=['preparing','started','running'].includes(p.status);
 return <div className="wf-output">
  {p.output&&<Markdown text={p.output}/>}
  {awaiting&&<LiveTraceActivity label={starting?L('正在启动专家','Starting experts'):L('等待专家回复…','Waiting for the expert…')}/>}
  {!p.output&&['completed','failed','error','interrupted'].includes(p.status)&&<p>{L('本次未产生回复。','No response was produced.')}</p>}
  {p.outputTruncated&&<p>{L('仅显示回复预览，打开执行记录可查看全文。','Response preview. Open the execution record for the full text.')}</p>}
 </div>;
}
export function revealContribution(request:SpaceRequest,participant:SpaceParticipant){
 const group=document.getElementById('wf-experts-'+request.id);
 // The target does not exist until the shadcn disclosure mounts its children.
 flushSync(()=>group?.dispatchEvent(new CustomEvent('reveal-expert')));
 const element=document.getElementById(contributionAnchor(request,participant));
 element?.scrollIntoView({block:'start',behavior:'instant'});element?.focus({preventScroll:true});
}
export function DiscussionRoster({request,runs,names}:{request:SpaceRequest;runs:Record<string,AgentRun>;names:Record<string,string>}){
 const L=useCopy();
 return <nav className="wf-discussion-roster" aria-label={L('本轮专家进展','Expert progress in this round')}>{request.participants.map(p=><Button key={p.employeeId} variant="ghost" size="sm" onClick={()=>revealContribution(request,p)}><span className="wf-roster-name">{speakerName(p,names[p.employeeId])}</span><DiscussionStatus participant={p} run={p.runId?runs[p.runId]:undefined}/></Button>)}</nav>;
}
export default function DiscussionIdentity({request,participant:p,run,fallbackName,archived,onSave,onOpenRecord,children}:{request:SpaceRequest;participant:SpaceParticipant;run?:AgentRun;fallbackName?:string;archived:boolean;onSave():void;onOpenRecord?:()=>void;children:ReactNode}){
 const L=useCopy(),name=speakerName(p,fallbackName),anchor=contributionAnchor(request,p),context=p.contribution?.context;
 const model=run?.model||p.contribution?.model;
 return <Message role="region" className="wf-response" id={anchor} tabIndex={-1} aria-labelledby={anchor+'-name'} data-expert-id={p.employeeId}>
  <MessageContent><MessageHeader className="wf-speaker-header">
   <Avatar aria-hidden="true"><AvatarFallback>{Array.from(name).slice(0,2).join('')}</AvatarFallback></Avatar>
   <div className="wf-speaker-name"><strong id={anchor+'-name'}>{name}</strong><span>{model||L('模型信息未记录','Model not recorded')}</span></div>
   <div className="wf-response-meta"><DiscussionStatus participant={p} run={run}/>
    <Popover><PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={L(`查看${name}的发言依据`,`View context for ${name}`)}/>}>{L('依据','Context')}</PopoverTrigger><PopoverContent side="bottom" align="end" className="wf-contribution-context w-80 max-w-[calc(100vw-24px)] max-h-[min(440px,var(--available-height))] overflow-y-auto"><PopoverTitle>{L('本次发言依据','Context for this contribution')}</PopoverTitle>
     {context?<><p>{context.assignment||L('使用专家通用职责','Uses the expert’s general responsibilities')}</p><p>{request.host?L('收到主持人的独立委派、当前方案及此前真实回复。','Received the host’s scoped assignment, current brief and earlier actual responses.'):context.completeHistory?L('收到本话题此前的完整用户消息与专家回复。','Received the preceding user messages and expert replies in full.') :context.priorRequestIds.length?L(`已提供前 ${context.priorRequestIds.length} 轮的观点摘录。`,`Received excerpts from ${context.priorRequestIds.length} previous rounds.`):L('未提供前轮观点。','No previous-round responses were provided.')}{context.historyTruncated&&L('更早的轮次已省略。','Earlier rounds were omitted.')}</p>{context.documents.length>0&&<ul>{context.documents.map(d=><li key={d.id}>{d.title} · v{d.revision}</li>)}</ul>}<p>{L('授权历史空间','Authorized historical spaces')} · {context.historySpaceIds.length}</p><small>{L('上下文版本','Context version')} · {context.version.slice(0,12)}</small></>:<p>{L('历史记录未保存完整的发言依据，无法确认当时收到的全部上下文。','This historical record does not preserve the complete input context.')}</p>}
     {!!p.role?.skills.length&&<><p>{L('已加载技能（不代表已经调用）','Loaded skills (not proof of use)')}</p><ul>{p.role.skills.map(s=><li key={s.id}>{s.name}</li>)}</ul></>}
    </PopoverContent></Popover>
    {(p.output||onOpenRecord)&&<DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={L('回复操作','Response actions')}/> }><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{onOpenRecord&&<DropdownMenuItem onClick={onOpenRecord}>{L('查看执行记录','View execution record')}</DropdownMenuItem>}{p.output&&<DropdownMenuItem disabled={archived} onClick={onSave}>{L('保存为文档草稿','Save as document draft')}</DropdownMenuItem>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
   </div>
  </MessageHeader>
  {children}
 </MessageContent></Message>;
}
