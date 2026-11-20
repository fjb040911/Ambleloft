import type {SshConnection} from './SshProjectFields';
import {sshLabels,sshProjectState} from './ssh-state';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from './components/ui/empty';
import './sidebar-layout.css';
import {SidebarContent,SidebarGroup,SidebarGroupLabel,SidebarGroupAction,SidebarGroupContent,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarMenuAction,SidebarMenuSub} from './components/ui/sidebar';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './components/ui/collapsible';
import {Button} from './components/ui/button';
import {ProjectInfo,projectInfoPopupClassName} from './ProjectInfo';
import VirtualBlock from './VirtualBlock';
import {workspaceGroups,type WorkspaceGroup} from './WorkspaceNavigationItems';
import { t, useLanguage } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type HTMLAttributes } from 'react';
import {Popover,PopoverContent} from './components/ui/popover';
import { BriefcaseBusiness, Check, Circle, LoaderCircle, TriangleAlert, Clock3, Hourglass, MessageCircleQuestion, Shield, CircleStop, CirclePause, CircleCheck, FilePenLine, ChevronRight, Folder, FolderOpen, Server, SquarePen, MoreHorizontal, Plus } from 'lucide-react';
import type { AgentRun, Project, Task } from './types';

// Selected categories cannot collapse. Avoid mounting a measuring animation panel
// for these permanently open containers; project-level toggles still use Base UI.
function NavigationContent({static:fixed,...props}:HTMLAttributes<HTMLDivElement>&{static:boolean}) {
 return fixed?<div data-slot="collapsible-content" {...props}/>:<CollapsibleContent keepMounted {...props}/>;
}
function NavigationTitle({children,className=''}:{children:string;className?:string}) {
 return <span className={`nav-title-viewport ${className}`}><span className="nav-title-text">{children}</span></span>;
}
const PROJECT_TASK_PAGE_SIZE = 5;
const CHAT_PAGE_SIZE = 30;
export type NavTask = {revision?:number;unread?:boolean;queued?:boolean;questions?:AgentRun["questions"];collaboration?:AgentRun['collaboration'];archivedAt?:string|null;id:string; title:string; projectId:string|null; createdAt:string; updatedAt?:string; status:string; draft?:boolean};
const taskStatusIcons = {
 draft: [FilePenLine, '草稿'], queued: [Clock3, '排队中'], preparing: [Hourglass, '准备中'],
 running: [LoaderCircle, '运行中'], question: [MessageCircleQuestion, '等待回答'], waiting: [Shield, '等待审批'],
 stopping: [CircleStop, '停止中'], failed: [TriangleAlert, '失败'], interrupted: [CirclePause, '已中断'],
 completed: [CircleCheck, '已完成'],
} as const;

