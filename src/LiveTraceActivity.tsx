import {useTraceSweep} from './useTraceSweep';
import type {ReactNode} from 'react';
import {Marker,MarkerIcon,MarkerContent} from './components/ui/marker';
import {Spinner} from './components/ui/spinner';
import {t} from './i18n';

// Keep the slot mounted across handoffs. A concrete step takes precedence
// over a phase label; only an active, unblocked turn gets the wait fallback.
export default function LiveTraceActivity({children,label,waiting=false,hasProgress=false,highlight=true,activityId}:{
 highlight?:boolean;activityId?:string;children?:ReactNode;label?:string;waiting?:boolean;hasProgress?:boolean;
}){
 const status=label||(waiting?t(hasProgress?'等待下一步响应':'等待模型响应'):undefined);
 const sweep=useTraceSweep<HTMLSpanElement>(highlight&&!children&&status?`${activityId??''}:${status}`:undefined);
 return <div className="live-trace-activity min-h-6 min-w-0">
  {children??(status&&<Marker className="process-entry process-entry-title" role="status">
   <MarkerIcon><Spinner role="presentation" className="motion-reduce:animate-none"/></MarkerIcon>
   <MarkerContent ref={sweep}>{status}</MarkerContent>
  </Marker>)}
 </div>;
}
