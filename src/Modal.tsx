import type {ReactNode} from 'react';
import ManagementDialog from './ManagementDialog';
export default function Modal({title,children,close,wide=false,busy=false}:{title:string;children:ReactNode;close():void;wide?:boolean;busy?:boolean}) {
 return <ManagementDialog title={title} busy={busy} close={close} wide={wide}>{children}</ManagementDialog>;
}
