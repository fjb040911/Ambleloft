import {expertModelLabel} from './ExpertModelPreference';
import {useState,type ReactNode} from 'react';
import {ArrowRight,BookOpen,LoaderCircle} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './components/ui/dialog';
import {Failure,sourceKey,useCopy,SkillInformation,SkillSummary,useSkillMetadata} from './WorkforceInputs';
import type {RoleDefinition} from './workforce-types';
import type {Skill,ProviderCatalog} from './types';

/** Viewing a definition is read-only. Only the explicit action may create a draft. */
export function RoleDetails({definition,kind,metadata,catalog,installed=[],actionLabel,actionDisabled=false,onAction,onCustomize,onClose,returnFocus,examples=[]}:{
 definition:RoleDefinition;catalog?:ProviderCatalog;kind:'template'|'employee';metadata:ReactNode;installed?:Skill[];
 examples?:string[];actionLabel:string;actionDisabled?:boolean;onAction():Promise<boolean>;onCustomize?():Promise<boolean>;onClose():void;returnFocus:HTMLElement|null;
}){
 const L=useCopy(),[pending,setPending]=useState(false),[error,setError]=useState(''),enrich=useSkillMetadata(definition.templateRef?.id);
 const act=async(action=onAction)=>{if(pending||actionDisabled)return;setPending(true);setError('');try{if(await action())onClose();else setError(L('操作未完成，请重试。','Could not complete the action. Please retry.'));}catch(e){setError((e as Error).message);}finally{setPending(false);}};
 return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}>
  <DialogContent className="wf-dialog wf-role-detail sm:max-w-[760px] p-6 flex" finalFocus={returnFocus?{current:returnFocus}:undefined}>
   <DialogHeader>
    {kind==='employee'&&<div className="wf-actions"><Badge variant="secondary">{L('我的专家 · 档案','My expert · Profile')}</Badge><span className="wf-muted">{metadata}</span></div>}
    <DialogTitle>{definition.name}</DialogTitle>
    <DialogDescription>{kind==='template'?L('先了解职责、工作方法与推荐技能。添加后，可按你的业务调整专家配置。','Explore responsibilities, methods and recommended skills. Add an expert to adapt this template to your business.'):L('这是你保存的专家配置。编辑用于后续任务，已有任务保留当时的配置。','This is your saved expert profile. Edits apply to future tasks; existing tasks keep their original configuration.')}</DialogDescription>
   </DialogHeader>
   <Failure message={error}/>
   <div className="wf-role-detail-body">
    <dl className="wf-role-definition">{kind==='employee'&&<div><dt>{L('默认模型','Default model')}</dt><dd>{expertModelLabel(definition.modelChoice,catalog,L)}{!definition.modelChoice&&<p className="wf-muted">{L('沿用任务选择的模型；任务未选择时使用上述系统默认模型。','Uses the task’s selected model, or the system default shown above when none is selected.')}</p>}</dd></div>}
     {[[L('专业方向','Specialization'),definition.domain||L('可按业务定制','Adapt to your business')],[L('主要职责','Responsibilities'),definition.responsibilities],[L('预期交付','Expected deliverables'),definition.deliverables||L('添加后可补充','You can add this later')],[L('工作方法与边界','Working methods and boundaries'),definition.methods||L('添加后可补充','You can add this later')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {!!examples.length&&<section className="wf-role-detail-skills wf-role-detail-examples"><h3>{L('可以帮你完成','Example tasks')}</h3><ul>{examples.map(example=><li key={example}><ArrowRight aria-hidden="true"/><span>{example}</span></li>)}</ul></section>}
    <section className="wf-role-detail-skills"><h3>{kind==='template'?L('推荐技能','Recommended skills'):L('声明的技能','Declared skills')} · {definition.skills.length}</h3>
     <p className="wf-muted">{kind==='template'?L('添加时可以调整，提交后由宿主自动准备技能。默认技能已预选，可选技能按需要添加。','You can change these when adding the expert. Submission prepares skills automatically. Defaults are preselected; optional skills can be added.'):L('工作时默认使用适用技能；技能准备状态可在准备进度中查看。','Relevant skills are used by default. Check preparation progress for readiness.')}</p>
     <ul>{definition.skills.map(original=>{const skill=enrich(original);return <li key={sourceKey(skill)}><BookOpen aria-hidden="true"/><div><strong>{skill.label}</strong>{kind==='template'&&<Badge variant="secondary">{skill.defaultSelected!==false?L('默认使用','Default'):L('可选补充','Optional')}</Badge>}<SkillSummary skill={skill}/><details><summary>{L('查看技能详情','View skill details')}</summary><SkillInformation skill={skill}/></details></div></li>;})}</ul>
     {!definition.skills.length&&<p className="wf-muted">{L('未声明额外技能，按角色职责工作。','No additional skills; works from the role definition.')}</p>}
    </section>
   </div>
   <DialogFooter><Button variant="outline" disabled={pending} onClick={onClose}>{L('关闭','Close')}</Button>{onCustomize&&<Button variant="outline" disabled={pending} onClick={()=>void act(onCustomize)}>{L('调整后添加','Customize first')}</Button>}<Button disabled={pending||actionDisabled} onClick={()=>void act()}>{pending&&<LoaderCircle data-icon="inline-start" className="animate-spin"/>}{actionLabel}<ArrowRight data-icon="inline-end"/></Button></DialogFooter>
  </DialogContent>
 </Dialog>;
}
