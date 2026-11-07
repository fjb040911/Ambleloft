import type {ReactNode} from 'react';
import {CircleDashed,Clock,Play,Pause,Check,TriangleAlert,CircleX,ClipboardCheck,FilePenLine,GitMerge,Square} from 'lucide-react';
import {Badge} from './components/ui/badge';

// Share visual semantics without changing the lifecycle labels or business state.
export default function TaskStatusBadge({state,children,className}:{state:string;children:ReactNode;className?:string}){
 const style=(()=>{
  if(['completed','accepted'].includes(state))return {variant:'success',Icon:Check} as const;
  if(['failed','rejected','error'].includes(state))return {variant:'destructive',Icon:CircleX} as const;
  if(state==='conflict')return {variant:'warning',Icon:GitMerge} as const;
  if(state==='review')return {variant:'warning',Icon:ClipboardCheck} as const;
  if(state==='collecting')return {variant:'secondary',Icon:FilePenLine} as const;
  if(['confirm','draft'].includes(state))return {variant:'warning',Icon:FilePenLine} as const;
  if(['attention','waiting','blocked','interrupted','stale'].includes(state))return {variant:'warning',Icon:TriangleAlert} as const;
  if(['running','starting','preparing','started'].includes(state))return {variant:'info',Icon:Play} as const;
  if(['paused','pausing','stopping'].includes(state))return {variant:'secondary',Icon:Pause} as const;
  if(state==='pending')return {variant:'outline',Icon:Clock} as const;
  if(['ended','stopped','discarded'].includes(state))return {variant:'outline',Icon:Square} as const;
  return {variant:'outline',Icon:CircleDashed} as const;
 })();
 return <Badge variant={style.variant} className={className} data-status={state}><style.Icon aria-hidden="true" data-icon="inline-start"/>{children}</Badge>;
}
