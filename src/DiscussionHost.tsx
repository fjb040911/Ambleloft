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
import {spaceScroller} from './workforce-space-state';
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
  <header className="wf-speaker-header"><Avatar aria-hidden="true"><AvatarFallback><MessageCircle className="size-4"/></AvatarFallback></Avatar><div className="wf-speaker-name"><strong>{L('主持人','Host')}</strong><span>{host.model||(live?L('正在准备模型','Preparing model'):L('模型信息未记录','Model not recorded'))}</span></div><Badge variant={host.status==='failed'?'destructive':'secondary'}>{labels[host.status]||host.status}</Badge></header>
  {live&&<div className="wf-host-activity" aria-label={L('主持人运行状态','Host activity')}>
   {activity?.reasoning&&activity.phase==='reasoning'?<ThinkingWindow text={activity.reasoning} title={activity.reasoningFormat==='text'?'思考过程':'思考摘要'} live/>:<ProcessIndicator title={host.status==='preparing'?L('正在准备','Preparing'):host.status==='stopping'?L('正在停止','Stopping'):activity?.phase==='experts'?L('等待专家完成分析','Waiting for expert analysis'):activity?.phase==='responding'?L('正在整理回复','Preparing a response'):L('等待模型响应','Waiting for the model')}/>}
  </div>}
  {activity?.reasoning&&(!live||activity.phase!=='reasoning')&&<details className="wf-host-trace"><summary>{L('查看模型思考','View model reasoning')}</summary><ThinkingWindow text={activity.reasoning} title={activity.reasoningFormat==='text'?'思考过程':'思考摘要'} live={false}/></details>}
  {host.steps.length>1&&<details className="wf-host-trace"><summary>{L('查看协调过程','View coordination steps')} · {host.steps.length-1}</summary>{host.steps.slice(0,-1).map(s=><div key={s.id}><Markdown text={s.text}/></div>)}</details>}
  {host.steps.at(-1)&&<Markdown text={host.steps.at(-1)!.text}/>}
  {host.error&&<Alert variant="destructive"><AlertDescription>{host.error}</AlertDescription></Alert>}
  {['failed','interrupted'].includes(host.status)&&<p className="wf-muted">{L('已保留本轮结果。在输入框补充或发送“继续”，主持人会重新评估下一步。','Results are preserved. Add a message or send “continue” to reassess the next step.')}</p>}
  {children}
 </section>;
}
export function DiscussionQuestions({request,disabled,submit}:{request:SpaceRequest;disabled:boolean;submit(text:string,answers:FormValues):Promise<boolean>}){
 const L=useCopy(),q=request.host!.question!,key='workforce-host-answer:'+request.id+':'+q.requestKey;
 const [values,setValues]=useState<FormValues>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null')||q.prefill||{};}catch{return q.prefill||{};}}),[errors,setErrors]=useState<Record<string,string>>({}),[sending,setSending]=useState(false);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(values));}catch{}},[key,values]);
 return <form className="wf-host-questions" onSubmit={e=>{e.preventDefault();if(disabled||sending)return;const missing=Object.fromEntries(q.source.definition.fields.filter(f=>f.required&&!String(values[f.name]??'').trim()).map(f=>[f.name,L('请补充这一项','Complete this field')]));setErrors(missing);if(Object.keys(missing).length)return;setSending(true);const text=q.source.definition.fields.map(f=>f.label+'：'+(f.options?.find(o=>o.value===values[f.name])?.label||values[f.name]||'')).join('\n');void submit(text,values).then(ok=>{if(ok)localStorage.removeItem(key);}).finally(()=>setSending(false));}}>
  <FormFields fields={q.source.definition.fields} values={values} change={(name,value)=>{setValues(v=>({...v,[name]:value}));setErrors(e=>({...e,[name]:''}));}} errors={errors} locked={disabled||sending}/>
  <div className="wf-host-question-actions"><span className="wf-muted">{L('也可以直接在聊天中补充或调整目标。','You can also reply in chat or revise the goal.')}</span><Button type="submit" disabled={disabled||sending}>{sending?L('正在发送…','Sending…'):L('确认并继续','Confirm and continue')}</Button></div>
 </form>;
}
export function DiscussionTaskHandoff({state,model,disabled,proceed}:{state:'new'|'draft'|'plan'|'team';model?:string;disabled:boolean;proceed():void}){
 const L=useCopy();
 const title=state==='plan'?L('任务计划已保存','Task plan saved'):state==='draft'?L('已有任务草稿，继续核对','Continue reviewing the existing draft'):state==='team'?L('先安排参与工作的专家','Choose the experts who will do the work'):L('下一步：检查任务与分工','Next: review tasks and assignments');
 const description=state==='plan'?L('打开计划查看分工、执行状态与交付。','Open the plan to review assignments, progress and deliveries.'):state==='draft'?L('保留原讨论来源和已填写内容；新要求可以在草稿中补充。','Your original sources and edits are preserved. Add new requirements in the draft.'):state==='team'?L('当前空间还没有可分工的专家。添加成员后，可以继续整理任务。','This space has no experts to assign work to. Add members, then prepare the tasks.'):L(`使用 ${model||'当前模型'}，根据本轮讨论、引用资料和专家职责整理建议。关键缺项会继续询问，核对后由你确认是否启动。`,`Use ${model||'the selected model'} to prepare proposals from this discussion, references and expert responsibilities. Clarify any key gaps, then review before deciding to start.`);
 const label=state==='plan'?L('查看任务计划','View task plan'):state==='draft'?L('继续整理任务','Continue task draft'):state==='team'?L('选择参与专家','Choose experts'):L('整理并检查任务','Prepare and check tasks');
 return <section className="wf-host-handoff" aria-label={L('任务下一步','Next task step')}><h3>{title}</h3><p className="wf-muted">{description}</p><Button disabled={disabled} onClick={proceed} onFocus={event=>{
  const button=event.currentTarget,footer=button.closest('.wf-discussion-main')?.querySelector('.wf-discussion-footer');
  // Native focus scrolling does not account for the sticky composer.
  if(footer){const overlap=button.getBoundingClientRect().bottom-footer.getBoundingClientRect().top+16;if(overlap>0)spaceScroller(button).scrollBy({top:overlap,behavior:'instant'});}
 }}>{label}</Button></section>;
}
export function DiscussionBrief({request,requests,createTasks,disabled}:{request:SpaceRequest;requests:SpaceRequest[];createTasks():void;disabled:boolean}){
 const L=useCopy(),brief=request.host?.brief;if(!brief)return null;
 const labels={decision:L('用户决定','User decision'),proposal:L('待采纳建议','Proposal'),question:L('待确认','Open question'),verification:L('待验证','To verify')};
 const sources=[...new Set(brief.items.flatMap(i=>i.sourceIds))],latest=requests.at(-1);
 const jump=(id:string)=>{const r=requests.find(r=>r.id===id||r.host?.steps.some(step=>step.id===id)||r.participants.some(p=>p.contribution?.id===id||`${r.id}:${p.employeeId}`===id));if(!r)return;const p=r.participants.find(p=>p.contribution?.id===id||`${r.id}:${p.employeeId}`===id);const el=document.getElementById(p?contributionAnchor(r,p):'wf-request-'+r.id);const details=el?.closest('details');if(details)details.open=true;el?.scrollIntoView({block:'start'});el?.focus({preventScroll:true});};
 return <section className="wf-host-brief"><h3>{L('当前方案','Current brief')}</h3><p>{brief.goal}</p>{latest?.id!==request.id&&<p className="wf-muted">{L('后续有新讨论，等待主持人更新。','Newer discussion is awaiting consolidation.')}</p>}
  <ul>{brief.items.map(i=><li key={i.id}><Badge variant="outline">{labels[i.kind]}</Badge><p>{i.text}</p><div className="wf-host-sources">{i.sourceIds.map(id=><Button key={id} variant="link" size="sm" onClick={()=>jump(id)}>{L('来源','Source')} {sources.indexOf(id)+1}</Button>)}</div></li>)}</ul>
  <Button variant="outline" disabled={disabled} onClick={createTasks}>{L('整理为任务','Shape into tasks')}</Button><p className="wf-muted">{L('确认任务草稿后再启动。','Review the task draft before starting.')}</p>
 </section>;
}
