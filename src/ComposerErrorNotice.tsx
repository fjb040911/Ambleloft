import {X} from 'lucide-react';
import {Alert,AlertDescription} from './components/ui/alert';
import {Button} from './components/ui/button';
import {t} from './i18n';

export default function ComposerErrorNotice({message,dismiss}:{message:string;dismiss():void}){
 return <Alert variant="destructive" className="flex items-center gap-2">
  <AlertDescription className="min-w-0 flex-1 break-words">{message}</AlertDescription>
  <Button type="button" size="icon-sm" variant="ghost" onClick={dismiss} aria-label={t('关闭提示')}><X/></Button>
 </Alert>;
}
