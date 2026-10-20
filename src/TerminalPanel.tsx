import {useCallback,useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {SearchAddon} from '@xterm/addon-search';
import {Plus,Minus,Maximize2,Minimize2,Trash2,Search,Copy,ClipboardPaste,Eraser} from 'lucide-react';
import {t} from './i18n';
import {followTerminalTheme} from './terminal-theme';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

export type TerminalSession={id:string;projectId:string;runId?:string;cwd:string;shell:string;exited:boolean;exitCode:number|null};
export type TerminalRequest={projectId:string;runId?:string;directory?:string};
export type TerminalAPI={
 focus(input:{active:boolean}):Promise<void>;
 profiles(input?:{projectId:string}):Promise<{id:string;name:string}[]>;
 list():Promise<TerminalSession[]>;
 create(input:TerminalRequest&{shell?:string}):Promise<TerminalSession>;
 read(input:{id:string}):Promise<{data:string;exited:boolean;exitCode:number|null}>;
 write(input:{id:string;data:string}):Promise<void>;
 resize(input:{id:string;cols:number;rows:number}):Promise<void>;
 close(input:{id:string}):Promise<void>;
};
type Handle={term:Terminal;search:SearchAddon;fit:()=>void};
function TerminalView({session,visible,handles,onExit,onError}:{session:TerminalSession;visible:boolean;handles:Map<string,Handle>;onExit:(id:string,code:number|null)=>void;onError:(message:string)=>void}) {
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const api=window.desktop!.terminal!;
  const term=new Terminal({cursorBlink:true,scrollback:5000,fontSize:13,fontFamily:'Menlo, Consolas, "DejaVu Sans Mono", monospace',allowProposedApi:false});
  const stopTheme=followTerminalTheme(term);
  const fitAddon=new FitAddon(),search=new SearchAddon();term.loadAddon(fitAddon);term.loadAddon(search);term.open(host.current!);
  let disposed=false,timer:ReturnType<typeof setTimeout>;
  const fail=(e:unknown)=>{if(!disposed)onError(String(e instanceof Error?e.message:e));};
  const fit=()=>{if(host.current?.clientWidth&&host.current?.clientHeight){fitAddon.fit();void api.resize({id:session.id,cols:Math.min(term.cols,500),rows:Math.min(term.rows,300)}).catch(fail);}};
  handles.set(session.id,{term,search,fit});
  const input=term.onData(data=>{void api.write({id:session.id,data}).catch(fail);});
  // Acknowledge each batch only after xterm consumed it. Hidden terminals also drain,
  // so collapsing the panel never suspends a development server's output.
  const read=async()=>{
   try {
    const result=await api.read({id:session.id});if(disposed)return;
    if(result.data)await new Promise<void>(resolve=>term.write(result.data,resolve));
    if(disposed)return;
    if(result.exited){term.write(`\r\n[${t('终端已退出')} · ${result.exitCode}]\r\n`);onExit(session.id,result.exitCode);return;}
    timer=setTimeout(read,result.data?16:120);
   }catch(e){fail(e);}
  };
  void read();
  const observer=new ResizeObserver(fit);observer.observe(host.current!);
  return()=>{disposed=true;stopTheme();clearTimeout(timer);observer.disconnect();input.dispose();handles.delete(session.id);term.dispose();};
 },[session.id,handles,onExit,onError]);
 useEffect(()=>{if(visible){handles.get(session.id)?.fit();handles.get(session.id)?.term.focus();}},[visible,session.id,handles]);
 return <div ref={host} onFocusCapture={()=>void window.desktop?.terminal?.focus({active:true}).catch(()=>{})} onBlurCapture={()=>void window.desktop?.terminal?.focus({active:false}).catch(()=>{})} className="terminal-screen" style={{display:visible?'block':'none'}} aria-label={`${session.shell} — ${session.cwd}`}/>;
}
export default function TerminalPanel({context,request,open,hide}:{context:TerminalRequest;request:{serial:number;directory?:string}|null;open:boolean;hide:()=>void}) {
 const api=window.desktop?.terminal;
 useEffect(()=>{const search=()=>setSearching(true);window.addEventListener('terminal:search',search);return()=>window.removeEventListener('terminal:search',search);},[]);
 const [sessions,setSessions]=useState<TerminalSession[]>([]),[profiles,setProfiles]=useState<{id:string;name:string}[]>([]);
 const [shell,setShell]=useState(''),[active,setActive]=useState<Record<string,string>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [height,setHeight]=useState(280),[maximized,setMaximized]=useState(false),[searching,setSearching]=useState(false),[query,setQuery]=useState('');
 const handles=useRef(new Map<string,Handle>()).current,handled=useRef(0),creating=useRef(false);
 const group=sessions.filter(s=>s.projectId===context.projectId);
 const selected=group.find(s=>s.id===active[context.projectId])||group[group.length-1];
 const report=useCallback((message:string)=>setError(message),[]);
 const exited=useCallback((id:string,exitCode:number|null)=>setSessions(old=>old.map(s=>s.id===id?{...s,exited:true,exitCode}:s)),[]);
 useEffect(()=>{if(!api)return;setShell('');let cancelled=false;Promise.all([api.list(),api.profiles({projectId:context.projectId})]).then(([items,choices])=>{if(!cancelled){setSessions(items);setProfiles(choices);setReady(true);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[api,context.projectId]);
 const create=async(directory?:string)=>{
  if(!api||creating.current)return;creating.current=true;setBusy(true);setError('');
  try{const session=await api.create({...context,directory,shell:shell||undefined});setSessions(old=>[...old,session]);setActive(old=>({...old,[session.projectId]:session.id}));}
  catch(e){setError((e as Error).message);}finally{creating.current=false;setBusy(false);}
 };
 useEffect(()=>{
  if(!ready||!request||handled.current===request.serial)return;
  handled.current=request.serial;
  if(request.directory!==undefined||!selected)void create(request.directory);
  else {handles.get(selected.id)?.fit();handles.get(selected.id)?.term.focus();}
 },[ready,request,selected]);
 const close=async()=>{if(!selected||!api)return;try{await api.close({id:selected.id});setSessions(old=>old.filter(s=>s.id!==selected.id));setError('');}catch(e){setError((e as Error).message);}};
 const action=async(kind:'copy'|'paste')=>{if(!selected)return;try{const term=handles.get(selected.id)?.term;if(kind==='copy')await window.desktop!.copyText(term?.getSelection()||'');else term?.paste(await navigator.clipboard.readText());term?.focus();}catch(e){setError((e as Error).message);}};
 return <section className={`terminal-panel ${maximized?'terminal-maximized':''}`} style={{display:open?'flex':'none',height:maximized?'100%':height}} aria-label={t('终端')}>
  <div className="terminal-resize" role="separator" aria-label={t('调整终端高度')} aria-orientation="horizontal" aria-valuenow={height} aria-valuemin={160} aria-valuemax={Math.floor(window.innerHeight*.75)} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(h=>Math.max(160,Math.min(window.innerHeight*.75,h+(e.key==='ArrowUp'?20:-20))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){setMaximized(false);setHeight(Math.max(160,Math.min(window.innerHeight*.75,e.currentTarget.parentElement!.getBoundingClientRect().bottom-e.clientY)));}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
  <div className="terminal-toolbar">
   <span className="terminal-heading">{t('终端')}</span>
   <div className="terminal-tabs" role="tablist" aria-label={t('终端会话')}>{group.map((s,i)=><button key={s.id} role="tab" aria-selected={selected?.id===s.id} title={s.cwd} onClick={()=>setActive(old=>({...old,[context.projectId]:s.id}))}>{s.shell} {i+1}{s.exited?` · ${t('已退出')}`:''}</button>)}</div>
   <select aria-label={t('新终端使用的 Shell')} value={shell} onChange={e=>setShell(e.target.value)}><option value="">{t('默认 Shell')}</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <button title={t('新建终端')} aria-label={t('新建终端')} disabled={busy||!ready} onClick={()=>void create()}><Plus size={16}/></button>
   <button title={t('搜索终端')} aria-label={t('搜索终端')} onClick={()=>setSearching(v=>!v)}><Search size={16}/></button>
   <button title={t('复制选中内容')} aria-label={t('复制选中内容')} disabled={!selected} onClick={()=>void action('copy')}><Copy size={16}/></button>
   <button title={t('粘贴')} aria-label={t('粘贴')} disabled={!selected||selected.exited} onClick={()=>void action('paste')}><ClipboardPaste size={16}/></button>
   <button title={t('清屏')} aria-label={t('清屏')} disabled={!selected} onClick={()=>selected&&handles.get(selected.id)?.term.clear()}><Eraser size={16}/></button>
   <button title={t('结束终端')} aria-label={t('结束终端')} disabled={!selected} onClick={()=>void close()}><Trash2 size={16}/></button>
   <button title={t(maximized?'还原终端':'最大化终端')} aria-label={t(maximized?'还原终端':'最大化终端')} onClick={()=>setMaximized(v=>!v)}>{maximized?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
   <button title={t('收起终端')} aria-label={t('收起终端')} onClick={hide}><Minus size={16}/></button>
  </div>
  {selected&&<div className="terminal-directory" title={selected.cwd}>{selected.cwd}</div>}
  {searching&&<form className="terminal-search" onSubmit={e=>{e.preventDefault();if(selected)handles.get(selected.id)?.search.findNext(query);}}><input autoFocus placeholder={t('搜索终端')} aria-label={t('搜索终端')} value={query} onChange={e=>{setQuery(e.target.value);if(selected)handles.get(selected.id)?.search.findNext(e.target.value);}} onKeyDown={e=>{if(e.key==='Escape')setSearching(false);}}/><button type="submit">{t('下一个')}</button></form>}
  {error&&<div className="terminal-error" role="alert">{error}</div>}
  {!selected&&<div className="terminal-empty">{busy?t('正在启动终端…'):t('点击 + 新建终端')}</div>}
  {sessions.map(s=><TerminalView key={s.id} session={s} visible={open&&selected?.id===s.id} handles={handles} onExit={exited} onError={report}/>)}
 </section>;
}
