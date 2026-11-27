import './load-more.css';
import {useEffect,useRef} from 'react';
import {Button} from './components/ui/button';
import {Spinner} from './components/ui/spinner';
import {t} from './i18n';
export default function LoadMore({hasMore,loading,error,onLoad,onRestart}:{hasMore:boolean;loading?:boolean;error?:string;onLoad():void;onRestart?():void}){
 const ref=useRef<HTMLDivElement>(null),load=useRef(onLoad);load.current=onLoad;
 useEffect(()=>{if(!hasMore||loading||error)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))load.current();},{rootMargin:'0px 0px 160px 0px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[hasMore,loading,error,onLoad]);
 if(!hasMore&&!error)return null;
 const changed=error?.includes('STORE_PAGE_CHANGED');
 return <div className="store-load-more" ref={ref}>{error&&<p role="alert">{t(changed?'目录已更新，请重新加载列表。':'加载下一页失败，已加载的内容仍可查看。')}</p>}<Button variant="outline" disabled={loading} onClick={changed?onRestart:onLoad}>{loading&&<Spinner data-icon="inline-start"/>}{t(loading?'正在加载…':changed?'重新加载列表':error?'重试':'加载更多')}</Button></div>;
}
