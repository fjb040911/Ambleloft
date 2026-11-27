import {Button} from './components/ui/button';
import {createPortal} from 'react-dom';
import SkillPreview from './SkillPreview';
import {IntegrationActionsContext,IntegrationEmpty,IntegrationEntry,type IntegrationFilter} from './IntegrationPage';
import {useContext,useEffect,useRef,useState} from 'react';
import {BookOpen,Upload} from 'lucide-react';
import {useSkillImport} from './SkillImport';
import {t,formatDate,useLanguage} from './i18n';
import {useSkills} from './skills';
import type {Skill,SkillDetail} from './types';
export default function SkillManager({initialSkillId,query='',filter='all',mode='list',onClose}:{initialSkillId?:string;query?:string;filter?:IntegrationFilter;mode?:'list'|'detail'|'import';onClose?():void}) {
 useLanguage();
 const actions=useContext(IntegrationActionsContext);
 const {skills,error:loadError}=useSkills();const [detail,setDetail]=useState<SkillDetail|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const skillImport=useSkillImport(setError);
 useEffect(()=>{if(!initialSkillId||!window.desktop?.skills)return;let cancelled=false;void window.desktop.skills.detail(initialSkillId).then(value=>{if(!cancelled){setDetail(value);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[initialSkillId]);
 const origin=useRef<HTMLElement|null>(null);
 const closeDetail=()=>{setDetail(null);onClose?.();requestAnimationFrame(()=>{if(origin.current?.isConnected)origin.current.focus();});};
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const visible=skills.filter(s=>(filter==='all'||s.enabled===(filter==='enabled'))&&(s.name+' '+s.description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const open=(skill:Skill)=>{origin.current=document.activeElement as HTMLElement;void perform(async()=>{setDetail(await window.desktop!.skills!.detail(skill.id));});};
 const importButton=<Button size="lg" disabled={busy||skillImport.busy} onClick={()=>void skillImport.importSkill()}><Upload data-icon="inline-start"/>{t('导入本地技能')}</Button>;
 return <section className="personal-skills">{mode!=='detail'&&(actions?createPortal(importButton,actions):importButton)}
 {(error||loadError)&&<p role="alert" className="error-banner">{error||loadError}</p>}{mode==='detail'&&(error||loadError)&&<Button variant="outline" onClick={onClose}>{t('返回已安装')}</Button>}
 {mode==='list'&&<div className="integration-list">{visible.map(skill=><IntegrationEntry className="personal-skill-card" key={skill.id} name={skill.displayName||skill.name} description={skill.displayDescription||skill.description} meta={'v'+skill.version+' · '+formatDate(skill.updatedAt)} enabled={skill.enabled} icon={<BookOpen/>} onClick={()=>open(skill)} disabled={busy}/>)}</div>}
 {mode==='list'&&!visible.length&&<IntegrationEmpty title={skills.length?'没有找到相关技能':'尚未安装技能'} description={skills.length?'试试其他关键词，或清除筛选条件。':'导入包含 SKILL.md 的文件夹，开始维护你的技能。'}/>}
 {skillImport.conflict}
 {detail&&<SkillPreview key={detail.id} skill={detail} close={closeDetail} updated={setDetail}/>}
 </section>;
}
