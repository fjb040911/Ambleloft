import TaskRelationGuide from './TaskRelationGuide';
import UserMessage from './UserMessage';
import {useConfirm} from './Confirmation';
import {documentImpact} from './workforce-space-state';
import ProjectBindingPlanner,{updatePackage} from './ProjectBindingPlanner';
import {useLanguage} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Button} from './components/ui/button';
import {Checkbox} from './components/ui/checkbox';
import {Badge} from './components/ui/badge';
import {createPortal} from 'react-dom';
import {FieldGroup,FieldSet,FieldLegend} from './components/ui/field';
import {Failure,FormField,useCopy} from './WorkforceInputs';
import FormFields,{type FormValues} from './FormFields';
import ChatComposer from './ChatComposer';
import Markdown from './Markdown';
import {ModelPicker} from './ComposerControls';
import {ProcessIndicator} from './ProcessPanel';
import type {Space,TaskDraft,PlanValue,Employee,WorkPlan} from './workforce-types';
import type {ProviderCatalog,Project} from './types';

export default function TaskCreationGuide({space,discussionId,catalog,employees,projects,close,restart,discussionMode=false,registerExit,refresh,created,autoAssess=false,initialChoice,composerHost,initialDraftId}:{initialDraftId?:string;space:Space;discussionId?:string;catalog:ProviderCatalog;employees:Employee[];projects:Project[];close():void;restart?():void;discussionMode?:boolean;registerExit?(leave:(()=>Promise<void>)|null):void;refresh():Promise<void>;created(plan:WorkPlan):void;autoAssess?:boolean;initialChoice?:{providerId?:string;model?:string};composerHost?:HTMLElement|null}){
 const locale=useLanguage();
 const L=useCopy(),confirm=useConfirm(),api=window.desktop!.spaces!;
 const [draft,setDraft]=useState<TaskDraft|null>(null),[value,setValue]=useState<PlanValue|null>(null),[input,setInput]=useState(''),[answers,setAnswers]=useState<FormValues>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[choice,setChoice]=useState<{providerId?:string;model?:string}>(()=>{if(initialChoice?.providerId)return initialChoice;const p=catalog.providers.find(p=>p.id===catalog.defaultId)||catalog.providers[0];return {providerId:p?.id,model:p?.model};});
 const request=useRef<string|null>(null),current=useRef<TaskDraft|null>(null),mounted=useRef(true),command=useRef(crypto.randomUUID()),[savedPlan,setSavedPlan]=useState<WorkPlan|null>(null);
 const restored=useRef(false),[assessing,setAssessing]=useState(false);
 const apply=(d:TaskDraft)=>{const previous=current.current;current.current=d;setDraft(d);setValue(d.value);if(JSON.stringify(previous?.assessment?.question||previous?.pendingQuestion)!==JSON.stringify(d.assessment?.question||d.pendingQuestion))setAnswers({});if(!restored.current){restored.current=true;try{const saved=JSON.parse(localStorage.getItem('workforce.task-guide-input:'+d.id)||'null');if(saved){setInput(saved.input||'');if(saved.revision===d.revision){setAnswers(saved.answers||{});if(saved.value)setValue(saved.value);}}}catch{}}};
 useEffect(()=>{if(draft)try{localStorage.setItem('workforce.task-guide-input:'+draft.id,JSON.stringify({input,answers,value,revision:draft.revision}));}catch{}},[draft?.id,draft?.revision,input,answers,value]);
 useEffect(()=>{mounted.current=true;void (initialDraftId?api.snapshot().then(s=>{const d=s.taskDrafts?.find(d=>d.id===initialDraftId);if(!d)throw Error('任务草稿不存在');return d;}):api.createTaskDraft({spaceId:space.id,discussionId,commandId:command.current})).then(d=>{if(mounted.current)apply(d);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));return()=>{mounted.current=false;if(request.current&&current.current)void api.cancelTaskGuide({id:current.current.id,requestId:request.current});};},[]);
 const dirty=!!draft&&JSON.stringify(value)!==JSON.stringify(draft.value);
 const persist=async()=>{if(!draft||!value)throw Error(L('草稿尚未加载','Draft is not loaded'));const d=dirty?await api.saveTaskDraft({id:draft.id,expectedRevision:draft.revision,value}):draft;apply(d);return d;};
 const reload=async()=>{const snap=await api.snapshot();const latest=snap.taskDrafts?.find(d=>d.id===current.current?.id);if(latest&&mounted.current)apply(latest);await refresh();};
 const assess=async(message=input,phase?:'relations')=>{if(busy||!draft)return;setBusy(true);setAssessing(true);setError('');try{const base=await persist();const requestId=crypto.randomUUID();request.current=requestId;if(!phase)setInput('');const result=await api.guideTask({id:base.id,expectedRevision:base.revision,requestId,message,locale,phase,...choice});if(mounted.current)apply(result);await refresh();}catch(e){if(mounted.current){if(!phase)setInput(current=>current||message);setError((e as Error).message);await reload().catch(()=>{});}}finally{request.current=null;if(mounted.current){setBusy(false);setAssessing(false);}}};
 const check=async()=>{if(busy||!draft)return;setBusy(true);setError('');try{const base=await persist();apply(await api.checkTaskDraft({id:base.id,expectedRevision:base.revision,locale}));await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const answerRelations=async(packageId:string,values:FormValues)=>{if(busy||dirty||!draft?.relationGuide)return false;setBusy(true);setError('');try{apply(await api.answerTaskRelations({id:draft.id,expectedRevision:draft.revision,requestKey:draft.relationGuide.requestKey,packageId,answers:values,locale}));await refresh();return true;}catch(e){setError((e as Error).message);await reload().catch(()=>{});return false;}finally{setBusy(false);}};
 const initialAssessment=useRef(false);
 useEffect(()=>{if(loading||!draft||initialAssessment.current)return;initialAssessment.current=true;
  // Only the explicit discussion handoff may assess a fresh draft automatically.
  // Restoring a draft must never regenerate over saved work or unsent input.
  if(autoAssess&&!dirty&&draft.revision===1&&!draft.assessment&&!draft.messages.length&&!draft.value.name&&!draft.value.goal&&!draft.value.packages.length&&!input.trim()&&!Object.values(answers).some(v=>String(v??'').trim()))void assess('');
 },[loading,draft?.id]);
 const stop=()=>{if(request.current&&draft)void api.cancelTaskGuide({id:draft.id,requestId:request.current});};
 const leave=()=>{
  // Closing is navigation, not validation. Keep even incomplete edits locally;
  // unmount cancels an in-flight assessment and guards its late response.
  if(draft)try{localStorage.setItem('workforce.task-guide-input:'+draft.id,JSON.stringify({input,answers,value,revision:draft.revision}));}catch{}
  close();void refresh().catch(()=>{});
 };
 useEffect(()=>{registerExit?.(async()=>{if(request.current&&current.current)await api.cancelTaskGuide({id:current.current.id,requestId:request.current});});return()=>registerExit?.(null);},[]);
 const create=async(start:boolean)=>{
  if(!draft||busy)return;setBusy(true);setError('');
  let persistedPlan=savedPlan,started=false;
  try{
   let basisConfirmation;
   if(!savedPlan){
    const snapshot=await api.snapshot(),refs=[...new Map(draft.value.packages.filter(p=>p.mode==='work').flatMap(p=>p.documentRefs).map(r=>[r.id+':'+r.revision,r])).values()];
    const documents=refs.flatMap(ref=>{const doc=snapshot.documents.find(d=>d.id===ref.id&&!d.deletedAt);if(!doc||doc.versions.find(v=>v.revision===ref.revision)?.hash!==ref.hash)throw Error(L('引用文档已变化，请重新检查任务信息','A referenced document changed. Recheck task information.'));return doc.adoptedRevision===ref.revision?[]:[{id:doc.id,revision:ref.revision,hash:ref.hash!,expectedRevision:doc.revision,expectedAdoptedRevision:doc.adoptedRevision??null}];});
    if(documents.length){
     const names=documents.map(d=>(snapshot.documents.find(v=>v.id===d.id)?.title||d.id)+' v'+d.revision);
     const affected=[...new Set(documents.flatMap(d=>{const impact=documentImpact(snapshot.plans||[],snapshot.requests,d.id,d.revision);return [...impact.packages.map(p=>p.title),...impact.requests.map(r=>r.prompt)];}))];
     if(!await confirm({title:L('确认本计划的执行依据','Confirm execution references'),description:names.join('；')+'。'+(affected.length?L('更换依据会使以下任务及其下游需要重新核对，原执行输入不会被替换：','Changing the basis requires review of these tasks and their dependents; original execution inputs remain unchanged: ')+affected.join('；'):L('这些版本将设为执行依据，并与计划一起保存。','These revisions will become execution references and be saved together with the plan.')),action:L('确认依据并创建计划','Confirm references and create plan')}))return;
     basisConfirmation={documents,context:JSON.stringify([(snapshot.plans||[]).filter(p=>p.spaceId===space.id).map(p=>[p.id,p.revision]).sort(),snapshot.requests.filter(r=>r.spaceId===space.id&&r.mode==='work').map(r=>r.id).sort()])};
    }
   }
   const plan=savedPlan||await api.createGuidedPlan({id:draft.id,expectedRevision:draft.revision,basisConfirmation});setSavedPlan(plan);persistedPlan=plan;
   if(start)await api.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:crypto.randomUUID(),action:'start'});
   started=start;
   await refresh();if(mounted.current){created(plan);close();}
  }catch(e){setError((persistedPlan?(!start?L('计划已保存，但状态刷新失败。请查看已保存的计划。','Plan saved, but refreshing failed. Open the saved plan.') :started?L('计划已启动，但状态刷新失败。请查看计划确认执行状态。','Plan started, but refreshing failed. Open the plan to check its status.'):L('计划已保存，但启动未完成。可重试启动，或查看已保存的计划。','Plan saved, but starting did not complete. Retry starting or open the saved plan.')):L('计划未能保存。填写内容已保留，请重试。','The plan could not be saved. Your input is preserved; please retry.'))+' '+(e as Error).message);await refresh().catch(()=>{});}finally{setBusy(false);}
 };

 const question=(draft?.assessment?.question||draft?.pendingQuestion)?.source.definition;
 const ready=!dirty&&draft?.status==='ready';
 const [reviewOpen,setReviewOpen]=useState(false);
 useEffect(()=>{if(value?.packages.length)setReviewOpen(true);},[!!value?.packages.length]);
 const composer=<div className="wf-task-guide-composer"><div className="wf-task-guide-recipient">{L('补充给任务整理','Clarification for task preparation')}</div><ChatComposer sendLabel={L('发送补充','Send clarification')} value={input} onChange={setInput} onSubmit={()=>void assess()} active={busy} onStop={stop} canSend={!!input.trim()&&!busy} label={L('补充任务需求','Additional task requirements')} placeholder={L('直接描述目标，或补充、修改上面的要求…','Describe the goal or clarify the requirements…')} controls={<div className="composer-options"><div className="composer-option-row min-h-8"><div className="composer-model-anchor"><ModelPicker catalog={catalog} value={choice} onChange={setChoice} disabled={busy}/></div></div></div>} skills={null} followup/></div>;
 return <section className="wf-task-guide-inline" aria-label={L('整理为任务','Shape tasks from discussion')}>
 <header className="wf-section-title"><div><h2 tabIndex={-1}>{L('整理任务','Prepare tasks')}</h2><p className="wf-muted">{L('在这里补充需求，核对后再启动。','Clarify here, then review before starting.')}</p></div>{!discussionMode&&<div className="wf-actions">{restart&&<Button size="sm" variant="ghost" onClick={restart}>{L('新话题重新梳理','Start over in a new topic')}</Button>}<Button size="sm" variant="ghost" onClick={leave}>{discussionId?L('返回讨论，保留草稿','Back to discussion · keep draft'):L('返回任务，保留草稿','Back to tasks · keep draft')}</Button></div>}</header><Failure message={error}/>
 <div className="wf-task-guide">
 {loading?<p role="status">{L('正在读取草稿…','Loading draft…')}</p>:savedPlan?<p role="status">{L('计划已保存；启动未完成。可以重试启动，也可以稍后在任务页启动。','Plan saved; it has not started. Retry starting or start later from Tasks.')}</p>:<>
 <div className="wf-actions"><Badge variant="secondary">{ready?L('待确认','Ready for confirmation'):L('待补充与检查','Needs input and review')}</Badge><span className="wf-muted">{discussionId?L('已固定本轮讨论来源','Discussion snapshot pinned'):L('从目标开始','Start with a goal')}</span></div>
 {assessing&&<ProcessIndicator title={L('正在检查需求、分工与验收条件','Checking requirements, assignments and acceptance criteria')}/>}
 {draft?.messages.filter((m,i)=>!(i===draft.messages.length-1&&m.role==='assistant'&&m.text===draft.assessment?.summary)).map((m,i)=>m.role==='user'?<UserMessage key={i} text={m.text} label={L('你的补充','Your clarification')}/>:<article key={i} className="message assistant" aria-label={L('任务整理回复','Task preparation response')}><Markdown text={m.text}/></article>)}
 {ready&&<p role="status" className="wf-muted">{L('信息已通过检查。请核对下方任务、负责人、执行项目和验收条件，再选择保存计划或确认并启动。','The information check is complete. Review the tasks, owners, projects and acceptance criteria below, then save the plan or confirm and start.')}</p>}
 {draft?.assessment&&<section className="wf-guide-assessment" aria-label={L('信息检查结果','Information assessment')}><Markdown text={draft.assessment.summary}/>{!!draft.assessment.missing.length&&<ul>{draft.assessment.missing.map(m=><li key={m}>{m}</li>)}</ul>}{dirty&&<p role="status">{L('内容已修改，需要重新检查。','The draft changed. Review it again before creating tasks.')}</p>}</section>}
 {question&&!dirty&&!assessing&&<section className="wf-guide-question"><h3>{L('还需要确认','Clarify before proceeding')}</h3><p className="wf-muted">{L('先确认需求，再核对项目关系；已填写内容会保留。','Clarify requirements first, then review project relationships. Your input is preserved.')}</p><FormFields fields={question.fields} values={answers} change={(key,v)=>setAnswers(old=>({...old,[key]:v}))} locked={busy}/><Button variant="outline" disabled={busy||question.fields.some(f=>!String(answers[f.name]||'').trim())} onClick={()=>void assess(question.fields.map(f=>f.label+': '+String(answers[f.name]||'')).join('\n'))}>{L('提交补充并检查','Submit answers and review')}</Button></section>}

 {!!value?.packages.some(p=>p.projectBinding?.confirmed&&p.projectBinding.reusedFrom)&&<p role="status" className="wf-muted">{L('已沿用确认过的项目关系','Confirmed project relationships reused')} · {value.packages.filter(p=>p.projectBinding?.confirmed&&p.projectBinding.reusedFrom).length}</p>}
 {draft?.relationGuide&&!question&&!draft.requirementsPending&&!assessing&&<TaskRelationGuide draftId={draft.id} guide={draft.relationGuide} disabled={busy} dirty={dirty} answer={answerRelations} refine={message=>void assess(message,'relations')}/>}
 {(!question||dirty||!!error)&&<Button variant="outline" disabled={busy||!draft} onClick={()=>void assess()}>{busy?L('正在整理…','Reviewing…'):draft?.assessment?L('重新检查任务信息','Recheck task information'):L('根据讨论整理任务','Extract tasks from discussion')}</Button>}
 {!!value?.packages.length&&<Button disabled={busy} variant="outline" onClick={()=>void check()}>{L('检查并保存草稿','Check and save draft')}</Button>}
 {ready&&value&&<section aria-label={L('本计划的执行依据','Execution references')}><h3>{L('本计划的执行依据','Execution references')}</h3>{[...new Map(value.packages.filter(p=>p.mode==='work').flatMap(p=>p.documentRefs).map(r=>[r.id+':'+r.revision,r])).values()].map(r=><p key={r.id+':'+r.revision}>{draft?.sourceDocuments?.find(d=>d.id===r.id&&d.revision===r.revision)?.title||r.id} · v{r.revision}</p>)}<p className="wf-muted">{L('仅确认任务实际引用的版本。尚未设置的依据将在创建时确认；不引用文档的任务使用已确认的讨论与任务说明。','Only explicitly referenced revisions are confirmed. New references are confirmed during creation; tasks without documents use the confirmed discussion and instructions.')}</p></section>}
 {value&&<details className="wf-guide-candidate" open={reviewOpen} onToggle={e=>setReviewOpen(e.currentTarget.open)}><summary>{L('任务建议 · 可编辑，尚未确认','Task proposals · editable, not confirmed')} · {value.packages.length}</summary><FieldGroup><FormField label={L('计划名称','Plan name')} value={value.name} onChange={name=>setValue(v=>v?{...v,name}:v)} disabled={busy}/><FormField label={L('共同目标','Shared goal')} value={value.goal} onChange={goal=>setValue(v=>v?{...v,goal}:v)} multiline disabled={busy}/>
 <ProjectBindingPlanner definitions={value.packages} change={packages=>setValue(v=>v?{...v,packages}:v)} space={space} employees={employees} projects={projects} disabled={busy}/>{value.packages.map((p,index)=>{const update=(patch:Partial<typeof p>)=>setValue(v=>v?{...v,packages:v.packages.map(q=>q.id===p.id?updatePackage(q,patch):q)}:v);return <details className="wf-guide-package" key={p.id}><summary><strong>{index+1}. {p.title||L('新任务','New task')}</strong><span>{employees.find(e=>e.id===p.ownerId)?.name||L('待分配','Unassigned')} · {p.mode==='discussion'?L('分析与讨论','Analysis'):projects.find(v=>v.id===p.projectId)?.name||L('待选择项目','Choose project')}</span></summary><FieldGroup><FormField label={L('任务名称','Task title')} value={p.title} onChange={title=>update({title})} disabled={busy}/>{(['instruction','deliverables','acceptance','verification','constraints'] as const).map((key,i)=><FormField key={key} label={[L('需求与范围','Requirements and scope'),L('预期交付','Deliverables'),L('验收条件','Acceptance criteria'),L('验证方法','Verification method'),L('约束与非目标（可选）','Constraints and non-goals (optional)')][i]} value={p[key]||''} onChange={v=>update({[key]:v})} multiline disabled={busy}/>)}<FieldSet><FieldLegend>{L('固定资料（可选）','Pinned references (optional)')}</FieldLegend>{(draft?.sourceDocuments||[]).map(d=><label key={d.id+':'+d.revision} className="wf-check"><Checkbox disabled={busy} checked={p.documentRefs.some(r=>r.id===d.id&&r.revision===d.revision)} onCheckedChange={checked=>update({documentRefs:checked?[...p.documentRefs.filter(r=>r.id!==d.id),{id:d.id,revision:d.revision,hash:d.hash}]:p.documentRefs.filter(r=>r.id!==d.id)})}/>{d.title} · v{d.revision}</label>)}{!draft?.sourceDocuments?.length&&<p className="wf-muted">{L('使用讨论内容，不要求另建文档。','Uses discussion context; no separate document is required.')}</p>}</FieldSet><FieldSet><FieldLegend>{L('前置依赖','Dependencies')}</FieldLegend>{value.packages.filter(q=>q.id!==p.id).map(q=><label className="wf-check" key={q.id}><Checkbox disabled={busy} checked={p.dependencies.includes(q.id)} onCheckedChange={checked=>update({dependencies:checked?[...p.dependencies,q.id]:p.dependencies.filter(id=>id!==q.id)})}/>{q.title}</label>)}{value.packages.length===1&&<p className="wf-muted">{L('无前置任务','No predecessor tasks')}</p>}</FieldSet></FieldGroup></details>;})}</FieldGroup></details>}

 </>}
 </div>{!discussionMode&&!composerHost&&composer}{(ready||savedPlan)&&!draft?.basePlanId&&<div className="wf-guide-actions"><Button variant="outline" disabled={busy||!ready&&!savedPlan} onClick={()=>void create(false)}>{savedPlan?L('查看已保存的计划','Open saved plan'):L('确认并保存计划','Confirm and save plan')}</Button><Button disabled={busy||!ready&&!savedPlan} onClick={()=>void create(true)}>{savedPlan?L('重试启动','Retry starting'):L('确认并启动','Confirm and start')}</Button></div>}{!discussionMode&&composerHost&&createPortal(composer,composerHost)}</section>;
}
