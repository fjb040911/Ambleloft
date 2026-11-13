import TaskDelivery from './TaskDelivery';
import {Button} from './components/ui/button';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {useCopy} from './WorkforceInputs';
import {useConfirm} from './Confirmation';
import type {WorkPlan} from './workforce-types';
import type {ProviderCatalog} from './types';

export default function PlanControls({requestKinds,plan,catalog,readOnly,busy,onOpenTask,select,change}:{requestKinds:Record<string,string>;plan:WorkPlan;catalog:ProviderCatalog;readOnly:boolean;busy:boolean;onOpenTask(id:string):void;select(id:string,detailTab?:'review'):void;change(permission:'default'|'full'):Promise<void>}){
 const L=useCopy(),confirm=useConfirm();
 const waiting=plan.packages.filter(p=>p.status==='waiting'||!!requestKinds[p.attempts.at(-1)?.runId||'']&&!['unknown','loading'].includes(requestKinds[p.attempts.at(-1)?.runId||''])),reviews=plan.packages.filter(p=>p.status==='review');
 return <section className="wf-plan-command-center" aria-label={L('计划控制与待处理','Plan controls and requests')}>
  <label className="wf-actions">{L('计划授权模式','Plan permission')}
   <NativeSelect aria-label={L('计划授权模式','Plan permission')} disabled={readOnly||busy||plan.packages.some(p=>p.permissionChange?.state==='switching')} value={plan.permission||'default'} onChange={e=>{const permission=e.target.value as 'default'|'full';void(async()=>{
    if(permission==='full'&&!await confirm({title:L('更改整个计划的默认授权？','Change the plan default permission?'),description:L('继承计划的节点将允许无需逐次审批的操作。当前执行及子 Agent 会短暂暂停，确认新权限后继续。单独设置的节点不受影响。','Inherited nodes allow operations without individual approval. Active executions and subagents pause briefly and resume after permission confirmation. Node overrides remain unchanged.'),action:L('应用计划授权','Apply plan permission')}))return;
    await change(permission);
   })();}}><NativeSelectOption value="default">{L('按需审批','Ask when needed')}</NativeSelectOption><NativeSelectOption value="full">{L('完全访问','Full access')}</NativeSelectOption></NativeSelect>
  </label>
  <p className="wf-muted">{L('运行中的节点及子 Agent 将切换权限并保留上下文继续；请在节点详情查看是否已生效。','Active nodes and subagents switch permissions and continue with preserved context. Check each node for confirmation.')}</p>
  <details open={waiting.length>0?true:undefined}><summary>{L('待授权或补充','Approval or input needed')} ({waiting.length}) · {L('待验收','Awaiting review')} ({reviews.length})</summary>
   {waiting.map(p=><section key={p.id}><div className="wf-section-title"><h4>{p.definition.title}</h4><Button variant="ghost" onClick={()=>select(p.id)}>{L('打开任务','Open task')}</Button></div><TaskDelivery mode="actions" readOnly={readOnly} runId={p.attempts.at(-1)?.runId} catalog={catalog} onOpenTask={onOpenTask}/></section>)}
   {reviews.map(p=><Button key={p.id} variant="outline" onClick={()=>select(p.id,'review')}>{p.definition.title} · {L('检查交付并验收','Review delivery')}</Button>)}
   {!waiting.length&&!reviews.length&&<p className="wf-muted">{L('当前没有需要处理的请求','No requests need attention')}</p>}
  </details>
 </section>;
}
