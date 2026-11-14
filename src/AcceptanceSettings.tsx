import {automaticFallback} from './workforce-automation-state';
import {useId} from 'react';
import {Button} from './components/ui/button';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Alert,AlertDescription} from './components/ui/alert';
import {FormField,useCopy} from './WorkforceInputs';
import type {AcceptancePolicy,AcceptanceCheck,PackageDefinition,WorkPackage,WorkPlan} from './workforce-types';
export const defaultAcceptance:AcceptancePolicy={mode:'auto',maxRepairs:2,maxRetries:2};
export const legacyAcceptance:AcceptancePolicy={mode:'manual',maxRepairs:0,maxRetries:0};
export function AcceptancePolicyNote({value}:{value?:AcceptancePolicy}){
 const L=useCopy(),policy=value||legacyAcceptance;
 return <p className="wf-muted">{policy.mode==='auto'?L(`默认自动验收 · 最多修复 ${policy.maxRepairs} 次 · 证据不足转人工`, `Automatic acceptance · Up to ${policy.maxRepairs} repairs · Human fallback for missing evidence`):policy.mode==='complete'?L('完成即放行 · 不核验交付质量','Pass on completion · Delivery quality is not verified'):L('人工验收 · 节点可单独设置','Human acceptance · Nodes may override this rule')}</p>;
}
export function AcceptanceSettings({value,inherited,onChange,disabled=false}:{value?:AcceptancePolicy;inherited?:AcceptancePolicy;onChange(value:AcceptancePolicy|undefined):void;disabled?:boolean}){
 const L=useCopy(),id=useId(),effective=value||inherited||legacyAcceptance;
 return <FieldGroup><Field><FieldLabel htmlFor={id}>{inherited?L('节点验收方式','Node acceptance'):L('默认验收方式','Default acceptance')}</FieldLabel>
  <NativeSelect id={id} disabled={disabled} value={value?.mode||(inherited?'inherit':'manual')} onChange={e=>onChange(e.target.value==='inherit'?undefined:{...effective,mode:e.target.value as AcceptancePolicy['mode']})}>
   {inherited&&<NativeSelectOption value="inherit">{L('继承计划','Inherit plan')}</NativeSelectOption>}
   <NativeSelectOption value="auto">{L('按指标自动验收','Automatically verify criteria')}</NativeSelectOption><NativeSelectOption value="manual">{L('人工验收','Human review')}</NativeSelectOption><NativeSelectOption value="complete">{L('完成即放行（不核验质量）','Pass on completion (no quality check)')}</NativeSelectOption>
  </NativeSelect><FieldDescription>{effective.mode==='auto'?L('程序核算可测指标，AI 独立评审定性要求。证据不足或修复失败时交由你处理。','Measured criteria are checked by code; qualitative criteria receive independent AI review. Missing evidence or unsuccessful repair needs your attention.'):effective.mode==='complete'?L('执行正常结束即启动后续任务，不代表交付质量已达标。','A completed execution releases successors without verifying delivery quality.'):L('执行完成后等待人工决定；已有计划保留此规则。','Waits for a human decision after execution; existing plans retain this rule.')}</FieldDescription></Field>
  {(value||!inherited)&&effective.mode==='auto'&&<div className="grid gap-4 sm:grid-cols-2">{(['maxRepairs','maxRetries'] as const).map(key=><Field key={key}><FieldLabel htmlFor={id+key}>{key==='maxRepairs'?L('验收失败最多修复','Repairs after failed review'):L('服务故障最多重试','Retries after service failure')}</FieldLabel><NativeSelect id={id+key} disabled={disabled} value={effective[key]} onChange={e=>onChange({...effective,[key]:Number(e.target.value)})}>{[0,1,2,3].map(n=><NativeSelectOption key={n} value={n}>{n===0?L('不自动重试','No automatic retry'):L(`${n} 次`,`${n} attempts`)}</NativeSelectOption>)}</NativeSelect></Field>)}</div>}
 </FieldGroup>;
}
export function AcceptanceChecksEditor({definition,onChange,disabled=false}:{definition:PackageDefinition;onChange(checks:AcceptanceCheck[]):void;disabled?:boolean}){
 const L=useCopy(),fieldId=useId(),checks=definition.acceptanceChecks||[];
 const patch=(i:number,value:Partial<AcceptanceCheck>)=>onChange(checks.map((c,n)=>n===i?{...c,...value}:c));
 return <details><summary>{L('自动验收指标','Automatic acceptance criteria')} · {checks.length}</summary><FieldGroup>
  <p className="wf-muted">{L('AI 从讨论整理这些指标。可在聊天中调整，也可在此编辑；保存修订后生效。未配置独立指标时，按上面的验收标准与验证方法评审。','AI derives these criteria from the discussion. Revise them in chat or here; changes apply after saving a revision. Without individual checks, the acceptance criteria and verification method are reviewed together.')}</p>
  {checks.map((c,i)=><FieldGroup key={c.id}><FormField label={L('要求','Requirement')+` ${i+1}`} value={c.requirement} disabled={disabled} onChange={requirement=>patch(i,{requirement})}/>
   <Field><FieldLabel htmlFor={fieldId+'-kind-'+c.id}>{L('验证方式','Verification')}</FieldLabel><NativeSelect id={fieldId+'-kind-'+c.id} disabled={disabled} value={c.kind} onChange={e=>patch(i,{kind:e.target.value as AcceptanceCheck['kind']})}>{[['rubric',L('AI 评审内容与证据','AI review of content and evidence')],['output-equals',L('最终文本完全匹配','Exact final text')],['tool-exit',L('命令退出码','Command exit code')],['metric',L('JSON 数值指标','JSON numeric metric')]].map(([value,label])=><NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
   {c.kind!=='output-equals'&&<FormField label={c.kind==='metric'?L('指标路径（JSON Pointer）','Metric path (JSON Pointer)'):L('需要的证据','Required evidence')} value={c.evidence} disabled={disabled} onChange={evidence=>patch(i,{evidence})}/>}
   {['tool-exit','metric'].includes(c.kind)&&<FormField label={L('验证命令（与执行记录完全匹配）','Verification command (exact match)')} value={c.target} disabled={disabled} onChange={target=>patch(i,{target})}/>}
   {c.kind!=='rubric'&&<FormField label={L('预期值','Expected value')} value={c.expected} disabled={disabled} onChange={expected=>patch(i,{expected})}/>}
   {c.kind==='metric'&&<Field><FieldLabel htmlFor={fieldId+'-op-'+c.id}>{L('比较规则','Comparison')}</FieldLabel><NativeSelect id={fieldId+'-op-'+c.id} disabled={disabled} value={c.operator} onChange={e=>patch(i,{operator:e.target.value as AcceptanceCheck['operator']})}>{[['eq',L('等于','Equals')],['gte',L('不低于','At least')],['lte',L('不高于','At most')]].map(([value,label])=><NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>}
   <Button variant="ghost" disabled={disabled} onClick={()=>onChange(checks.filter((_,n)=>n!==i))}>{L('移除此指标','Remove criterion')}</Button>
  </FieldGroup>)}
  <Button variant="outline" disabled={disabled||checks.length>=12} onClick={()=>onChange([...checks,{id:crypto.randomUUID(),kind:'rubric',requirement:'',evidence:'',target:'',expected:'',operator:'eq'}])}>{L('添加验收指标','Add criterion')}</Button>
 </FieldGroup></details>;
}
export function AcceptanceSummary({plan,item}:{plan:WorkPlan;item:WorkPackage}){
 const L=useCopy(),policy=item.definition.acceptancePolicy||plan.acceptancePolicy||legacyAcceptance,report=item.attempts.at(-1)?.automaticReview;
 return <section aria-label={L('验收规则与结果','Acceptance rules and result')} className="flex flex-col gap-3">
  <h3>{policy.mode==='complete'?L('完成即放行','Pass on completion'):report?L('本次自动验收','Latest automatic review'):policy.mode==='auto'?L('按指标自动验收','Automatic acceptance'):L('人工验收','Human review')}</h3>
  {policy.mode==='auto'&&<details><summary>{L('验收与重试设置','Review and retry settings')}</summary><p className="wf-muted">{L(`最多修复 ${policy.maxRepairs} 次 · 服务故障最多重试 ${policy.maxRetries} 次 · 无法确认时转人工`, `Up to ${policy.maxRepairs} repairs · ${policy.maxRetries} service retries · Human fallback when uncertain`)}</p></details>}
  {report?.state==='checking'&&<Alert><AlertDescription>{L('正在自动验收，通过后继续后续任务，无需操作。','Reviewing automatically. Passing releases the next tasks; no action needed.')}</AlertDescription></Alert>}
  {automaticFallback(item)&&<Alert><AlertDescription>{item.reason||report?.reason||L('自动验收无法确认结果，请核对证据。','Automatic review could not confirm the result. Check the evidence.')} {L('可按原标准重新验证，也可核对交付后人工验收。','Retry against the agreed criteria, or inspect the delivery for human acceptance.')}</AlertDescription></Alert>}
  {report?.results?.map(r=><div key={r.id}><strong>{r.outcome==='pass'?L('通过','Passed'):r.outcome==='fail'?L('未通过','Failed'):L('证据不足','Insufficient evidence')} · {item.definition.acceptanceChecks?.find(c=>c.id===r.id)?.requirement||item.definition.acceptance}</strong><p>{r.reason}</p>{!!r.evidence.length&&<details><summary>{L('依据记录','Evidence references')} · {r.evidence.length}</summary><p className="wf-muted">{r.evidence.join(' · ')}</p></details>}</div>)}
  {policy.mode!=='complete'&&item.definition.acceptanceChecks?.length&&!report?.results?.length?<ul>{item.definition.acceptanceChecks.map(c=><li key={c.id}>{c.requirement}{c.kind==='metric'?` · ${c.evidence} ${c.operator} ${c.expected}`:''}</li>)}</ul>:null}
 </section>;
}
