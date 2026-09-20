import VirtualBlock from './VirtualBlock';
import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Folder, MoreHorizontal, Plus, MessageCircle, Settings } from 'lucide-react';
import type { AgentRun, Project, Task } from './types';
import { runStatus } from './Conversation';
export type NavTask = {unread?:boolean;queued?:boolean;questions?:AgentRun["questions"];archivedAt?:string|null;id:string; title:string; projectId:string|null; createdAt:string; updatedAt?:string; status:string; draft?:boolean};
export function workspaceTasks(runs:AgentRun[], drafts:Task[], projects:Project[]):NavTask[] {
 return [...runs,...drafts.map(task=>({...task,draft:true}))].map<NavTask>(task=>({...task,projectId:projects.some(p=>p.id===task.projectId)?task.projectId:null})).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt));
}
export default function WorkspaceNavigation({projects,tasks,selected,projectId,open,newTask,openProject,editProject,editTask,addProject}:{projects:Project[];tasks:NavTask[];selected:string|null;projectId:string;open(task:NavTask):void;newTask(project?:string):void;openProject(id:string):void;editProject(project:Project):void;editTask(task:NavTask):void;addProject():void}) {
 const [limits,setLimits]=useState<Record<string,number>>({});
 const [projectLimit,setProjectLimit]=useState(30);
 const taskRows=(key:string)=>{const items=tasks.filter(task=>key==='chats'?!task.projectId:task.projectId===key);const limit=limits[key]||30;return <>{items.slice(0,limit).map(task=><VirtualBlock key={task.id} enabled={limit>30}>{row(task)}</VirtualBlock>)}{items.length>limit&&<button className="text-button" onClick={()=>setLimits(old=>({...old,[key]:limit+30}))}>{t('加载更多')} · {items.length-limit}</button>}</>;};
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const [groups,setGroups]=useState({projects:false,chats:false});
 const previewRef=useRef<HTMLDivElement>(null);
 const [preview,setPreview]=useState<{project:Project;x:number;y:number}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);};
 const hide=()=>{cancel();setPreview(null);};
 const leave=()=>{cancel();timer.current=setTimeout(()=>{if(!previewRef.current?.contains(document.activeElement))setPreview(null);},220);};
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const show=(el:HTMLElement,project:Project)=>{hide();const r=el.getBoundingClientRect();timer.current=setTimeout(()=>setPreview({project,x:r.right+12,y:Math.max(12,Math.min(r.top,window.innerHeight-260))}),400);};
 const statusLabel=(task:NavTask)=>task.draft?'草稿':task.queued?'排队中':task.status==='waiting'?(task.questions?.some(q=>q.blocking)?'等待回答':'等待审批'):task.status==='running'?'运行中':task.status==='preparing'?'准备中':task.status==='stopping'?'停止中':task.status==='failed'?'失败':task.status==='interrupted'?'已中断':task.unread?'已完成':'';
 const row=(task:NavTask)=><div className={`tree-task ${selected===task.id?'selected':''}`} key={task.id}><button onClick={()=>open(task)} title={task.title}><span className={`task-state ${task.status}`} aria-label={task.draft?t("草稿"):runStatus[task.status as AgentRun['status']]} /><span>{task.title}</span>{task.unread&&<small aria-label="未读更新">●</small>}{statusLabel(task)&&<small className={`task-status-label ${task.status}`}>{t(statusLabel(task))}</small>}</button><button className="icon-button row-menu" aria-label={`管理任务：${task.title}`} onClick={()=>editTask(task)}><MoreHorizontal size={14}/></button></div>;
 const heading=(key:'projects'|'chats',label:string,action:string,add:()=>void)=><div className="nav-caption caption-action"><button className="nav-group-toggle" aria-expanded={!groups[key]} aria-controls={`nav-${key}`} onClick={()=>{hide();setGroups({...groups,[key]:!groups[key]});}}><ChevronRight size={12} style={{transform:groups[key]?undefined:'rotate(90deg)'}}/>{t(label)}</button><button className="icon-button" aria-label={t(action)} onClick={add}><Plus size={14}/></button></div>;
 return <div className="workspace-navigation" onScroll={hide} onKeyDown={e=>{if(e.key==='Escape')hide();}}>
  <section aria-label={t("我的项目")}>{heading('projects','我的项目','添加项目',addProject)}<div id="nav-projects" hidden={groups.projects}>
  {projects.slice(0,projectLimit).map(project=><VirtualBlock key={project.id} enabled={projects.length>30}><div className="project-tree"><div className={`project-tree-row ${projectId===project.id?'selected':''}`} onMouseEnter={e=>show(e.currentTarget,project)} onMouseLeave={leave} onContextMenu={e=>{e.preventDefault();hide();editProject(project);}}>
   <button className="icon-button tree-toggle" aria-label={`${collapsed.has(project.id)?t("展开"):t("折叠")}项目：${project.name}`} aria-expanded={!collapsed.has(project.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(project.id))next.delete(project.id);else next.add(project.id);return next;})}><ChevronRight size={13} style={{transform:collapsed.has(project.id)?undefined:'rotate(90deg)'}}/></button>
   <button className="project-tree-name" onFocus={e=>show(e.currentTarget,project)} onBlur={leave} onKeyDown={e=>{if(e.key==='ArrowRight'&&preview){e.preventDefault();previewRef.current?.querySelector('button')?.focus();}}} onClick={()=>{hide();openProject(project.id);}}><Folder size={15}/><span>{project.name}</span></button>
   <button className="icon-button row-menu" aria-label={`管理项目：${project.name}`} onClick={()=>{hide();editProject(project);}}><MoreHorizontal size={15}/></button>
   <button className="icon-button row-menu" aria-label={`在项目中新建任务：${project.name}`} onClick={()=>{hide();newTask(project.id);}}><Plus size={15}/></button>
  </div>{!collapsed.has(project.id)&&<div className="project-children">{taskRows(project.id)}</div>}</div></VirtualBlock>)}{projects.length>projectLimit&&<button className="text-button" onClick={()=>setProjectLimit(n=>n+30)}>{t('加载更多项目')}</button>}
  {!projects.length&&<p className="nav-empty">{t("添加项目，整理相关任务。")}</p>}</div></section>
  <section aria-label={t("聊天")}>{heading('chats','聊天','新建聊天',()=>newTask())}<div id="nav-chats" hidden={groups.chats}>{taskRows('chats')}{!tasks.some(t=>!t.projectId)&&<p className="nav-empty">{t("你的聊天会显示在这里。")}</p>}</div></section>
  {preview&&createPortal(<div ref={previewRef} className="project-preview" role="region" aria-label={t("项目信息")} style={{left:preview.x,top:preview.y}} onMouseEnter={cancel} onMouseLeave={leave} onFocus={cancel} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))hide();}} onKeyDown={e=>{if(e.key==='Escape'){hide();}}}><ul className="project-info-list"><li><Folder size={18}/><strong>{preview.project.name}</strong></li><li><MessageCircle size={18}/><span>{tasks.filter(t=>t.projectId===preview.project.id).length} {t("个任务")}</span></li><li className="project-info-path"><Folder size={18}/><span>{preview.project.path}</span></li><li className="project-info-action"><button onClick={()=>{const project=preview.project;hide();editProject(project);}}><Settings size={18}/><span>{t("编辑项目")}</span></button></li></ul></div>,document.body)}
 </div>;
}
