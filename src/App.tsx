import ProjectPicker from './ProjectPicker';
import FileChangesPanel from './FileChangesPanel';
import {useExtensions} from './extensions';
import ExtensionsPage from './ExtensionsPage';
import { t, setLanguage, useLanguage } from './i18n';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Cloud, Cpu, FileText, Folder, FolderPlus, HardDrive, Laptop, LayoutGrid, Monitor, Moon, PanelRight, PanelLeft, PencilLine, Plus, Puzzle, Search, Settings, ShieldCheck, Sparkles, Sun, Trash2, X } from 'lucide-react';
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


export default function App() {
  useLanguage();
  const {snapshot:extensions}=useExtensions();
  const [extensionViewId,setExtensionViewId]=useState<string|null>(null);
  const extensionViews=extensions.installed.filter(item=>item.enabled).flatMap(item=>item.manifest.contributes.views||[]);
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
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [modal, setModal] = useState<'help' | 'delete' | null>(null);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
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
      const next = update(workspaceRef.current);
      await bridge.save(next);
      workspaceRef.current = next;
      setWorkspace(next);
    });
    writeQueue.current = operation.catch(() => {});
    return operation.catch(() => { setError('保存失败，数据未更新。请检查可用磁盘空间后重试。'); throw new Error('save failed'); }).finally(() => setSaving(false));
  };
  const addProject = async () => { if(ready) {setDeleteProject(false);setProjectEditor({id:crypto.randomUUID(),name:'',path:'',description:'',createdAt:new Date().toISOString()});} };
  const newTask = (project = '') => { setChoice(null); setComposerOptions({permission:'default'}); setProjectId(project); setRunId(null); navigate('home'); setTaskDetail(null); setPrompt(''); setTimeout(() => promptRef.current?.focus(), 0); };
  const openProject = (id:string) => {setProjectId(id);setRunId(null);navigate('projects');};
  const openTask = (task:NavTask) => {setProjectId(task.projectId||'');if(task.draft)setTaskDetail(workspace.tasks.find(t=>t.id===task.id)||null);else{setRunId(task.id);navigate('home');}};
  const manage = async (operation:()=>Promise<void>) => {setManaging(true);try{await operation();}catch(error){setError((error as Error).message);}finally{setManaging(false);}};
  const saveProject = () => manage(async()=>{
    if(!projectEditor?.name.trim()||!projectEditor.path.trim())throw new Error('请填写项目名称并选择工作目录');
    const project={...projectEditor,name:projectEditor.name.trim(),path:projectEditor.path.trim()};
    await persist(state=>({...state,projects:state.projects.some(p=>p.id===project.id)?state.projects.map(p=>p.id===project.id?project:p):[...state.projects,project]}));
    setProjectEditor(null);openProject(project.id);
  });
  const removeProject = () => manage(async()=>{
    if(!projectEditor)return;
    if(activeRun)throw new Error('请先等待当前任务结束，再删除项目');
    for(const run of runs.filter(r=>r.projectId===projectEditor.id)) if(window.desktop)setRuns(await window.desktop.editRun({id:run.id,projectId:null}));
    await persist(state=>({...state,projects:state.projects.filter(p=>p.id!==projectEditor.id),tasks:state.tasks.map(t=>t.projectId===projectEditor.id?{...t,projectId:null}:t)}));
    if(projectId===projectEditor.id)newTask();setProjectEditor(null);setDeleteProject(false);
  });
  const saveTaskEdit = (remove=false) => manage(async()=>{
    if(!taskEditor)return;
    if(taskEditor.draft)await persist(state=>({...state,tasks:remove?state.tasks.map(t=>t.id===taskEditor.id?{...t,archivedAt:new Date().toISOString()}:t):state.tasks.map(t=>t.id===taskEditor.id?{...t,title:taskEditor.title.trim(),projectId:taskEditor.projectId}:t)}));
    else if(window.desktop)setRuns(await window.desktop.editRun({id:taskEditor.id,...(remove?{archived:true}:{title:taskEditor.title,projectId:taskEditor.projectId})}));
    if(remove&&runId===taskEditor.id)newTask();setTaskEditor(null);setDeleteTask(false);
  });
  useEffect(() => window.desktop?.onCommand(command => {
    if (command === 'new-task') newTask();
    if (command === 'settings') navigate('settings');
    if (command === 'sidebar') setSidebar(value => !value);
    if (command === 'add-project') void addProject();
    if (command === 'search' && document.querySelector('.app-shell:not([inert]) .file-panel-slot.is-open .file-code')) { window.dispatchEvent(new Event('file-code-find')); return; }
    if (command === 'search') document.querySelector<HTMLInputElement>('.settings-workspace input[type=search], .app-shell:not([inert]) input[type=search]')?.focus();
  }), [ready]);

  const startAgent = async (text: string, previousId?: string, options?:ComposerOptions) => {
    if (!window.desktop) return;
    setSubmitting(true); setError('');
    try { const run = await window.desktop.startRun({ providerId:choice?.providerId||provider?.id, model:choice?.model||provider?.model, ...(!previousId?composerOptions:{}), ...options, prompt: text, projectId: projectId || null, runId: previousId });
      setRuns(current => current.some(item => item.id === run.id) ? current : [run, ...current]); setRunId(run.id); setTaskDetail(null); navigate('home');
    } catch (error) { setError((error as Error).message); throw error; } finally { setSubmitting(false); }
  };
  const stopAgent = async (id: string) => { try { await window.desktop?.stopRun(id); } catch (error) { setError((error as Error).message); } };
  const approveAgent = async (id: string, approvalId: string, decision: 'accept' | 'decline') => { try { await window.desktop?.approveRun({ runId: id, approvalId, decision }); } catch (error) { setError((error as Error).message); } };
  const saveTask = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || saving || submitting || (!prompt.trim()&&!composerOptions.selectedSkillIds?.length)) return;
    if (provider?.configured && window.desktop) { try { await startAgent(prompt); setPrompt(''); setComposerOptions({permission:'default'}); } catch {} return; }
    const taskPrompt=prompt.trim()||'请执行所选技能的工作流程。';
    const task: Task = { selectedSkillIds:composerOptions.selectedSkillIds, id: crypto.randomUUID(), title: taskPrompt.slice(0,34), prompt: taskPrompt+(composerOptions.attachments?.length?'\n\n附件：\n'+composerOptions.attachments.map(file=>file.path).join('\n'):''), modelId: choice?.model||provider?.model||'', projectId: projectId || null, status: 'draft', createdAt: new Date().toISOString() };
    try { await persist(state => ({ ...state, tasks: [task, ...state.tasks] })); setPrompt(''); setComposerOptions({permission:'default'}); setTaskDetail(task); } catch { /* Persistent error is visible. */ }
  };
  const useCapability = (cap: Capability) => { setRunId(null); navigate('home'); setPrompt(cap.prompt); setTimeout(() => promptRef.current?.focus(), 0); };
  const pageLabel = page==='extension-view' ? (extensionView?.title||t('扩展')) : page === 'settings' ? t("设置") : page==='home' ? (currentRun?currentRun.title:t("新建任务")) : page==='projects'?t("我的项目"):page==='devices'?t("我的设备"):pages.find(item => item.id === page)?.label;
  const navTasks=workspaceTasks(runs.filter(r=>!r.archivedAt),workspace.tasks.filter(t=>!t.archivedAt),workspace.projects);
  const archived=workspaceTasks(runs.filter(r=>r.archivedAt),workspace.tasks.filter(t=>t.archivedAt),workspace.projects);
  const selectedProvider=choice ? catalog.providers.find(p=>p.id===choice.providerId) : provider;
  const changeArchive=async(task:NavTask,remove=false)=>{
    if(task.draft)await persist(state=>({...state,tasks:remove?state.tasks.filter(t=>t.id!==task.id):state.tasks.map(t=>t.id===task.id?{...t,archivedAt:null,projectId:state.projects.some(p=>p.id===t.projectId)?t.projectId:null}:t)}));
    else if(window.desktop)setRuns(await window.desktop.editRun({id:task.id,...(remove?{remove:true}:{archived:false})}));
  };
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

  return <><div inert={settingsOpen} style={settingsOpen?{visibility:'hidden',pointerEvents:'none'}:undefined} className={`app-shell ${sidebar ? '' : 'sidebar-hidden'} ${window.desktop ? 'desktop' : 'browser'}`}>
    <aside id="workspace-sidebar" className="sidebar" inert={!sidebar} aria-label={t("主导航")}>
      <div className="window-space"><span className="preview-label">{window.desktop ? '' : 'DESKTOP PREVIEW'}</span></div>
      <button className="brand" onClick={() => navigate('home')} aria-label={t("Ambleloft 工作台")}><img className="brand-symbol" src="./brand/icon-128.png" alt="" /><span>Ambleloft<span className="brand-subtitle">{t("你的个人 AI 工作台")}</span></span></button>
      <button className="new-task" onClick={() => newTask()}><Plus size={17} />{t("新建任务")}<span>⌘ N</span></button>

      <nav>{extensionViews.map(view=><button key={view.id} className={`nav-item ${page==='extension-view'&&extensionViewId===view.id?'active':''}`} aria-current={page==='extension-view'&&extensionViewId===view.id?'page':undefined} onClick={()=>{setExtensionViewId(view.id);navigate('extension-view');}}><Puzzle size={18}/><span>{view.title}</span></button>)}</nav>
      <WorkspaceNavigation projects={workspace.projects} tasks={navTasks.map(task=>({...task,unread:unread.has(task.id)}))} selected={runId} projectId={page==='projects'?projectId:''} open={openTask} newTask={newTask} openProject={openProject} addProject={()=>void addProject()} editProject={project=>{setDeleteProject(false);setProjectEditor({...project});}} editTask={task=>{setDeleteTask(false);setTaskEditor({...task});}} />
      <div className="sidebar-bottom"><div className="sidebar-footer"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={17} />{t("设置")}</button><button className="icon-button" onClick={() => setModal('help')} aria-label={t("关于此版本")}><CircleHelp size={17} /></button></div></div>
    </aside>
    <div className="main-shell"><div className="workspace-content"><div className="conversation-shell">
      <header className="toolbar"><div className="toolbar-left"><button className="icon-button" onClick={() => setSidebar(value => !value)} aria-controls="workspace-sidebar" aria-expanded={sidebar} aria-label={sidebar ? t("隐藏侧栏") : t("显示侧栏")}><PanelLeft size={18} /></button><span className="toolbar-divider" /><span className="toolbar-title" title={pageLabel}>{page==='home'&&currentRun?currentRun.title:t(pageLabel||'')}</span></div><div className="toolbar-right">{canBrowseFiles&&!filesOpen&&!activeChanges&&<button className="icon-button" onClick={() => {setChangeView(null);setFilesOpen(!filesOpen);}} aria-label={t(filesOpen?"隐藏侧边面板":"显示侧边面板")} title={t(filesOpen?"隐藏侧边面板":"显示侧边面板")} aria-pressed={filesOpen}><PanelRight size={20} /></button>}</div></header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <main id="main-content" className={page === 'home' && currentRun ? 'chat-main' : undefined}>
        {runs.filter(run=>!run.summaryOnly&&!run.archivedAt).map(viewRun=><div key={viewRun.id} style={{display:page==='home'&&runId===viewRun.id?'contents':'none'}}><Conversation openChanges={changes=>{setFilesOpen(false);setChangeView({scope:fileScope,changes});}} floatingHost={page==='home'&&runId===viewRun.id&&filesOpen&&expandedFileScope===fileScope&&!settingsOpen?fileChatHost:null} visible={page==='home'&&runId===viewRun.id&&!settingsOpen} openFile={fileProject?openDeliveredFile:undefined} key={viewRun.id} run={viewRun} catalog={catalog} openSettings={section=>{setSettingsSection(section);navigate('settings');}} send={(text,options) => startAgent(text, viewRun.id,options)} stop={() => void stopAgent(viewRun.id)} approve={(id, decision) => approveAgent(viewRun.id, id, decision)} submitting={submitting} /></div>)}
        {page === 'home' && currentRun?.summaryOnly && <p role="status">{t('正在加载会话…')}</p>}
        {page === 'home' && !currentRun && <div className="home-page">
          <div className="greeting-meta"><span className="tiny-spark">✦</span>{t("为专注而设计，让想法自然发生")}</div>
          <h1>{t("给你的想法，一点新可能")}<span className="title-dot">.</span></h1>
          <p className="page-description">{t("从一个问题、一份资料，或一个还没成形的灵感开始。")}</p>
          <div className="new-task-composer">
          <form className="composer" aria-busy={submitting||saving} onSubmit={saveTask}>
            <SkillTags ids={composerOptions.selectedSkillIds} disabled={submitting||saving} onRemove={id=>setComposerOptions(current=>({...current,selectedSkillIds:current.selectedSkillIds?.filter(value=>value!==id)}))}/><textarea disabled={submitting||saving} ref={promptRef} aria-label={t("任务内容")} placeholder={t("今天，想一起完成什么？")} value={prompt} maxLength={20000} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void saveTask(); } }} />
            <div className="composer-bottom"><ComposerControls catalog={catalog} value={{providerId:choice?.providerId||provider?.id,model:choice?.model||provider?.model,...composerOptions}} onChange={next=>{setComposerOptions(next);if(next.providerId&&next.model)setChoice({providerId:next.providerId,model:next.model});}} disabled={submitting||saving} openSettings={section=>{setSettingsSection(section);navigate('settings');}}/><button className="send-button" type="submit" disabled={!ready || (!prompt.trim()&&!composerOptions.selectedSkillIds?.length) || saving || submitting} aria-label={provider?.configured ? t("发送任务") : t("保存任务草稿")}><ArrowUp size={19}/></button></div>
          </form>
          <div className="composer-project-bar"><ProjectPicker projects={workspace.projects} value={projectId} onChange={setProjectId} disabled={submitting||saving}/><span className="composer-project-hint">{t("Shift + Enter 换行")}</span></div>
          </div>
          <div className="composer-note"><ShieldCheck size={13} /><span className="composer-status">{provider?.configured ? `模型服务： ${selectedProvider?.baseUrl} · ${composerOptions.permission==='full'?'完全访问':'默认权限'}` : `${t("配置模型服务即可开始；未配置时只保存草稿")}`}</span>{!provider?.configured && <button className="text-button" onClick={() => navigate('settings')}>{t("配置服务")}</button>}<span className="keyboard-hint">↵ {provider?.configured ? t("发送") : t("保存草稿")}</span></div>
          <section className="starter-section"><div className="section-heading"><h2>{t("从这里开始")}</h2><button className="text-button" onClick={() => navigate('plugins')}>{t("探索更多能力")}<ArrowRight size={13} /></button></div><div className="starter-grid">{capabilities.map(cap => { const Icon = capabilityIcons[cap.icon]; return <button className="starter-card" disabled={submitting||saving} key={cap.id} onClick={() => useCapability(cap)}><span className={`cap-icon ${cap.color}`}><Icon size={21} strokeWidth={1.6} /></span><h3>{t(cap.name)}<ArrowRight size={14} /></h3><p>{t(cap.description)}</p></button>; })}</div></section>
          <div className="home-footer"><span className="footer-line" /><span>{t("你的设备，你的想法，你的节奏。")}</span><span className="footer-line" /></div>
        </div>}

        {page === 'plugins' && <ExtensionsPage />}
        {page==='extension-view'&&<div className="content-page"><h1>{extensionView?.title||t('扩展不可用')}</h1><section className="settings-group"><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{extensionView?.body||t('此扩展已停用或卸载。请在扩展页面管理。')}</p></section></div>}

        {page === 'projects' && currentProject && <div className="content-page"><div className="page-heading"><div><div className="eyebrow">PROJECT</div><h1>{currentProject.name}</h1><p className="page-description">{currentProject.description||'为这个项目添加说明，让相关任务共享背景。'}</p></div><button className="secondary-button" onClick={()=>{setDeleteProject(false);setProjectEditor({...currentProject});}}>{t("编辑项目")}</button></div><p className="project-path">{currentProject.path}</p><button className="primary-button" onClick={()=>newTask(currentProject.id)}><Plus size={16}/>{t("新建项目任务")}</button><div className="task-list project-task-list">{navTasks.filter(t=>t.projectId===currentProject.id).map(task=><button className="task-row" key={task.id} onClick={()=>openTask(task)}><FileText size={17}/><span>{task.title}</span><small>{task.draft?t("草稿"):runStatus[task.status as AgentRun['status']]}</small><ChevronRight size={15}/></button>)}</div>{!navTasks.some(t=>t.projectId===currentProject.id)&&<Empty title={t("还没有任务")} description={t("从这个项目的第一个问题开始。")}/>}</div>}

        {page === 'devices' && <div className="content-page"><div className="eyebrow">PERSONAL COMPUTE</div><h1>{t("工作台运行环境")}</h1><p className="page-description">{t("连接可用模型服务，在这台电脑上完成任务。")}</p><div className="device-card"><div className="device-art"><Laptop size={92} strokeWidth={0.85} /><span /></div><span className="badge green">{device?.mode === 'desktop' ? t("本机 · 已连接") : t("浏览器 · 预览模式")}</span><h2>{device?.name || '正在读取设备…'}</h2><p>{device?.chip || '等待设备信息'}</p><div className="device-stats"><div><Cpu size={17} /><strong>{device?.arch || '—'}</strong><span>{t("处理器架构")}</span></div><div><HardDrive size={17} /><strong>{device?.memoryGB ? `${device.memoryGB} GB` : '—'}</strong><span>{t("物理内存")}</span></div><div><Monitor size={17} /><strong>{device?.platform || '—'}</strong><span>{t("运行平台")}</span></div></div><div className="device-runtime"><span className="status-dot muted" />{provider?.configured ? t("模型服务已配置 · 服务按需启动") : t("模型服务尚未配置")}<span className="badge neutral">{provider?.configured ? t("就绪") : t("待配置")}</span></div></div></div>}


      </main></div>
      <div className="file-chat-host" ref={setFileChatHost}/>
      {activeChanges&&<FileChangesPanel key={activeChanges.turnKey} changes={activeChanges} close={()=>setChangeView(null)}/>}
      {canBrowseFiles&&fileProject&&!activeChanges&&<ProjectFilePanel full={expandedFileScope===fileScope} setFull={value=>setExpandedFileScope(value?fileScope:null)} request={fileRequest?.scope===fileScope?fileRequest:null} key={fileScope} scope={fileScope} context={{projectId:fileProject.id,runId:currentRun?.id}} rootHint={fileRoot} open={filesOpen} close={()=>{setFilesOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.toolbar-right button')?.focus());}} paused={settingsOpen}/>}
      </div>
    </div>
    {notice && <div className="toast" role="status"><CircleHelp size={16} />{notice}</div>}
    {projectEditor && <Modal title={workspace.projects.some(p=>p.id===projectEditor.id)?t("管理项目"):t("创建项目")} close={()=>{if(!managing)setProjectEditor(null);}}><form className="project-editor" onSubmit={e=>{e.preventDefault();void saveProject();}}><fieldset disabled={managing}><label>{t("项目名称")}<input aria-label={t("项目名称")} required maxLength={120} value={projectEditor.name} onChange={e=>setProjectEditor({...projectEditor,name:e.target.value})}/></label><label>{t("项目说明")}<textarea aria-label={t("项目说明")} maxLength={10000} value={projectEditor.description||''} onChange={e=>setProjectEditor({...projectEditor,description:e.target.value})}/></label><label>{t("工作目录")}<input aria-label={t("工作目录")} required value={projectEditor.path} onChange={e=>setProjectEditor({...projectEditor,path:e.target.value})}/></label><button type="button" className="secondary-button" onClick={()=>void manage(async()=>{if(!window.desktop){setNotice('请在桌面版中选择文件夹，预览中可填写路径。');return;}const folder=await window.desktop.selectFolder();if(folder)setProjectEditor({...projectEditor,path:folder.path,name:projectEditor.name||folder.name});})}>{t("选择文件夹")}</button><p className="fine-print">{t("项目说明用于后续任务的上下文。目录修改在下次执行生效，当前任务不受影响。")}</p>{workspace.projects.some(p=>p.id===projectEditor.id)&&<div className="project-management"><button type="button" className="text-button" onClick={()=>{newTask(projectEditor.id);setProjectEditor(null);}}>{t("新建项目任务")}</button><button type="button" className="text-button" onClick={()=>void manage(async()=>{await window.desktop?.openProject(projectEditor.id);})}>{t("在访达中打开")}</button><button type="button" className="text-button danger" onClick={()=>setDeleteProject(true)}>{t("删除项目")}</button></div>}{deleteProject?<div className="delete-confirm"><p>{t("删除项目后，任务保留并移到“聊天”。不会删除本机文件。")}</p><button type="button" className="secondary-button" onClick={()=>setDeleteProject(false)}>{t("取消删除")}</button><button type="button" className="danger-button" onClick={()=>void removeProject()}>{t("确认删除项目")}</button></div>:<button className="primary-button full" type="submit">{t("保存项目")}</button>}</fieldset></form></Modal>}
    {taskEditor && <Modal title={t("管理任务")} close={()=>{if(!managing)setTaskEditor(null);}}><form className="project-editor" onSubmit={e=>{e.preventDefault();void saveTaskEdit();}}><fieldset disabled={managing}><label>{t("任务名称")}<input aria-label={t("任务名称")} required maxLength={120} value={taskEditor.title} onChange={e=>setTaskEditor({...taskEditor,title:e.target.value})}/></label><label>{t("所属项目")}<select aria-label={t("所属项目")} value={taskEditor.projectId||''} onChange={e=>setTaskEditor({...taskEditor,projectId:e.target.value||null})}><option value="">{t("未关联项目（聊天）")}</option>{workspace.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="fine-print">{t("移动后，下一次执行使用目标项目目录。已有对话内容仍保留。")}</p>{deleteTask?<div className="delete-confirm"><p>{t("归档这条任务？可在设置的会话页面中还原。")}</p><button type="button" className="secondary-button" onClick={()=>setDeleteTask(false)}>{t("保留任务")}</button><button type="button" className="danger-button" onClick={()=>void saveTaskEdit(true)}>{t("确认归档任务")}</button></div>:<div className="modal-actions"><button type="button" className="text-button danger" onClick={()=>setDeleteTask(true)}>{t("归档任务")}</button><button className="primary-button" disabled={!taskEditor.title.trim()} type="submit">{t("保存修改")}</button></div>}</fieldset></form></Modal>}
    {modal === 'help' && <Modal title={t("一切，从本地开始")} close={() => setModal(null)}><div className="modal-symbol"><Sparkles size={31} /></div><p>{t("Ambleloft 是为个人 AI 电脑设计的工作台。这是第一个可交互的开发版本。")}</p><div className="info-box">{t("在设置中配置 Responses 模型端点后，即可执行任务。支持对话历史、停止和审批。模型下载及插件安装仍为规划。")}</div><button className="primary-button full" onClick={() => setModal(null)}>{t("开始探索")}</button></Modal>}
    {taskDetail && <Modal title={t("任务草稿")} close={() => { setTaskDetail(null); setModal(null); }} wide><span className="badge neutral"><FileText size={12} />{t("已保存到本地")}</span><h3 className="task-detail-title">{taskDetail.title}</h3><div className="task-prompt">{taskDetail.prompt}</div><div className="detail-row"><span>{t("模型偏好")}</span><strong>{taskDetail.modelId || '发送时选择模型服务'}</strong></div><div className="detail-row"><span>{t("项目")}</span><strong>{workspace.projects.find(project => project.id === taskDetail.projectId)?.name || '未关联项目'}</strong></div><div className="info-box">{t("草稿尚未执行。")}{provider?.configured ? t("可以复制到新任务，通过已配置的模型服务发送。") : t("请先在设置中配置模型服务。")}</div>{modal === 'delete' ? <div className="delete-confirm"><p>{t("归档这条任务草稿？可在设置中还原。")}</p><button className="secondary-button" onClick={() => setModal(null)}>{t("保留")}</button><button className="danger-button" disabled={saving} onClick={async () => { try { await persist(state => ({ ...state, tasks: state.tasks.map(task => task.id === taskDetail.id ? {...task,archivedAt:new Date().toISOString()} : task) })); setTaskDetail(null); setModal(null); } catch { /* Shown by persist. */ } }}>{t("归档草稿")}</button></div> : <div className="modal-actions"><button className="text-button danger" onClick={() => setModal('delete')}><Trash2 size={14} />{t("归档草稿")}</button><button className="secondary-button" onClick={() => { setRunId(null); setPrompt(taskDetail.prompt); setComposerOptions({permission:'default',selectedSkillIds:taskDetail.selectedSkillIds}); setProjectId(taskDetail.projectId || ''); setTaskDetail(null); navigate('home'); }}>{t("复制到新任务")}</button></div>}</Modal>}
  </div>{settingsOpen&&<SettingsWorkspace section={settingsSection} setSection={setSettingsSection} workspace={workspace} save={update=>persist(state=>({...state,...update}))} back={()=>{setSettingsOpen(false);requestAnimationFrame(()=>settingsFocus.current?.focus({preventScroll:true}));}} archived={archived} restore={task=>changeArchive(task)} remove={task=>changeArchive(task,true)} catalog={catalog} refresh={refreshProviders} busy={saving||!ready}/>}</>;
}

function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><Folder size={35} strokeWidth={1.1} /><h2>{title}</h2><p>{description}</p>{action}</div>;
}
