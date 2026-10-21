import {useEffect,useRef,useState} from 'react';
import {Box,Folder,ArrowUp,ChevronRight,RefreshCw} from 'lucide-react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Field,FieldLabel,FieldDescription} from './components/ui/field';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import type {Project,DockerEnvironment} from './types';
import type {DockerList,SshAPI} from './SshProjectFields';
import {t} from './i18n';
const stateLabel:Record<string,string>={running:'运行中',exited:'已停止',created:'已创建',paused:'已暂停',restarting:'正在重启',removing:'正在移除',dead:'不可用'};
export default function DockerProjectFields({project,change,onBusy}:{project:Project;change(p:Project):void;onBusy(b:boolean):void}){
 const api=window.desktop?.ssh,env=project.environment?.kind==='docker'?project.environment:undefined;
 const [list,setList]=useState<DockerList|null>(null),[picking,setPicking]=useState(!env),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[showStopped,setShowStopped]=useState(false);
 const [endpoint,setEndpoint]=useState(env?.endpoint||''),[user,setUser]=useState(env?.user||''),[shell,setShell]=useState<DockerEnvironment['shell']>(env?.shell||'auto');
 const [folder,setFolder]=useState<Awaited<ReturnType<SshAPI['browse']>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[identity,setIdentity]=useState('');
 const live=useRef(true),sequence=useRef(0);
 useEffect(()=>{live.current=true;return()=>{live.current=false;sequence.current++;onBusy(false);};},[onBusy]);
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);onBusy(true);setError('');const version=++sequence.current;try{await fn();}catch(e){if(live.current&&version===sequence.current)setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{if(live.current&&version===sequence.current){setBusy(false);onBusy(false);}}};
 const load=()=>work(async()=>{if(!api?.dockerList)throw Error(t('Docker 功能需要完全退出并重新启动应用。'));const value=await api.dockerList({id:project.connectionId!,endpoint:endpoint||undefined});if(live.current){setList(value);setEndpoint(value.endpoint);}});
 useEffect(()=>{void load();},[]);
 const browse=(path:string)=>work(async()=>{if(!env)return;const value=await api!.browse({id:project.connectionId!,environment:env,path});if(live.current)setFolder(value);});
 const chosen=list?.containers.find(c=>c.id===selected);
 const enter=(id:string,start=false)=>work(async()=>{
  const item=list?.containers.find(c=>c.id===id);if(!item||!list)return;
  const environment:DockerEnvironment={kind:'docker',endpoint:list.endpoint,daemonId:list.daemonId,containerId:item.id,containerName:item.name,imageId:'',user:user||null,shell};
  const ready=await api![start?'dockerStart':'dockerEnter']({id:project.connectionId!,environment});
  const next=await api!.browse({id:project.connectionId!,environment:ready.environment,path:ready.path});
  if(!live.current)return;change({...project,environment:ready.environment,path:''});setPicking(false);setFolder(next);setIdentity(`UID ${ready.uid} · ${ready.shell}`);
 });
 const rows=(list?.containers||[]).filter(c=>(showStopped||c.state==='running')&&`${c.name} ${c.image} ${c.id}`.toLowerCase().includes(query.toLowerCase()));
 const missing=env&&list&&!list.containers.some(c=>c.id===env.containerId);
 return <section className="docker-project flex flex-col gap-3" aria-label={t('Docker 容器')} aria-busy={busy}>
  {!picking&&env?<><div className="flex flex-wrap items-center gap-2"><Box className="size-4"/><strong className="min-w-0 flex-1 break-all text-sm">{env.containerName}</strong><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{setPicking(true);setFolder(null);void load();}}>{t('更换容器')}</Button></div><p className="text-xs text-muted-foreground break-all">{env.containerId.slice(0,12)} · {identity||t('沿用容器用户和 Shell 设置')}</p><Button type="button" variant="outline" disabled={busy} onClick={()=>void browse(project.path||'/')}>{t('浏览容器目录')}</Button></>:
  <><div className="flex items-center gap-2"><Input aria-label={t('搜索容器')} placeholder={t('搜索名称、镜像或 ID')} value={query} onChange={e=>setQuery(e.target.value)}/><Button type="button" variant="outline" size="icon" aria-label={t('刷新容器')} disabled={busy} onClick={()=>void load()}><RefreshCw/></Button></div>
   <div className="docker-container-list" role="listbox" aria-label={t('选择容器')}>
    {rows.map(c=><button type="button" role="option" aria-selected={selected===c.id} key={c.id} disabled={busy} onClick={()=>setSelected(c.id)} onDoubleClick={()=>{if(c.state==='running')void enter(c.id);}} onKeyDown={e=>{if(e.key==='Enter'&&c.state==='running'){e.preventDefault();void enter(c.id);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const options=Array.from(e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role=option]'));options[(options.indexOf(e.currentTarget)+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}}}>
     <Box className="size-4 shrink-0"/><span className="min-w-0 flex-1"><strong className="block truncate font-medium">{c.name}</strong><span className="block truncate text-xs text-muted-foreground">{c.image} · {c.id.slice(0,12)}</span></span><span className="shrink-0 text-xs">{t(stateLabel[c.state]||c.state)}</span>
    </button>)}
    {!rows.length&&<p className="p-4 text-sm text-muted-foreground" role="status">{t(busy?'正在加载容器…':query?'没有匹配的容器':list?.containers.length?'没有运行中的容器，请显示已停止容器。':'没有可用容器，可刷新或切换到服务器目录。')}</p>}
   </div><div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showStopped} onChange={e=>setShowStopped(e.target.checked)}/>{t('显示已停止容器')}</label><Button type="button" disabled={busy||!chosen||!['running','exited','created'].includes(chosen.state)} onClick={()=>chosen&&void enter(chosen.id,chosen.state!=='running')}>{t(busy?'正在连接…':chosen&&chosen.state!=='running'?'启动并进入':'进入容器')}</Button></div></>}
  {missing&&<p role="status" className="text-sm">{t('原容器已不存在。请选择新容器并保存项目；历史任务不会自动切换到新容器。')}</p>}
  <details className="text-sm"><summary className="cursor-pointer">{t('高级设置')}</summary><div className="flex flex-col gap-3 pt-3">
   <Field><FieldLabel htmlFor="docker-endpoint">{t('Docker 本机端点')}</FieldLabel><Input id="docker-endpoint" placeholder="unix:///var/run/docker.sock" value={endpoint} disabled={busy||!picking} onChange={e=>{setEndpoint(e.target.value);setList(null);setSelected('');}}/><FieldDescription>{t('仅连接此 SSH 主机上的 Unix socket，支持 rootless Docker。')}</FieldDescription></Field>
   <Field><FieldLabel htmlFor="docker-user">{t('容器用户')}</FieldLabel><Input id="docker-user" placeholder={t('留空沿用容器默认用户')} value={user} disabled={busy} onChange={e=>{setUser(e.target.value);if(env){change({...project,environment:{...env,user:e.target.value||null}});setFolder(null);setIdentity('');}}}/></Field>
   <Field><FieldLabel htmlFor="docker-shell">Shell</FieldLabel><NativeSelect id="docker-shell" value={shell} disabled={busy} onChange={e=>{const value=e.target.value as DockerEnvironment['shell'];setShell(value);if(env){change({...project,environment:{...env,shell:value}});setFolder(null);setIdentity('');}}}><NativeSelectOption value="auto">{t('自动选择')}</NativeSelectOption><NativeSelectOption value="bash">bash</NativeSelectOption><NativeSelectOption value="sh">sh</NativeSelectOption></NativeSelect></Field>
   <FieldDescription>{t('容器需要 Python 3 和 bash 或 sh，用于文件访问与开发；不会自动安装依赖。')}</FieldDescription>
  </div></details>
  {folder&&!picking&&<div className="project-folder-browser"><div className="project-folder-toolbar"><Button type="button" variant="ghost" size="icon-sm" aria-label={t('上级目录')} disabled={busy||folder.path===folder.parent} onClick={()=>void browse(folder.parent)}><ArrowUp/></Button><code title={folder.path}>{folder.path}</code><Button type="button" size="sm" disabled={busy} onClick={()=>{change({...project,path:folder.path,name:project.name||folder.path.split('/').filter(Boolean).at(-1)||env?.containerName||''});setFolder(null);}}>{t('使用此目录')}</Button></div><div className="project-folder-list" aria-label={t('容器文件夹')}>{folder.entries.map(entry=><button type="button" key={entry.path} disabled={busy} onClick={()=>void browse(entry.path)}><Folder className="size-4"/><span>{entry.name}</span><ChevronRight className="size-4"/></button>)}{!folder.entries.length&&<p>{t('此目录中没有子文件夹，可直接使用当前目录。')}</p>}</div><p className="px-3 pb-2 text-xs text-muted-foreground">{t(folder.writable===false?'此目录只读。':folder.storage==='container'?'此目录位于容器可写层，删除或重建容器可能丢失修改。':folder.storage==='tmpfs'?'临时存储：容器停止或重启后内容会丢失。':'此目录使用挂载存储。')}</p>{folder.truncated&&<p className="px-3 pb-2 text-xs">{t('目录条目较多，部分未显示，请直接输入路径。')}</p>}</div>}
  {env&&project.path&&<p className="text-xs text-muted-foreground break-all">{env.containerName} → {project.path}</p>}
  {error&&<p className="project-editor-error" role="alert">{t(error)}</p>}
 </section>;
}
