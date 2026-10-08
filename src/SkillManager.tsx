import {Button} from './components/ui/button';
import {createPortal} from 'react-dom';
import SkillPreview from './SkillPreview';
import {IntegrationActionsContext,IntegrationEmpty,IntegrationEntry,type IntegrationFilter} from './IntegrationPage';
import {useContext,useEffect,useRef,useState} from 'react';
import {BookOpen,Upload} from 'lucide-react';
import Modal from './Modal';
import {t} from './i18n';
import {useSkills,skillsChanged} from './skills';
import type {Skill,SkillDetail,SkillImportResult} from './types';
export default function SkillManager({initialSkillId,query,filter='all'}:{initialSkillId?:string;query:string;filter?:IntegrationFilter}) {
 const actions=useContext(IntegrationActionsContext);
 const {skills,error:loadError}=useSkills();const [detail,setDetail]=useState<SkillDetail|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [duplicate,setDuplicate]=useState<SkillImportResult|null>(null);
 useEffect(()=>{if(!initialSkillId||!window.desktop?.skills)return;let cancelled=false;void window.desktop.skills.detail(initialSkillId).then(value=>{if(!cancelled){setDetail(value);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[initialSkillId]);
 const origin=useRef<HTMLElement|null>(null);
 const closeDetail=()=>{setDetail(null);requestAnimationFrame(()=>{if(origin.current?.isConnected)origin.current.focus();});};
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const importSkill=(options?:{replaceId?:string;asNew?:boolean;token?:string})=>perform(async()=>{if(!window.desktop?.skills)throw new Error(t('请在桌面应用中导入技能'));const result=await window.desktop.skills.import(options);setDuplicate(result?.duplicate?result:null);if(result?.skill)skillsChanged();});
 const visible=skills.filter(s=>(filter==='all'||s.enabled===(filter==='enabled'))&&(s.name+' '+s.description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const open=(skill:Skill)=>{origin.current=document.activeElement as HTMLElement;void perform(async()=>{setDetail(await window.desktop!.skills!.detail(skill.id));});};
 const importButton=<Button size="lg" disabled={busy} onClick={()=>void importSkill()}><Upload data-icon="inline-start"/>{t('导入本地技能')}</Button>;
 return <section className="personal-skills">{actions?createPortal(importButton,actions):importButton}
 {(error||loadError)&&<p role="alert" className="error-banner">{error||loadError}</p>}
 <div className="integration-list">{visible.map(skill=><IntegrationEntry className="personal-skill-card" key={skill.id} name={skill.name} description={skill.description} meta={'v'+skill.version+' · '+new Date(skill.updatedAt).toLocaleDateString()} enabled={skill.enabled} icon={<BookOpen/>} onClick={()=>open(skill)} disabled={busy}/>)}</div>
 {!visible.length&&<IntegrationEmpty title={skills.length?'没有找到相关技能':'尚未安装技能'} description={skills.length?'试试其他关键词，或清除筛选条件。':'导入包含 SKILL.md 的文件夹，开始维护你的技能。'}/>}
 {duplicate?.duplicate&&<Modal busy={busy} title={t('发现同名技能')} close={()=>{if(!busy)setDuplicate(null);}}><p>{duplicate.duplicate.name}</p><p>{t('更新现有技能，或保留两个独立版本。')}</p>{error&&<p role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={()=>void importSkill({asNew:true,token:duplicate.token})}>{t('另存为新技能')}</button><button className="primary-button" disabled={busy} onClick={()=>void importSkill({replaceId:duplicate.duplicate!.id,token:duplicate.token})}>{t('更新现有技能')}</button></div></Modal>}
 {detail&&<SkillPreview key={detail.id} skill={detail} close={closeDetail} updated={setDetail}/>}
 </section>;
}
