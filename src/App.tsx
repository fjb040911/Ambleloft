import {Tooltip,TooltipTrigger,TooltipContent} from './components/ui/tooltip';
import ProjectCategoryIcon from './ProjectCategoryIcon';
import ExtensionCategoryIcon from './ExtensionCategoryIcon';
import ExtensionIcon from './ExtensionIcon';
import ChatComposer from './ChatComposer';
import {SidebarProvider,SidebarTrigger,useSidebar,Sidebar,SidebarHeader,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton} from './components/ui/sidebar';
import ManagementDialog from './ManagementDialog';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {Field,FieldLabel,FieldSet,FieldGroup,FieldDescription} from './components/ui/field';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {TaskProjectInfo} from './ProjectInfo';
import {GlobalActionsProvider,GlobalSidebarActions} from './GlobalActions';
import {draftForSend} from './draft-send';
import MessageCenter from './MessageCenter';
import WorkspaceSearch from './WorkspaceSearch';
import ProjectPicker from './ProjectPicker';
import FileChangesPanel from './FileChangesPanel';
import {useExtensions} from './extensions';
import ExtensionSurface from './ExtensionSurface';
import ExtensionInteraction from './ExtensionInteraction';
import { t, setLanguage, useLanguage } from './i18n';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MessageCircle, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Cloud, Cpu, FileText, Folder, FolderPlus, HardDrive, Laptop, LayoutGrid, Monitor, Moon, PanelRight, PanelLeft, PencilLine, Plus, Puzzle, Settings, ShieldCheck, Sparkles, Sun, Trash2, X } from 'lucide-react';
import { capabilities } from './catalog';
import Modal from './Modal';
import { bridge, emptyWorkspace } from './storage';
import WorkspaceNavigation, { workspaceTasks, type NavTask } from './WorkspaceNavigation';
import SettingsWorkspace from './SettingsWorkspace';
import ProjectFilePanel, {useFilePanelOpen} from './ProjectFilePanel';
import SkillTags from './SkillTags';
import ComposerControls, {type ComposerOptions} from './ComposerControls';
import Conversation, { isRunning, runStatus } from './Conversation';
import type { AgentRun, ProviderConfig, ProviderCatalog, Capability, Device, Page, Project, Task, Theme, Workspace } from './types';

const pages = [{ id: 'plugins', label: '扩展', icon: Puzzle }] as const;
const capabilityIcons = { folder: Folder, pen: PencilLine, research: BookOpen };


export default function App() { return <SidebarProvider className="contents" keyboardShortcut={false}><WorkspaceApp/></SidebarProvider>; }

