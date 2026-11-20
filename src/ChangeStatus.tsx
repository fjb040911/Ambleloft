import {useEffect,useRef,useState} from 'react';
import {t} from './i18n';
import {Check,Clock,LoaderCircle,TriangleAlert} from 'lucide-react';
import {Button} from './components/ui/button';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle,PopoverDescription} from './components/ui/popover';

type Change={id:string;state:'switching'|'configured'|'applied'|'failed';error?:string};
// Success belongs to an observed change, never to a restored execution record.
export default function ChangeStatus({value,label,inline=false,onDismiss}:{value?:Change;label:string;inline?:boolean;onDismiss?():void}){
 const previous=useRef(value),[success,setSuccess]=useState<string|null>(null);
 useEffect(()=>{
  const old=previous.current;previous.current=value;
  if(value?.state!=='applied'){setSuccess(null);return;}
  if(!old||old.id!==value.id||!['switching','configured'].includes(old.state))return;
  setSuccess(value.id);
  const timer=setTimeout(()=>setSuccess(null),3000);
  return()=>clearTimeout(timer);
 },[value?.id,value?.state]);
 const shown=!!value&&(value.state!=='applied'||success===value.id);
 const message=label+(value?.error?' · '+value.error:'');
 const Icon=value?.state==='switching'?LoaderCircle:value?.state==='configured'?Clock:value?.state==='failed'?TriangleAlert:Check;
 if(!shown)return null;
 const dismiss=value?.state==='failed'&&onDismiss?<Button size="sm" variant="ghost" onClick={onDismiss}>{t('关闭提示')}</Button>:null;
 if(!inline)return <p className="m-0 px-3.5 py-1 text-xs text-muted-foreground break-words" role={value?.state==='failed'?'alert':'status'}>{message}{dismiss}</p>;
 if(value?.state==='applied')return <span className="change-success" role="status"><Check aria-hidden="true" className="size-3.5 shrink-0"/>{label}</span>;
 return <Popover><PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" className="size-6 shrink-0" aria-label={message} title={message}/> }><Icon aria-hidden="true" className={value?.state==='switching'?'size-3.5 animate-spin motion-reduce:animate-none':'size-3.5'}/></PopoverTrigger><PopoverContent side="top" align="end" className="w-72 max-w-[calc(100vw-24px)]"><PopoverTitle className="sr-only">{label}</PopoverTitle><PopoverDescription role={value?.state==='failed'?'alert':'status'} className="break-words">{message}</PopoverDescription>{dismiss}</PopoverContent><span className="sr-only" role={value?.state==='failed'?'alert':'status'}>{message}</span></Popover>;
}
