import {Popover,PopoverContent,PopoverTrigger} from './components/ui/popover';
import {Button} from './components/ui/button';
import {Separator} from './components/ui/separator';
import {useState} from 'react';
import {Folder,MessageCircle,Settings,ShieldCheck} from 'lucide-react';
import type {Project} from './types';
import {t} from './i18n';
export function ProjectInfo({name,path,count,permission,edit}:{name:string;path:string;count?:number;permission?:string;edit?:()=>void}){
 return <div className="flex flex-col gap-3"><div className="flex items-center gap-2"><Folder size={18}/><strong>{name}</strong></div>{count!==undefined&&<div className="flex items-center gap-2"><MessageCircle size={18}/><span>{count} {t('个任务')}</span></div>}<Separator/><div className="flex items-start gap-2"><Folder size={18} className="shrink-0"/><span className="min-w-0 break-all">{path}</span></div>{permission&&<div className="flex items-center gap-2"><ShieldCheck size={18}/><span>{t(permission==='full'?'完全访问':'默认权限')}</span></div>}{edit&&<><Separator/><Button variant="ghost" className="w-full justify-start" onClick={edit}><Settings data-icon="inline-start"/>{t('编辑项目')}</Button></>}</div>;
}
export function TaskProjectInfo({project,cwd,permission,count,edit}:{project?:Project;cwd:string;permission:string;count:number;edit(project:Project):void}){
 const [open,setOpen]=useState(false);
 const name=project?.name||cwd.split(/[\\/]/).filter(Boolean).at(-1)||t('工作目录');
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button variant="ghost" size="icon" title={name} aria-label={`${t('项目信息')}：${name}`}/>}><Folder/></PopoverTrigger><PopoverContent align="start" sideOffset={8} role="region" aria-label={t('项目信息')}><ProjectInfo name={name} path={cwd} count={project?count:undefined} permission={permission} edit={project?()=>{setOpen(false);edit(project);}:undefined}/></PopoverContent></Popover>;
}
