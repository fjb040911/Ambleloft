import {packageState} from './workforce-automation-state';
import {ArrowRight,CheckCircle2} from 'lucide-react';
import {Button} from './components/ui/button';
import TaskStatusBadge from './TaskStatusBadge';
import {useCopy} from './WorkforceInputs';
import type {Employee,WorkPackage,WorkPlan} from './workforce-types';

// This is a live view of direct successors, not a prediction that acceptance dispatched them.
export default function TaskReviewOutcome({plan,item,employees,onSelect}:{plan:WorkPlan;item:WorkPackage;employees:Employee[];onSelect(id:string):void}){
 const L=useCopy();
 if(!item.acceptance)return null;
 const accepted=item.acceptance.accepted&&!item.stale&&item.status==='accepted';
 const successors=plan.packages.filter(p=>p.definition.dependencies.includes(item.id));
 const running=successors.filter(p=>p.status==='running').length;
 const preparing=successors.filter(p=>['starting','preparing','started'].includes(p.status)).length;
 const summary=!accepted
  ?item.stale||item.status==='stale'?L('验收依据已更新，请修订后重新核对。','The review basis changed. Revise and check it again.'):L('验收未通过，后续任务仍需等待。','Delivery rejected. Dependent tasks must wait.')
  :plan.status==='completed'?plan.packages.some(p=>p.acceptance?.source==='completion-policy')?L('本计划已完成，部分节点按设置直接放行，未核验质量。','Plan completed. Some tasks were released without quality verification, as configured.'):L('本计划已全部验收完成。','All tasks in this plan are accepted.')
  :plan.status!=='running'?L('验收已保存。计划未运行，不会启动新的任务；返回流程图继续计划。','Review saved. The plan is not running; no new tasks will start. Resume it from the graph.')
  :running||preparing?L(`后续任务：${running} 项执行中，${preparing} 项准备中。`,`Next tasks: ${running} running, ${preparing} preparing.`)
  :successors.some(p=>p.status==='pending')?L('验收已保存，尚无后续任务开始执行。调度状态会自动更新。','Review saved. No next task has started yet. Scheduling status updates automatically.')
  :L('验收已保存，后续任务状态如下。','Review saved. Current downstream task statuses are shown below.');
 const reason=(p:WorkPackage)=>{
  if(p.stale)return p.reason||L('依据已更新，需要修订后重新调度。','The basis changed. Revise before rescheduling.');
  if(p.status!=='pending')return p.reason||'';
  const dependencies=p.definition.dependencies.map(id=>plan.packages.find(v=>v.id===id)).filter(d=>!d||d.status!=='accepted'||d.stale);
  const waiting=dependencies.length?L('等待前置任务验收：','Awaiting prerequisite acceptance: ')+dependencies.map(d=>d?.definition.title||L('任务已不存在','Missing task')).join('、'):'';
  const paused=plan.status!=='running'?L('计划未运行，尚未调度。','The plan is not running; not dispatched.'):'';
  // Acceptance updates before the scheduler's next pulse. Derive dependency
  // readiness from the current nodes, not the previous pulse's stale reason.
  const reason=p.reason==='等待上游工作包验收'?'':p.reason;
  return [paused,waiting||reason||(!paused?L('前置验收已满足，等待调度器检查资料与执行资源。','Prerequisites accepted; awaiting input and execution-resource checks.'):'')].filter(Boolean).join(' ');
 };
 return <section className="wf-review-outcome" aria-label={L('验收结果与后续任务','Review outcome and next tasks')}>
  <h3 tabIndex={-1} data-review-result>{accepted&&<CheckCircle2 aria-hidden="true"/>}{accepted?item.acceptance.source==='completion-policy'?L('已按设置放行','Released as configured'):L('验收已通过','Delivery accepted'):L('验收结果','Review outcome')}</h3>
  <p className="wf-muted">{item.acceptance.source==='automatic-review'?L('按指标自动验收通过','Automatically verified against criteria'):item.acceptance.source==='completion-policy'?L('完成即放行，未核验质量','Passed on completion; quality was not verified'):L('人工验收记录','Human review record')}</p>
  <p role="status" aria-live="polite">{summary}</p>
  {item.acceptance.note&&<p className="wf-muted">{item.acceptance.note}</p>}
  {!!successors.length?<ul className="wf-successor-list">{successors.map(p=><li key={p.id} data-successor-id={p.id}>
   <div className="wf-successor-heading"><strong>{p.definition.title}</strong><TaskStatusBadge state={p.stale?'stale':p.status}>{packageState(p,L)}</TaskStatusBadge></div>
   <div className="wf-successor-owner"><span>{employees.find(e=>e.id===p.definition.ownerId)?.name||L('专家已移除','Expert removed')}</span><Button variant="ghost" size="sm" onClick={()=>onSelect(p.id)}>{L('查看任务','View task')}<ArrowRight data-icon="inline-end"/></Button></div>
   {reason(p)&&<p className="wf-muted">{reason(p)}</p>}
  </li>)}</ul>:<p className="wf-muted">{L('没有直接依赖本任务的后续任务。','No tasks directly depend on this task.')}</p>}
 </section>;
}
