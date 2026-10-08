import type {ReactNode} from 'react';
import {Card,CardHeader,CardTitle,CardContent} from './components/ui/card';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from './components/ui/empty';
export function SettingsCard({title,children}:{title:ReactNode;children:ReactNode}){return <Card className="mb-4"><CardHeader><CardTitle role="heading" aria-level={2}>{title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">{children}</CardContent></Card>;}
export function SettingsEmpty({icon,title,description}:{icon:ReactNode;title:ReactNode;description?:ReactNode}){return <Empty><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle>{description&&<EmptyDescription>{description}</EmptyDescription>}</EmptyHeader></Empty>;}
