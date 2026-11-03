import TaskDelivery from './TaskDelivery';
import {Button} from './components/ui/button';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {useCopy} from './WorkforceInputs';
import {useConfirm} from './Confirmation';
import type {WorkPlan} from './workforce-types';
import type {ProviderCatalog} from './types';

export default function PlanControls({plan,catalog,readOnly,busy,onOpenTask,select,change}:{plan:WorkPlan;catalog:ProviderCatalog;readOnly:boolean;busy:boolean;onOpenTask(id:string):void;select(id:string):void;change(permission:'default'|'full'):Promise<void>}){
 const L=useCopy(),confirm=useConfirm();
 const waiting=plan.packages.filter(p=>p.status==='waiting'),reviews=plan.packages.filter(p=>p.status==='review');
 return <section className="wf-plan-command-center" aria-label={L('计划控制与待处理','Plan controls and requests')}>
  <label className="wf-actions">{L('计划授权模式','Plan permission')}
   <NativeSelect aria-label={L('计划授权模式','Plan permission')} disabled={readOnly||busy} value={plan.permission||'default'} onChange={e=>{const permission=e.target.value as 'default'|'full';void(async()=>{
    if(permission==='full'&&!await confirm({title:L('更改整个计划的默认授权？','Change the plan default permission?'),description:L('继承计划的节点将允许无需逐次审批的操作。SSH 后续工具请求立即生效；本地当前执行保持原模式。已有待审批请求不会自动批准。单独设置的节点不受影响。','Inherited nodes allow operations without individual approval. Future SSH requests use the mode immediately; active local turns retain their policy. Pending requests are not approved automatically. Node overrides remain unchanged.'),action:L('应用计划授权','Apply plan permission')}))return;
    await change(permission);
   })();}}><NativeSelectOption value="default">{L('按需审批','Ask when needed')}</NativeSelectOption><NativeSelectOption value="full">{L('完全访问','Full access')}</NativeSelectOption></NativeSelect>
  </label>
  <p className="wf-muted">{L('SSH 后续工具请求即时生效；本地当前执行保持原模式，新执行使用新模式。已有请求仍需单独处理。','Future SSH requests use the new mode immediately. Active local executions retain their policy until a new execution. Pending requests still need a decision.')}</p>
  <details open={waiting.length>0?true:undefined}><summary>{L('待处理节点','Nodes needing input')} ({waiting.length}) · {L('待验收','Awaiting review')} ({reviews.length})</summary>
   {waiting.map(p=><section key={p.id}><div className="wf-section-title"><h4>{p.definition.title}</h4><Button variant="ghost" onClick={()=>select(p.id)}>{L('打开任务','Open task')}</Button></div><TaskDelivery mode="actions" readOnly={readOnly} runId={p.attempts.at(-1)?.runId} catalog={catalog} onOpenTask={onOpenTask}/></section>)}
   {reviews.map(p=><Button key={p.id} variant="outline" onClick={()=>select(p.id)}>{p.definition.title} · {L('检查交付并验收','Review delivery')}</Button>)}
   {!waiting.length&&!reviews.length&&<p className="wf-muted">{L('当前没有需要处理的请求','No requests need attention')}</p>}
  </details>
 </section>;
}
