import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './components/ui/alert-dialog';
import {t} from './i18n';
type ConfirmOptions={title:string;description?:string;action:string;destructive?:boolean;returnFocus?:HTMLElement|null};
const Context=createContext<(options:ConfirmOptions)=>Promise<boolean>>(()=>Promise.resolve(false));
export const useConfirm=()=>useContext(Context);
export function ConfirmationProvider({children}:{children:ReactNode}) {
 const [request,setRequest]=useState<ConfirmOptions|null>(null);
 const resolve=useRef<((accepted:boolean)=>void)|null>(null);
 const trigger=useRef<HTMLElement|null>(null);
 const cancel=useRef<HTMLButtonElement|null>(null);
 const confirm=useCallback((options:ConfirmOptions)=>{
  if(resolve.current)return Promise.resolve(false);
  trigger.current=options.returnFocus||document.activeElement as HTMLElement;
  return new Promise<boolean>(done=>{resolve.current=done;setRequest(options);});
 },[]);
 const finish=useCallback((accepted:boolean)=>{const done=resolve.current;resolve.current=null;setRequest(null);done?.(accepted);},[]);
 useEffect(()=>()=>{resolve.current?.(false);resolve.current=null;},[]);
 useEffect(()=>{if(!request)return;const key='confirmation-'+crypto.randomUUID();window.desktop?.extensionPage?.overlay({key,enabled:true});return()=>{window.desktop?.extensionPage?.overlay({key,enabled:false});};},[request]);
 return <Context.Provider value={confirm}>{children}<AlertDialog open={!!request} onOpenChange={open=>{if(!open)finish(false);}}><AlertDialogContent initialFocus={cancel} finalFocus={()=>trigger.current?.isConnected?trigger.current:false} className="max-w-[calc(100vw-32px)] sm:max-w-md"><AlertDialogHeader><AlertDialogTitle>{request?.title}</AlertDialogTitle>{request?.description&&<AlertDialogDescription>{request.description}</AlertDialogDescription>}</AlertDialogHeader><AlertDialogFooter><AlertDialogCancel ref={cancel} onClick={()=>finish(false)}>{t('取消')}</AlertDialogCancel><AlertDialogAction variant={request?.destructive?'destructive':'default'} onClick={()=>finish(true)}>{request?.action}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></Context.Provider>;
}