function TaskStatusIcon({task}:{task:NavTask}) {
 const state = task.draft ? 'draft' : task.queued ? 'queued'
  : task.status==='waiting' && task.questions?.some(question=>question.blocking) ? 'question' : task.status;
 if (!(state in taskStatusIcons) || (state==='completed' && !task.unread)) return null;
 const [Icon,label]=taskStatusIcons[state as keyof typeof taskStatusIcons];
 const description=t(label);
 return <span className="task-status-label" data-state={state} role="img" aria-label={description} title={description}>
  <Icon aria-hidden="true"/>
 </span>;
}
export function workspaceTasks(runs:AgentRun[], drafts:Task[], projects:Project[]):NavTask[] {
 // Streaming updates change updatedAt on every event; only a new turn should reorder tasks.
 const orderedRuns=runs.filter(run=>!run.collaboration).map(run=>({...run,updatedAt:run.messages?.findLast(message=>message.role==='user'&&!message.turnKey)?.timing?.startedAt||run.lastTurnStartedAt||run.createdAt}));
 return [...orderedRuns,...drafts.map(task=>({...task,draft:true}))].map<NavTask>(task=>({...task,projectId:projects.some(p=>p.id===task.projectId)?task.projectId:null})).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt));
}
export default function WorkspaceNavigation({sshConnections=[],sshLoading=false,sshError=false,activeGroup,extensionsContent,workforceContent,projects,tasks,selected,projectId,open,newTask,openProject,editProject,editTask,addProject}:{sshConnections?:SshConnection[];sshLoading?:boolean;sshError?:boolean;activeGroup?:WorkspaceGroup;extensionsContent?:ReactNode;workforceContent?:ReactNode;projects:Project[];tasks:NavTask[];selected:string|null;projectId:string;open(task:NavTask):void;newTask(project?:string):void;openProject(id:string):void;editProject(project:Project):void;editTask(task:NavTask):void;addProject():void}) {
 useLanguage();
 // Keep visited virtualized trees mounted so their measured row heights survive
 // category switches; never-visited categories do not contribute startup work.
 const [visitedGroups,setVisitedGroups]=useState(()=>new Set<WorkspaceGroup>(activeGroup?[activeGroup]:workspaceGroups.map(group=>group.id)));
 useEffect(()=>{if(activeGroup)setVisitedGroups(previous=>previous.has(activeGroup)?previous:new Set([...previous,activeGroup]));},[activeGroup]);
 const mountedGroup=(key:WorkspaceGroup)=>!activeGroup||activeGroup===key||visitedGroups.has(key);
 const scrollPositions=useRef<Record<string,number>>({});
 const contentRef=useRef<HTMLDivElement>(null);
 const [listScrolled,setListScrolled]=useState(false);
 const restoringScroll=useRef(false);
 const restoredGroup=useRef<string|undefined>(undefined);
 useLayoutEffect(()=>{
  const key=activeGroup||'all',el=contentRef.current;
  if(!el)return;
  const previous=restoredGroup.current;restoredGroup.current=key;
  if(previous===undefined)return;
  const target=scrollPositions.current[key]||0;restoringScroll.current=true;
  let frame=0;const restore=()=>{el.scrollTop=target;setListScrolled(el.scrollTop>0);};
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);});
  for(const child of el.children)observer.observe(child);
  restore();
  const finish=()=>{restoringScroll.current=false;observer.disconnect();cancelAnimationFrame(frame);};
  for(const event of ['wheel','touchmove','pointerdown','keydown'])el.addEventListener(event,finish,{passive:true});
  return()=>{finish();for(const event of ['wheel','touchmove','pointerdown','keydown'])el.removeEventListener(event,finish);};

 },[activeGroup]);
 const [limits,setLimits]=useState<Record<string,number>>({});
 const [projectLimit,setProjectLimit]=useState(30);
 const dateGroup=(task:NavTask)=>{const date=new Date(task.updatedAt||task.createdAt);const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);const week=new Date(today);week.setDate(week.getDate()-6);return date>=today?'今天':date>=yesterday?'昨天':date>=week?'近 7 天':'更早';};
 const empty=(icon:ReactNode,title:string,description:string)=><Empty className="sidebar-empty items-start justify-start rounded-none border-0 px-3 pt-7 pb-6 text-left text-pretty"><EmptyHeader className="w-full items-start gap-2"><EmptyMedia className="mb-3 text-muted-foreground [&_svg]:size-6" aria-hidden="true">{icon}</EmptyMedia><EmptyTitle className="text-sm font-medium tracking-normal">{t(title)}</EmptyTitle><EmptyDescription className="max-w-[24ch] text-xs leading-relaxed text-pretty">{t(description)}</EmptyDescription></EmptyHeader></Empty>;
 const taskRows=(key:string)=>{
  const isProject=key!=='chats';
  const items=tasks.filter(task=>isProject?task.projectId===key:!task.projectId);
  const pageSize=isProject?PROJECT_TASK_PAGE_SIZE:CHAT_PAGE_SIZE;
  const limit=limits[key]||pageSize;
  const expanded=limit>pageSize;
  return <SidebarMenu id={`nav-task-list-${key}`}>
   {items.slice(0,limit).map((task,index)=><SidebarMenuItem key={task.id}>{activeGroup==='chats'&&!isProject&&(index===0||dateGroup(items[index-1])!==dateGroup(task))&&<h3 className="nav-date-heading">{t(dateGroup(task))}</h3>}<VirtualBlock enabled={limit>30}>{row(task)}</VirtualBlock></SidebarMenuItem>)}
   {(items.length>limit||(isProject&&expanded))&&<SidebarMenuItem>
    {isProject?<div className="project-task-pagination">
     {items.length>limit&&<Button variant="ghost" size="sm" className="justify-start" aria-label={`${t('展开显示')}：${projects.find(project=>project.id===key)?.name}`} aria-controls={`nav-task-list-${key}`} onClick={()=>setLimits(old=>({...old,[key]:(old[key]||pageSize)+pageSize}))}>{t('展开显示')}</Button>}
     {expanded&&<Button variant="ghost" size="sm" className="justify-start" aria-label={`${t('收起显示')}：${projects.find(project=>project.id===key)?.name}`} aria-controls={`nav-task-list-${key}`} onClick={()=>setLimits(old=>({...old,[key]:pageSize}))}>{t('收起显示')}</Button>}
    </div>:<Button variant="ghost" onClick={()=>setLimits(old=>({...old,[key]:(old[key]||pageSize)+pageSize}))}>{t('加载更多')} · {items.length-limit}</Button>}
   </SidebarMenuItem>}
  </SidebarMenu>;
 };
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const [groups,setGroups]=useState({projects:false,chats:false,workforce:false,extensions:false});
 const previewRef=useRef<HTMLDivElement>(null);
 const [preview,setPreview]=useState<{project:Project;anchor:HTMLElement}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);};
 const hide=()=>{cancel();setPreview(null);};
 const leave=()=>{cancel();timer.current=setTimeout(()=>{if(!previewRef.current?.contains(document.activeElement))setPreview(null);},220);};
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const show=(el:HTMLElement,project:Project)=>{hide();timer.current=setTimeout(()=>setPreview({project,anchor:el}),400);};
 const dismissPreview=()=>{const anchor=preview?.anchor;const target=anchor?.matches('button')?anchor:anchor?.querySelector<HTMLElement>('.project-tree-name');target?.focus();hide();};
 const toggleProject=(id:string)=>{hide();setCollapsed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});};
 const row=(task:NavTask)=><div className={`tree-task ${selected===task.id?'selected':''}`} key={task.id}><SidebarMenuButton variant="row" isActive={selected===task.id} className="min-w-0 flex-1 pr-2 font-normal data-active:font-medium group-has-data-[sidebar=menu-action]/menu-item:pr-2 data-active:text-inherit" aria-current={selected===task.id?'page':undefined} onClick={()=>open(task)} title={task.collaboration?`${task.title} · ${t('协作工作')} / ${task.collaboration.spaceName}`:task.title}><NavigationTitle>{task.title}</NavigationTitle>{task.collaboration&&<BriefcaseBusiness size={13} className="shrink-0 text-muted-foreground" aria-label={`${t('协作工作')} / ${task.collaboration.spaceName}`}/>}{task.unread&&<small role="img" aria-label={t("未读更新")} title={t("未读更新")}>●</small>}<TaskStatusIcon task={task}/></SidebarMenuButton><span className="tree-row-actions"><SidebarMenuAction className="icon-button row-menu shrink-0 static h-8 w-7 after:inset-0" aria-label={`${t("管理任务：")}${task.title}`} onClick={()=>editTask(task)}><MoreHorizontal size={14}/></SidebarMenuAction></span></div>;
 const heading=(key:WorkspaceGroup,action?:string,add?:()=>void)=>{
  if(activeGroup)return null;
  const {label,Icon}=workspaceGroups.find(group=>group.id===key)!;
  return <div className="nav-caption caption-action"><CollapsibleTrigger render={<SidebarGroupLabel render={<button/>} className="nav-group-toggle"/>} aria-controls={`nav-${key}`} title={t(label)} onClick={hide}><Icon aria-hidden="true"/><span>{t(label)}</span><ChevronRight aria-hidden="true" className="nav-group-chevron"/></CollapsibleTrigger>{action?<SidebarGroupAction className="icon-button nav-group-add static shrink-0 size-8 after:inset-0" title={t(action)} aria-label={t(action)} onClick={add}>{key==='projects'?<Plus/>:<SquarePen/>}</SidebarGroupAction>:<span aria-hidden="true" className="size-8 shrink-0"/>}</div>;
 };
 const changeGroup=(key:WorkspaceGroup,open:boolean)=>{if(!activeGroup)setGroups(old=>({...old,[key]:!open}));};
 return <SidebarContent ref={contentRef} className="workspace-navigation" data-scrolled={listScrolled||undefined} onScroll={event=>{setListScrolled(event.currentTarget.scrollTop>0);hide();if(!restoringScroll.current)scrollPositions.current[activeGroup||'all']=event.currentTarget.scrollTop;}} onKeyDown={e=>{if(e.key==='Escape')hide();}}>
  {mountedGroup('projects')&&<SidebarGroup className={activeGroup&&activeGroup!=='projects'?'p-0 hidden':'p-0'} role="region" aria-label={t("我的项目")}><Collapsible open={!!activeGroup||!groups.projects} onOpenChange={open=>changeGroup('projects',open)}>{heading('projects','添加项目',addProject)}<NavigationContent static={!!activeGroup} id="nav-projects" inert={!activeGroup&&groups.projects} aria-hidden={!activeGroup&&groups.projects}><SidebarGroupContent>
  {projects.slice(0,projectLimit).map(project=>{const connection=sshConnections.find(c=>c.id===project.connectionId);const state=sshProjectState(project,connection,sshLoading,sshError);const toggleLabel=t(collapsed.has(project.id)?"展开项目：":"折叠项目：")+project.name;const StateIcon=state==='connected'?Check:['loading','connecting','reconnecting','disconnecting'].includes(state)?LoaderCircle:state==='disconnected'?Circle:TriangleAlert;return <VirtualBlock estimatedHeight={44} key={project.id} enabled={projects.length>30}><SidebarMenu><SidebarMenuItem className="project-tree"><div className={`project-tree-row ${projectId===project.id?'selected':''}`} onMouseLeave={leave} onContextMenu={e=>{e.preventDefault();hide();editProject(project);}}>
   <button className="icon-button tree-toggle" aria-label={toggleLabel} title={toggleLabel} onMouseEnter={hide} onFocus={hide} aria-expanded={!collapsed.has(project.id)} aria-controls={`project-tasks-${project.id}`} onClick={()=>toggleProject(project.id)}>{project.type==='ssh'?<Server size={18} strokeWidth={1.6}/>:collapsed.has(project.id)?<Folder size={18} strokeWidth={1.6}/>:<FolderOpen size={18} strokeWidth={1.6}/>}</button>
   <SidebarMenuButton variant="row" isActive={projectId===project.id} aria-current={projectId===project.id?'page':undefined} className="project-tree-name min-w-0 flex-1 px-0 group-has-data-[sidebar=menu-action]/menu-item:pr-0 data-active:text-inherit" onClick={()=>openProject(project.id)} onMouseEnter={e=>show(e.currentTarget,project)} onFocus={e=>show(e.currentTarget,project)} onBlur={leave} onKeyDown={e=>{if(e.key==='ArrowRight'&&preview){e.preventDefault();previewRef.current?.querySelector('button')?.focus();}}}><NavigationTitle className="project-tree-title">{project.name}</NavigationTitle>{project.type==='ssh'&&<small className="ssh-nav-state" data-state={state} role="img" title={t(sshLabels[state]||sshLabels.error)} aria-label={t(sshLabels[state]||sshLabels.error)}><StateIcon aria-hidden="true"/></small>}</SidebarMenuButton>
   <span className="tree-row-actions"><SidebarMenuAction className="icon-button row-menu shrink-0 static h-8 w-7 after:inset-0" aria-label={`${t("管理项目：")}${project.name}`} onClick={event=>{event.stopPropagation();hide();editProject(project);}}><MoreHorizontal size={15}/></SidebarMenuAction>
   <SidebarMenuAction className="icon-button row-menu shrink-0 static h-8 w-7 after:inset-0" aria-label={`${t("在项目中新建任务：")}${project.name}`} onClick={event=>{event.stopPropagation();hide();newTask(project.id);}}><SquarePen size={15}/></SidebarMenuAction></span>
  </div><Collapsible open={!collapsed.has(project.id)}><CollapsibleContent id={`project-tasks-${project.id}`} keepMounted inert={collapsed.has(project.id)} aria-hidden={collapsed.has(project.id)}>{tasks.some(task=>task.projectId===project.id)&&<div><SidebarMenuSub className="project-children -mx-1 [&_.tree-task>button:first-child]:pl-8 translate-x-0 border-l-0 pl-0 pr-0"><li>{taskRows(project.id)}</li></SidebarMenuSub></div>}</CollapsibleContent></Collapsible></SidebarMenuItem></SidebarMenu></VirtualBlock>;})}{projects.length>projectLimit&&<Button variant="ghost" size="sm" onClick={()=>setProjectLimit(n=>n+30)}>{t('加载更多项目')}</Button>}
  {!projects.length&&(activeGroup?empty(<Folder strokeWidth={1.5}/>,"组织你的工作","为一个目标建立项目，让文件与相关任务各归其位。"): <p className="nav-empty">{t("添加项目，整理相关任务。")}</p>)}</SidebarGroupContent></NavigationContent></Collapsible></SidebarGroup>}
  {mountedGroup('chats')&&<SidebarGroup className={activeGroup&&activeGroup!=='chats'?'p-0 hidden':'p-0'} role="region" aria-label={t("任务")}><Collapsible open={!!activeGroup||!groups.chats} onOpenChange={open=>changeGroup('chats',open)}>{heading('chats','新建任务',()=>newTask())}<NavigationContent static={!!activeGroup} id="nav-chats" inert={!activeGroup&&groups.chats} aria-hidden={!activeGroup&&groups.chats}><SidebarGroupContent>{taskRows('chats')}{!tasks.some(t=>!t.projectId)&&(activeGroup?empty(<SquarePen strokeWidth={1.5}/>,"从一个问题开始","随时发起新任务，在这里继续之前的对话。"):<p className="nav-empty">{t("你的任务会显示在这里。")}</p>)}</SidebarGroupContent></NavigationContent></Collapsible></SidebarGroup>}
  {workforceContent&&mountedGroup('workforce')&&<SidebarGroup className={activeGroup&&activeGroup!=='workforce'?'p-0 hidden':'p-0'} role="region" aria-label={t('协作工作平台')}><Collapsible open={!!activeGroup||!groups.workforce} onOpenChange={open=>changeGroup('workforce',open)}>{heading('workforce')}<NavigationContent static={!!activeGroup} id="nav-workforce" inert={!activeGroup&&groups.workforce} aria-hidden={!activeGroup&&groups.workforce}><SidebarGroupContent>{workforceContent}</SidebarGroupContent></NavigationContent></Collapsible></SidebarGroup>}
  {mountedGroup('extensions')&&<SidebarGroup className={activeGroup&&activeGroup!=='extensions'?'p-0 hidden':'p-0'} role="region" aria-label={t('扩展业务入口')}><Collapsible open={!!activeGroup||!groups.extensions} onOpenChange={open=>changeGroup('extensions',open)}>{heading('extensions')}<NavigationContent static={!!activeGroup} id="nav-extensions" inert={!activeGroup&&groups.extensions} aria-hidden={!activeGroup&&groups.extensions}><SidebarGroupContent>{extensionsContent}</SidebarGroupContent></NavigationContent></Collapsible></SidebarGroup>}

  {preview&&<Popover open onOpenChange={open=>{if(!open)hide();}}><PopoverContent className={projectInfoPopupClassName} anchor={preview.anchor} side="right" align="start" sideOffset={12} initialFocus={false} ref={previewRef} role="region" aria-label={t("项目信息")} onMouseEnter={cancel} onMouseLeave={leave} onFocus={cancel} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))hide();}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();dismissPreview();}}}><ProjectInfo project={preview.project} connection={sshConnections.find(c=>c.id===preview.project.connectionId)} connectionState={sshProjectState(preview.project,sshConnections.find(c=>c.id===preview.project.connectionId),sshLoading,sshError)} name={preview.project.name} path={preview.project.path} count={tasks.filter(t=>t.projectId===preview.project.id).length} edit={()=>{const project=preview.project;hide();editProject(project);}}/></PopoverContent></Popover>}
 </SidebarContent>;
}
