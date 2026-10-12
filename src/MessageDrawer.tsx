import {useEffect,useState,type RefObject} from 'react';
import {X} from 'lucide-react';
import {Button} from './components/ui/button';
import {Drawer,DrawerClose,DrawerContent,DrawerHeader,DrawerTitle,DrawerDescription} from './components/ui/drawer';
import MessageCenter from './MessageCenter';
import {ConfirmationProvider} from './Confirmation';
import {t} from './i18n';

export default function MessageDrawer({open,onOpenChange,trigger}:{open:boolean;onOpenChange(open:boolean):void;trigger:RefObject<HTMLElement|null>}) {
 const [narrow,setNarrow]=useState(()=>window.matchMedia('(max-width:640px)').matches);
 useEffect(()=>{if(!open)return;const key='messages-'+crypto.randomUUID();window.desktop?.extensionPage?.overlay({key,enabled:true});return()=>{window.desktop?.extensionPage?.overlay({key,enabled:false});};},[open]);
 useEffect(()=>{const query=window.matchMedia('(max-width:640px)');const sync=()=>setNarrow(query.matches);query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);},[]);
 return <Drawer open={open} modal swipeDirection={narrow?'down':'right'} onOpenChange={(value,details)=>{if(!value&&details.reason==='escape-key'&&document.querySelector('[data-message-actions-menu]')){details.cancel();return;}onOpenChange(value);}}>
  <DrawerContent overlayClassName="bg-black/30 supports-backdrop-filter:backdrop-blur-sm motion-reduce:transition-none" className="message-drawer border border-border shadow-xl [--drawer-inset:12px] [--drawer-bleed-background:transparent] data-[swipe-axis=x]:w-[480px] max-w-[calc(100vw-24px)] data-[swipe-direction=right]:rounded-3xl data-[swipe-direction=down]:rounded-3xl data-[swipe-axis=y]:h-[85dvh] motion-reduce:transition-none" finalFocus={()=>trigger.current?.isConnected?trigger.current:false}>
   <DrawerHeader className="relative shrink-0 px-6 pt-6 pb-4 pr-16 group-data-[swipe-axis=y]/drawer-popup:text-left">
    <DrawerTitle>{t('消息中心')}</DrawerTitle>
    <DrawerDescription className="sr-only">{t('关注重要进展，按自己的节奏处理。')}</DrawerDescription>
    <DrawerClose render={<Button variant="ghost" size="icon-sm" className="absolute right-5 top-5" aria-label={t('关闭消息中心')}/>}><X/></DrawerClose>
   </DrawerHeader>
   <div className="message-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-6"><ConfirmationProvider><MessageCenter compact/></ConfirmationProvider></div>
  </DrawerContent>
 </Drawer>;
}
