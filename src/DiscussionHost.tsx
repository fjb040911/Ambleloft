import {useState,useEffect} from 'react';
import {MessageCircle} from 'lucide-react';
import {Avatar,AvatarFallback} from './components/ui/avatar';
import {Badge} from './components/ui/badge';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import FormFields,{type FormValues} from './FormFields';
import Markdown from './Markdown';
import {ThinkingWindow,ProcessIndicator} from './ProcessPanel';
import {useCopy} from './WorkforceInputs';
import {contributionAnchor} from './DiscussionIdentity';
import type {DiscussionHost,SpaceRequest} from './workforce-types';

export function ExpertContributions({request,children}:{request:SpaceRequest;children:React.ReactNode}){
 const L=useCopy();if(!request.host)return <>{children}</>;
 if(!request.participants.length)return null;
 return <details className="wf-host-experts"><summary>{L('专家分析与执行记录','Expert analysis and execution records')} · {request.participants.length}</summary>{children}</details>;
}

export function DiscussionHostReply({host,children}:{host:DiscussionHost;children?:React.ReactNode}){
 const L=useCopy(),live=['preparing','running','stopping'].includes(host.status),activity=host.activity;
 const labels:Record<string,string>={preparing:L('准备中','Preparing'),running:L('协调中','Coordinating'),'needs-input':L('待你确认','Your input needed'),ready:L('可整理为任务','Ready to shape into tasks'),completed:L('本轮已完成','Round complete'),failed:L('协调未完成','Coordination incomplete'),interrupted:L('已停止','Stopped')};
 return <section className="wf-response wf-host-response" aria-label={L('主持人回复','Host response')}>
  <header className="wf-speaker-header"><Avatar aria-hidden="true"><AvatarFallback><MessageCircle className="size-4"/></AvatarFallback></Avatar><div className="wf-speaker-name"><strong>{L('主持人','Host')}</strong><span>{host.model||(live?L('正在准备模型','Preparing model'):L('模型信息未记录','Model not recorded'))}</span></div><Badge variant={host.status==='failed'?'destructive':'secondary'}>{host.task?.restarted&&host.status==='completed'?L('新引导已开始','New guide started'):labels[host.status]||host.status}</Badge></header>
  {live&&<div className="wf-host-activity" aria-label={L('主持人运行状态','Host activity')}>
   {activity?.reasoning&&activity.phase==='reasoning'?<ThinkingWindow text={activity.reasoning} title={activity.reasoningFormat==='text'?'思考过程':'思考摘要'} live/>:<ProcessIndicator title={host.status==='preparing'?L('正在准备','Preparing'):host.status==='stopping'?L('正在停止','Stopping'):activity?.phase==='planning'?L('正在规划任务与检查项目关系','Planning tasks and checking project relationships'):activity?.phase==='experts'?L('等待专家完成分析','Waiting for expert analysis'):activity?.phase==='responding'?L('正在整理回复','Preparing a response'):L('等待模型响应','Waiting for the model')}/>}
  </div>}
  {activity?.reasoning&&(!live||activity.phase!=='reasoning')&&<details className="wf-host-trace"><summary>{L('查看模型思考','View model reasoning')}</summary><ThinkingWindow text={activity.reasoning} title={activity.reasoningFormat==='text'?'思考过程':'思考摘要'} live={false}/></details>}
  {host.steps.length>1&&<details className="wf-host-trace"><summary>{L('查看协调过程','View coordination steps')} · {host.steps.length-1}</summary>{host.steps.slice(0,-1).map(s=><div key={s.id}><Markdown text={s.text}/></div>)}</details>}
  {host.steps.at(-1)&&<Markdown text={host.steps.at(-1)!.text}/>}
  {host.error&&<Alert variant="destructive"><AlertDescription>{host.error}</AlertDescription></Alert>}
  {['failed','interrupted'].includes(host.status)&&<p className="wf-muted">{L('已保留本轮结果。在输入框补充或发送“继续”，主持人会重新评估下一步。','Results are preserved. Add a message or send “continue” to reassess the next step.')}</p>}
  {host.task&&!host.task.restarted&&<p className="wf-muted">{L('计划草稿','Plan draft')} · v{host.task.draftRevision}{host.task.changes&&<> · {L('新增','Added')} {host.task.changes.added.length} · {L('调整','Changed')} {host.task.changes.changed.length} · {L('移除','Removed')} {host.task.changes.removed.length}</>}</p>}
  {host.progress&&<p className="wf-muted">{L('状态查询时间：','Status checked: ')}{new Date(host.progress.observedAt).toLocaleString()} · {L('已验收','Accepted')} {host.progress.nodes.filter(n=>n.accepted).length}/{host.progress.nodes.length}</p>}
  {children}
 </section>;
}
export function DiscussionQuestions({request,disabled,submit}:{request:SpaceRequest;disabled:boolean;submit(text:string,answers:FormValues):Promise<boolean>}){
 const L=useCopy(),q=request.host!.question!,key='workforce-host-answer:'+request.id+':'+q.requestKey;
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(key+':collapsed')==='true';}catch{return false;}});
 const collapse=(value:boolean)=>{setCollapsed(value);try{localStorage.setItem(key+':collapsed',String(value));}catch{}};
 const [values,setValues]=useState<FormValues>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null')||q.prefill||{};}catch{return q.prefill||{};}}),[errors,setErrors]=useState<Record<string,string>>({}),[sending,setSending]=useState(false);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(values));}catch{}},[key,values]);
 if(collapsed)return <div className="wf-actions"><span className="wf-muted">{L('问题已收起，未提交的回答已保留。','Question collapsed. Unsubmitted answers are preserved.')}</span><Button variant="ghost" size="sm" onClick={()=>collapse(false)}>{L('继续回答','Continue answering')}</Button></div>;
 return <form className="wf-host-questions" onSubmit={e=>{e.preventDefault();if(disabled||sending)return;const missing=Object.fromEntries(q.source.definition.fields.filter(f=>f.required&&!String(values[f.name]??'').trim()).map(f=>[f.name,L('请补充这一项','Complete this field')]));setErrors(missing);if(Object.keys(missing).length)return;setSending(true);const text=q.source.definition.fields.map(f=>f.label+'：'+(f.options?.find(o=>o.value===values[f.name])?.label||values[f.name]||'')).join('\n');void submit(text,values).then(ok=>{if(ok)localStorage.removeItem(key);}).finally(()=>setSending(false));}}>
  <div className="wf-actions"><Button type="button" size="sm" variant="ghost" onClick={()=>collapse(true)}>{L('稍后回答','Answer later')}</Button></div>
  <FormFields fields={q.source.definition.fields} values={values} change={(name,value)=>{setValues(v=>({...v,[name]:value}));setErrors(e=>({...e,[name]:''}));}} errors={errors} locked={disabled||sending}/>
  <div className="wf-host-question-actions"><span className="wf-muted">{L('也可以直接在聊天中补充或调整目标。','You can also reply in chat or revise the goal.')}</span><Button type="submit" disabled={disabled||sending}>{sending?L('正在发送…','Sending…'):L('确认并继续','Confirm and continue')}</Button></div>
 </form>;
}
export function DiscussionBrief({request,requests,createTasks,disabled,actionLabel,onSource}:{request:SpaceRequest;requests:SpaceRequest[];createTasks?():void;disabled?:boolean;actionLabel?:string;onSource?(id:string):void}){
 const L=useCopy(),brief=request.host?.brief;if(!brief)return null;
 const labels={decision:L('用户决定','User decision'),proposal:L('建议（未确认）','Suggestion (unconfirmed)'),question:L('待确认','Open question'),verification:L('待验证','To verify')};
 const sources=[...new Set(brief.items.flatMap(i=>i.sourceIds))],latest=requests.at(-1);
 const jump=(id:string)=>{if(onSource){onSource(id);return;}const r=requests.find(r=>r.id===id||r.host?.steps.some(step=>step.id===id)||r.participants.some(p=>p.contribution?.id===id||`${r.id}:${p.employeeId}`===id));if(!r)return;const p=r.participants.find(p=>p.contribution?.id===id||`${r.id}:${p.employeeId}`===id);const el=document.getElementById(p?contributionAnchor(r,p):'wf-request-'+r.id);const details=el?.closest('details');if(details)details.open=true;el?.scrollIntoView({block:'start'});el?.focus({preventScroll:true});};
 return <section className="wf-host-brief"><h3>{L('当前目标','Current goal')}</h3><p>{brief.goal}</p>{latest?.id!==request.id&&<p className="wf-muted">{L('后续有新讨论，等待主持人更新。','Newer discussion is awaiting consolidation.')}</p>}
  <ul>{brief.items.map(i=><li key={i.id}><Badge variant="outline">{labels[i.kind]}</Badge><p>{i.text}</p><div className="wf-host-sources">{i.sourceIds.map(id=><Button key={id} variant="link" size="sm" onClick={()=>jump(id)}>{L('来源','Source')} {sources.indexOf(id)+1}</Button>)}</div></li>)}</ul>
  {createTasks&&<Button variant="outline" disabled={disabled} onClick={createTasks}>{actionLabel||L('整理为任务','Shape into tasks')}</Button>}
 </section>;
}
