import {useState} from 'react';
import {BookOpen,X} from 'lucide-react';
import type {SkillDetail,SkillSnapshot} from './types';
import {useSkills} from './skills';
import Modal from './Modal';
import {t} from './i18n';
export default function SkillTags({ids,onRemove,disabled,snapshots}:{ids?:string[];onRemove?(id:string):void;disabled?:boolean;snapshots?:SkillSnapshot[]}) {
 const {skills}=useSkills();const [detail,setDetail]=useState<SkillDetail|SkillSnapshot|null>(null);const [error,setError]=useState('');
 const tags=snapshots||ids?.map(id=>skills.find(s=>s.id===id)||{id,name:t('不可用技能'),enabled:false})||[];
 if(!tags.length)return null;
 return <><div className="skill-tags" aria-label={t('已选技能')}>{tags.map(skill=><span className="skill-tag" key={skill.id}><button type="button" title={skill.name} onClick={()=>{setError('');if(snapshots)setDetail(skill as SkillSnapshot);else void window.desktop?.skills?.detail(skill.id).then(setDetail).catch(e=>setError(e.message));}}><BookOpen size={14}/>{skill.name}{'enabled' in skill&&!skill.enabled&&<small>{t('已停用')}</small>}</button>{onRemove&&<button type="button" aria-label={`${t('移除技能')} ${skill.name}`} disabled={disabled} onClick={()=>onRemove(skill.id)}><X size={13}/></button>}</span>)}</div>{error&&<small role="alert">{error}</small>}{detail&&<Modal title={detail.name} close={()=>setDetail(null)}><p>{detail.description}</p><small>v{detail.version}</small><pre className="skill-instructions">{detail.body}</pre></Modal>}</>;
}
