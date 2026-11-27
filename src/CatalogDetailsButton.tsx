import type {MouseEventHandler} from 'react';
import {Button} from './components/ui/button';
import {t,useLanguage} from './i18n';
/** A shared secondary action for role and tool catalog cards. */
export default function CatalogDetailsButton({title,onClick}:{title:string;onClick:MouseEventHandler<HTMLButtonElement>}){
 const language=useLanguage();
 return <Button size="sm" variant="ghost" className="rounded-full min-h-9" aria-label={t('查看详情')+(language==='en'?': ':'：')+title} onClick={onClick}>{t('详情')}</Button>;
}
