import ExpertModelPreference,{expertModelLabel} from './ExpertModelPreference';
import {useState,useRef,useEffect,useImperativeHandle,type Ref} from 'react';
import {ArrowRight,BookOpen,Plus,X,LoaderCircle} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from './components/ui/alert-dialog';
import {Alert,AlertDescription} from './components/ui/alert';
import {FieldGroup,FieldDescription} from './components/ui/field';
import {Failure,FormField,SkillPicker,SkillSummary,SkillInformation,useSkillMetadata,sourceKey,useCopy} from './WorkforceInputs';
import type {RoleDraft,RoleDefinition,SkillDeclaration} from './workforce-types';
import type {Skill,ProviderCatalog} from './types';
export type RoleEditorHandle={flush():Promise<RoleDraft>;requestLeave():Promise<boolean>};
const storedFields=(draft:RoleDraft)=>({value:draft.value,step:draft.step,mode:draft.mode,brief:draft.brief,guide:draft.guide||[],guideInput:draft.guideInput||''});
const packageIdentity=(s:SkillDeclaration)=>JSON.stringify([s.name,Object.entries(s.source).filter(([key])=>key!=='snapshotId').sort(([a],[b])=>a.localeCompare(b))]);
// Compare editable content, excluding catalog enrichment and UI navigation.
const roleContent=(value:RoleDefinition)=>JSON.stringify({name:value.name.trim(),domain:value.domain.trim(),responsibilities:value.responsibilities.trim(),deliverables:value.deliverables.trim(),methods:value.methods.trim(),modelChoice:value.modelChoice||null,skills:value.skills.map(s=>({name:s.name,label:s.label,purpose:s.purpose||'',source:packageIdentity(s),usage:s.usage||null})).sort((a,b)=>a.name.localeCompare(b.name))});
export function skillSource(skill:SkillDeclaration,installed:Skill[],L:(zh:string,en:string)=>string){
 const source=skill.source;
 if(source.kind==='store')return `${L('精选技能','Curated skill')} · v${source.version}`;
 if(source.kind==='import')return skill.provenance?.kind==='github'?`${skill.provenance.repository} · ${skill.provenance.directory} @ ${skill.provenance.commit?.slice(0,12)}`:skill.provenance?.path||L('已固定的导入来源','Frozen imported source');
 const found=installed.find(s=>s.id===source.skillId);return found?`${L('全局技能','Global skill')} · ${found.name} · v${source.version||found.version}`:L('原技能已移除，请重新选择','The original skill was removed; choose another source');
}
export function DeclarationList({skills,installed,remove,roleId}:{skills:SkillDeclaration[];installed:Skill[];roleId?:string;remove?(skill:SkillDeclaration):void}){
 const L=useCopy(),enrich=useSkillMetadata(roleId);return <div className="wf-list">{skills.map(original=>{const skill=enrich(original);return <div className="wf-row" key={sourceKey(skill)}><BookOpen aria-hidden="true"/><div><strong>{skill.label}</strong><SkillSummary skill={skill}/><details className="wf-skill-details"><summary>{L('查看技能详情','View skill details')}</summary><SkillInformation skill={skill}/></details></div>{remove&&<Button size="icon-sm" variant="ghost" aria-label={L('移除声明：','Remove declaration: ')+skill.label} onClick={()=>remove(skill)}><X/></Button>}</div>;})}{!skills.length&&<p className="wf-muted">{L('未声明额外技能，可以先按角色职责开始工作。','No additional skills. This expert can start with the role definition.')}</p>}</div>;
}
export function RoleEditor({ref,initial,installed,catalog,save,onEditState,newDraft,original,close}:{ref?:Ref<RoleEditorHandle>;initial:RoleDraft;original?:RoleDefinition;installed:Skill[];catalog:ProviderCatalog;close():void;save(draft:RoleDraft):Promise<void>;onEditState(state:{dirty:boolean;busy:boolean}):void;newDraft:boolean}){
 const L=useCopy(),api=window.desktop!.workforce!;
 const [draft,setDraft]=useState<RoleDraft>(()=>{try{const recovery=JSON.parse(localStorage.getItem('workforce-draft:'+initial.id)||'null');if(recovery?.baseRevision===initial.revision)return {...initial,...recovery.fields};}catch{}return initial;});
 const [leaveOpen,setLeaveOpen]=useState(false);
 const leaveResolve=useRef<((choice:'save'|'discard'|'cancel')=>void)|null>(null);
 const [picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saveState,setSaveState]=useState('saved');
 const current=useRef(draft),persisted=useRef(initial),saving=useRef<Promise<RoleDraft>|null>(null),alive=useRef(true);
 current.current=draft;
 const update=(patch:Partial<RoleDraft>)=>setDraft(d=>({...d,...patch}));
 const set=(key:keyof RoleDefinition,text:string)=>setDraft(d=>({...d,value:{...d.value,[key]:text}}));
 const flush=async():Promise<RoleDraft>=>{
  if(saving.current)await saving.current;
  const fields=storedFields(current.current);
  if(JSON.stringify(fields)===JSON.stringify(storedFields(persisted.current)))return persisted.current;
  const action=api.saveDraft({id:initial.id,expectedRevision:persisted.current.revision,...fields});saving.current=action;setSaveState('saving');
  try{const saved=await action;persisted.current=saved;
   if(JSON.stringify(storedFields(current.current))===JSON.stringify(fields)){localStorage.removeItem('workforce-draft:'+initial.id);if(alive.current)setSaveState('saved');}
   else{localStorage.setItem('workforce-draft:'+initial.id,JSON.stringify({baseRevision:saved.revision,fields:storedFields(current.current)}));}
   return saved;
  }catch(e){if(alive.current){setError((e as Error).message);setSaveState('failed');}throw e;}finally{saving.current=null;}
 };
 const requestLeave=async():Promise<boolean>=>{
  if(leaveResolve.current)return false;
  setBusy(true);
  try{
   const saved=await flush();
   const content=(d:RoleDraft)=>JSON.stringify({value:d.value,brief:d.brief,guide:d.guide||[],guideInput:d.guideInput||''});
   const changed=content(current.current)!==content(initial);
   if(!changed){
    if(newDraft){await api.discardDraft({id:saved.id,expectedRevision:saved.revision});localStorage.removeItem('workforce-draft:'+initial.id);}
    return true;
   }
   const choice=await new Promise<'save'|'discard'|'cancel'>(resolve=>{leaveResolve.current=resolve;setLeaveOpen(true);});
   if(choice==='cancel')return false;
   if(choice==='discard'){
    if(newDraft||initial.ephemeral)await api.discardDraft({id:saved.id,expectedRevision:saved.revision});
    else await api.saveDraft({id:saved.id,expectedRevision:saved.revision,...storedFields(initial)});
    localStorage.removeItem('workforce-draft:'+initial.id);
   }
   return true;
  }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 };
 const finishLeave=(choice:'save'|'discard'|'cancel')=>{const resolve=leaveResolve.current;leaveResolve.current=null;setLeaveOpen(false);resolve?.(choice);};
 useImperativeHandle(ref,()=>({flush,requestLeave}));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const fields=storedFields(draft);if(JSON.stringify(fields)===JSON.stringify(storedFields(persisted.current)))return;
  localStorage.setItem('workforce-draft:'+initial.id,JSON.stringify({baseRevision:persisted.current.revision,fields}));setSaveState('pending');
  const timer=setTimeout(()=>void flush().catch(()=>{}),450);return()=>clearTimeout(timer);
 },[draft]);
 useEffect(()=>{onEditState({dirty:false,busy});},[busy,onEditState]);
 // Leaving can unmount before the async finally runs. Release the parent lock.
 useEffect(()=>()=>onEditState({dirty:false,busy:false}),[onEditState]);
 const submit=async()=>{setBusy(true);setError('');try{const saved=await flush();await save(saved);localStorage.removeItem('workforce-draft:'+initial.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const labels=[L('定义角色','Define role'),L('配置技能','Configure skills'),L('确认配置','Confirm configuration')];
 const compactLabels=[L('定义角色','Role'),L('配置技能','Skills'),L('确认配置','Review')];
 const {value}=draft,step=Math.max(1,draft.step);
 const editing=!!draft.employeeId,changed=roleContent(value)!==roleContent(original||initial.value);
 const addedSkills=value.skills.filter(s=>!(original||initial.value).skills.some(old=>packageIdentity(old)===packageIdentity(s)));
 const roleComplete=!!value.name.trim()&&!!value.responsibilities.trim();
 return <section className="wf-editor">
 <header><h1>{draft.employeeId?L('编辑专家配置','Edit expert configuration'):L('添加 AI 专家','Add an AI expert')}</h1><p>{L('定义职责、工作方式与技能。离开时可选择是否保留草稿。','Define responsibilities, working methods and skills. Choose whether to keep a draft when you leave.')}</p></header>
 {editing?<nav className="wf-edit-sections" aria-label={L('专家配置分区','Expert configuration sections')}>{[["expert-basic",L('基本信息','Basics')],["expert-role",L('职责与工作方式','Responsibilities')],["expert-skills",L('技能','Skills')]].map(([id,label])=><Button key={id} variant="ghost" onClick={()=>document.getElementById(id)?.scrollIntoView({block:'start'})}>{label}</Button>)}</nav>:<nav aria-label={L('专家配置步骤','Expert setup steps')}><ol className="wf-steps">{labels.map((label,i)=><li key={label} data-current={step===i+1?'true':undefined}><Button type="button" variant="ghost" className="wf-step-button" aria-label={label} aria-current={step===i+1?'step':undefined} onClick={()=>update({step:i+1})} disabled={busy}><span aria-hidden="true">{i+1}</span><span className="wf-step-label"><span className="wf-step-full">{label}</span><span className="wf-step-short" aria-hidden="true">{compactLabels[i]}</span></span></Button></li>)}</ol></nav>}
 <AlertDialog open={leaveOpen} onOpenChange={open=>{if(!open)finishLeave('cancel');}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{L('保留这份草稿？','Keep this draft?')}</AlertDialogTitle><AlertDialogDescription>{L('保存后可以稍后继续；放弃将丢弃本次填写。','Save to continue later, or discard the changes made during this visit.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="ghost" onClick={()=>finishLeave('cancel')}>{L('继续编辑','Keep editing')}</Button><Button variant="outline" onClick={()=>finishLeave('discard')}>{L('放弃更改','Discard changes')}</Button><Button onClick={()=>finishLeave('save')}>{L('保存草稿','Save draft')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Failure message={error}/>{saveState==='failed'&&<Button variant="outline" onClick={()=>void flush().catch(()=>{})}>{L('重试保存','Retry saving')}</Button>}
 {!editing&&step===1&&(draft.guide?.length||draft.guideInput||draft.brief)&&<details><summary>{L('查看之前的构思记录','View earlier notes')}</summary>{draft.guide?.map(message=><div key={message.id}><p>{message.role==='user'?L('你：','You: '):'AI: '}{message.text}</p>{message.question&&<p>{message.question.source.definition.title}：{message.question.source.definition.fields[0]?.options?.find(option=>option.value===message.question?.prefill.choice)?.label||L('未选择','Not selected')}</p>}{message.fields&&Object.entries(message.fields).map(([key,text])=>text&&<p key={key}>{({name:L('名称','Name'),domain:L('专业方向','Specialization'),responsibilities:L('职责','Responsibilities'),deliverables:L('交付','Deliverables'),methods:L('工作方法与边界','Methods and boundaries')} as Record<string,string>)[key]||key}：{text}</p>)}</div>)}{!draft.guide?.length&&draft.brief&&<p>{draft.brief}</p>}{draft.guideInput&&<p>{L('未发送：','Unsent: ')}{draft.guideInput}</p>}</details>}
 {(editing||step===1)&&<><div id="expert-basic" className="wf-edit-section"><h2>{editing?L('基本信息','Basics'):L('让它按你的方式工作','Make it work your way')}</h2><p className="wf-muted">{editing?L('调整专家名称、专业方向和常用模型。','Adjust the expert’s name, specialization and preferred model.'):L('写清楚要负责什么，以及什么样的结果算完成。','Describe the responsibilities and what a useful result looks like.')}</p></div><FieldGroup><FieldGroup className="wf-profile-pair"><FormField label={L('专家名称','Expert name')} value={value.name} onChange={s=>set('name',s)} maxLength={80} required/><FormField label={L('专业方向（可选）','Specialization (optional)')} value={value.domain} onChange={s=>set('domain',s)} maxLength={300}/></FieldGroup>{editing&&<><ExpertModelPreference value={value.modelChoice} catalog={catalog} disabled={busy} onChange={modelChoice=>update({value:{...value,modelChoice}})}/><h2 id="expert-role" className="wf-edit-section">{L('职责与工作方式','Responsibilities and working methods')}</h2></>}<FormField label={L('主要职责','Responsibilities')} value={value.responsibilities} onChange={s=>set('responsibilities',s)} multiline required/><FormField label={L('预期交付','Expected deliverables')} value={value.deliverables} onChange={s=>set('deliverables',s)} multiline maxLength={3000}/><FormField label={L('工作方法与边界','Working methods and boundaries')} value={value.methods} onChange={s=>set('methods',s)} multiline/>{!editing&&<ExpertModelPreference value={value.modelChoice} catalog={catalog} disabled={busy} onChange={modelChoice=>update({value:{...value,modelChoice}})}/>}<FieldDescription>{L('不需要在这里填写服务器地址、工具链路径或密钥。这些在项目或扩展设置中配置。','Server addresses, toolchain paths and credentials belong in project or extension settings.')}</FieldDescription></FieldGroup></>}
 {(editing||step===2)&&<><div id="expert-skills" className="wf-section-title wf-edit-section"><div><h2>{L('这个角色会什么？','What can this role do?')}</h2><p className="wf-muted">{draft.origin==='template'?L('查看角色推荐技能，也可以添加、替换或移除。','Review the role recommendations, or add, replace and remove skills.'):L('根据职责添加合适的技能，也可以先不选择。','Add skills that match the responsibilities, or continue without selecting any.')}</p></div><Button variant="outline" onClick={()=>setPicker(true)}><Plus data-icon="inline-start"/>{L('添加或替换技能','Add or replace skills')}</Button></div><DeclarationList roleId={value.templateRef?.id} skills={value.skills} installed={installed} remove={skill=>update({value:{...value,skills:value.skills.filter(s=>sourceKey(s)!==sourceKey(skill))}})}/><p className="wf-muted">{L('工作时默认使用适用技能。移除声明不会卸载全局技能。','Relevant skills are used by default. Removing a declaration does not uninstall global skills.')}</p></>}
 {!editing&&step===3&&<div className="wf-review"><Badge variant="secondary">{draft.origin==='template'?L('来自角色模板','From a role template'):L('自定义配置','Custom configuration')}</Badge><div className="wf-section-title"><h2>{value.name}</h2><Button variant="ghost" size="sm" onClick={()=>update({step:1})}>{L('编辑角色','Edit role')}</Button></div><p>{value.domain||L('通用方向','General')}</p><dl><dt>{L('默认模型','Default model')}</dt><dd>{expertModelLabel(value.modelChoice,catalog,L)}</dd><dt>{L('职责','Responsibilities')}</dt><dd>{value.responsibilities}</dd><dt>{L('交付','Deliverables')}</dt><dd>{value.deliverables||'—'}</dd><dt>{L('工作方法','Methods')}</dt><dd>{value.methods||'—'}</dd></dl><div className="wf-section-title"><h3>{L('技能声明','Declared skills')}</h3><Button variant="ghost" size="sm" onClick={()=>update({step:2})}>{L('编辑技能','Edit skills')}</Button></div><DeclarationList roleId={value.templateRef?.id} skills={value.skills} installed={installed}/><Alert><AlertDescription>{L('提交后自动准备所选技能，全部成功后配置才生效。准备期间可继续使用工作台；已有任务保持原配置。','Submission prepares the selected skills and applies the configuration only after all succeed. You can continue using the workbench. Existing tasks keep their configuration.')}</AlertDescription></Alert>{!roleComplete&&<Alert><AlertDescription>{L('请先填写专家名称和主要职责，再提交配置。','Enter an expert name and responsibilities before submitting.')} <Button variant="link" onClick={()=>update({step:1})}>{L('返回定义角色','Go to role details')}</Button></AlertDescription></Alert>}</div>}
 {editing?<footer className="wf-editor-footer wf-edit-footer"><span className="wf-muted" role="status">{addedSkills.length?L(`已新增或替换 ${addedSkills.length} 项技能；保存时复用已有技能，仅准备缺失项。`,`${addedSkills.length} skills added or replaced. Existing skills are reused; only missing skills need preparation.`):changed?L('更改将用于后续任务。','Changes apply to future tasks.'):L('尚未更改','No changes yet')}</span><div className="wf-actions"><Button variant="outline" disabled={busy} onClick={()=>void requestLeave().then(leave=>{if(leave)close();})}>{L('取消','Cancel')}</Button><Button disabled={busy||!changed||!roleComplete} onClick={()=>void submit()}>{busy&&<LoaderCircle className="animate-spin" data-icon="inline-start"/>}{L('保存更改','Save changes')}</Button></div></footer>:<footer className="wf-editor-footer"><Button variant="outline" disabled={busy||step===1} onClick={()=>update({step:step-1})}>{L('上一步','Back')}</Button>{step<3?<Button disabled={step===1&&!roleComplete} onClick={()=>update({step:step+1})}>{L('下一步','Next')}<ArrowRight data-icon="inline-end"/></Button>:<div className="wf-actions"><Button disabled={busy||!roleComplete} onClick={()=>void submit()}>{busy&&<LoaderCircle className="animate-spin" data-icon="inline-start"/>}{draft.employeeId?L('保存更改','Save changes'):L('添加专家并准备技能','Add expert and prepare skills')}</Button></div>}</footer>}

 {picker&&<SkillPicker roleId={value.templateRef?.id||(initial.origin==='template'?initial.sourceRef?.id:undefined)} selected={value.skills} installed={installed} close={()=>setPicker(false)} apply={skills=>{update({value:{...value,skills}});setPicker(false);}}/>}
 </section>;
}
