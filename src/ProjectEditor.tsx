import {useEffect,useRef,useState} from 'react';
import {FolderOpen,Laptop,Server,ChevronDown} from 'lucide-react';
import ManagementDialog from './ManagementDialog';
import SshProjectFields,{type SshProjectHandle,type SshProjectState} from './SshProjectFields';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {Field,FieldLabel,FieldDescription} from './components/ui/field';
import {t} from './i18n';
import type {Project} from './types';
import './project-editor.css';

type Props={project:Project;change(project:Project):void;existing:boolean;busy:boolean;error:string;close():void;save():void;remove():void;newTask():void};
export default function ProjectEditor({project,change,existing,busy,error,close,save,remove,newTask}:Props){
 const remote=project.type==='ssh';
 const ssh=useRef<SshProjectHandle>(null);
 const [connection,setConnection]=useState<SshProjectState>({busy:false,ready:false,editing:false,configuring:false,canContinue:false,canCancelWait:false,action:'连接服务器',hint:'选择一个连接，或新建 SSH 连接。'});
 const [picking,setPicking]=useState(false),[localError,setLocalError]=useState(''),[deleting,setDeleting]=useState(false);
 const errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error||localError)errorRef.current?.focus();},[error,localError]);
 const locations=useRef<Partial<Record<'local'|'ssh',{path:string;connectionId?:string;environment?:Project['environment']}>>>({});
 const locked=busy||picking||(remote&&connection.busy);
 const connectionStep=remote&&!connection.configuring;
 const editingConnection=remote&&connection.editing;
 const canSave=!!project.name.trim()&&!!project.path.trim()&&(!remote||connection.ready);
 const switchType=(type:'local'|'ssh')=>{
  locations.current[remote?'ssh':'local']={path:project.path,connectionId:project.connectionId,environment:project.environment};
  const {connectionId,environment,...rest}=project;
  change({...rest,type,...(locations.current[type]||{path:''})});setLocalError('');
 };
 const pick=async()=>{setPicking(true);setLocalError('');try{const folder=await window.desktop?.selectFolder();if(folder)change({...project,path:folder.path,name:project.name||folder.name});}catch(e){setLocalError((e as Error).message);}finally{setPicking(false);}};
 const locationOptions=<fieldset className="project-location" disabled={locked}><legend>{t('项目类型')}</legend><div className="project-location-options">
     {([{type:'local',label:'本地项目',hint:'使用这台电脑上的文件夹',Icon:Laptop},{type:'ssh',label:'SSH 远端项目',hint:'连接服务器上的工作目录',Icon:Server}] as const).map(({type,label,hint,Icon})=><label key={type} className="project-location-option"><input type="radio" name="project-type" value={type} checked={(remote?'ssh':'local')===type} onChange={()=>switchType(type)}/><Icon size={20} aria-hidden="true"/><span><strong>{t(label)}</strong><small>{t(hint)}</small></span></label>)}
    </div></fieldset>;
 return <ManagementDialog title={t(editingConnection?connection.title||'新建 SSH 连接':existing?'管理项目':'创建项目')} busy={busy||picking} close={close} className="project-editor-dialog flex flex-col gap-0 p-0 overflow-hidden sm:max-w-[640px]">
  <form className="project-setup" onSubmit={e=>{e.preventDefault();if(locked||deleting)return;if(connectionStep)ssh.current?.submit();else if(canSave)save();}}>
   <div className="project-editor-body">
    {!editingConnection&&<>{(!remote||!connection.configuring)&&<p className="project-editor-intro">{t('选择代码所在的位置，将相关任务集中在一个项目中。')}</p>}
    {remote&&connection.configuring?<details className="project-description"><summary>{t('项目类型')}<span>{t('SSH 远端项目')}</span><ChevronDown size={14}/></summary>{locationOptions}</details>:locationOptions}</>}
    {remote&&<SshProjectFields ref={ssh} project={project} change={change} onStateChange={setConnection}/>}
    {!connectionStep&&<fieldset className="project-editor-fields" disabled={locked}>
     <Field><FieldLabel htmlFor="project-name">{t('项目名称')}</FieldLabel><Input id="project-name" required maxLength={120} placeholder={t('例如：团队网站')} value={project.name} onChange={e=>change({...project,name:e.target.value})}/></Field>
     <Field><FieldLabel htmlFor="project-directory">{t(project.environment?.kind==='docker'?'容器工作目录':'工作目录')}</FieldLabel><div className="project-directory-input"><Input id="project-directory" required value={project.path} placeholder={remote?'/home/user/project':t('选择文件夹或输入完整路径')} onChange={e=>change({...project,path:e.target.value})}/>{!remote&&window.desktop&&<Button type="button" variant="outline" onClick={()=>void pick()}><FolderOpen/>{t(picking?'正在选择…':'选择文件夹')}</Button>}</div><FieldDescription>{t(project.environment?.kind==='docker'?'文件、终端和 Agent 都在此容器目录中工作。':remote?'终端和 Agent 将在这个远端目录中工作。':'终端和 Agent 将在这个文件夹中工作。')}</FieldDescription></Field>
     <details className="project-description" open={project.description?true:undefined}><summary>{t('项目说明')}<span>{t('可选')}</span><ChevronDown size={14}/></summary><Field><FieldLabel className="sr-only" htmlFor="project-description">{t('项目说明')}</FieldLabel><Textarea id="project-description" maxLength={10000} placeholder={t('补充项目背景，帮助 Agent 理解你的任务。')} value={project.description||''} onChange={e=>change({...project,description:e.target.value})}/></Field></details>
    </fieldset>}
    {(localError||error)&&<p className="project-editor-error" role="alert" tabIndex={-1} ref={errorRef}>{t((localError||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''))}</p>}
    {existing&&!editingConnection&&<div className="project-manage-actions"><Button type="button" variant="ghost" disabled={locked} onClick={newTask}>{t('新建项目任务')}</Button>{!remote&&<Button type="button" variant="ghost" disabled={locked} onClick={()=>void window.desktop?.openProject(project.id).catch(e=>setLocalError(e.message))}>{t('在访达中打开')}</Button>}<Button type="button" variant="destructive" disabled={locked} onClick={()=>setDeleting(true)}>{t('删除项目')}</Button></div>}
   </div>
   <footer className="project-editor-footer">
    {deleting?<><p>{t('删除项目后，所属任务将一并归档，可在设置中还原。项目文件不会被删除。')}</p><div><Button type="button" variant="outline" disabled={locked} onClick={()=>setDeleting(false)}>{t('取消删除')}</Button><Button type="button" variant="destructive" disabled={locked} onClick={remove}>{t('确认删除项目')}</Button></div></>:<><span className="project-editor-hint" role="status">{t(busy?'正在保存…':remote&&connection.hint?connection.hint:!project.path?'选择工作目录后即可保存。':!project.name.trim()?'填写项目名称后即可保存。':'')}</span><div><Button type="button" variant="outline" disabled={busy||picking} onClick={()=>{if(remote&&connection.canCancelWait)ssh.current?.cancelWait();else if(editingConnection)ssh.current?.back();else close();}}>{t(remote&&connection.canCancelWait?'取消等待':editingConnection?'返回':'取消')}</Button><Button type="submit" disabled={locked||(connectionStep?!connection.canContinue:!canSave)}>{t(busy?'正在保存…':connectionStep?connection.action:remote&&!existing?'创建项目':'保存项目')}</Button></div></>}
   </footer>
  </form>
 </ManagementDialog>;
}
