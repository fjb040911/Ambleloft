import './workforce-directory-empty.css';
import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {Empty,EmptyMedia,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from './components/ui/empty';

export function WorkforceDirectoryEmpty({Icon,title,description,children}:{Icon:LucideIcon;title:string;description?:string;children?:ReactNode}){
 return <Empty className="wf-directory-empty border-none"><EmptyHeader><EmptyMedia variant="icon"><Icon aria-hidden="true"/></EmptyMedia><EmptyTitle>{title}</EmptyTitle>{description&&<EmptyDescription>{description}</EmptyDescription>}</EmptyHeader>{children&&<EmptyContent>{children}</EmptyContent>}</Empty>;
}
