import UserMessage from './UserMessage';
import {Spinner} from './components/ui/spinner';
import {t} from './i18n';

/** Transient UI only: replaced by the persisted message once sending is acknowledged. */
export default function PendingMessage({text}:{text:string}){
 return <div className="conversation-turn pending-message" aria-label={t('正在发送的消息')}>
  <UserMessage text={text||t('请执行所选技能的工作流程。')}/>
  <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground" role="status"><Spinner aria-hidden="true" className="motion-reduce:animate-none"/>{t('正在发送…')}</p>
 </div>;
}
