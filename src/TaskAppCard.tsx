import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,RotateCcw} from 'lucide-react';
import {t} from './i18n';
import type {TaskApp} from './types';
import './task-app.css';

/** The iframe has an opaque origin and no Electron bridge. Only its own WindowProxy is accepted. */
export default function TaskAppCard({app,runId,visible,archived}:{app:TaskApp;runId:string;visible:boolean;archived:boolean}){
 const [expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0);
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[height,setHeight]=useState(320);
 const frame=useRef<HTMLIFrameElement>(null),loads=useRef(0),failCurrent=useRef<()=>void>(()=>{});
 useEffect(()=>{
  if(!expanded||!visible||archived)return;
  const api=window.desktop?.taskApps;if(!api){setError(t('请在桌面版中打开交互内容'));return;}
  let disposed=false,sessionId='',initialized=false,timer:ReturnType<typeof setTimeout>|undefined;
  setUrl('');setError('');setReady(false);setHeight(320);loads.current=0;
  const post=(message:unknown)=>frame.current?.contentWindow?.postMessage(message,'*');
  const close=()=>{if(sessionId)void api.close({sessionId}).catch(()=>{});};
  const fail=()=>{if(disposed)return;clearTimeout(timer);close();setUrl('');setError(t('交互内容暂时无法使用。扩展可能已停用、更新，或需要重新授权。'));};
  failCurrent.current=fail;
  const listener=async(event:MessageEvent)=>{
   if(disposed||!sessionId||event.source!==frame.current?.contentWindow||event.origin!=='null')return;
   const message=event.data;
   try{
    if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string'||JSON.stringify(message).length>256*1024)return;
    if(message.method==='ui/notifications/size-changed'&&message.id===undefined){if(initialized&&Number.isFinite(message.params?.height))setHeight(Math.max(160,Math.min(640,Math.ceil(message.params.height))));return;}
    const response=await api.rpc({sessionId,message});if(disposed)return;
    if(response?.notifications){initialized=true;clearTimeout(timer);setReady(true);for(const item of response.notifications)post(item);}
    else if(response?.jsonrpc==='2.0')post(response);
   }catch{fail();}
  };
  window.addEventListener('message',listener);
  const stopContext=api.onContextChanged(value=>{if(value.sessionId===sessionId&&initialized)post({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:value.context});});
  const unsubscribe=api.onClosed(value=>{if(value.sessionId===sessionId)fail();});
  void api.open({runId,appId:app.id}).then(value=>{
   if(disposed){void api.close({sessionId:value.sessionId});return;}
   sessionId=value.sessionId;setUrl(value.url);timer=setTimeout(fail,15000);
  }).catch(fail);
  return()=>{if(initialized)post({jsonrpc:'2.0',id:'host-teardown',method:'ui/resource-teardown',params:{}});disposed=true;failCurrent.current=()=>{};clearTimeout(timer);window.removeEventListener('message',listener);unsubscribe();stopContext();close();};
 },[expanded,visible,archived,app.id,runId,attempt]);
 return <section className="task-app-card" aria-label={t('任务交互内容')}>
  <header><div><span className="task-app-source">{app.extensionName}</span><strong>{app.title}</strong></div><button className="icon-button" aria-label={t(expanded?'收起交互内容':'打开交互内容')} aria-expanded={expanded} disabled={archived} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button></header>
  {archived?<p>{t('还原此任务后可继续操作。')}</p>:expanded&&visible?<>
   {error?<div className="task-app-status" role="alert"><p>{error}</p><button className="secondary-button" onClick={()=>setAttempt(value=>value+1)}><RotateCcw size={14}/>{t('重新打开')}</button></div>:<>
    {!ready&&<p role="status">{t('正在打开交互内容…')}</p>}
    {url&&<iframe ref={frame} onLoad={()=>{if(++loads.current>1)failCurrent.current();}} title={app.title} src={url} sandbox="allow-scripts allow-forms" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-write 'none'" referrerPolicy="no-referrer" style={{height}}/>}
   </>}
  </>:null}
 </section>;
}
