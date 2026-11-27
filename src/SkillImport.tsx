import {useState} from 'react';
import {Button} from './components/ui/button';
import Modal from './Modal';
import {skillsChanged} from './skills';
import {t} from './i18n';
import type {SkillImportResult} from './types';

export function useSkillImport(onError:(message:string)=>void){
 const [duplicate,setDuplicate]=useState<SkillImportResult|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function importSkill(options?:{replaceId?:string;asNew?:boolean;token?:string}){
  setBusy(true);setError('');onError('');
  try{
   if(!window.desktop?.skills)throw new Error(t('请在桌面应用中导入技能'));
   const result=await window.desktop.skills.import(options);
   setDuplicate(result?.duplicate?result:null);
   if(result?.skill)skillsChanged();
  }catch(e){
   const message=(e instanceof Error?e.message:String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
   if(duplicate)setError(message);else onError(message);
  }finally{setBusy(false);}
 }
 const conflict=duplicate?.duplicate&&<Modal busy={busy} title={t('发现同名技能')} close={()=>{if(!busy)setDuplicate(null);}}><p>{duplicate.duplicate.name}</p><p>{t('更新现有技能，或保留两个独立版本。')}</p>{error&&<p role="alert">{error}</p>}<div className="modal-actions"><Button variant="outline" disabled={busy} onClick={()=>void importSkill({asNew:true,token:duplicate.token})}>{t('另存为新技能')}</Button><Button variant="default" disabled={busy} onClick={()=>void importSkill({replaceId:duplicate.duplicate!.id,token:duplicate.token})}>{t('更新现有技能')}</Button></div></Modal>;
 return {busy,importSkill,conflict};
}
