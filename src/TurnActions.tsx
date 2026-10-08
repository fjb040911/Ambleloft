import {Button} from './components/ui/button';
import {useState} from 'react';
import {Check, Copy, Cpu, BookOpen} from 'lucide-react';
import {useCopyFeedback} from './hooks/use-copy-feedback';
import {t} from './i18n';
import Modal from './Modal';
import SkillTags from './SkillTags';
import type {ConversationTurn} from './conversation-turns';

export default function TurnActions({turn}:{turn:ConversationTurn}) {
  const {status,copy}=useCopyFeedback('拷贝');
  const [detail,setDetail]=useState<'skills'|'model'|null>(null);
  const skills=turn.user.skills||[];
  const text=turn.final?.text||turn.messages.filter(message=>message.role==='assistant'&&!message.kind).map(message=>message.text).join('\n\n');
  return <><div className="turn-actions" role="group" aria-label={t('回复操作')}>
    <Button variant="ghost" size="icon" disabled={!text} title={t(status)} aria-label={t(status)} onClick={()=>void copy(text)}>{status==='已复制'?<Check size={18}/>:<Copy size={18}/>}<span className="sr-only" aria-live="polite">{t(status)}</span></Button>
    {skills.length>0&&<Button variant="ghost" size="sm" title={t('本次使用的技能')} onClick={()=>setDetail('skills')}><BookOpen size={18}/><span>{t('技能')}</span><span>{skills.length}</span></Button>}
    <Button variant="ghost" size="sm" className="turn-model" title={t('本次使用的模型')} onClick={()=>setDetail('model')}><Cpu size={18}/><span>{turn.model||t('模型未记录')}</span></Button>
  </div>{detail&&<Modal title={t(detail==='skills'?'本次使用的技能':'本次使用的模型')} close={()=>setDetail(null)}>{detail==='skills'?<SkillTags snapshots={skills}/>:<p className="turn-model-detail">{turn.model||t('模型未记录')}</p>}</Modal>}</>;
}
