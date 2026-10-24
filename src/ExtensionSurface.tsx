import {Button} from './components/ui/button';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {t} from './i18n';
export default function ExtensionSurface({extensionId,revision,visible,projectId,locale,onSettings}:{extensionId:string;revision?:string;visible:boolean;projectId?:string;locale:string;onSettings?():void}){
 const slot=useRef<HTMLDivElement>(null);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useLayoutEffect(()=>{window.desktop?.extensionPage?.overlay({key:'extension-surface-hidden',enabled:!visible});return()=>{window.desktop?.extensionPage?.overlay({key:'extension-surface-hidden',enabled:false});};},[visible]);
 useEffect(()=>{
  const api=window.desktop?.extensionPage;if(!api){setError(t('请在桌面应用中打开扩展页面。'));return;}const slotId=crypto.randomUUID();let disposed=false;let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const element=slot.current;if(disposed||!element)return;const b=element.getBoundingClientRect();void api.layout({slotId,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},visible:!!element.getClientRects().length&&b.width>0&&b.height>0}).catch(()=>{});});};
  const observer=new ResizeObserver(update);if(slot.current)observer.observe(slot.current);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  const off=api.onClosed(data=>{if(data.slotId===slotId&&!disposed)setError(t('扩展页面已关闭，请重新打开。'));});
  setError('');void (async()=>{await api.context({projectId:projectId||null,locale});if(disposed)return;await api.open({extensionId,slotId});})().then(()=>{if(disposed)void api.close({slotId});else update();}).catch(e=>{if(!disposed)setError(e.message);});
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();off();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);void api.close({slotId}).catch(()=>{});};
 },[extensionId,revision,retry,projectId]);
 return <div ref={slot} className="extension-surface" aria-label={t('扩展页面')}>{error&&<div className="extension-surface-failure"><p role="alert" className="error-banner">{error}</p><div><Button variant="outline" onClick={()=>setRetry(n=>n+1)}>{t("重新打开")}</Button>{onSettings&&<Button variant="ghost" onClick={onSettings}>{t("设置与权限")}</Button>}</div></div>}</div>;
}
