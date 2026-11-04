import {useEffect} from 'react';
import {Menu,Plus} from 'lucide-react';
import {Button} from './components/ui/button';
import {SidebarTrigger} from './components/ui/sidebar';
import {GlobalSidebarActions} from './GlobalActions';
import {t} from './i18n';

/** Mounted only when the desktop bridge identifies Windows. */
export default function WindowsChrome({settings=false,collapsedActions=false,onNewTask}:{settings?:boolean;collapsedActions?:boolean;onNewTask():void}) {
 useEffect(()=>{
  const update=()=>{
   const root=getComputedStyle(document.documentElement);
   void window.desktop?.setWindowChrome?.({color:root.getPropertyValue('--activity-rail').trim(),symbolColor:root.getPropertyValue('--text').trim()}).catch(()=>{});
  };
  const observer=new MutationObserver(update);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const media=matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change',update);update();
  return ()=>{observer.disconnect();media.removeEventListener('change',update);};
 },[]);
 return <div className="windows-chrome" aria-label={t('窗口工具栏')}>
  {!settings&&<SidebarTrigger aria-controls="workspace-sidebar" aria-label={t('显示 / 隐藏侧栏')} title={t('显示 / 隐藏侧栏')}/>}
  <Button variant="ghost" size="icon" aria-label={t('应用菜单')} title={t('应用菜单')} onClick={()=>void window.desktop?.openWindowMenu?.()}><Menu/></Button>
  {collapsedActions&&<><Button variant="ghost" size="icon" aria-label={t("新建任务")} title={t("新建任务")} onClick={onNewTask}><Plus/></Button><GlobalSidebarActions/></>}
 </div>;
}
