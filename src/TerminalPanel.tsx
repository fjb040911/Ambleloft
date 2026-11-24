import {useCallback,useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {SearchAddon} from '@xterm/addon-search';
import {Plus,Minus,Maximize2,Minimize2,Trash2,Search,Copy,ClipboardPaste,Eraser} from 'lucide-react';
import {t} from './i18n';
import {followTerminalTheme} from './terminal-theme';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

export type TerminalSession={id:string;projectId:string;runId?:string;viewId?:string;cwd:string;shell:string;exited:boolean;exitCode:number|null};
export type TerminalRequest={projectId:string;runId?:string;viewId?:string;directory?:string};
type Attachment={id:string;token:string};
type TerminalFrame={data:string;snapshot:boolean;cols:number;rows:number;exited:boolean;exitCode:number|null};
export type TerminalAPI={
 focus(input:{active:boolean}):Promise<void>;
 profiles(input?:{projectId:string}):Promise<{id:string;name:string}[]>;
 list():Promise<TerminalSession[]>;
 create(input:TerminalRequest&{shell?:string}):Promise<TerminalSession>;
 attach(input:Attachment):Promise<TerminalFrame>;
 detach(input:Attachment):Promise<void>;
 read(input:Attachment):Promise<TerminalFrame|null>;
 clear(input:{id:string}):Promise<void>;
 onExit(listener:(session:TerminalSession)=>void):()=>void;
 write(input:{id:string;data:string}):Promise<void>;
 resize(input:{id:string;cols:number;rows:number}):Promise<void>;
 close(input:{id:string}):Promise<void>;
};
type Handle={term:Terminal;search:SearchAddon;fit:()=>void};
function TerminalView({session,handles,scrollOffsets,onError}:{session:TerminalSession;handles:Map<string,Handle>;scrollOffsets:Map<string,number>;onError:(message:string)=>void}) {
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const api=window.desktop!.terminal!;
  if(!api.attach){onError(t('请重新启动桌面应用以加载新版终端。'));return;}
  const attachment={id:session.id,token:crypto.randomUUID()};
  const term=new Terminal({cursorBlink:true,scrollback:5000,fontSize:13,fontFamily:'Menlo, Consolas, "DejaVu Sans Mono", monospace'});
  const stopTheme=followTerminalTheme(term);
  const fitAddon=new FitAddon(),search=new SearchAddon();term.loadAddon(fitAddon);term.loadAddon(search);term.open(host.current!);
  let disposed=false,restored=false;
  const fail=(e:unknown)=>{if(!disposed)onError(String(e instanceof Error?e.message:e));};
  const fit=()=>{
   if(!restored||!host.current?.clientWidth||!host.current?.clientHeight)return;
   const size=fitAddon.proposeDimensions();
   if(!size)return;
   const cols=Math.min(size.cols,500),rows=Math.min(size.rows,300);
   if(cols===term.cols&&rows===term.rows)return;
   term.resize(cols,rows);
   void api.resize({id:session.id,cols,rows}).catch(fail);
  };
  handles.set(session.id,{term,search,fit});
  const input=term.onData(data=>{void api.write({id:session.id,data}).catch(fail);});
  const observer=new ResizeObserver(fit);observer.observe(host.current!);
  const display=async()=>{
   let frame:TerminalFrame|null=await api.attach(attachment);
   while(frame&&!disposed){
    const offset=frame.snapshot && restored ? term.buffer.active.baseY-term.buffer.active.viewportY : scrollOffsets.get(session.id);
    if(frame.snapshot){
     term.reset();
     term.resize(frame.cols,frame.rows);
    }
    const data=frame.data;
    if(data)await new Promise<void>(done=>term.write(data,done));
    if(disposed)return;
    if(frame.snapshot){
     restored=true;
     fit();
     if(offset!==undefined)term.scrollToLine(Math.max(0,term.buffer.active.baseY-offset));
    }
    if(frame.exited){term.write(`\r\n[${t('终端已退出')} · ${frame.exitCode}]\r\n`);return;}
    // The host resolves this only on output, exit or detach.
    frame=await api.read(attachment);
   }
  };
  void display().catch(fail);
  term.focus();
  return()=>{
   disposed=true;
   if(restored)scrollOffsets.set(session.id,term.buffer.active.baseY-term.buffer.active.viewportY);
   void api.detach(attachment).catch(()=>{});
   observer.disconnect();input.dispose();stopTheme();handles.delete(session.id);term.dispose();
  };
 },[session.id,handles,scrollOffsets,onError]);
 return <div ref={host} onFocusCapture={()=>void window.desktop?.terminal?.focus({active:true}).catch(()=>{})} onBlurCapture={()=>void window.desktop?.terminal?.focus({active:false}).catch(()=>{})} className="terminal-screen" aria-label={`${session.shell} — ${session.cwd}`}/>;
}
export default function TerminalPanel({context,request,open,hide}:{context:TerminalRequest;request:{serial:number;directory?:string}|null;open:boolean;hide:()=>void}) {
 const api=window.desktop?.terminal;
 useEffect(()=>{if(!open)return;const search=()=>setSearching(true);window.addEventListener('terminal:search',search);return()=>window.removeEventListener('terminal:search',search);},[open]);
 const [sessions,setSessions]=useState<TerminalSession[]>([]),[profiles,setProfiles]=useState<{id:string;name:string}[]>([]);
 const [shell,setShell]=useState(''),[active,setActive]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [height,setHeight]=useState(280),[maximized,setMaximized]=useState(false),[searching,setSearching]=useState(false),[query,setQuery]=useState('');
 const handles=useRef(new Map<string,Handle>()).current,handled=useRef(0),creating=useRef(false);
 const scrollOffsets=useRef(new Map<string,number>()).current;
 const selected=sessions.find(s=>s.id===active)||sessions[sessions.length-1];
 const report=useCallback((message:string)=>setError(message),[]);
 useEffect(()=>api?.onExit?.(session=>{if(session.projectId===context.projectId&&session.runId===context.runId&&session.viewId===context.viewId)setSessions(old=>old.map(s=>s.id===session.id?session:s));}),[api,context.projectId,context.runId,context.viewId]);
 useEffect(()=>{if(!api)return;setShell('');let cancelled=false;Promise.all([api.list(),api.profiles({projectId:context.projectId})]).then(([items,choices])=>{if(!cancelled){setSessions(items.filter(s=>s.projectId===context.projectId&&s.runId===context.runId&&s.viewId===context.viewId));setProfiles(choices);setReady(true);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[api,context.projectId,context.runId,context.viewId]);
 const create=async(directory?:string)=>{
  if(!api||creating.current)return;creating.current=true;setBusy(true);setError('');
  try{const session=await api.create({...context,directory,shell:shell||undefined});setSessions(old=>[...old,session]);setActive(session.id);}
  catch(e){setError((e as Error).message);}finally{creating.current=false;setBusy(false);}
 };
 useEffect(()=>{
  if(!open||!ready||!request||handled.current===request.serial)return;
  handled.current=request.serial;
  if(request.directory!==undefined||!selected)void create(request.directory);
  else {handles.get(selected.id)?.fit();handles.get(selected.id)?.term.focus();}
 },[open,ready,request,selected]);
 const close=async()=>{if(!selected||!api)return;try{await api.close({id:selected.id});scrollOffsets.delete(selected.id);setSessions(old=>old.filter(s=>s.id!==selected.id));setError('');}catch(e){setError((e as Error).message);}};
 const action=async(kind:'copy'|'paste')=>{if(!selected)return;try{const term=handles.get(selected.id)?.term;if(kind==='copy')await window.desktop!.copyText(term?.getSelection()||'');else term?.paste(await navigator.clipboard.readText());term?.focus();}catch(e){setError((e as Error).message);}};
 return <section className={`terminal-panel ${maximized?'terminal-maximized':''}`} style={{display:open?'flex':'none',height:maximized?'100%':height}} aria-label={t('终端')}>
  <div className="terminal-resize" role="separator" aria-label={t('调整终端高度')} aria-orientation="horizontal" aria-valuenow={height} aria-valuemin={160} aria-valuemax={Math.floor(window.innerHeight*.75)} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(h=>Math.max(160,Math.min(window.innerHeight*.75,h+(e.key==='ArrowUp'?20:-20))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){setMaximized(false);setHeight(Math.max(160,Math.min(window.innerHeight*.75,e.currentTarget.parentElement!.getBoundingClientRect().bottom-e.clientY)));}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
  <div className="terminal-toolbar">
   <span className="terminal-heading">{t('终端')}</span>
   <div className="terminal-tabs" role="tablist" aria-label={t('终端会话')}>{sessions.map((s,i)=><button key={s.id} role="tab" aria-selected={selected?.id===s.id} title={s.cwd} onClick={()=>setActive(s.id)}>{s.shell} {i+1}{s.exited?` · ${t('已退出')}`:''}</button>)}</div>
   <select aria-label={t('新终端使用的 Shell')} value={shell} onChange={e=>setShell(e.target.value)}><option value="">{t('默认 Shell')}</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <button title={t('新建终端')} aria-label={t('新建终端')} disabled={busy||!ready} onClick={()=>void create()}><Plus size={16}/></button>
   <button title={t('搜索终端')} aria-label={t('搜索终端')} onClick={()=>setSearching(v=>!v)}><Search size={16}/></button>
   <button title={t('复制选中内容')} aria-label={t('复制选中内容')} disabled={!selected} onClick={()=>void action('copy')}><Copy size={16}/></button>
   <button title={t('粘贴')} aria-label={t('粘贴')} disabled={!selected||selected.exited} onClick={()=>void action('paste')}><ClipboardPaste size={16}/></button>
   <button title={t('清屏')} aria-label={t('清屏')} disabled={!selected} onClick={()=>{if(selected)void api?.clear?.({id:selected.id}).catch(e=>report(e.message));}}><Eraser size={16}/></button>
   <button title={t('结束终端')} aria-label={t('结束终端')} disabled={!selected} onClick={()=>void close()}><Trash2 size={16}/></button>
   <button title={t(maximized?'还原终端':'最大化终端')} aria-label={t(maximized?'还原终端':'最大化终端')} onClick={()=>setMaximized(v=>!v)}>{maximized?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
   <button title={t('收起终端')} aria-label={t('收起终端')} onClick={hide}><Minus size={16}/></button>
  </div>
  {selected&&<div className="terminal-directory" title={selected.cwd}>{selected.cwd}</div>}
  {searching&&<form className="terminal-search" onSubmit={e=>{e.preventDefault();if(selected)handles.get(selected.id)?.search.findNext(query);}}><input autoFocus placeholder={t('搜索终端')} aria-label={t('搜索终端')} value={query} onChange={e=>{setQuery(e.target.value);if(selected)handles.get(selected.id)?.search.findNext(e.target.value);}} onKeyDown={e=>{if(e.key==='Escape')setSearching(false);}}/><button type="submit">{t('下一个')}</button></form>}
  {error&&<div className="terminal-error" role="alert">{error}</div>}
  {!selected&&<div className="terminal-empty">{busy?t('正在启动终端…'):t('点击 + 新建终端')}</div>}
  {open&&selected&&<TerminalView key={selected.id} session={selected} handles={handles} scrollOffsets={scrollOffsets} onError={report}/>}
 </section>;
}
