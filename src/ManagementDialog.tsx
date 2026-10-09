import {useEffect,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from './components/ui/dialog';
import {Button} from './components/ui/button';
import {t} from './i18n';
export default function ManagementDialog({title,busy,close,children,wide=false}:{title:string;busy:boolean;close():void;children:ReactNode;wide?:boolean}){
 useEffect(()=>{const key='management-'+crypto.randomUUID();window.desktop?.extensionPage?.overlay({key,enabled:true});return()=>{window.desktop?.extensionPage?.overlay({key,enabled:false});};},[]);
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent showCloseButton={false} aria-busy={busy} className={wide?"max-h-[90dvh] overflow-y-auto sm:max-w-3xl":"max-h-[90dvh] overflow-y-auto sm:max-w-lg"}><DialogHeader className="pr-8"><DialogTitle>{title}</DialogTitle></DialogHeader><Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" disabled={busy} aria-label={t('关闭')} onClick={close}><X/></Button>{children}</DialogContent></Dialog>;
}
