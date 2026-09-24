import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent,type ReactNode} from 'react';
import {ChevronDown,ChevronRight,ChevronsDownUp,Code2,Copy,ExternalLink,File,FileCode2,FileImage,FileText,Folder,Folders,FolderOpen,Maximize2,Minimize2,PanelRight,RefreshCw,RotateCcw,Search,WrapText,X,ZoomIn,ZoomOut} from 'lucide-react';
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
function Resizer({label,value,min,max,change}:{label:string;value:number;min:number;max:number;change:(n:number)=>void}) {
 const start=useRef<{x:number;value:number}|null>(null);
 const end=(event:PointerEvent<HTMLDivElement>)=>{start.current=null;delete event.currentTarget.dataset.resizing;};
 const move=(event:PointerEvent)=>{if(start.current)change(Math.max(min,Math.min(max,start.current.value+start.current.x-event.clientX)));};
 return <div className="file-resizer" role="separator" aria-label={t(label)} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();change(Math.max(min,Math.min(max,value+(event.key==='ArrowLeft'?24:-24))));}}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.dataset.resizing='true';start.current={x:event.clientX,value};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/>;
}
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
 const [apps,setApps]=useState<FileApplication[]>([]),[menu,setMenu]=useState<string|null>(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [menuAnchor,setMenuAnchor]=useState({x:0,y:0});
 const menuRef=useRef<HTMLDivElement>(null);
 const showMenu=(path:string,event:{clientX:number;clientY:number;currentTarget:HTMLElement})=>{const bounds=panelRef.current!.getBoundingClientRect();const row=event.currentTarget.getBoundingClientRect();setMenuAnchor({x:(event.clientX||row.left)-bounds.left,y:(event.clientY||row.bottom)-bounds.top});setMenu(path);};
 useLayoutEffect(()=>{if(!menu||!menuRef.current||!panelRef.current)return;const menuBox=menuRef.current;const panel=panelRef.current;menuBox.style.left=Math.max(8,Math.min(menuAnchor.x,panel.clientWidth-menuBox.offsetWidth-8))+'px';menuBox.style.top=Math.max(8,Math.min(menuAnchor.y,panel.clientHeight-menuBox.offsetHeight-8))+'px';},[menu,menuAnchor,apps]);
 useEffect(()=>{if(!open||paused)setMenu(null);},[open,paused]);
 const body=useRef<HTMLDivElement>(null),stateRef=useRef(state),fileRef=useRef(file),panelRef=useRef<HTMLElement>(null),htmlFrame=useRef<HTMLIFrameElement>(null);
 stateRef.current=state;fileRef.current=file;
 const active=state.active,reading=state.reading[active]||{},mode=reading.mode||'preview';
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
  setApps([]);if(!menu||!api)return;let cancelled=false;
  api.apps({...context,path:menu}).then(value=>{if(!cancelled)setApps(value);}).catch(e=>{if(!cancelled)setNotice(e.message);});
  return()=>{cancelled=true;};
 },[menu,api,context.projectId,context.runId]);
 useEffect(()=>{if(!menu)return;const dismiss=(event:MouseEvent)=>{if(!(event.target as Element).closest('.file-open-menu,.file-open-controls'))setMenu(null);};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss);},[menu]);
 useEffect(()=>{if(body.current)body.current.scrollTop=reading.top||0;setZoom(1);},[active,mode,file?.path]);
 useEffect(()=>setPreviewZoom(100),[active]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==htmlFrame.current?.contentWindow||event.data?.type!=='atelier-preview-scroll'||typeof event.data.top!=='number'||!Number.isFinite(event.data.top))return;putReading({top:Math.max(0,event.data.top)});};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[]);
 const openFile=(path:string,pinned=false)=>{
  setError('');setMenu(null);
  setState(old=>{const found=old.tabs.find(tab=>tab.path===path);const tabs=found?old.tabs.map(tab=>tab.path===path?{...tab,pinned:tab.pinned||pinned}:tab):[...old.tabs.filter(tab=>tab.pinned),{path,pinned}];return {...old,tabs,active:path,tree:(panelRef.current?.clientWidth||999)<590?false:old.tree};});
 };
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
 const closeTab=(path:string)=>setState(old=>{const tabs=old.tabs.filter(tab=>tab.path!==path);return {...old,tabs,active:old.active===path?tabs[tabs.length-1]?.path||'':old.active};});
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
 const ext=(path:string)=>path.split('.').pop()?.toLowerCase()||'';
 const openExternal=(path:string,application:string)=>void run(async()=>{const app=await api?.open({...context,path,application});if(app){save('app.'+ext(path),app);setNotice(t('已在外部应用中打开'));}setMenu(null);});
 const resource=(path:string)=>{
  if(!base)return '';
  const current=base+active.split('/').map(encodeURIComponent).join('/');
  return new URL(path.startsWith('/')?path.slice(1):path,path.startsWith('/')?base:current).href;
 };
 const fileUrl=base+active.split('/').map(encodeURIComponent).join('/')+'?v='+encodeURIComponent(file?.version||'');
 const follow=(path:string)=>{if(path.startsWith('#')){const target=document.getElementById(path.slice(1));target?.scrollIntoView();return;}const url=new URL(resource(path));if(url.protocol==='atelier-preview:'&&url.host===new URL(base).host)openFile(decodeURIComponent(url.pathname.slice(1)));};
 const toggleFolder=(path:string)=>setState(old=>({...old,expanded:old.expanded.includes(path)?old.expanded.filter(item=>item!==path&&!item.startsWith(path+'/')):[...old.expanded,path]}));
 const renderEntries=(path:string,depth=0):ReactNode=>{
  const listing=directories[path];
  if(!listing)return <p className="file-tree-note">{t('正在加载…')}</p>;
  return <>{listing.entries.map(entry=><div key={entry.path}><button className={`file-tree-row ${active===entry.path?'selected':''}`} style={{paddingLeft:10+depth*14}} title={entry.path} aria-expanded={entry.directory?state.expanded.includes(entry.path):undefined} onClick={()=>entry.directory?toggleFolder(entry.path):openFile(entry.path)} onDoubleClick={()=>{if(!entry.directory)openFile(entry.path,true);}} onContextMenu={event=>{if(!entry.directory){event.preventDefault();showMenu(entry.path,event);}}}>{entry.directory?(state.expanded.includes(entry.path)?<ChevronDown size={13}/>:<ChevronRight size={13}/>):<span className="file-tree-spacer"/>}{icon(entry)}<span>{entry.name}</span></button>{entry.directory&&state.expanded.includes(entry.path)&&renderEntries(entry.path,depth+1)}</div>)}{!listing.entries.length&&<p className="file-tree-note">{t('空目录')}</p>}{listing.truncated&&<p className="file-tree-note">{t('目录较大，仅显示前 2000 项')}</p>}</>;
 };
 const selected=file?.path===active?file:null;
 const code=selected&&selected.text!==undefined&&(mode==='code'||selected.kind==='code');
 const preferred=load<FileApplication>('app.'+ext(active),{id:'default',name:'系统默认应用'});
 return <div className={`file-panel-slot ${open?'is-open':''} ${full?'is-expanded':''}`} style={{'--file-panel-width':`${width}px`,'--file-tree-width':`${treeWidth}px`} as CSSProperties} aria-hidden={!open} inert={!open}>
  <Resizer label="调整文件面板宽度" value={width} min={400} max={1400} change={setWidth}/>
  <section ref={panelRef} className="project-file-panel" aria-label={t('项目文件面板')} onKeyDown={event=>{if(event.key==='Escape'){if(menu)setMenu(null);else if(full)setFull(false);else close();}}}>
   <div className="file-tabs-bar"><div className="file-tabs" role="tablist" aria-label={t('打开的文件')}>{state.tabs.map(tab=><div key={tab.path} className={`file-tab ${active===tab.path?'active':''} ${tab.pinned?'':'temporary'}`}><button role="tab" aria-selected={active===tab.path} title={tab.path} onClick={()=>setState(old=>({...old,active:tab.path}))} onDoubleClick={()=>openFile(tab.path,true)}><FileTypeIcon name={tab.path}/><span>{tab.path.split('/').pop()}</span></button><button aria-label={t('关闭文件')+' '+tab.path} onClick={()=>closeTab(tab.path)}><X size={13}/></button></div>)}{!state.tabs.length&&<span className="file-tab-placeholder">{t('打开文件')}</span>}</div><button className="icon-button" title={t(full?'恢复面板宽度':'展开预览')} aria-label={t(full?'恢复面板宽度':'展开预览')} onClick={()=>setFull(!full)}>{full?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button className="icon-button" title={t('隐藏侧边面板')} aria-label={t('隐藏侧边面板')} aria-pressed={open} onClick={close}><PanelRight size={18}/></button></div>
   <div className="file-root" title={root}><FolderOpen size={13}/><span>{root}</span></div>
   <div className="file-actions"><span className="file-breadcrumb" title={active}>{active||t('项目文件')}</span><div className="file-action-buttons">
    {code&&<><button className="icon-button" title={t('查找内容')} aria-label={t('查找内容')} onClick={()=>window.dispatchEvent(new Event('file-code-find'))}><Search size={15}/></button><button className="icon-button" title={t('自动换行')} aria-label={t('自动换行')} aria-pressed={wrap} onClick={()=>setWrap(!wrap)}><WrapText size={15}/></button><button className="icon-button" title={t('复制内容')} aria-label={t('复制内容')} onClick={()=>void run(async()=>{await copyText(selected?.text||'');setNotice(t('已复制'));})}><Copy size={15}/></button></>}
    {selected&&!code&&['markdown','html'].includes(selected.kind)&&<div className="file-preview-zoom" role="group" aria-label={t('预览缩放')}><button className="icon-button" title={t('缩小')} aria-label={t('缩小')} disabled={previewZoom<=50} onClick={()=>setPreviewZoom(value=>Math.max(50,value-10))}><ZoomOut size={15}/></button><output aria-live="polite">{previewZoom}%</output><button className="icon-button" title={t('放大')} aria-label={t('放大')} disabled={previewZoom>=200} onClick={()=>setPreviewZoom(value=>Math.min(200,value+10))}><ZoomIn size={15}/></button><button className="icon-button" title={t('还原尺寸')} aria-label={t('还原尺寸')} disabled={previewZoom===100} onClick={()=>setPreviewZoom(100)}><RotateCcw size={15}/></button></div>}
    {selected&&['markdown','html'].includes(selected.kind)&&<div className="file-mode" aria-label={t('显示模式')}><button aria-pressed={mode==='preview'} onClick={()=>putReading({mode:'preview'})}>{t('预览')}</button><button aria-pressed={mode==='code'} onClick={()=>putReading({mode:'code'})}>{t('代码')}</button></div>}
    {active&&<div className="file-open-controls"><button title={t(preferred.name)} disabled={busy} onClick={()=>openExternal(active,preferred.id)}><ExternalLink size={14}/><span>{t('打开')}</span></button><button aria-label={t('打开方式')} aria-expanded={!!menu} onClick={event=>{if(menu)setMenu(null);else{const rect=event.currentTarget.getBoundingClientRect();showMenu(active,{clientX:rect.right-230,clientY:rect.bottom+6,currentTarget:event.currentTarget});}}}><ChevronDown size={14}/></button></div>}
    <button className="icon-button" title={t('刷新文件')} aria-label={t('刷新文件')} onClick={()=>setReload(old=>old+1)}><RefreshCw size={15}/></button><button className="icon-button" title={t('显示/隐藏文件树')} aria-label={t('显示/隐藏文件树')} aria-pressed={state.tree} onClick={()=>setState(old=>({...old,tree:!old.tree}))}><Folders size={18}/></button>
   </div></div>
   {menu&&<div ref={menuRef} className="file-open-menu" style={{left:menuAnchor.x,top:menuAnchor.y}} role="menu" aria-label={t('文件操作')}><strong title={menu}>{menu.split('/').pop()}</strong><button role="menuitem" disabled={busy} onClick={()=>openExternal(menu,'default')}>{t('使用系统默认应用打开')}</button>{apps.map(app=><button role="menuitem" disabled={busy} key={app.id} onClick={()=>openExternal(menu,app.id)}>{app.name}</button>)}<button role="menuitem" disabled={busy} onClick={()=>openExternal(menu,'choose')}>{t('选择其他应用…')}</button><hr/><button role="menuitem" onClick={()=>void run(async()=>{await copyText(menu);setMenu(null);setNotice(t('已复制'));})}>{t('复制相对路径')}</button><button role="menuitem" onClick={()=>void run(async()=>{await copyText(root.replace(/\/$/,'')+'/'+menu);setMenu(null);setNotice(t('已复制'));})}>{t('复制完整路径')}</button><button role="menuitem" onClick={()=>void run(async()=>{await api?.open({...context,path:menu,action:'reveal'});setMenu(null);})}>{t('在访达中显示')}</button></div>}
   {notice&&<div className="file-notice" role="status">{notice}</div>}
   <div className={`file-panel-body ${state.tree?'with-tree':''}`}>
    <div className="file-preview" role="tabpanel" aria-label={active||t('文件预览')}>
     {!api?<div className="file-empty"><FolderOpen size={40}/><p>{t('请在桌面版中浏览项目文件')}</p></div>:error?<div className="file-empty" role="alert"><File size={35}/><p>{error}</p><button className="secondary-button" onClick={()=>setReload(old=>old+1)}>{t('重试')}</button></div>:!active?<div className="file-empty"><FolderOpen size={44} strokeWidth={1.3}/><h3>{t('打开文件')}</h3><p>{t('从项目文件树中选择文件')}</p></div>:!selected?<div className="file-empty" role="status">{t('正在加载…')}</div>:<>
      {selected.truncated&&<div className="file-warning">{t('文件较大，仅展示前 1 MiB；完整内容请使用外部应用打开。')}</div>}
      {code?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Code text={selected.text||''} path={active} wrap={wrap} position={reading.codeTop||0} onScroll={top=>putReading({codeTop:top})}/></Suspense>:
       selected.kind==='markdown'?<div className="file-markdown" ref={body} onScroll={event=>putReading({top:event.currentTarget.scrollTop})}><div className="file-markdown-scaled" style={{zoom:previewZoom/100}}><Markdown text={selected.text||''} resourceUrl={resource} onFileLink={follow}/></div></div>:
       selected.kind==='html'?(selected.truncated?<div className="file-empty"><p>{t('HTML 过大，请切换代码模式或使用外部应用打开。')}</p></div>:base&&<div className="file-html-viewport"><iframe style={{zoom:previewZoom/100,width:`${10000/previewZoom}%`,height:`${10000/previewZoom}%`}} ref={htmlFrame} onLoad={()=>htmlFrame.current?.contentWindow?.postMessage({type:'atelier-preview-restore',top:stateRef.current.reading[active]?.top||0},'*')} key={active+selected.version+reload} className="file-html" title={t('HTML 文件预览')} sandbox="allow-scripts" src={fileUrl}/></div>):
       selected.kind==='image'?<><div className="file-image-tools"><button aria-label={t('缩小图片')} onClick={()=>setZoom(Math.max(.1,zoom-.25))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label={t('放大图片')} onClick={()=>setZoom(Math.min(4,zoom+.25))}><ZoomIn size={16}/></button><button onClick={()=>setZoom(1)}>{t('适应窗口')}</button></div><div className="file-image"><img src={fileUrl} alt={selected.name} style={{width:`${zoom*100}%`}}/></div></>:
       ['spreadsheet','presentation'].includes(selected.kind)?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Office key={active} context={context} path={active} version={selected.version} reload={reload} baseUrl={base}/></Suspense>:
       selected.kind==='pdf'?<Suspense fallback={<div className="file-empty">{t('正在加载…')}</div>}><Pdf url={fileUrl}/></Suspense>:
       <div className="file-empty"><File size={40}/><h3>{selected.name}</h3><p>{(selected.size/1024).toFixed(1)} KiB</p><p>{t(selected.reason||'此格式请使用外部应用打开。')}</p><button className="secondary-button" onClick={()=>openExternal(active,preferred.id)}>{t('使用外部应用打开')}</button></div>}
     </>}
    </div>
    {state.tree&&<aside className="file-tree" aria-label={t('项目文件树')}><Resizer label="调整文件树宽度" value={treeWidth} min={170} max={360} change={setTreeWidth}/><div className="file-tree-search"><Search size={14}/><input type="search" aria-label={t('筛选文件')} placeholder={t('筛选文件…')} value={query} onChange={event=>setQuery(event.target.value)}/></div><div className="file-tree-tools"><label><input type="checkbox" checked={state.hidden} onChange={event=>setState(old=>({...old,hidden:event.target.checked}))}/>{t('隐藏和生成文件')}</label><button className="icon-button" title={t('收起所有目录')} aria-label={t('收起所有目录')} onClick={()=>setState(old=>({...old,expanded:[]}))}><ChevronsDownUp size={14}/></button></div>{treeError&&<p className="file-tree-error" role="alert">{treeError}</p>}<div className="file-tree-scroll">{searching?<p className="file-tree-note">{t('正在搜索…')}</p>:matches?<>{matches.entries.map(entry=><button className={`file-tree-row ${active===entry.path?'selected':''}`} title={entry.path} key={entry.path} onClick={()=>openFile(entry.path)} onDoubleClick={()=>openFile(entry.path,true)} onContextMenu={event=>{event.preventDefault();showMenu(entry.path,event);}}>{icon(entry)}<span>{entry.path}</span></button>)}{!matches.entries.length&&<p className="file-tree-note">{t('没有匹配的文件')}</p>}{matches.truncated&&<p className="file-tree-note">{t('搜索范围已达上限，请缩小筛选范围')}</p>}</>:api&&renderEntries('')}</div></aside>}
   </div>
  </section>
 </div>;
}
