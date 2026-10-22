import {Popover,PopoverContent,PopoverTrigger} from './components/ui/popover';
import {Button} from './components/ui/button';
import {Separator} from './components/ui/separator';
import {useState} from 'react';
import {Folder,MessageCircle,Settings,Server} from 'lucide-react';
import type {SshConnection} from './SshProjectFields';
import {sshLabels,sshProjectState} from './ssh-state';
import './project-info.css';
import type {Project} from './types';
import {t} from './i18n';
export const projectInfoPopupClassName="project-info-popup w-[340px] max-w-[calc(100vw-24px)] max-h-[min(36rem,var(--available-height,90dvh))] overflow-y-auto overscroll-contain p-4 bg-(--raised) text-(--text)";
export function ProjectInfo({name,path,count,permission,project,connection,connectionState,edit}:{name:string;path:string;count?:number;permission?:string;project?:Project;connection?:SshConnection;connectionState?:string;edit?:()=>void}){
 const remote=project?.type==='ssh',container=project?.environment?.kind==='docker'?project.environment:undefined;
 const state=connectionState||(project?sshProjectState(project,connection):'missing');
 const Icon=remote?Server:Folder;
 const metadata: {label:string;value:string}[]=[{label:container?'容器工作目录':'工作目录',value:path||t('未设置')}];
 if(remote&&connection){
  metadata.push({label:'服务器连接',value:connection.name},{label:'主机 / IP',value:connection.host},{label:'端口',value:String(connection.port)},{label:'SSH 用户名',value:connection.username},{label:'认证方式',value:t(connection.authType==='password'?'密码':connection.authType==='key'?'私钥':'SSH Agent')});
 }
 if(container)metadata.push({label:'Docker 容器',value:container.containerName},{label:'容器用户',value:container.user||t('容器默认用户')});
 if(permission)metadata.push({label:'权限模式',value:t(permission==='full'?'完全访问':'默认权限')});
 return <div className="project-info">
  <div className="project-info-heading"><Icon aria-hidden="true"/><div><strong>{name}</strong><span>{t(remote?container?'SSH · Docker 容器':'SSH 远端项目':'本地项目')}</span></div></div>
  {project?.description&&<p className="project-info-description">{project.description}</p>}
  {remote&&<div className="project-info-state" data-state={state}><span aria-hidden="true"/>{t(sshLabels[state]||sshLabels.error)}</div>}
  <Separator/>
  <dl className="project-info-details">{metadata.map(({label,value})=><div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
  {remote&&['missing','unavailable','loading'].includes(state)&&<p className="project-info-description">{t(state==='missing'?'此项目的 SSH 连接配置不可用，可编辑项目重新选择。':state==='loading'?'正在读取 SSH 连接信息。':'暂时无法读取 SSH 连接状态，请稍后重试。')}</p>}
  {remote&&connection?.error&&!['loading','unavailable','connected'].includes(state)&&<details className="project-info-error"><summary>{t('连接详情')}</summary><p>{t(connection.error)}</p></details>}
  {count!==undefined&&<div className="project-info-count"><MessageCircle aria-hidden="true"/><span>{count} {t('个任务')}</span></div>}
  {edit&&<><Separator/><Button variant="ghost" className="w-full justify-start" onClick={edit}><Settings data-icon="inline-start"/>{t('编辑项目')}</Button></>}
 </div>;
}
export function TaskProjectInfo({project,cwd,permission,count,connection,loading=false,unavailable=false,edit}:{project?:Project;connection?:SshConnection;loading?:boolean;unavailable?:boolean;cwd:string;permission:string;count:number;edit(project:Project):void}){
 const [open,setOpen]=useState(false);
 const name=project?.name||cwd.split(/[\\/]/).filter(Boolean).at(-1)||t('工作目录');
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button variant="ghost" size="icon" title={name} aria-label={`${t('项目信息')}：${name}`}/>}><Folder/></PopoverTrigger><PopoverContent className={projectInfoPopupClassName} align="start" sideOffset={8} role="region" aria-label={t('项目信息')}><ProjectInfo name={name} path={cwd} project={project} connection={connection} connectionState={project?sshProjectState(project,connection,loading,unavailable):undefined} count={project?count:undefined} permission={permission} edit={project?()=>{setOpen(false);edit(project);}:undefined}/></PopoverContent></Popover>;
}
