import {useEffect,useState} from 'react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {useCopy,Failure} from './WorkforceInputs';
import {useLanguage} from './i18n';
import {useConfirm} from './Confirmation';
import {documentImpact} from './workforce-space-state';
import {executionState} from './workforce-execution-state';
import {previewPackages} from './workforce-plan-graph';
import WorkforcePlanGraph from './WorkforcePlanGraph';
import TaskRelationGuide from './TaskRelationGuide';
import FormFields,{type FormValues} from './FormFields';
import Markdown from './Markdown';
import type {TaskDraft,WorkPlan,Space,Employee,DiscussionTaskContext} from './workforce-types';
import type {Project} from './types';

export default function DiscussionPlan({draft,plan,drafts,plans,space,employees,projects,disabled,processing=false,hostQuestionPending=false,explanationOnly=false,target,select,refresh,send,edit,openPlan,choice}:{draft?:TaskDraft;plan?:WorkPlan;drafts:TaskDraft[];plans:WorkPlan[];space:Space;employees:Employee[];projects:Project[];disabled:boolean;processing?:boolean;hostQuestionPending?:boolean;explanationOnly?:boolean;target:DiscussionTaskContext;select(target:DiscussionTaskContext):void;refresh():Promise<void>;send(text:string,intent?:'explain-node'|'restart-guide'):Promise<boolean>;edit(id:string):void;openPlan(id:string,packageId?:string):void;choice:{providerId?:string;model?:string}}){
 const L=useCopy(),locale=useLanguage(),confirm=useConfirm(),api=window.desktop!.spaces!;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[answers,setAnswers]=useState<FormValues>({});
 const value=draft?.value||(plan?{name:plan.name,goal:plan.goal,packages:plan.packages.map(p=>p.definition)}:null);
 const node=value?.packages.find(p=>p.id===target.packageId),locked=disabled||busy;
 const question=(draft?.assessment?.question||draft?.pendingQuestion)?.source.definition;
 const awaitingHost=processing||hostQuestionPending;
 const [reviewOpen,setReviewOpen]=useState(!explanationOnly);
 useEffect(()=>{setReviewOpen(!explanationOnly);},[explanationOnly,draft?.id,draft?.revision]);
 const needsReview=!!question||!!draft?.relationGuide?.nodes.length;
 const explain=()=>{setReviewOpen(false);void send(L('解释当前选中节点的职责、前置依赖和验收方法。','Explain the selected node’s responsibility, prerequisites and acceptance method.'),'explain-node');};
 const key='workforce.host-plan-answer:'+draft?.id+':'+JSON.stringify(question?.fields||[]);
 useEffect(()=>{try{setAnswers(JSON.parse(localStorage.getItem(key)||'{}'));}catch{setAnswers({});}},[key]);
 const changeAnswer=(name:string,value:string|number|boolean)=>setAnswers(old=>{const next={...old,[name]:value};localStorage.setItem(key,JSON.stringify(next));return next;});
 const run=async(fn:()=>Promise<unknown>)=>{if(locked)return false;setBusy(true);setError('');try{await fn();await refresh();return true;}catch(e){setError((e as Error).message);await refresh().catch(()=>{});return false;}finally{setBusy(false);}};
 const ready=draft?.status==='ready'&&draft.assessment?.revision===draft.revision;
 const stale=!!draft?.basePlanId&&plan?.revision!==draft.basePlanRevision;
 const apply=async(start:boolean)=>run(async()=>{
  if(!draft){if(!plan)return;await api.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:crypto.randomUUID(),action:'start'});return;}
  const snap=await api.snapshot(),current=snap.taskDrafts?.find(d=>d.id===draft.id);
  if(current?.revision!==draft.revision)throw Error(L('草稿已更新，请先查看最新流程。','The draft changed. Review the latest workflow.'));
  const refs=[...new Map(draft.value.packages.filter(p=>p.mode==='work').flatMap(p=>p.documentRefs).map(r=>[r.id+':'+r.revision,r])).values()];
  const documents=refs.flatMap(ref=>{const doc=snap.documents.find(d=>d.id===ref.id&&!d.deletedAt&&d.spaceId===space.id);if(!doc||doc.versions.find(v=>v.revision===ref.revision)?.hash!==ref.hash)throw Error(L('引用资料已变化，请重新检查。','A reference changed. Check the draft again.'));return doc.adoptedRevision===ref.revision?[]:[{id:doc.id,revision:ref.revision,hash:ref.hash!,expectedRevision:doc.revision,expectedAdoptedRevision:doc.adoptedRevision??null}];});
  if(documents.length){
   const affected=[...new Set(documents.flatMap(d=>{const impact=documentImpact(snap.plans||[],snap.requests,d.id,d.revision);return [...impact.packages.map(p=>p.title),...impact.requests.map(r=>r.prompt)];}))];
   if(!await confirm({title:L('确认计划的执行依据','Confirm execution references'),description:documents.map(d=>(snap.documents.find(v=>v.id===d.id)?.title||d.id)+' v'+d.revision).join('；')+(affected.length?L('。以下任务及其下游需重新核对：','; These tasks and their dependents need review: ')+affected.join('；'):''),action:L('确认依据','Confirm references')}))return;
  }
  const base=draft.basePlanId?snap.plans?.find(p=>p.id===draft.basePlanId):undefined;
  if(draft.basePlanId){
   if(base?.revision!==draft.basePlanRevision)throw Error(L('计划已有新版本，请让主持人基于最新版本重新修订。','The plan changed. Ask the host to revise the latest version.'));
   if(!await confirm({title:L('应用这份修订？','Apply this revision?'),description:L('将暂停整个计划，等待执行停止后保存新版；变更节点及受影响的下游需要重新执行或验收。历史记录保留，保存后不会自动启动。','Pauses the whole plan before saving. Changed nodes and affected dependents need execution or review again. History is kept. Saving does not restart the plan.'),action:L('应用修订','Apply revision')}))return;
  }
  const basisConfirmation=documents.length?{documents,context:JSON.stringify([(snap.plans||[]).filter(p=>p.spaceId===space.id).map(p=>[p.id,p.revision]).sort(),snap.requests.filter(r=>r.spaceId===space.id&&r.mode==='work').map(r=>r.id).sort()])}:undefined;
  const saved=await api.createGuidedPlan({id:draft.id,expectedRevision:draft.revision,basisConfirmation,pauseBeforeApply:!!base});
  select({planId:saved.id});
  if(start&&!draft.basePlanId)try{await api.controlPlan({id:saved.id,expectedRevision:saved.revision,commandId:crypto.randomUUID(),action:'start'});}catch(e){throw Error(L('计划已保存，但启动未完成。','Plan saved, but starting did not complete. ')+(e as Error).message);}
 });
 if(!value)return null;
 const options=[...drafts.map(d=>({id:'draft:'+d.id,name:(d.value.name||L('未命名草稿','Untitled draft'))+' · '+L('草稿','Draft')})),...plans.map(p=>({id:'plan:'+p.id,name:p.name+' · '+executionState(p.status,L)}))];
 return <section id="discussion-current-plan" className="wf-discussion-plan" aria-label={L('当前任务流程','Current task workflow')}>
  <header className="wf-section-title"><div><h3>{value.name||L('任务规划草稿','Task plan draft')}</h3><div className="wf-actions"><Badge variant="secondary">{draft?(draft.basePlanId?L('修订草稿','Revision draft'):L('计划草稿','Plan draft')):executionState(plan!.status,L)}</Badge><span className="wf-muted">v{draft?.revision||plan?.revision}</span></div></div><div className="wf-actions"><Button variant="ghost" size="sm" disabled={locked} onClick={()=>void send(L('检查当前计划的实际执行进度，说明阻塞和下一步。','Check actual plan progress, blockers and next steps.'))}>{L('汇报进展','Report progress')}</Button></div></header>
  {options.length>1&&<NativeSelect disabled={locked} aria-label={L('本话题的计划','Plans in this topic')} value={draft?'draft:'+draft.id:'plan:'+plan?.id} onChange={e=>{const [kind,id]=e.target.value.split(':');select(kind==='draft'?{draftId:id}:{planId:id});}}>{options.map(o=><NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}</NativeSelect>}
  <p>{value.goal}</p><Failure message={error}/>
  {stale&&<p role="status">{L('正式计划已有新版本。这份草稿不能直接应用，请告诉主持人基于最新版本重新修订。','The saved plan has a newer version. Ask the host to revise the latest version before applying.')}</p>}
  {draft?.assessment&&<div className="wf-guide-assessment"><Markdown text={draft.assessment.summary}/>{!!draft.assessment.missing.length&&<details><summary>{L('待补齐信息','Missing information')} · {draft.assessment.missing.length}</summary><ul>{draft.assessment.missing.map(m=><li key={m}>{m}</li>)}</ul></details>}</div>}
  {!!value.packages.length&&<WorkforcePlanGraph preview={!!draft} planId={draft?.id||plan!.id} name={value.name} packages={draft?previewPackages(value.packages):plan!.packages} employees={employees} projects={projects} selectedId={target.packageId} onSelect={packageId=>select({...target,packageId})} onClear={()=>select({...target,packageId:undefined})}/>}
  {node&&<section className="wf-graph-preview-detail" aria-label={L('选中节点','Selected node')}><h4>{node.title}</h4><p>{node.instruction}</p><p>{L('交付：','Delivery: ')}{node.deliverables}</p><p>{L('验收：','Acceptance: ')}{node.acceptance}</p>{node.constraints&&<p>{L('约束：','Constraints: ')}{node.constraints}</p>}<div className="wf-actions"><Button variant="outline" size="sm" disabled={locked} onClick={explain}>{L('请主持人解释','Ask the host to explain')}</Button>{!draft&&plan&&<Button variant="ghost" onClick={()=>openPlan(plan.id,node.id)}>{L('查看执行详情','View execution details')}</Button>}</div></section>}
  {awaitingHost&&<p role="status" className="wf-muted">{processing?(explanationOnly?L('正在解释所选节点，计划保持不变。','Explaining the selected node; the plan remains unchanged.'):L('正在根据你的补充更新流程，完成后会显示下一步。','Updating the workflow from your clarification. The next step will appear when ready.')):L('请先回答主持人当前的问题，再继续核对计划。','Answer the host’s current question before reviewing the plan.')}</p>}
  {needsReview&&!reviewOpen&&!awaitingHost&&<div className="wf-actions"><span className="wf-muted">{L('计划仍有待确认信息，不影响查看节点解释。','The plan has pending information; you can still read the node explanation.')}</span><Button variant="outline" size="sm" disabled={locked} onClick={()=>setReviewOpen(true)}>{L('继续完善计划','Continue reviewing the plan')}</Button></div>}
  {question&&reviewOpen&&!awaitingHost&&<section className="wf-guide-question" aria-label={L('补充任务信息','Clarify task information')}><h4>{question.title}</h4><p className="wf-muted">{L('先确认影响任务范围的信息；确认后再核对项目关系。已填写内容会保留。','Clarify the task scope first, then review project relationships. Your input is preserved.')}</p><FormFields fields={question.fields} values={answers} change={changeAnswer} locked={locked}/><Button disabled={locked||question.fields.some(f=>f.required&&!String(answers[f.name]??'').trim())} onClick={()=>void send(question.fields.map(f=>f.label+': '+String(answers[f.name]??'')).join('\n'))}>{L('补充给主持人','Send answers to host')}</Button></section>}
  {draft?.relationGuide&&reviewOpen&&!question&&!draft.requirementsPending&&!awaitingHost&&<TaskRelationGuide key={draft.id} draftId={draft.id} guide={draft.relationGuide} disabled={locked} dirty={false} answer={(packageId,answers)=>run(()=>api.answerTaskRelations({id:draft.id,expectedRevision:draft.revision,requestKey:draft.relationGuide!.requestKey,packageId,answers,locale}))} refine={message=>void run(()=>api.guideTask({id:draft.id,expectedRevision:draft.revision,requestId:crypto.randomUUID(),message,phase:'relations',locale,...choice}))}/>}
  <div className="wf-guide-actions">{draft?<><Button variant="ghost" disabled={locked} onClick={()=>edit(draft.id)}>{L('手动编辑草稿','Edit draft manually')}</Button><Button variant="outline" disabled={locked} onClick={()=>void run(()=>api.checkTaskDraft({id:draft.id,expectedRevision:draft.revision,locale}))}>{L('检查完整性','Check completeness')}</Button><Button variant="outline" disabled={locked||!ready||stale} onClick={()=>void apply(false)}>{draft.basePlanId?L('检查并应用修订','Review and apply revision'):L('确认并保存计划','Confirm and save plan')}</Button>{!draft.basePlanId&&<Button disabled={locked||!ready} onClick={()=>void apply(true)}>{L('确认并启动','Confirm and start')}</Button>}</>:plan&&<><Button variant="outline" onClick={()=>openPlan(plan.id)}>{L('查看任务页','Open Tasks')}</Button>{['draft','paused'].includes(plan.status)&&<Button disabled={locked} onClick={()=>void apply(true)}>{L('启动此计划','Start this plan')}</Button>}</>}</div>
 </section>;
}
