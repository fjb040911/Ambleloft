import {automationStage,hasPendingRequest,packageState} from './workforce-automation-state';
import {needsAttention} from './workforce-space-state';
import TaskDelivery from './TaskDelivery';
import {Button} from './components/ui/button';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {useCopy} from './WorkforceInputs';
import {useConfirm} from './Confirmation';
import type {WorkPlan} from './workforce-types';
import type {ProviderCatalog} from './types';

export default function PlanControls({requestKinds,plan,catalog,readOnly,busy,onOpenTask,select,change}:{requestKinds:Record<string,string>;plan:WorkPlan;catalog:ProviderCatalog;readOnly:boolean;busy:boolean;onOpenTask(id:string):void;select(id:string,detailTab?:'review'):void;change(permission:'default'|'full'):Promise<void>}){
 const L=useCopy(),confirm=useConfirm();
 const waiting=plan.packages.filter(p=>p.status==='waiting'||hasPendingRequest(requestKinds[p.attempts.at(-1)?.runId||'']));
 const actions=plan.packages.filter(p=>needsAttention(p)||waiting.includes(p)),first=waiting[0]||actions[0];
 const working=plan.packages.filter(p=>!!automationStage(p)||['starting','preparing','running'].includes(p.status)).length;

 return <section className="wf-plan-command-center" aria-label={L('计划控制与待处理','Plan controls and requests')}>
  <div className="wf-section-title"><label className="wf-actions">{L('计划授权模式','Plan permission')}
   <NativeSelect aria-label={L('计划授权模式','Plan permission')} disabled={readOnly||busy||plan.packages.some(p=>p.permissionChange?.state==='switching')} value={plan.permission||'default'} onChange={e=>{const permission=e.target.value as 'default'|'full';void(async()=>{
    if(permission==='full'&&!await confirm({title:L('更改整个计划的默认授权？','Change the plan default permission?'),description:L('继承计划的节点将允许无需逐次审批的操作。当前执行及子 Agent 会短暂暂停，确认新权限后继续。单独设置的节点不受影响。','Inherited nodes allow operations without individual approval. Active executions and subagents pause briefly and resume after permission confirmation. Node overrides remain unchanged.'),action:L('应用计划授权','Apply plan permission')}))return;
    await change(permission);
   })();}}><NativeSelectOption value="default">{L('按需审批','Ask when needed')}</NativeSelectOption><NativeSelectOption value="full">{L('完全访问','Full access')}</NativeSelectOption></NativeSelect>
  </label>{first?<Button disabled={readOnly||busy} onClick={()=>select(first.id,first.status==='review'?'review':undefined)}>{L('处理待办','Handle requests')} · {actions.length}</Button>:<span className="wf-muted" role="status">{plan.status==='completed'?L('全部节点已完成','All tasks completed'):plan.status!=='running'?L('计划未运行','Plan is not running'):working?L(`自动处理中 · ${working} 项，无需操作`,`Processing ${working} tasks · No action needed`):L('正在检查依赖，无需操作','Checking dependencies · No action needed')}</span>}</div>
  {!!actions.length&&<details open={waiting.length>0?true:undefined}><summary>{L('待办详情','Request details')} · {actions.length}</summary>
   {waiting.map(p=><section key={p.id}><div className="wf-section-title"><h4>{p.definition.title}</h4><Button variant="ghost" onClick={()=>select(p.id)}>{L('打开任务','Open task')}</Button></div><TaskDelivery mode="actions" readOnly={readOnly} runId={p.attempts.at(-1)?.runId} catalog={catalog} onOpenTask={onOpenTask}/></section>)}
   {actions.filter(p=>!waiting.includes(p)).map(p=><Button key={p.id} className="max-w-full h-auto whitespace-normal text-left justify-start" variant="ghost" onClick={()=>select(p.id,p.status==='review'?'review':undefined)}>{p.definition.title} · {packageState(p,L)}</Button>)}
  </details>}
 </section>;
}
