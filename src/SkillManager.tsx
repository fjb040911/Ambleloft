import {useState} from 'react';
import {BookOpen,ChevronRight,Upload} from 'lucide-react';
import Modal from './Modal';
import {t} from './i18n';
import {useSkills,skillsChanged} from './skills';
import type {Skill,SkillDetail,SkillImportResult} from './types';
export default function SkillManager({query}:{query:string}) {
 const {skills,error:loadError}=useSkills();const [detail,setDetail]=useState<SkillDetail|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [duplicate,setDuplicate]=useState<SkillImportResult|null>(null);
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const importSkill=(options?:{replaceId?:string;asNew?:boolean;token?:string})=>perform(async()=>{if(!window.desktop?.skills)throw new Error(t('请在桌面应用中导入技能'));const result=await window.desktop.skills.import(options);setDuplicate(result?.duplicate?result:null);if(result?.skill)skillsChanged();});
 const visible=skills.filter(s=>(s.name+' '+s.description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const open=(skill:Skill)=>void perform(async()=>setDetail(await window.desktop!.skills!.detail(skill.id)));
 return <section className="personal-skills"><div className="personal-skills-heading"><div><h2>{t('我的技能')}</h2><p className="fine-print">{t('启用后可按任务自动使用；聊天中选择可指定本次使用。')}</p></div><button className="secondary-button" disabled={busy} onClick={()=>void importSkill()}><Upload size={15}/>{t('导入本地技能')}</button></div>
 {(error||loadError)&&<p role="alert" className="error-banner">{error||loadError}</p>}
 <div className="plugin-list">{visible.map(skill=><button key={skill.id} className="plugin-card surface-card personal-skill-card" onClick={()=>open(skill)} disabled={busy}><span className="cap-icon large purple"><BookOpen size={24}/></span><div><h2>{skill.name}<span className="badge neutral">{t(skill.enabled?'已启用':'已停用')}</span></h2><p>{skill.description}</p><small>v{skill.version} · {new Date(skill.updatedAt).toLocaleDateString()}</small></div><ChevronRight size={16}/></button>)}</div>
 {!visible.length&&<p className="fine-print">{t(skills.length?'没有找到相关技能':'导入包含 SKILL.md 的文件夹，开始维护你的技能。')}</p>}
 {duplicate?.duplicate&&<Modal busy={busy} title={t('发现同名技能')} close={()=>{if(!busy)setDuplicate(null);}}><p>{duplicate.duplicate.name}</p><p>{t('更新现有技能，或保留两个独立版本。')}</p>{error&&<p role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={()=>void importSkill({asNew:true,token:duplicate.token})}>{t('另存为新技能')}</button><button className="primary-button" disabled={busy} onClick={()=>void importSkill({replaceId:duplicate.duplicate!.id,token:duplicate.token})}>{t('更新现有技能')}</button></div></Modal>}
 {detail&&<Modal busy={busy} wide title={t('技能详情')} close={()=>{if(!busy)setDetail(null);}}><div className="skill-editor">
 <label>{t('名称')}<input value={detail.name} maxLength={120} disabled={busy} onChange={e=>setDetail({...detail,name:e.target.value})}/></label>
 <label>{t('描述')}<textarea value={detail.description} maxLength={2000} disabled={busy} onChange={e=>setDetail({...detail,description:e.target.value})}/></label>
 <label>{t('技能指令')}<textarea className="skill-body" value={detail.body} maxLength={200000} disabled={busy} onChange={e=>setDetail({...detail,body:e.target.value})}/></label>
 <p className="fine-print">{t('导入来源')}：{detail.sourcePath} · v{detail.version}</p><details><summary>{t('附属文件')}（{detail.files.length}）</summary><ul>{detail.files.map(file=><li key={file}>{file}</li>)}</ul></details>
 {error&&<p role="alert" className="error-banner">{error}</p>}
 <div className="modal-actions skill-editor-actions"><button className="text-button danger" disabled={busy} onClick={()=>{if(window.confirm(t('删除此技能？历史消息中的技能记录会保留。')))void perform(async()=>{await window.desktop!.skills!.remove(detail.id);skillsChanged();setDetail(null);});}}>{t('删除')}</button><button className="secondary-button" disabled={busy} onClick={()=>void perform(async()=>{await window.desktop!.skills!.update({id:detail.id,enabled:!detail.enabled});skillsChanged();setDetail({...detail,enabled:!detail.enabled});})}>{t(detail.enabled?'停用':'启用')}</button><button className="primary-button" disabled={busy||!detail.name.trim()||!detail.description.trim()||!detail.body.trim()} onClick={()=>void perform(async()=>{await window.desktop!.skills!.update({id:detail.id,version:detail.version,name:detail.name,description:detail.description,body:detail.body});skillsChanged();setDetail(null);})}>{t(busy?'处理中…':'保存')}</button></div>
 </div></Modal>}
 </section>;
}
