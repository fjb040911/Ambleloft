import {useSyncExternalStore} from 'react';
import ChangeStatus from './ChangeStatus';
import {useLanguage} from './i18n';
import type {ModelChange} from './types';
const storageKey='amble.dismissed-model-changes.v1';
const dismissedHere=new Set<string>();
function readDismissed():string[]{
 try{const ids:unknown=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}
}
function subscribe(listener:()=>void){
 window.addEventListener(storageKey,listener);window.addEventListener('storage',listener);
 return ()=>{window.removeEventListener(storageKey,listener);window.removeEventListener('storage',listener);};
}
export default function ModelStatus({value,inline=false}:{value?:ModelChange;inline?:boolean}){
 const language=useLanguage(),L=(zh:string,en:string)=>language==='en'?en:zh;
 const status=value?.state==='switching'?L('模型切换中，尚未确认生效','Switching model; not yet confirmed'):value?.state==='configured'?L('已设置，等待新模型确认','Configured; awaiting model confirmation'):value?.state==='applied'?L('新模型已生效','New model applied'):L('模型切换失败，未确认生效','Model change failed; not confirmed');
 const id=value?.state==='failed'?value.id:undefined;
 const dismissed=useSyncExternalStore(subscribe,()=>!!id&&(dismissedHere.has(id)||readDismissed().includes(id)));
 if(dismissed)return null;
 const dismiss=()=>{if(!id)return;dismissedHere.add(id);
  try{localStorage.setItem(storageKey,JSON.stringify([...new Set([...readDismissed(),id])].slice(-200)));}catch{/* Keep dismissal for this window. */}
  window.dispatchEvent(new Event(storageKey));
 };
 return <ChangeStatus onDismiss={dismiss} value={value} inline={inline} label={(value?.requested.model||'')+' · '+status}/>;
}
