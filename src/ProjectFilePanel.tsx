import FileResizer from './FileResizer';
import {ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuGroup,ContextMenuItem,ContextMenuLabel,ContextMenuSeparator,ContextMenuSub,ContextMenuSubTrigger,ContextMenuSubContent} from './components/ui/context-menu';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent} from './components/ui/dropdown-menu';
import {ToggleGroup,ToggleGroupItem} from './components/ui/toggle-group';
import {Button} from './components/ui/button';
import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {AppWindow,Check,Copy,Link,MoreHorizontal,Pin,ChevronDown,ChevronRight,ChevronsDownUp,ExternalLink,File,Folders,FolderOpen,Maximize2,Minimize2,PanelRight,RefreshCw,RotateCcw,Search,X,ZoomIn,ZoomOut} from 'lucide-react';
import Markdown from './Markdown';
import FileTypeIcon from './FileTypeIcon';
import {copyText} from './clipboard';
import {t} from './i18n';
import type {FileApplication,FileContext,FileEntry,FileListing,FilePreview} from './types';
import './project-files.css';
const Code=lazy(()=>import('./FileCode'));
const Office=lazy(()=>import('./OfficePreview'));
const Pdf=lazy(()=>import('./FilePdf'));
const prefix='atelier.files.v1.';
function load<T>(key:string,fallback:T):T {try{return JSON.parse(localStorage.getItem(prefix+key)||'null')??fallback;}catch{return fallback;}}
function save(key:string,value:unknown){try{localStorage.setItem(prefix+key,JSON.stringify(value));}catch{/* Browsing remains available when storage is full. */}}
export function useFilePanelOpen(key:string) {
 const [values,setValues]=useState<Record<string,boolean>>({});
 const open=values[key]??load<boolean>(key+'.open',false);
 return [open,(value:boolean)=>{save(key+'.open',value);setValues(old=>({...old,[key]:value}));}] as const;
}
type Tab={path:string;pinned:boolean};
type Reading={mode?:'preview'|'code';top?:number;codeTop?:number};
type PanelState={tabs:Tab[];active:string;expanded:string[];reading:Record<string,Reading>;tree:boolean;hidden:boolean};
const initial:PanelState={tabs:[],active:'',expanded:[],reading:{},tree:true,hidden:false};
const icon=(entry:FileEntry)=><FileTypeIcon name={entry.name} directory={entry.directory}/>;
export default function ProjectFilePanel({context,scope,open,close,rootHint,paused,request,full,setFull}:{full:boolean;setFull(value:boolean):void;request?:{path:string;id:number}|null;context:FileContext;scope:string;open:boolean;close:()=>void;rootHint:string;paused:boolean}) {
 const api=window.desktop?.projectFiles;
 const [state,setState]=useState<PanelState>(()=>{const value=load<PanelState>(scope,initial);return value&&Array.isArray(value.tabs)&&Array.isArray(value.expanded)&&value.reading?value:initial;});
 const [width,setWidth]=useState(()=>load<number>('width',680));
 const [treeWidth,setTreeWidth]=useState(()=>load<number>('treeWidth',220));
 const [wrap,setWrap]=useState(true),[zoom,setZoom]=useState(1);
 const [previewZoom,setPreviewZoom]=useState(100);
 const [root,setRoot]=useState(rootHint),[base,setBase]=useState('');
 const [directories,setDirectories]=useState<Record<string,FileListing>>({});
 const [query,setQuery]=useState(''),[matches,setMatches]=useState<FileListing|null>(null),[searching,setSearching]=useState(false);
 const [file,setFile]=useState<FilePreview|null>(null),[error,setError]=useState(''),[treeError,setTreeError]=useState(''),[notice,setNotice]=useState('');
 const [appLists,setAppLists]=useState<Record<string,FileApplication[]>>({}),[preferences,setPreferences]=useState<Record<string,FileApplication>>({}),[menu,setMenu]=useState<{path:string;source:'context'|'open'|'more'}|null>(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!open||paused)setMenu(null);},[open,paused]);
 const body=useRef<HTMLDivElement>(null),stateRef=useRef(state),fileRef=useRef(file),panelRef=useRef<HTMLElement>(null),htmlFrame=useRef<HTMLIFrameElement>(null);
 stateRef.current=state;fileRef.current=file;
 const [narrow,setNarrow]=useState(false),[drawerOpen,setDrawerOpen]=useState(true);
 const treeScroll=useRef<HTMLDivElement>(null),treeTop=useRef(0),treeFocus=useRef(''),tabBar=useRef<HTMLDivElement>(null);
 const [focusedPath,setFocusedPath]=useState('');
 const treeVisible=narrow?drawerOpen:state.tree;
 useLayoutEffect(()=>{const el=panelRef.current;if(!el)return;const observer=new ResizeObserver(()=>setNarrow(el.clientWidth<590));observer.observe(el);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{if(treeVisible&&treeScroll.current)treeScroll.current.scrollTop=treeTop.current;},[treeVisible]);
 const active=state.active,reading=state.reading[active]||{},mode=reading.mode||'preview';
 useLayoutEffect(()=>{tabBar.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const putReading=(update:Reading)=>setState(old=>({...old,reading:{...old.reading,[old.active]:{...old.reading[old.active],...update}}}));
 useEffect(()=>{const timer=setTimeout(()=>save(scope,state),180);return()=>clearTimeout(timer);},[state,scope]);
 useEffect(()=>{const flush=()=>save(scope,stateRef.current);window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);return()=>{flush();window.removeEventListener('pagehide',flush);window.removeEventListener('beforeunload',flush);};},[scope]);
 useEffect(()=>{if(!open)save(scope,stateRef.current);},[open,scope]);
 useEffect(()=>{save('width',width);},[width]);useEffect(()=>{save('treeWidth',treeWidth);},[treeWidth]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),2500);return()=>clearTimeout(timer);}},[notice]);
 useEffect(()=>{
  if(!open||paused||!api)return;
  let cancelled=false;
  api.context(context).then(value=>{if(!cancelled){setRoot(value.root);setBase(value.baseUrl);}}).catch(e=>{if(!cancelled)setTreeError(e.message);});
  return()=>{cancelled=true;};
 },[api,context.projectId,context.runId,open,paused,reload]);
 useEffect(()=>{
  if(!open||paused||!api)return;
  let cancelled=false,running=false;
  const refresh=async()=>{if(running||document.hidden)return;running=true;
   try{const entries=await Promise.all(['',...state.expanded].map(async path=>{try{return [path,await api.list({...context,path,hidden:state.hidden})] as const;}catch(e){if(!path)throw e;return [path,{entries:[],truncated:false}] as const;}}));
    if(!cancelled){setDirectories(Object.fromEntries(entries));setTreeError('');}
   }catch(e){if(!cancelled)setTreeError((e as Error).message);}finally{running=false;}
  };void refresh();const timer=setInterval(refresh,2000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[api,open,paused,context.projectId,context.runId,state.expanded,state.hidden,reload]);
 useEffect(()=>{
  if(!query.trim()||!api||!open||paused){setMatches(null);setSearching(false);return;}
  let cancelled=false;setSearching(true);
  const timer=setTimeout(()=>{api.search({...context,query,hidden:state.hidden}).then(value=>{if(!cancelled){setMatches(value);setSearching(false);}}).catch(e=>{if(!cancelled){setTreeError(e.message);setSearching(false);}});},220);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[query,state.hidden,open,paused,api,context.projectId,context.runId,reload]);
 useEffect(()=>{
  if(!open||paused||!active||!api)return;
  let cancelled=false,running=false;
  setError('');if(fileRef.current?.path!==active)setFile(null);
  const refresh=async()=>{if(running||document.hidden)return;running=true;
   try{const value=await api.read({...context,path:active,version:fileRef.current?.path===active?fileRef.current.version:undefined});
    if(!cancelled){if(!value.unchanged)setFile(value);setError('');}
   }catch(e){if(!cancelled){if(fileRef.current?.path===active&&['spreadsheet','presentation'].includes(fileRef.current.kind))setNotice((e as Error).message);else{setError((e as Error).message);setFile(null);}}}finally{running=false;}
  };
  void refresh();const timer=setInterval(refresh,2000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[active,open,paused,api,context.projectId,context.runId,reload]);
 useEffect(()=>{
  if(!open||paused||!api)return;let cancelled=false;
  for(const path of new Set([active,menu?.source==='context'?menu.path:''].filter(Boolean))){
   api.apps({...context,path}).then(value=>{if(!cancelled)setAppLists(old=>({...old,[path]:value}));}).catch(()=>{/* Default app remains available when discovery fails. */});
  }
  return()=>{cancelled=true;};
 },[api,active,menu?.path,open,paused,context.projectId,context.runId]);
 const applicationsFor=(path:string)=>{const items=appLists[path]||[];return items.some(app=>app.id==='default')?items:[{id:'default',name:'系统默认应用'},...items];};
 const preferredFor=(path:string)=>{const saved=preferences[path.split('.').pop()?.toLowerCase()||'']||load<FileApplication|null>('app.'+(path.split('.').pop()?.toLowerCase()||''),null);const choices=applicationsFor(path);return choices.find(app=>app.id===saved?.id||app.applicationId===saved?.id&&!!saved?.id)||choices.find(app=>app.id==='default')||choices[0];};
 const appIcon=(app:FileApplication)=>app.icon?.startsWith('data:image/')?<img className="file-application-icon" src={app.icon} alt=""/>:<AppWindow aria-hidden="true"/>;


 useEffect(()=>{if(body.current)body.current.scrollTop=reading.top||0;setZoom(1);},[active,mode,file?.path]);
 useEffect(()=>setPreviewZoom(100),[active]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==htmlFrame.current?.contentWindow||event.data?.type!=='atelier-preview-scroll'||typeof event.data.top!=='number'||!Number.isFinite(event.data.top))return;putReading({top:Math.max(0,event.data.top)});};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[]);
 const openFile=useCallback((path:string,pinned=false)=>{
  setError('');setMenu(null);
  if((panelRef.current?.clientWidth||999)<590){setDrawerOpen(false);requestAnimationFrame(()=>tabBar.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus());}
  setState(old=>{const found=old.tabs.find(tab=>tab.path===path);const tabs=found?old.tabs.map(tab=>tab.path===path?{...tab,pinned:tab.pinned||pinned}:tab):[...old.tabs.filter(tab=>tab.pinned),{path,pinned}];return {...old,tabs,active:path};});
 },[]);
 const handledRequest=useRef<number|null>(null);
 useEffect(()=>{
  if(!request||!open||paused||!api||handledRequest.current===request.id)return;
  let cancelled=false;
  api.context(context).then(value=>{
   if(cancelled)return;
   const prefix=value.root.replace(/\/$/,'')+'/';
   const path=request.path.startsWith('/')?(request.path.startsWith(prefix)?request.path.slice(prefix.length):null):request.path;
   if(!path||path.split('/').includes('..'))throw new Error(t('文件不在项目目录内'));
   setRoot(value.root);setBase(value.baseUrl);setQuery('');openFile(path,true);
   const parts=path.split('/');const ancestors=parts.slice(0,-1).map((_,index)=>parts.slice(0,index+1).join('/'));
   setState(old=>({...old,expanded:[...new Set([...old.expanded,...ancestors])],reading:{...old.reading,[path]:{...old.reading[path],mode:'preview'}}}));
   handledRequest.current=request.id;setReload(old=>old+1);
  }).catch(e=>{if(!cancelled){setError(e.message);handledRequest.current=request.id;}});
  return()=>{cancelled=true;};
 },[request,open,paused,api,context.projectId,context.runId]);
 const closeTab=(path:string)=>{setState(old=>{const index=old.tabs.findIndex(tab=>tab.path===path);const tabs=old.tabs.filter(tab=>tab.path!==path);return {...old,tabs,active:old.active===path?(tabs[index]||tabs[index-1])?.path||'':old.active};});requestAnimationFrame(()=>{const selected=tabBar.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]');if(selected)selected.focus();else panelRef.current?.querySelector<HTMLElement>('.file-list-toggle')?.focus();});};
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
 const ext=(path:string)=>path.split('.').pop()?.toLowerCase()||'';
 const openExternal=(path:string,application:string)=>void run(async()=>{const app=await api?.open({...context,path,application});if(app){save('app.'+ext(path),{id:app.id,name:app.name});setPreferences(old=>({...old,[ext(path)]:app}));setAppLists(old=>({...old,[path]:[...(old[path]||[]).filter(item=>item.id!==app.id),app]}));setNotice(t('已在外部应用中打开'));}setMenu(null);});
 const resource=useCallback((path:string)=>{
  if(!base)return '';
  const current=base+active.split('/').map(encodeURIComponent).join('/');
  return new URL(path.startsWith('/')?path.slice(1):path,path.startsWith('/')?base:current).href;
 },[base,active]);
 const fileUrl=base+active.split('/').map(encodeURIComponent).join('/')+'?v='+encodeURIComponent(file?.version||'');
 const follow=useCallback((path:string)=>{if(path.startsWith('#')){const target=document.getElementById(path.slice(1));target?.scrollIntoView();return;}const url=new URL(resource(path));if(url.protocol==='atelier-preview:'&&url.host===new URL(base).host)openFile(decodeURIComponent(url.pathname.slice(1)));},[resource,base,openFile]);
 const toggleFolder=(path:string)=>setState(old=>({...old,expanded:old.expanded.includes(path)?old.expanded.filter(item=>item!==path&&!item.startsWith(path+'/')):[...old.expanded,path]}));
 const menuItems=(path:string,contextMenu=false)=>{
  const Group=contextMenu?ContextMenuGroup:DropdownMenuGroup,Item=contextMenu?ContextMenuItem:DropdownMenuItem,Label=contextMenu?ContextMenuLabel:DropdownMenuLabel,Separator=contextMenu?ContextMenuSeparator:DropdownMenuSeparator;
  const Sub=contextMenu?ContextMenuSub:DropdownMenuSub,SubTrigger=contextMenu?ContextMenuSubTrigger:DropdownMenuSubTrigger,SubContent=contextMenu?ContextMenuSubContent:DropdownMenuSubContent;
  const currentApp=preferredFor(path);
  const choices=applicationsFor(path),primary=choices.filter(app=>app.id===currentApp.id||app.id==='default'||app.recommended!==false).sort((a,b)=>Number(b.id===currentApp.id)-Number(a.id===currentApp.id)).slice(0,5),others=choices.filter(app=>!primary.includes(app));
  const itemClass='min-h-9 gap-2.5 px-2.5 py-2';
  const renderApplication=(app:FileApplication)=><Item className={itemClass} disabled={busy} key={app.id} title={app.id==='default'?t('系统默认应用')+' · '+t(app.name):app.name} onClick={()=>openExternal(path,app.id)}>{appIcon(app)}<span className="min-w-0 flex-1 truncate">{t(app.name)}{app.id==='default'&&app.name!=='系统默认应用'&&<span className="ml-2 text-xs text-muted-foreground">{t('默认')}</span>}</span>{currentApp.id===app.id&&<Check aria-hidden="true"/>}</Item>;
  return <>
   <Group>
    <Label className="truncate px-2.5 py-2" title={path}>{path.split('/').pop()}</Label>
    {primary.map(renderApplication)}
    {others.length>0&&<Sub><SubTrigger className={itemClass}><AppWindow/>{t('更多应用')}</SubTrigger><SubContent className="w-64"><Group>{others.map(renderApplication)}</Group></SubContent></Sub>}
    <Item className={itemClass} disabled={busy} onClick={()=>openExternal(path,'choose')}><MoreHorizontal/>{t('选择其他应用…')}</Item>
   </Group>
   <Separator className="my-1.5"/>
   <Group>
    <Label className="px-2.5 py-1.5">{t('文件操作')}</Label>
    <Item className={itemClass} onClick={()=>openFile(path,true)}><Pin/>{t('保留此标签')}</Item>
    <Item className={itemClass} onClick={()=>void run(async()=>{await copyText(path);setNotice(t('已复制'));})}><Link/>{t('复制相对路径')}</Item>
    <Item className={itemClass} onClick={()=>void run(async()=>{await copyText(root.replace(/\/$/,'')+'/'+path);setNotice(t('已复制'));})}><Copy/>{t('复制完整路径')}</Item>
    <Item className={itemClass} onClick={()=>void run(async()=>{await api?.open({...context,path,action:'reveal'});})}><FolderOpen/>{t('打开所在文件夹')}</Item>
   </Group>
  </>;
 };
 const visibleEntries:{entry:FileEntry;depth:number}[]=[];
 const collect=(path:string,depth=0)=>{for(const entry of directories[path]?.entries||[]){visibleEntries.push({entry,depth});if(entry.directory&&state.expanded.includes(entry.path))collect(entry.path,depth+1);}};
 if(matches)visibleEntries.push(...matches.entries.map(entry=>({entry,depth:0})));else collect('');
 const focusEntry=(path:string)=>{setFocusedPath(path);treeFocus.current=path;const row=Array.from(treeScroll.current?.querySelectorAll<HTMLElement>('[role=treeitem]')||[]).find(el=>el.dataset.path===path);row?.focus();row?.scrollIntoView({block:'nearest'});};
 const toggleTree=()=>{const show=!treeVisible;if(narrow)setDrawerOpen(show);else setState(old=>({...old,tree:show}));if(show)requestAnimationFrame(()=>{if(treeScroll.current)treeScroll.current.scrollTop=treeTop.current;const row=Array.from(treeScroll.current?.querySelectorAll<HTMLElement>('[role=treeitem]')||[]).find(el=>el.dataset.path===(treeFocus.current||active));row?.focus({preventScroll:true});});};
 const tabPath=visibleEntries.some(item=>item.entry.path===focusedPath)?focusedPath:visibleEntries[0]?.entry.path;
 const renderEntry=({entry,depth}:{entry:FileEntry;depth:number},index:number)=>{
  const expanded=state.expanded.includes(entry.path);
  const row=<button role="treeitem" aria-level={depth+1} aria-selected={active===entry.path} tabIndex={tabPath===entry.path?0:-1} data-path={entry.path} className={`file-tree-row ${active===entry.path?'selected':''}`} style={{paddingLeft:10+depth*14}} title={entry.path} aria-expanded={entry.directory?expanded:undefined} onFocus={()=>{setFocusedPath(entry.path);treeFocus.current=entry.path;}} onClick={()=>entry.directory?toggleFolder(entry.path):openFile(entry.path)} onDoubleClick={()=>{if(!entry.directory)openFile(entry.path,true);}} onKeyDown={event=>{
   let target:string|undefined;
   if(event.key==='ArrowDown')target=visibleEntries[Math.min(index+1,visibleEntries.length-1)]?.entry.path;
   else if(event.key==='ArrowUp')target=visibleEntries[Math.max(0,index-1)]?.entry.path;
   else if(event.key==='Home')target=visibleEntries[0]?.entry.path;
   else if(event.key==='End')target=visibleEntries.at(-1)?.entry.path;
   else if(event.key==='ArrowRight'){if(entry.directory){if(!expanded)toggleFolder(entry.path);else if(visibleEntries[index+1]?.depth>depth)target=visibleEntries[index+1].entry.path;}}
   else if(event.key==='ArrowLeft'){if(entry.directory&&expanded)toggleFolder(entry.path);else target=entry.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')):undefined;}
   else if(!entry.directory&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();event.currentTarget.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:rect.left+24,clientY:rect.bottom}));return;}
   else return;
   event.preventDefault();if(target)focusEntry(target);
  }}>{entry.directory?(expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>):<span className="file-tree-spacer"/>}{icon(entry)}<span>{matches?entry.path:entry.name}</span></button>;
  return <div role="none" key={entry.path}>{entry.directory?row:<ContextMenu open={menu?.source==='context'&&menu.path===entry.path} onOpenChange={value=>setMenu(value?{path:entry.path,source:'context'}:null)}><ContextMenuTrigger render={row}/><ContextMenuContent className="w-72 max-w-[calc(100vw-16px)] p-1.5" alignOffset={0} aria-label={t('文件操作')} onKeyDown={event=>event.stopPropagation()}>{menuItems(entry.path,true)}</ContextMenuContent></ContextMenu>}{entry.directory&&expanded&&!directories[entry.path]&&<p className="file-tree-note">{t('正在加载…')}</p>}{entry.directory&&expanded&&directories[entry.path]?.entries.length===0&&<p className="file-tree-note">{t('空目录')}</p>}{entry.directory&&expanded&&directories[entry.path]?.truncated&&<p className="file-tree-note">{t('目录较大，仅显示前 2000 项')}</p>}</div>;
 };
 const selected=file?.path===active?file:null;
 const code=selected&&selected.text!==undefined&&(mode==='code'||selected.kind==='code');
 const preferred=preferredFor(active);
 return <div className={`file-panel-slot ${open?'is-open':''} ${full?'is-expanded':''}`} style={{'--file-panel-width':`${width}px`,'--file-tree-width':`${treeWidth}px`} as CSSProperties} aria-hidden={!open} inert={!open}>
  {!full&&<FileResizer kind="panel" value={width} change={setWidth}/>}
  <section id="project-file-panel" ref={panelRef} className="project-file-panel" aria-label={t('项目文件面板')} onKeyDown={event=>{if(event.key==='Escape'){if((event.target as HTMLElement).closest('[role=menu],.cm-search'))return;if(menu)setMenu(null);else if(narrow&&treeVisible){setDrawerOpen(false);panelRef.current?.querySelector<HTMLElement>('.file-list-toggle')?.focus();}else if(full)setFull(false);else close();}}}>
   <div className="file-tabs-bar"><div ref={tabBar} className="file-tabs" role="tablist" aria-label={t('打开的文件')}>{state.tabs.map(tab=><div key={tab.path} className={`file-tab ${active===tab.path?'active':''} ${tab.pinned?'':'temporary'}`}><button role="tab" aria-controls="file-preview-panel" tabIndex={active===tab.path?0:-1} onKeyDown={event=>{const index=state.tabs.findIndex(item=>item.path===tab.path);const next=event.key==='ArrowRight'?(index+1)%state.tabs.length:event.key==='ArrowLeft'?(index+state.tabs.length-1)%state.tabs.length:event.key==='Home'?0:event.key==='End'?state.tabs.length-1:null;if(next!==null){event.preventDefault();setState(old=>({...old,active:old.tabs[next].path}));tabBar.current?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();}else if(event.key==='Delete'){event.preventDefault();closeTab(tab.path);}}} aria-selected={active===tab.path} title={tab.pinned?tab.path:tab.path+' · '+t('临时预览，双击保留')} onClick={()=>setState(old=>({...old,active:tab.path}))} onDoubleClick={()=>openFile(tab.path,true)}><FileTypeIcon name={tab.path}/><span>{tab.path.split('/').pop()}</span></button>{!tab.pinned&&<button title={t('保留此标签')} aria-label={t('保留此标签')+' '+tab.path} onClick={()=>openFile(tab.path,true)}><Pin size={13}/></button>}<button aria-label={t('关闭文件')+' '+tab.path} onClick={()=>closeTab(tab.path)}><X size={13}/></button></div>)}{!state.tabs.length&&<span className="file-tab-placeholder">{t('打开文件')}</span>}</div><button className="icon-button" title={t(full?'恢复面板宽度':'展开预览')} aria-label={t(full?'恢复面板宽度':'展开预览')} onClick={()=>setFull(!full)}>{full?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button className="icon-button" title={t('隐藏侧边面板')} aria-label={t('隐藏侧边面板')} aria-pressed={open} onClick={close}><PanelRight size={18}/></button></div>
   <div className="file-actions"><div className="file-root file-breadcrumb" title={root+(active?'/'+active:'')}><FolderOpen size={13}/><span>{root.split('/').filter(Boolean).pop()||root}{active?' / '+active:''}</span></div><div className="file-action-buttons">
    {code&&<button className="icon-button" title={t('查找内容')} aria-label={t('查找内容')} onClick={()=>window.dispatchEvent(new Event('file-code-find'))}><Search size={15}/></button>}
    {selected&&!code&&['markdown','html'].includes(selected.kind)&&<div className="file-preview-zoom" role="group" aria-label={t('预览缩放')}><button className="icon-button" title={t('缩小')} aria-label={t('缩小')} disabled={previewZoom<=50} onClick={()=>setPreviewZoom(value=>Math.max(50,value-10))}><ZoomOut size={15}/></button><output aria-live="polite">{previewZoom}%</output><button className="icon-button" title={t('放大')} aria-label={t('放大')} disabled={previewZoom>=200} onClick={()=>setPreviewZoom(value=>Math.min(200,value+10))}><ZoomIn size={15}/></button><button className="icon-button" title={t('还原尺寸')} aria-label={t('还原尺寸')} disabled={previewZoom===100} onClick={()=>setPreviewZoom(100)}><RotateCcw size={15}/></button></div>}
    {selected&&['markdown','html'].includes(selected.kind)&&<ToggleGroup className="file-mode" size="sm" value={[mode]} onValueChange={values=>{const value=values[0];if(value==='preview'||value==='code')putReading({mode:value});}} aria-label={t('显示模式')}><ToggleGroupItem value="preview">{t('预览')}</ToggleGroupItem><ToggleGroupItem value="code">{t('代码')}</ToggleGroupItem></ToggleGroup>}
    <div className="file-external-actions"><Button variant="outline" size="icon" className="file-list-toggle rounded-full" title={t('文件列表')} aria-label={t('显示/隐藏文件树')} aria-pressed={treeVisible} aria-controls="project-file-tree" onClick={toggleTree}><Folders/></Button>
    {active&&<div className="file-open-controls"><button type="button" title={t('打开')+' · '+t(preferred.name)} aria-label={t('打开')+' · '+t(preferred.name)} disabled={busy} onClick={event=>{event.preventDefault();event.stopPropagation();openExternal(active,preferred.id);}}>{appIcon(preferred)}<span>{t('打开')}</span></button><DropdownMenu open={menu?.source==='open'} onOpenChange={value=>setMenu(value?{path:active,source:'open'}:null)}><DropdownMenuTrigger render={<button type="button" aria-label={t('打开方式')}/>}><ChevronDown size={14}/></DropdownMenuTrigger><DropdownMenuContent className="w-72 max-w-[calc(100vw-16px)] p-1.5" sideOffset={8} align="end" aria-label={t('文件操作')} onKeyDown={event=>event.stopPropagation()}>{menuItems(active)}</DropdownMenuContent></DropdownMenu></div>}</div>
    <DropdownMenu open={menu?.source==='more'} onOpenChange={value=>setMenu(value?{path:active,source:'more'}:null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('更多文件操作')}/> }><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end" onKeyDown={event=>event.stopPropagation()}><DropdownMenuGroup>{code&&<><DropdownMenuItem onClick={()=>setWrap(!wrap)}>{t(wrap?'关闭自动换行':'自动换行')}</DropdownMenuItem><DropdownMenuItem onClick={()=>void run(async()=>{await copyText(selected?.text||'');setNotice(t('已复制'));})}>{t('复制内容')}</DropdownMenuItem></>}<DropdownMenuItem onClick={()=>setReload(old=>old+1)}><RefreshCw/>{t('刷新文件')}</DropdownMenuItem>{active&&!state.tabs.find(tab=>tab.path===active)?.pinned&&<DropdownMenuItem onClick={()=>openFile(active,true)}><Pin/>{t('保留此标签')}</DropdownMenuItem>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
   </div></div>

   {notice&&<div className="file-notice" role="status">{notice}</div>}
   <div className={`file-panel-body ${treeVisible?'with-tree':''}`}>
    <div className="file-preview" id="file-preview-panel" role="tabpanel" aria-label={active||t('文件预览')}>
     {!api?<div className="file-empty"><FolderOpen size={40}/><p>{t('请在桌面版中浏览项目文件')}</p></div>:error?<div className="file-empty" role="alert"><File size={35}/><p>{error}</p><Button variant="outline" onClick={()=>setReload(old=>old+1)}>{t('重试')}</Button></div>:!active?<div className="file-empty"><FolderOpen size={44} strokeWidth={1.3}/><h3>{t('打开文件')}</h3><p>{t('从项目文件树中选择文件')}</p></div>:!selected?<div className="file-empty" role="status">{t('正在加载…')}</div>:<>
      {selected.truncated&&<div className="file-warning">{t('文件较大，仅展示前 1 MiB；完整内容请使用外部应用打开。')}</div>}
      {code?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Code text={selected.text||''} path={active} wrap={wrap} position={reading.codeTop||0} onScroll={top=>putReading({codeTop:top})}/></Suspense>:
       selected.kind==='markdown'?<div className="file-markdown" ref={body} onScroll={event=>putReading({top:event.currentTarget.scrollTop})}><div className="file-markdown-scaled" style={{zoom:previewZoom/100}}><Markdown text={selected.text||''} resourceUrl={resource} onFileLink={follow}/></div></div>:
       selected.kind==='html'?(selected.truncated?<div className="file-empty"><p>{t('HTML 过大，请切换代码模式或使用外部应用打开。')}</p></div>:base&&<div className="file-html-viewport"><iframe style={{zoom:previewZoom/100,width:`${10000/previewZoom}%`,height:`${10000/previewZoom}%`}} ref={htmlFrame} onLoad={()=>htmlFrame.current?.contentWindow?.postMessage({type:'atelier-preview-restore',top:stateRef.current.reading[active]?.top||0},'*')} key={active+selected.version+reload} className="file-html" title={t('HTML 文件预览')} sandbox="allow-scripts" src={fileUrl}/></div>):
       selected.kind==='image'?<><div className="file-image-tools"><button aria-label={t('缩小图片')} onClick={()=>setZoom(Math.max(.1,zoom-.25))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label={t('放大图片')} onClick={()=>setZoom(Math.min(4,zoom+.25))}><ZoomIn size={16}/></button><button onClick={()=>setZoom(1)}>{t('适应窗口')}</button></div><div className="file-image"><img src={fileUrl} alt={selected.name} style={{width:`${zoom*100}%`}}/></div></>:
       ['spreadsheet','presentation'].includes(selected.kind)?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Office key={active} context={context} path={active} version={selected.version} reload={reload} baseUrl={base}/></Suspense>:
       selected.kind==='pdf'?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Pdf url={fileUrl}/></Suspense>:
       <div className="file-empty"><File size={40}/><h3>{selected.name}</h3><p>{(selected.size/1024).toFixed(1)} KiB</p><p>{t(selected.reason||'此格式请使用外部应用打开。')}</p><Button variant="outline" onClick={()=>openExternal(active,preferred.id)}>{t('使用外部应用打开')}</Button></div>}
     </>}
    </div>
    <aside id="project-file-tree" hidden={!treeVisible} className="file-tree" aria-label={t('项目文件树')}><FileResizer kind="tree" value={treeWidth} change={setTreeWidth}/><div className="file-tree-search"><Search size={14}/><input type="search" aria-label={t('筛选文件')} placeholder={t('筛选文件…')} value={query} onChange={event=>setQuery(event.target.value)}/></div><div className="file-tree-tools"><label><input type="checkbox" checked={state.hidden} onChange={event=>setState(old=>({...old,hidden:event.target.checked}))}/>{t('隐藏和生成文件')}</label><button className="icon-button" title={t('收起所有目录')} aria-label={t('收起所有目录')} onClick={()=>setState(old=>({...old,expanded:[]}))}><ChevronsDownUp size={14}/></button></div>{treeError&&<p className="file-tree-error" role="alert">{treeError}</p>}<div ref={treeScroll} className="file-tree-scroll" onScroll={event=>{treeTop.current=event.currentTarget.scrollTop;}}>{searching?<p className="file-tree-note" role="status">{t('正在搜索…')}</p>:<><div role="tree" aria-label={t('项目文件')} aria-busy={!matches&&!directories['']&&!!api}>{visibleEntries.map(renderEntry)}</div>{!visibleEntries.length&&<p className="file-tree-note">{t(matches?'没有匹配的文件':directories['']?'空目录':'正在加载…')}</p>}{(matches?.truncated||directories['']?.truncated)&&<p className="file-tree-note">{t(matches?'搜索范围已达上限，请缩小筛选范围':'目录较大，仅显示前 2000 项')}</p>}</>}</div></aside>
   </div>
  </section>
 </div>;
}
