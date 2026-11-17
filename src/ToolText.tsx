import {createContext,useContext,useEffect,useState,useRef} from 'react';
import {Button} from './components/ui/button';
import {t} from './i18n';
export const RunDetailsContext=createContext('');
type Source={toolId?:string;messageId?:string;activityId?:string;preview?:boolean;version?:string;text:string};
export function useToolText(source:Source,open:boolean){
 const id=useContext(RunDetailsContext),[offset,setOffset]=useState<number>(),[page,setPage]=useState<{text:string;offset:number;total:number;version:string}>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const latest=useRef(source);latest.current=source;
 useEffect(()=>{
  if(!open){setPage(undefined);setOffset(undefined);setError('');return;}
  if(!source.preview||!id||!(source.messageId?window.desktop?.getMessageText:window.desktop?.getToolText))return;
  let live=true,busy=false,loaded=false,requested:string|undefined;
  const load=async()=>{
   if(!live||busy||(loaded&&requested===latest.current.version))return;
   busy=true;loaded=true;requested=latest.current.version;
   try{const value=await (source.messageId?window.desktop!.getMessageText!({id,messageId:source.messageId,offset:offset??0}):window.desktop!.getToolText!({id,toolId:source.toolId!,activityId:source.activityId,offset}));if(live){setPage(value);setError('');}}
   catch(e){if(live)setError(e instanceof Error?e.message:String(e));}
   finally{busy=false;}
  };
  // Throttle instead of debounce: continuous streaming must not starve an open panel.
  void load();const timer=setInterval(()=>void load(),150);
  return()=>{live=false;clearInterval(timer);};
 },[id,source.messageId,source.toolId,source.activityId,source.preview,open,offset,retry]);
 return {text:source.preview?page?.text??source.text:source.text,controls:source.preview&&open?<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
  {error?<><span role="alert">{error}</span><Button size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)}>{t('重试')}</Button></>:page?<><span>{page.total?page.offset+1:0}–{Math.min(page.total,page.offset+page.text.length)} / {page.total}</span><Button size="sm" variant="ghost" disabled={!page.offset} onClick={()=>setOffset(Math.max(0,page.offset-64000))}>{t('上一页')}</Button><Button size="sm" variant="ghost" disabled={page.offset+page.text.length>=page.total} onClick={()=>setOffset(page.offset+page.text.length)}>{t('下一页')}</Button></>:<span role="status">{t('正在加载…')}</span>}
 </div>:null};
}
