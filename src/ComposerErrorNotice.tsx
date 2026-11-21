import {useState, type ReactNode} from 'react';
import {X} from 'lucide-react';
import {composerError} from './model-service-feedback';
import {Alert,AlertDescription} from './components/ui/alert';
import {Button} from './components/ui/button';
import {t} from './i18n';

type NoticeProps = {message:string; dismiss?:()=>void; children?:ReactNode};
export default function ComposerErrorNotice(props:NoticeProps){
 return <Notice key={props.message} {...props}/>;
}
function Notice({message,dismiss,children}:NoticeProps){
 const [hidden,setHidden]=useState(false);
 if(hidden)return null;
 return <Alert variant="destructive" className="flex items-start gap-2">
  <AlertDescription className="min-w-0 flex-1 break-words">{composerError(message)}{children}</AlertDescription>
  <Button type="button" size="icon-sm" variant="ghost" onClick={dismiss || (()=>setHidden(true))} aria-label={t('关闭提示')}><X/></Button>
 </Alert>;
}
