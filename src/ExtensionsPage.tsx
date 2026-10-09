import ExtensionIcon from './ExtensionIcon';
import ExtensionPermissionsDialog from './ExtensionPermissionsDialog';
import {createPortal} from 'react-dom';
import {Button} from './components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSeparator} from './components/ui/dropdown-menu';
import ExtensionDetail from './ExtensionDetail';
import {Puzzle,ChevronDown,Plus} from 'lucide-react';
import {useContext,useEffect,useRef,useState} from 'react';
import Modal from './Modal';
import type {Project} from './types';
import {IntegrationActionsContext,IntegrationEmpty,IntegrationEntry,type IntegrationFilter} from './IntegrationPage';
import {extensionsChanged,openExtensionView,useExtensions} from './extensions';
import {t} from './i18n';
export default function ExtensionsPage({query='',filter='all'}:{query?:string;filter?:IntegrationFilter}){
 const actionsTarget=useContext(IntegrationActionsContext);
 const {snapshot,error:loadError}=useExtensions();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [developmentTarget,setDevelopmentTarget]=useState<string|null>(null),[developmentURL,setDevelopmentURL]=useState('http://127.0.0.1:5174');
 const [grantTarget,setGrantTarget]=useState<string|null>(null);const [projects,setProjects]=useState<Project[]>([]);const [projectId,setProjectId]=useState('');
 const pageScope=useRef(selected);pageScope.current=selected;
 const navigate=(id:string|null)=>{pageScope.current=id;setError('');setSelected(id);};
 const act=async(action:()=>Promise<unknown>)=>{const scope=pageScope.current;setBusy(true);setError('');try{await action();extensionsChanged();}catch(e){if(pageScope.current===scope)setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setBusy(false);}};
 useEffect(()=>{if(selected&&!snapshot.installed.some(i=>i.manifest.id===selected))navigate(null);},[snapshot,selected]);
 const grantItem=snapshot.installed.find(item=>item.manifest.id===grantTarget);
 const visible=snapshot.installed.filter(item=>(filter==='all'||item.enabled===(filter==='enabled'))&&(item.manifest.name+' '+item.manifest.description+' '+item.manifest.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const installActions=<div className="extension-install-actions"><Button size="lg" disabled={busy||!window.desktop?.extensions} onClick={()=>void act(()=>window.desktop!.extensions!.install())}><Plus data-icon="inline-start"/>{t('安装扩展')}</Button><DropdownMenu><DropdownMenuTrigger render={<Button size="icon-lg" variant="outline" disabled={busy||!window.desktop?.extensions} aria-label={t('更多安装方式')}/>}><ChevronDown/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem disabled={busy} onClick={()=>void act(()=>window.desktop!.extensions!.install({development:true}))}>{t('加载开发目录')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>;
 return <div className="content-page extension-settings">{!selected&&(actionsTarget?createPortal(installActions,actionsTarget):installActions)}
 {!grantTarget&&(error||loadError)&&<p className="error-banner" role="alert">{error||loadError}</p>}
 {!selected&&!visible.length&&<IntegrationEmpty title={snapshot.installed.length?'没有匹配的扩展':'尚未安装扩展。'} description={snapshot.installed.length?'试试其他关键词，或清除筛选条件。':'安装本地扩展，为工作台添加新的能力。'}/>}
 {snapshot.diagnostics?.map((message,index)=><p key={index} className="error-banner">{message}</p>)}
 {!selected&&visible.length>0&&<div className="integration-list" aria-label={t('已安装扩展')}>{visible.map(item=><IntegrationEntry className="extension-list-card" key={item.manifest.id} name={item.manifest.name} description={item.manifest.description} meta={item.manifest.version+' · '+t(item.sourceMode==='directory'?'本地开发目录':'本地安装')} enabled={item.enabled} icon={<ExtensionIcon icon={item.manifest.icon} size={24}/>} onClick={()=>navigate(item.manifest.id)}/>)}</div>}

 {snapshot.installed.filter(item=>item.manifest.id===selected).map(({manifest,enabled,kind,trusted,active,revisions,grants,diagnostic,runtime,hasBackend,hasConfiguration,sourceMode,home})=><ExtensionDetail key={manifest.id} item={snapshot.installed.find(i=>i.manifest.id===manifest.id)!} grantConfiguration={()=>void act(()=>window.desktop!.extensions!.grants({id:manifest.id,capabilities:['configuration']}))} back={()=>navigate(null)} busy={busy} toggle={()=>void act(()=>window.desktop!.extensions!.enable({id:manifest.id,enabled:!enabled}))} permissions={()=>void act(async()=>{const state=await window.desktop!.readWorkspace();setProjects(state.projects);setProjectId('');setGrantTarget(manifest.id);})} actions={<DropdownMenuGroup>{kind==='package'&&<><DropdownMenuItem disabled={busy} onClick={()=>void act(()=>window.desktop!.extensions!.resetConfirmations({id:manifest.id}))}>{t('恢复操作确认')}</DropdownMenuItem>{sourceMode==='directory'&&home&&<DropdownMenuItem onClick={()=>setDevelopmentTarget(manifest.id)}>{t('本地开发页面')}</DropdownMenuItem>}<DropdownMenuItem disabled={busy||!enabled||!trusted||!hasBackend||['active','starting','stopping','recovering'].includes(runtime?.state||'')} onClick={()=>void act(()=>window.desktop!.extensions!.activate(manifest.id))}>{t('启动后台')}</DropdownMenuItem>{revisions?.filter(r=>r.digest!==active).map(r=><DropdownMenuItem key={r.digest} disabled={busy} onClick={()=>void act(()=>window.desktop!.extensions!.rollback({id:manifest.id,digest:r.digest}))}>{t("恢复版本")} {r.version} ({r.digest.slice(0,8)})</DropdownMenuItem>)}</>}{enabled&&manifest.contributes.commands?.filter(command=>command.visible!==false).map(command=><DropdownMenuItem key={command.id} disabled={busy} onClick={()=>void act(async()=>{const target=await window.desktop!.extensions!.command(command.id);openExtensionView(target.viewId);})}>{command.title}</DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem variant="destructive" disabled={busy} onClick={()=>void act(()=>window.desktop!.extensions!.remove(manifest.id))}>{t('卸载')}</DropdownMenuItem></DropdownMenuGroup>}/>)}

 {grantItem&&<ExtensionPermissionsDialog item={grantItem} projects={projects} projectId={projectId} setProjectId={setProjectId} busy={busy} error={error} close={()=>{setGrantTarget(null);setError('');}} revoke={()=>void act(()=>window.desktop!.extensions!.grants({id:grantItem.manifest.id,revoke:true}))} grant={()=>void act(async()=>{await window.desktop!.extensions!.grants({id:grantItem.manifest.id,projectId:projectId||undefined});setGrantTarget(null);})}/>}
 {developmentTarget&&<Modal title={t('本地开发页面')} close={()=>setDevelopmentTarget(null)} busy={busy}><form className="project-editor" onSubmit={e=>{e.preventDefault();void act(async()=>{await window.desktop!.extensions!.development({id:developmentTarget,url:developmentURL});setDevelopmentTarget(null);});}}><label>HTTP origin<input aria-label="HTTP origin" value={developmentURL} onChange={e=>setDevelopmentURL(e.target.value)} required/></label><Button type="submit" variant="default">{t('启用')}</Button><Button type="button" variant="outline" onClick={()=>void act(async()=>{await window.desktop!.extensions!.development({id:developmentTarget,url:''});setDevelopmentTarget(null);})}>{t('使用包内页面')}</Button></form></Modal>}
 </div>;
}