function WorkspaceApp() {
  const activeLocale=useLanguage();
  const {snapshot:extensions}=useExtensions();
  const [extensionViewId,setExtensionViewId]=useState<string|null>(null);
  const extensionViews=extensions.installed.filter(item=>item.enabled).flatMap(item=>item.manifest.contributes.views||[]);
  const nativeExtension=extensions.installed.find(item=>item.manifest.id===extensionViewId&&item.enabled);
  const extensionView=extensionViews.find(view=>view.id===extensionViewId);
  useEffect(()=>{const open=(event:Event)=>{setExtensionViewId((event as CustomEvent<string>).detail);setSettingsOpen(false);setPage('extension-view');};window.addEventListener('extensions:open',open);return()=>window.removeEventListener('extensions:open',open);},[]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsSection,setSettingsSection]=useState('general');
  const [catalog,setCatalog]=useState<ProviderCatalog>({defaultId:null,providers:[]});
  const [composerOptions,setComposerOptions]=useState<ComposerOptions>({permission:'default'});
  const [choice,setChoice]=useState<{providerId:string;model:string}|null>(null);
  const settingsFocus=useRef<HTMLElement|null>(null);
  const [provider, setProvider] = useState<ProviderConfig | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentRun = runs.find(run => run.id === runId && !run.archivedAt);
  const activeRun = runs.find(isRunning);
  useEffect(()=>{
   if(!currentRun?.summaryOnly||!window.desktop?.getRunPage)return;
   let cancelled=false;
   window.desktop.getRunPage({id:currentRun.id}).then(run=>{if(!cancelled)setRuns(current=>current.map(item=>item.id===run.id&&item.summaryOnly?run:item));}).catch(e=>{if(!cancelled)setError(e.message);});
   return()=>{cancelled=true;};
  },[runId,currentRun?.summaryOnly]);

  const selectedRunRef=useRef(runId);selectedRunRef.current=runId;
  const [unread,setUnread]=useState<Set<string>>(new Set());
  useEffect(()=>{if(runId)setUnread(old=>{const next=new Set(old);next.delete(runId);return next;});},[runId]);
  const acceptRun = (run: AgentRun) => {
    if(run.id!==selectedRunRef.current&&['completed','failed'].includes(run.status))setUnread(old=>new Set([...old,run.id]));
    setRuns(current => current.some(item=>item.id===run.id)?current.map(item=>item.id===run.id?run:item):[run,...current]);
  };
  const [page, setPage] = useState<Page>('home');
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState('');
  const [managementError, setManagementError] = useState('');
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activeGroup,setActiveGroup]=useState<'projects'|'chats'|'extensions'>('projects');
  const activityLayout=workspace.layoutMode==='activity';
  const {open:sidebarOpen,setOpen,isMobile,openMobile,setOpenMobile,toggleSidebar}=useSidebar();
  const sidebar=isMobile?openMobile:sidebarOpen;
  const setSidebar=(value:boolean)=>isMobile?setOpenMobile(value):setOpen(value);
  const closeNarrowSidebar=()=>{if(isMobile)setOpenMobile(false);};
  useEffect(()=>{if(settingsOpen)setOpenMobile(false);},[settingsOpen,setOpenMobile]);
  const [searchSkillId,setSearchSkillId]=useState<string>();
  const [searchOpen,setSearchOpen]=useState(false);
  const [modal, setModal] = useState<'help' | 'delete' | null>(null);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [continuingDraft,setContinuingDraft]=useState<Task|null>(null);
  const [projectEditor, setProjectEditor] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState(false);
  const [taskEditor, setTaskEditor] = useState<NavTask | null>(null);
  const [deleteTask, setDeleteTask] = useState(false);
  const [managing, setManaging] = useState(false);
  const [notice, setNotice] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const workspaceRef = useRef(workspace);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    bridge.load().then(state => { workspaceRef.current = state; setWorkspace(state); setReady(true); }).catch(() => setError('无法读取工作台数据。为避免覆盖已有内容，保存已暂停。请重启应用重试。'));
    bridge.device().then(setDevice).catch(() => setError('无法读取设备信息，请重新打开设备页面或重启应用。'));
  }, []);
  useEffect(()=>window.desktop?.onWorkspace?.(state=>{if((state.revision??0)>=(workspaceRef.current.revision??0)){workspaceRef.current=state;setWorkspace(state);}}),[]);
  const refreshProviders=async()=>{
    if(!window.desktop)return;
    const config=await window.desktop.getProvider();setProvider(config);
    if(window.desktop.listProviders){const next=await window.desktop.listProviders();setCatalog(next);setChoice(null);}
  };
  useEffect(() => {
    if (!window.desktop?.getProvider) return;
    refreshProviders().catch(error => setError(error.message));
    const off = window.desktop.onRun(acceptRun);
    window.desktop.listRuns().then(list => setRuns(current => [...current, ...list.filter(item => !current.some(run => run.id === item.id))])).catch(error => setError(error.message));
    return off;
  }, []);
  useEffect(()=>{const scale=[90,100,110,120,130].includes(workspace.fontScale||100)?(workspace.fontScale||100)/100:1;document.documentElement.style.setProperty('--font-scale',String(scale));document.documentElement.style.fontSize=`${16*scale}px`;},[workspace.fontScale]);
  useEffect(()=>{const update=()=>setLanguage(workspace.language||'zh-CN');update();window.addEventListener('languagechange',update);return()=>window.removeEventListener('languagechange',update);},[workspace.language]);
  useEffect(() => { document.documentElement.dataset.theme = workspace.theme; }, [workspace.theme]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); } }, [notice]);

  const navigate = (next: Page) => { if(next==='settings'){settingsFocus.current=document.activeElement as HTMLElement;setSettingsOpen(true);return;}setSettingsOpen(false);setPage(next); };
  const persist = (update: (current: Workspace) => Workspace): Promise<void> => {
    setSaving(true);
    const operation = writeQueue.current.then(async () => {
      const before=workspaceRef.current;
      const next = await bridge.update(before,update(before));
      workspaceRef.current = next;
      setWorkspace(next);
    });
    writeQueue.current = operation.catch(() => {});
    return operation.catch(async(error) => {try{const fresh=await bridge.load();workspaceRef.current=fresh;setWorkspace(fresh);}catch{}setError(String(error.message).includes('CONFLICT')?'内容已在其他位置更新，请核对后重试。':'保存失败，数据未更新。请检查可用磁盘空间后重试。');throw error;}).finally(() => setSaving(false));
  };
  const addProject = async () => { if(ready) {setDeleteProject(false);setProjectEditor({id:crypto.randomUUID(),name:'',path:'',description:'',createdAt:new Date().toISOString()});} };
  const newTask = (project = '') => { setError(''); setContinuingDraft(null); setChoice(null); setComposerOptions({permission:'default'}); setProjectId(project); setRunId(null); navigate('home'); setTaskDetail(null); setPrompt(''); setTimeout(() => promptRef.current?.focus(), 0); };
  const openProject = (id:string) => {void window.desktop?.touchSearchItem?.({kind:'project',id}).catch(()=>{});setContinuingDraft(null);setProjectId(id);setRunId(null);navigate('projects');};
  const openTask = (task:NavTask) => {void window.desktop?.touchSearchItem?.({kind:'task',id:task.id}).catch(()=>{});setContinuingDraft(null);setProjectId(task.projectId||'');if(task.draft){const draft=workspace.tasks.find(t=>t.id===task.id);if(!draft)return;if(draft.archivedAt){setTaskDetail(draft);return;}setContinuingDraft(draft);setRunId(null);setPrompt(draft.prompt);setComposerOptions({permission:'default',selectedSkillIds:draft.selectedSkillIds});setTaskDetail(null);setError('');navigate('home');setTimeout(()=>promptRef.current?.focus(),0);}else{setRunId(task.id);navigate('home');}};
  const manage = async (operation:()=>Promise<void>) => {setManaging(true);setManagementError('');try{await operation();}catch(error){setManagementError((error as Error).message);setError((error as Error).message);}finally{setManaging(false);}};
  const saveProject = () => manage(async()=>{
    if(!projectEditor?.name.trim()||!projectEditor.path.trim())throw new Error('请填写项目名称并选择工作目录');
    const project={...projectEditor,name:projectEditor.name.trim(),path:projectEditor.path.trim()};
    await persist(state=>{if(state.projects.find(p=>p.id===project.id)?.revision!==project.revision)throw new Error('CONFLICT: 项目已更新，请重新打开编辑');return {...state,projects:state.projects.some(p=>p.id===project.id)?state.projects.map(p=>p.id===project.id?project:p):[...state.projects,project]};});
    setProjectEditor(null);openProject(project.id);
  });
  const removeProject = () => manage(async()=>{
    if(!projectEditor)return;
    if(activeRun)throw new Error('请先等待当前任务结束，再删除项目');
    // Project tasks are archived when their project is removed.
    await persist(state=>({...state,projects:state.projects.filter(p=>p.id!==projectEditor.id),tasks:state.tasks.map(t=>t.projectId===projectEditor.id?{...t,projectId:null,archivedAt:t.archivedAt||new Date().toISOString()}:t)}));
    if(projectId===projectEditor.id)newTask();setProjectEditor(null);setDeleteProject(false);
  });
  const saveTaskEdit = (remove=false) => manage(async()=>{
    if(!taskEditor)return;
    if(taskEditor.draft)await persist(state=>{if(state.tasks.find(t=>t.id===taskEditor.id)?.revision!==taskEditor.revision)throw new Error('CONFLICT: 草稿已更新，请重新打开编辑');return {...state,tasks:remove?state.tasks.map(t=>t.id===taskEditor.id?{...t,archivedAt:new Date().toISOString()}:t):state.tasks.map(t=>t.id===taskEditor.id?{...t,title:taskEditor.title.trim(),projectId:taskEditor.projectId}:t)};});
    else if(window.desktop)setRuns(await window.desktop.editRun({id:taskEditor.id,...(remove?{archived:true}:{title:taskEditor.title,projectId:taskEditor.projectId})}));
    if(remove&&runId===taskEditor.id)newTask();setTaskEditor(null);setDeleteTask(false);
  });
  useEffect(() => window.desktop?.onCommand(command => {
    if (command === 'new-task') newTask();
    if (command === 'settings') navigate('settings');
    if (command === 'sidebar') toggleSidebar();
    if (command === 'add-project') void addProject();
    if (command === 'messages') { navigate('messages'); return; }
    if (command === 'search' && document.querySelector('.app-shell:not([inert]) .file-panel-slot.is-open .file-code')) { window.dispatchEvent(new Event('file-code-find')); return; }
    if (command === 'search') document.querySelector<HTMLInputElement>('.settings-workspace input[type=search], .app-shell:not([inert]) input[type=search]')?.focus();
  }), [ready]);

  useEffect(()=>window.desktop?.onOpenConversation?.(ref=>{void (async()=>{try{if(ref.kind==='draft'){const state=await window.desktop!.readWorkspace();const draft=state.tasks.find(d=>d.id===ref.recordId);if(!draft)return;if((state.revision??0)>=(workspaceRef.current.revision??0)){workspaceRef.current=state;setWorkspace(state);}if(draft.archivedAt){setTaskDetail(draft);setModal(null);setError('');return;}setError('');setComposerOptions({permission:'default',selectedSkillIds:draft.selectedSkillIds});setContinuingDraft(draft);setRunId(null);setPrompt(draft.prompt);setProjectId(draft.projectId||'');navigate('home');}else{setContinuingDraft(null);setProjectId(ref.projectId||'');setRunId(ref.recordId);navigate('home');}}catch(error){setError((error as Error).message);}})();}),[]);
  const startAgent = async (text: string, previousId?: string, options?:ComposerOptions) => {
    if (!window.desktop) return;
    setSubmitting(true); setError('');
    try {
      let draft=continuingDraft;
      if(!previousId&&draft){const state=await window.desktop.readWorkspace();draft=draftForSend(draft,state.tasks);setContinuingDraft(draft);if((state.revision??0)>=(workspaceRef.current.revision??0)){workspaceRef.current=state;setWorkspace(state);}}
      const run = await window.desktop.startRun({ providerId:choice?.providerId||provider?.id, model:choice?.model||provider?.model, ...(!previousId?composerOptions:{}), ...options, prompt: text, projectId: projectId || null, runId: previousId,...(!previousId&&draft?{draftId:draft.id,draftRevision:draft.revision}:{} ) });
      setRuns(current => current.some(item => item.id === run.id) ? current : [run, ...current]); setRunId(run.id); setTaskDetail(null); setContinuingDraft(null); navigate('home');
    } catch (error) { const message=(error as Error).message;setError(/CONFLICT:.*(草稿|Draft)/.test(message)?t('发送前草稿发生了变化。你的输入仍保留，请重新打开聊天后再试。'):t(message));throw error; } finally { setSubmitting(false); }
  };
  const stopAgent = async (id: string) => { try { await window.desktop?.stopRun(id); } catch (error) { setError((error as Error).message); } };
  const approveAgent = async (id:string,approvalId:string,decision:'accept'|'decline')=>{await window.desktop?.approveRun({runId:id,approvalId,decision});};
  const saveTask = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || saving || submitting || (!prompt.trim()&&!composerOptions.selectedSkillIds?.length)) return;
    if (provider?.configured && window.desktop) { try { await startAgent(prompt); setPrompt(''); setComposerOptions({permission:'default'}); } catch {} return; }
    const taskPrompt=prompt.trim()||'请执行所选技能的工作流程。';
    const task: Task = { selectedSkillIds:composerOptions.selectedSkillIds, ...continuingDraft, id: continuingDraft?.id||crypto.randomUUID(), title: taskPrompt.slice(0,34), prompt: taskPrompt+(composerOptions.attachments?.length?'\n\n附件：\n'+composerOptions.attachments.map(file=>file.path).join('\n'):''), modelId: choice?.model||provider?.model||'', projectId: projectId || null, status: 'draft', createdAt: new Date().toISOString() };
    try { await persist(state => {if(continuingDraft&&state.tasks.find(t=>t.id===task.id)?.revision!==continuingDraft.revision)throw new Error('CONFLICT: 草稿已更新');return { ...state, tasks: [task, ...state.tasks.filter(t=>t.id!==task.id)] };}); const saved=workspaceRef.current.tasks.find(t=>t.id===task.id)||task;setContinuingDraft(saved);setPrompt(saved.prompt);setComposerOptions({permission:'default',selectedSkillIds:saved.selectedSkillIds});setNotice(t('草稿已保存'));setTaskDetail(null); } catch { /* Persistent error is visible. */ }
  };
  const useCapability = (cap: Capability) => { setContinuingDraft(null); setRunId(null); navigate('home'); setPrompt(cap.prompt); setTimeout(() => promptRef.current?.focus(), 0); };
  const pageLabel = page==='messages' ? t('消息中心') : page==='extension-view' ? (nativeExtension?.manifest.name||extensionView?.title||t('扩展')) : page === 'settings' ? t("设置") : page==='home' ? (currentRun?currentRun.title:continuingDraft?.title||t("新建任务")) : page==='projects'?t("我的项目"):page==='devices'?t("我的设备"):pages.find(item => item.id === page)?.label;
  const navTasks=workspaceTasks(runs.filter(r=>!r.archivedAt),workspace.tasks.filter(t=>!t.archivedAt),workspace.projects);
  const archived=workspaceTasks(runs.filter(r=>r.archivedAt),workspace.tasks.filter(t=>t.archivedAt),workspace.projects);
  const selectedProvider=choice ? catalog.providers.find(p=>p.id===choice.providerId) : provider;
  const changeArchive=async(task:NavTask,remove=false)=>{
    if(task.draft)await persist(state=>({...state,tasks:remove?state.tasks.filter(t=>t.id!==task.id):state.tasks.map(t=>t.id===task.id?{...t,archivedAt:null,projectId:state.projects.some(p=>p.id===t.projectId)?t.projectId:null}:t)}));
    else if(window.desktop)setRuns(await window.desktop.editRun({id:task.id,...(remove?{remove:true}:{archived:false})}));
  };
  useEffect(()=>{void window.desktop?.extensionPage?.context({projectId:projectId||null,locale:activeLocale}).catch(()=>{});},[projectId,activeLocale,workspace.revision]);
  const currentProject=workspace.projects.find(p=>p.id===projectId);
  const fileProject=workspace.projects.find(p=>p.id===(currentRun?currentRun.projectId:projectId));
  const fileRoot=currentRun?.cwd||fileProject?.path||'';
  const fileScope=JSON.stringify([currentRun?.id||'new',fileProject?.id||'',fileRoot]);
  const [changeView,setChangeView]=useState<{scope:string;changes:import('./types').TurnFileChanges}|null>(null);
  const activeChanges=changeView?.scope===fileScope&&page==='home'?changeView.changes:null;
  const [filesOpen,setFilesOpen]=useFilePanelOpen(fileScope);
  const [expandedFileScope,setExpandedFileScope]=useState<string|null>(null);
  const [fileChatHost,setFileChatHost]=useState<HTMLDivElement|null>(null);
  const canBrowseFiles=(page==='home'||page==='projects')&&!!fileProject;
  const [fileRequest,setFileRequest]=useState<{scope:string;path:string;id:number}|null>(null);
  const openDeliveredFile=(file:import('./types').DeliveredFile)=>{setFileRequest(previous=>({scope:fileScope,path:file.path,id:(previous?.id||0)+1}));setChangeView(null);setFilesOpen(true);};

  return <GlobalActionsProvider value={{openSearch:()=>setSearchOpen(true),openMessages:()=>navigate('messages'),messagesActive:page==='messages'&&!settingsOpen}}>{searchOpen&&<WorkspaceSearch onAction={action=>{setSearchOpen(false);if(action==='new-task')newTask();else if(action==='new-project')void addProject();else{setSettingsSection(action==='extensions'?'plugins':'general');navigate('settings');}}} close={()=>setSearchOpen(false)} fallback={[...runs.filter(r=>!r.archivedAt).map(r=>({id:r.id,kind:'task' as const,title:r.title,snippet:r.messages.map(m=>m.text).join(' '),date:r.updatedAt||r.createdAt})),...workspace.tasks.filter(r=>!r.archivedAt).map(r=>({id:r.id,kind:'task' as const,draft:true,title:r.title,snippet:r.prompt,date:r.createdAt})),...workspace.projects.map(p=>({id:p.id,kind:'project' as const,title:p.name,snippet:p.description||'',date:p.createdAt})),...extensions.installed.filter(e=>e.enabled).map(e=>({id:e.manifest.id,kind:'extension' as const,title:e.manifest.name,snippet:e.manifest.description||''}))]} open={item=>{setSearchOpen(false);if(item.kind==='skill'){setSearchSkillId(item.id);setSettingsSection('skills');navigate('settings');}else if(item.kind==='project')openProject(item.id);else if(item.kind==='extension'){void window.desktop?.touchSearchItem?.({kind:'extension',id:item.id}).catch(()=>{});setExtensionViewId(item.id);navigate('extension-view');}else {const task=navTasks.find(t=>t.id===item.id);if(task)openTask(task);else{setRunId(item.id);navigate('home');}}}}/>}<ExtensionInteraction/><div inert={settingsOpen} aria-hidden={settingsOpen} style={{'--sidebar-width':activityLayout?'256px':'224px',...(settingsOpen?{visibility:'hidden',pointerEvents:'none'}:{})} as React.CSSProperties} className={`app-shell ${activityLayout?'activity-layout':''} ${sidebar ? '' : 'sidebar-hidden'} ${window.desktop ? 'desktop' : 'browser'}`}>

    {activityLayout&&<nav className="activity-rail" aria-label={t('分组导航')}><Button variant="ghost" size="icon" className="activity-brand" aria-label={t('Ambleloft 工作台')} onClick={()=>navigate('home')}><img src="./brand/icon-128.png" alt=""/></Button><SidebarMenu className="activity-groups">{([{id:'projects',label:'项目',Icon:ProjectCategoryIcon},{id:'chats',label:'任务',Icon:MessageCircle},{id:'extensions',label:'扩展',Icon:ExtensionCategoryIcon}] as const).map(({id,label,Icon})=><SidebarMenuItem key={id}><Tooltip><TooltipTrigger render={<SidebarMenuButton isActive={activeGroup===id&&sidebar} className="activity-group h-12 justify-center [&>svg]:size-6 data-active:bg-[var(--selection)] data-active:text-[var(--accent)] data-active:hover:bg-[var(--selection)] data-active:hover:text-[var(--accent)]"/>} aria-label={t(label)} aria-pressed={activeGroup===id&&sidebar} aria-controls="workspace-sidebar" onClick={()=>{setActiveGroup(id);setSidebar(activeGroup===id?!sidebar:true);}}><Icon/></TooltipTrigger><TooltipContent side="right">{t(label)}</TooltipContent></Tooltip></SidebarMenuItem>)}</SidebarMenu><div className="activity-footer"><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon"/>} aria-label={t('设置')} onClick={()=>navigate('settings')}><Settings size={18}/></TooltipTrigger><TooltipContent side="right">{t('设置')}</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon"/>} aria-label={t('关于此版本')} onClick={()=>setModal('help')}><CircleHelp size={18}/></TooltipTrigger><TooltipContent side="right">{t('关于此版本')}</TooltipContent></Tooltip></div></nav>}
    <Sidebar contentClassName="sidebar" collapsible="offcanvas" role="complementary" id="workspace-sidebar" aria-label={t("主导航")} className={activityLayout?'workspace-sidebar-container border-sidebar-border data-[side=left]:left-[60px]':'workspace-sidebar-container border-sidebar-border'} style={{'--sidebar-width':activityLayout?'256px':'224px'} as React.CSSProperties}>

      <SidebarHeader className="p-0"><GlobalSidebarActions/>
      <button style={activityLayout?{display:'none'}:undefined} className="brand" onClick={() => navigate('home')} aria-label={t("Ambleloft 工作台")}><img className="brand-symbol" src="./brand/icon-128.png" alt="" /><span>Ambleloft<span className="brand-subtitle">{t("你的个人 AI 工作台")}</span></span></button>
      <SidebarMenu className="px-4"><SidebarMenuItem><SidebarMenuButton className="new-task mx-0 w-full" onClick={()=>{if(activityLayout&&activeGroup==='projects'){void addProject();}else if(activityLayout&&activeGroup==='extensions'){setSettingsSection('plugins');navigate('settings');}else{newTask();closeNarrowSidebar();}}}>{activityLayout&&activeGroup==='extensions'?<Settings size={17}/>:<Plus size={17}/>} {t(activityLayout&&activeGroup==='projects'?'新建项目':activityLayout&&activeGroup==='extensions'?'管理扩展':'新建任务')}{(!activityLayout||activeGroup==='chats')&&<span>{(device?.platform==='darwin'||(!device?.platform&&/Mac/.test(navigator.platform)))?'⌘ N':'Ctrl N'}</span>}</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>


      <WorkspaceNavigation hasExtensions={extensions.installed.some(item=>item.enabled)} activeGroup={activityLayout?activeGroup:undefined} manageExtensions={()=>{setSettingsSection('plugins');navigate('settings');}} extensionsContent={<SidebarMenu>{extensions.installed.filter(item=>item.enabled).map(item=><SidebarMenuItem key={item.manifest.id} className={`extension-nav-row ${page==='extension-view'&&extensionViewId===item.manifest.id?'selected':''}`}><SidebarMenuButton aria-current={page==='extension-view'&&extensionViewId===item.manifest.id?'page':undefined} isActive={page==='extension-view'&&extensionViewId===item.manifest.id} className="nav-item data-active:bg-transparent data-active:hover:bg-transparent data-active:text-inherit" onClick={()=>{setExtensionViewId(item.manifest.id);navigate('extension-view');closeNarrowSidebar();}}><ExtensionIcon icon={item.manifest.icon} size={18}/><span>{item.manifest.name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>} projects={workspace.projects} tasks={navTasks.map(task=>({...task,unread:unread.has(task.id)}))} selected={page==='home'?(runId||continuingDraft?.id||null):null} projectId={page==='projects'?projectId:''} open={task=>{openTask(task);closeNarrowSidebar();}} newTask={project=>{newTask(project);closeNarrowSidebar();}} openProject={id=>{openProject(id);closeNarrowSidebar();}} addProject={()=>void addProject()} editProject={project=>{setDeleteProject(false);setProjectEditor({...project});}} editTask={task=>{setManagementError('');setDeleteTask(false);setTaskEditor({...task});}} />
      <SidebarFooter className={activityLayout?"sidebar-bottom p-3 hidden":"sidebar-bottom p-3"}><SidebarMenu><SidebarMenuItem className="sidebar-footer"><SidebarMenuButton isActive={page==='settings'} className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={17} />{t("设置")}</SidebarMenuButton><button className="icon-button" onClick={() => setModal('help')} aria-label={t("关于此版本")}><CircleHelp size={17} /></button></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </Sidebar>

    <div className="main-shell"><div className="workspace-content"><div className="conversation-shell">
      <header className="toolbar"><div className="toolbar-left"><SidebarTrigger aria-controls="workspace-sidebar" aria-expanded={sidebar} aria-label={sidebar ? t("隐藏侧栏") : t("显示侧栏")}/><span className="toolbar-divider" />{page==='home'&&currentRun&&<TaskProjectInfo key={currentRun.id} project={workspace.projects.find(p=>p.id===currentRun.projectId)} cwd={currentRun.cwd||''} permission={currentRun.permission||'default'} count={navTasks.filter(task=>task.projectId===currentRun.projectId).length} edit={project=>{setDeleteProject(false);setProjectEditor({...project});}}/>}<span className="toolbar-title" title={pageLabel}>{page==='home'&&currentRun?currentRun.title:t(pageLabel||'')}</span></div><div className="toolbar-right">{!sidebar&&<><button className="icon-button" aria-label={t("新建任务")} onClick={()=>newTask()}><Plus size={18}/></button><GlobalSidebarActions/></>}{canBrowseFiles&&!filesOpen&&!activeChanges&&<button className="icon-button" onClick={() => {setChangeView(null);setFilesOpen(!filesOpen);}} aria-label={t(filesOpen?"隐藏侧边面板":"显示侧边面板")} title={t(filesOpen?"隐藏侧边面板":"显示侧边面板")} aria-pressed={filesOpen}><PanelRight size={20} /></button>}</div></header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <main id="main-content" className={page === 'home' && currentRun ? 'chat-main' : undefined}>
        {runs.filter(run=>!run.summaryOnly&&!run.archivedAt).map(viewRun=><div key={viewRun.id} style={{display:page==='home'&&runId===viewRun.id?'contents':'none'}}><Conversation openChanges={changes=>{setFilesOpen(false);setChangeView({scope:fileScope,changes});}} floatingHost={page==='home'&&runId===viewRun.id&&filesOpen&&expandedFileScope===fileScope&&!settingsOpen?fileChatHost:null} visible={page==='home'&&runId===viewRun.id&&!settingsOpen} openFile={fileProject?openDeliveredFile:undefined} key={viewRun.id} run={viewRun} catalog={catalog} openSettings={section=>{setSettingsSection(section);navigate('settings');}} send={(text,options) => startAgent(text, viewRun.id,options)} stop={() => void stopAgent(viewRun.id)} approve={(id, decision) => approveAgent(viewRun.id, id, decision)} submitting={submitting} /></div>)}
        {page === 'home' && currentRun?.summaryOnly && <p role="status">{t('正在加载任务…')}</p>}
        {page === 'home' && !currentRun && <div className="home-page">
          <h1>{t(continuingDraft?"继续你的任务":"今天，想完成什么？")}</h1>
          <p className="page-description">{t("从一个问题、一份资料，或一个还没成形的灵感开始。")}</p>
          <div className="new-task-composer">
          {continuingDraft&&<div className="draft-context-bar"><span>{t(workspace.tasks.find(task=>task.id===continuingDraft.id)?.archivedAt?'当前打开的是已归档草稿':'正在继续已有草稿')} · {continuingDraft.title}</span><Button type="button" variant="ghost" size="sm" disabled={submitting||saving} onClick={()=>{setContinuingDraft(null);setRunId(null);setError('');}}>{t('以当前内容新建聊天')}</Button>{workspace.tasks.find(task=>task.id===continuingDraft.id)?.archivedAt&&<Button type="button" variant="ghost" size="sm" onClick={()=>{setTaskDetail(workspace.tasks.find(task=>task.id===continuingDraft.id)||continuingDraft);setModal(null);}}>{t('查看归档草稿')}</Button>}</div>}
          <ChatComposer value={prompt} onChange={setPrompt} onSubmit={()=>void saveTask()} disabled={submitting||saving} inputRef={promptRef}
            label={t('任务内容')} placeholder={t('今天，想一起完成什么？')} canSend={!!ready&&(!!prompt.trim()||!!composerOptions.selectedSkillIds?.length)} saveDraft={!provider?.configured} sendLabel={provider?.configured?t('发送任务'):t('保存任务草稿')}
            skills={<SkillTags ids={composerOptions.selectedSkillIds} disabled={submitting||saving} onRemove={id=>setComposerOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/>}
            controls={<ComposerControls catalog={catalog} value={{providerId:choice?.providerId||provider?.id,model:choice?.model||provider?.model,...composerOptions}} onChange={next=>{setComposerOptions(next);if(next.providerId&&next.model)setChoice({providerId:next.providerId,model:next.model});}} disabled={submitting||saving} openSettings={section=>{setSettingsSection(section);navigate('settings');}}/>}/>

          <div className="composer-project-bar"><ProjectPicker projects={workspace.projects} value={projectId} onChange={setProjectId} disabled={submitting||saving||!!continuingDraft}/></div>
          </div>
          {!provider?.configured&&<div className="composer-note"><span className="composer-status">{t("连接模型服务即可执行任务，当前可保存草稿。")}</span><Button variant="outline" size="sm" onClick={()=>{setSettingsSection('providers');navigate('settings');}}>{t("配置模型服务")}</Button></div>}
          <section className="starter-section" aria-label={t("任务示例")}><span className="text-xs text-muted-foreground">{t("试试这些任务")}</span><div className="starter-suggestions">{capabilities.map(cap=>{const Icon=capabilityIcons[cap.icon];return <Button variant="ghost" size="sm" disabled={submitting||saving} key={cap.id} onClick={()=>useCapability(cap)}><Icon data-icon="inline-start"/>{t(cap.name)}</Button>;})}</div></section>
        </div>}

        {page==='messages'&&<MessageCenter/>}
        {page==='plugins'&&<div className="content-page extension-library"><div className="extension-page-heading"><div><h1>{t('扩展')}</h1><p className="page-description">{t('让工作台拥有更多可能。')}</p></div><Button variant="outline" onClick={()=>{setSettingsSection('plugins');navigate('settings');}}>{t('管理扩展')}</Button></div>{extensions.installed.some(item=>item.enabled)?<div className="extension-library-grid">{extensions.installed.filter(item=>item.enabled).map(item=><button className="extension-library-card" key={item.manifest.id} onClick={()=>{setExtensionViewId(item.manifest.id);navigate('extension-view');closeNarrowSidebar();}}><span className="extension-library-icon"><ExtensionIcon icon={item.manifest.icon} size={24}/></span><span className="extension-library-copy"><strong>{item.manifest.name}</strong><span>{item.manifest.description}</span></span><ChevronRight size={16} aria-hidden="true"/></button>)}</div>:<section className="extension-empty" aria-labelledby="extension-empty-title"><div className="extension-empty-icon" aria-hidden="true"><Puzzle size={38} strokeWidth={1.35}/></div><h2 id="extension-empty-title">{t(extensions.installed.length?'还没有启用的扩展':'为工作台添加新能力')}</h2><p>{t(extensions.installed.length?'启用已安装的扩展，即可在这里打开并使用。':'连接常用工具，拓展你的工作方式。安装后的扩展会显示在这里。')}</p><Button variant="default" onClick={()=>{setSettingsSection('plugins');navigate('settings');}}>{t(extensions.installed.length?'管理扩展':'添加扩展')}<ArrowRight size={15} aria-hidden="true"/></Button></section>}</div>}

        {page==='extension-view'&&nativeExtension?.home?<ExtensionSurface extensionId={nativeExtension.manifest.id} revision={nativeExtension.active} visible={!settingsOpen}/>:page==='extension-view'&&<div className="content-page"><h1>{nativeExtension?.manifest.name||extensionView?.title||t('扩展不可用')}</h1><section className="settings-group"><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{extensionView?.body||nativeExtension?.manifest.contributes.views?.[0]?.body||t(nativeExtension?'此扩展未提供首页。':'此扩展已停用或卸载。请在扩展页面管理。')}</p>{nativeExtension?.operations?.map(operation=><div key={operation.id}><Button variant="outline" disabled>{operation.title}</Button><p>{operation.description}</p><small>{t('通过 Agent 或扩展提供的入口使用。')}</small></div>)}</section></div>}

        {page === 'projects' && currentProject && <div className="content-page"><div className="page-heading"><div><div className="eyebrow">PROJECT</div><h1>{currentProject.name}</h1><p className="page-description">{currentProject.description||t('为这个项目添加说明，让相关任务共享背景。')}</p></div><Button variant="outline" onClick={()=>{setDeleteProject(false);setProjectEditor({...currentProject});}}>{t("编辑项目")}</Button></div><p className="project-path">{currentProject.path}</p><Button variant="default" onClick={()=>newTask(currentProject.id)}><Plus size={16}/>{t("新建项目任务")}</Button><div className="task-list project-task-list">{navTasks.filter(t=>t.projectId===currentProject.id).map(task=><button className="task-row" key={task.id} onClick={()=>openTask(task)}><FileText size={17}/><span>{task.title}</span><small>{task.draft?t("草稿"):task.queued?t('排队中'):t(runStatus[task.status as AgentRun['status']])}</small><ChevronRight size={15}/></button>)}</div>{!navTasks.some(t=>t.projectId===currentProject.id)&&<Empty title={t("还没有任务")} description={t("从这个项目的第一个问题开始。")}/>}</div>}

        {page === 'devices' && <div className="content-page"><div className="eyebrow">PERSONAL COMPUTE</div><h1>{t("工作台运行环境")}</h1><p className="page-description">{t("连接可用模型服务，在这台电脑上完成任务。")}</p><div className="device-card"><div className="device-art"><Laptop size={92} strokeWidth={0.85} /><span /></div><span className="badge green">{device?.mode === 'desktop' ? t("本机 · 已连接") : t("浏览器 · 预览模式")}</span><h2>{device?.name || t('正在读取设备…')}</h2><p>{device?.chip || t('等待设备信息')}</p><div className="device-stats"><div><Cpu size={17} /><strong>{device?.arch || '—'}</strong><span>{t("处理器架构")}</span></div><div><HardDrive size={17} /><strong>{device?.memoryGB ? `${device.memoryGB} GB` : '—'}</strong><span>{t("物理内存")}</span></div><div><Monitor size={17} /><strong>{device?.platform || '—'}</strong><span>{t("运行平台")}</span></div></div><div className="device-runtime"><span className="status-dot muted" />{provider?.configured ? t("模型服务已配置 · 服务按需启动") : t("模型服务尚未配置")}<span className="badge neutral">{provider?.configured ? t("就绪") : t("待配置")}</span></div></div></div>}


      </main></div>
      <div className="file-chat-host" ref={setFileChatHost}/>
      {activeChanges&&<FileChangesPanel key={activeChanges.turnKey} changes={activeChanges} close={()=>setChangeView(null)}/>}
      {canBrowseFiles&&fileProject&&!activeChanges&&<ProjectFilePanel full={expandedFileScope===fileScope} setFull={value=>setExpandedFileScope(value?fileScope:null)} request={fileRequest?.scope===fileScope?fileRequest:null} key={fileScope} scope={fileScope} context={{projectId:fileProject.id,runId:currentRun?.id}} rootHint={fileRoot} open={filesOpen} close={()=>{setFilesOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.toolbar-right button')?.focus());}} paused={settingsOpen}/>}
      </div>
    </div>
    {notice && <div className="toast" role="status"><CircleHelp size={16} />{notice}</div>}
    {projectEditor && <ManagementDialog busy={managing} title={workspace.projects.some(p=>p.id===projectEditor.id)?t("管理项目"):t("创建项目")} close={()=>{if(!managing)setProjectEditor(null);}}><form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();void saveProject();}}><FieldSet disabled={managing}><FieldGroup><Field><FieldLabel htmlFor="project-322">{t("项目名称")}</FieldLabel><Input id="project-322" aria-label={t("项目名称")} required maxLength={120} value={projectEditor.name} onChange={e=>setProjectEditor({...projectEditor,name:e.target.value})}/></Field><Field><FieldLabel htmlFor="project-502">{t("项目说明")}</FieldLabel><Textarea id="project-502" aria-label={t("项目说明")} maxLength={10000} value={projectEditor.description||''} onChange={e=>setProjectEditor({...projectEditor,description:e.target.value})}/></Field><Field><FieldLabel htmlFor="project-696">{t("工作目录")}</FieldLabel><Input id="project-696" aria-label={t("工作目录")} required value={projectEditor.path} onChange={e=>setProjectEditor({...projectEditor,path:e.target.value})}/></Field><Button type="button" variant="outline" onClick={()=>void manage(async()=>{if(!window.desktop){setNotice('请在桌面版中选择文件夹，预览中可填写路径。');return;}const folder=await window.desktop.selectFolder();if(folder)setProjectEditor({...projectEditor,path:folder.path,name:projectEditor.name||folder.name});})}>{t("选择文件夹")}</Button><FieldDescription>{t("项目说明用于后续任务的上下文。目录修改在下次执行生效，当前任务不受影响。")}</FieldDescription>{workspace.projects.some(p=>p.id===projectEditor.id)&&<div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={()=>{newTask(projectEditor.id);setProjectEditor(null);}}>{t("新建项目任务")}</Button><Button type="button" variant="ghost" onClick={()=>void manage(async()=>{await window.desktop?.openProject(projectEditor.id);})}>{t("在访达中打开")}</Button><Button type="button" variant="destructive" onClick={()=>setDeleteProject(true)}>{t("删除项目")}</Button></div>}{deleteProject?<div className="flex flex-col gap-3"><p>{t("删除项目后，所属任务将一并归档，可在设置中还原。不会删除本机文件。")}</p><Button type="button" variant="outline" onClick={()=>setDeleteProject(false)}>{t("取消删除")}</Button><Button type="button" variant="destructive" onClick={()=>void removeProject()}>{t("确认删除项目")}</Button></div>:<Button className="w-full" type="submit">{t("保存项目")}</Button>}</FieldGroup></FieldSet></form></ManagementDialog>}
    {taskEditor && <ManagementDialog busy={managing} title={t("管理任务")} close={()=>{if(!managing)setTaskEditor(null);}}><form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();void saveTaskEdit();}}><FieldSet disabled={managing}><FieldGroup>{managementError&&<p className="error-banner" role="alert">{managementError}</p>}<Field><FieldLabel htmlFor="project-2535">{t("任务名称")}</FieldLabel><Input id="project-2535" aria-label={t("任务名称")} required maxLength={120} value={taskEditor.title} onChange={e=>setTaskEditor({...taskEditor,title:e.target.value})}/></Field><Field><FieldLabel htmlFor="project-2708">{t("所属项目")}</FieldLabel><NativeSelect id="project-2708" aria-label={t("所属项目")} value={taskEditor.projectId||''} onChange={e=>setTaskEditor({...taskEditor,projectId:e.target.value||null})}><NativeSelectOption value="">{t("未关联项目（任务）")}</NativeSelectOption>{workspace.projects.map(p=><NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}</NativeSelect></Field><FieldDescription>{t("移动后，下一次执行使用目标项目目录。已有对话内容仍保留。")}</FieldDescription>{deleteTask?<div key="archive-confirmation" className="flex flex-col gap-3"><p>{t("归档这条任务？可在设置的任务页面中还原。")}</p><Button type="button" variant="outline" onClick={()=>setDeleteTask(false)}>{t("保留任务")}</Button><Button type="button" variant="destructive" onClick={()=>void saveTaskEdit(true)}>{t("确认归档任务")}</Button></div>:<div key="task-actions" className="flex flex-wrap justify-end gap-2"><Button type="button" variant="destructive" onClick={()=>setDeleteTask(true)}>{t("归档任务")}</Button><Button  disabled={!taskEditor.title.trim()} type="submit">{t("保存修改")}</Button></div>}</FieldGroup></FieldSet></form></ManagementDialog>}
    {modal === 'help' && <Modal title={t("一切，从本地开始")} close={() => setModal(null)}><div className="modal-symbol"><Sparkles size={31} /></div><p>{t("Ambleloft 是为个人 AI 电脑设计的工作台。这是第一个可交互的开发版本。")}</p><div className="info-box">{t("在设置中配置 Responses 模型端点后，即可执行任务。支持对话历史、停止和审批。模型下载及插件安装仍为规划。")}</div><Button variant="default" className="w-full" onClick={() => setModal(null)}>{t("开始探索")}</Button></Modal>}
    {taskDetail && <Modal title={t(taskDetail.archivedAt?"已归档的任务草稿":"任务草稿")} close={() => { setTaskDetail(null); setModal(null); }} wide><span className="badge neutral"><FileText size={12} />{t("已保存到本地")}</span><h3 className="task-detail-title">{taskDetail.title}</h3><div className="task-prompt">{taskDetail.prompt}</div><div className="detail-row"><span>{t("模型偏好")}</span><strong>{taskDetail.modelId || t('发送时选择模型服务')}</strong></div><div className="detail-row"><span>{t("项目")}</span><strong>{workspace.projects.find(project => project.id === taskDetail.projectId)?.name || t('未关联项目')}</strong></div><div className="info-box">{t(taskDetail.archivedAt?"这份草稿已归档。还原后可继续，也可以复制为新聊天。":"草稿尚未执行。")}{provider?.configured ? t("可以继续此任务，或复制为新任务后发送。") : t("请先在设置中配置模型服务。")}</div>{modal === 'delete' ? <div className="delete-confirm"><p>{t("归档这条任务草稿？可在设置中还原。")}</p><Button variant="outline" onClick={() => setModal(null)}>{t("保留")}</Button><Button variant="destructive" disabled={saving} onClick={async () => { try { await persist(state => ({ ...state, tasks: state.tasks.map(task => task.id === taskDetail.id ? {...task,archivedAt:new Date().toISOString()} : task) })); setTaskDetail(null); setModal(null); } catch { /* Shown by persist. */ } }}>{t("归档草稿")}</Button></div> : <div className="modal-actions"><Button variant="destructive" size="sm" onClick={() => setModal('delete')}><Trash2 size={14} />{t("归档草稿")}</Button>{taskDetail.archivedAt&&<Button variant="default" disabled={saving} onClick={async()=>{try{const id=taskDetail.id;await persist(state=>({...state,tasks:state.tasks.map(task=>task.id===id?{...task,archivedAt:null}:task)}));const restored=workspaceRef.current.tasks.find(task=>task.id===id);if(restored){setContinuingDraft(restored);setPrompt(restored.prompt);setComposerOptions({permission:'default',selectedSkillIds:restored.selectedSkillIds});setProjectId(restored.projectId||'');setRunId(null);setTaskDetail(null);setError('');navigate('home');}}catch{}}}>{t('还原并继续')}</Button>}<Button variant="default" disabled={!window.desktop?.patchWorkspace||!!taskDetail.archivedAt} onClick={()=>{setError('');setContinuingDraft(taskDetail);setRunId(null);setPrompt(taskDetail.prompt);setComposerOptions({permission:'default',selectedSkillIds:taskDetail.selectedSkillIds});setProjectId(taskDetail.projectId||'');setTaskDetail(null);navigate('home');}}>{t("继续此任务")}</Button><Button variant="outline" onClick={() => { setContinuingDraft(null); setRunId(null); setPrompt(taskDetail.prompt); setComposerOptions({permission:'default',selectedSkillIds:taskDetail.selectedSkillIds}); setProjectId(taskDetail.projectId || ''); setTaskDetail(null); navigate('home'); }}>{t("复制到新任务")}</Button></div>}</Modal>}
  </div>{settingsOpen&&<SettingsWorkspace initialSkillId={searchSkillId} section={settingsSection} setSection={setSettingsSection} workspace={workspace} save={update=>persist(state=>({...state,...update}))} back={()=>{setSettingsOpen(false);requestAnimationFrame(()=>settingsFocus.current?.focus({preventScroll:true}));}} archived={archived} restore={task=>changeArchive(task)} remove={task=>changeArchive(task,true)} catalog={catalog} refresh={refreshProviders} busy={saving||!ready}/>}</GlobalActionsProvider>;
}

function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><Folder size={35} strokeWidth={1.1} /><h2>{title}</h2><p>{description}</p>{action}</div>;
}
