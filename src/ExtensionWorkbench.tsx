import {useRef,useState} from 'react';
import {MoreHorizontal,ArrowRight,Search,Puzzle} from 'lucide-react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {SidebarMenu,SidebarMenuItem,SidebarMenuButton} from './components/ui/sidebar';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './components/ui/dropdown-menu';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription,EmptyContent} from './components/ui/empty';
import ExtensionIcon from './ExtensionIcon';
import ExtensionSurface from './ExtensionSurface';
import ExtensionsPage from './ExtensionsPage';
import ManagementDialog from './ManagementDialog';
import ProjectPicker from './ProjectPicker';
import {useConfirm} from './Confirmation';
import {t,useLanguage} from './i18n';
import type {ExtensionSnapshot,Project} from './types';
import './extension-workbench.css';
type Entry=ExtensionSnapshot['installed'][number];
export const businessEntries=(snapshot:ExtensionSnapshot)=>snapshot.installed.filter(item=>item.enabled&&item.trusted&&item.home);
export const businessTitle=(item:Entry)=>item.home?.title||item.manifest.name;
export function ExtensionNavigation({entries,selected,open,loading,error}:{entries:Entry[];selected:string|null;open(id:string):void;loading:boolean;error:string}){
 const [query,setQuery]=useState('');const term=query.trim().toLocaleLowerCase();
 const filtered=entries.filter(item=>(businessTitle(item)+' '+item.manifest.name).toLocaleLowerCase().includes(term));
 return <div className="extension-navigation">
  <div className="extension-nav-search"><Search size={15} aria-hidden="true"/><Input className="ps-8" type="search" aria-label={t('搜索业务入口')} placeholder={t('搜索业务入口…')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <p className="extension-nav-caption">{t('业务入口')}</p>
  <SidebarMenu>{filtered.map(item=>{const title=businessTitle(item),duplicate=entries.filter(other=>businessTitle(other)===title).length>1;return <SidebarMenuItem key={item.manifest.id}><SidebarMenuButton className="extension-nav-row" isActive={selected===item.manifest.id} aria-current={selected===item.manifest.id?'page':undefined} title={title} onClick={()=>open(item.manifest.id)}><ExtensionIcon icon={item.manifest.icon} size={18}/><span className="extension-nav-copy"><span>{title}</span>{duplicate&&<small>{item.manifest.name===title?item.manifest.id:item.manifest.name}</small>}{item.home?.available===false&&<small>{t('待满足使用条件')}</small>}</span></SidebarMenuButton></SidebarMenuItem>;})}</SidebarMenu>
  {error?<p className="extension-nav-empty" role="alert">{t('暂时无法读取扩展。')}{error}</p>:loading?<p className="extension-nav-empty" role="status">{t('正在加载…')}</p>:!filtered.length&&<p className="extension-nav-empty">{t(term?'没有匹配的业务入口。':'有独立页面的扩展会显示在这里。')}</p>}
 </div>;
}
export default function ExtensionWorkbench({item,selected,loading,error,visible,projects,projectId,setProject,discover,manage}:{item?:Entry;selected:string|null;loading:boolean;error:string;visible:boolean;projects:Project[];projectId:string;setProject(id:string):void;discover():void;manage():void}){
 const locale=useLanguage();const confirm=useConfirm();const [panel,setPanel]=useState<'settings'|'details'|null>(null);const guard=useRef<(()=>void)|null>(null);
 const close=()=>{if(guard.current)guard.current();else setPanel(null);};
 const usable=item?.enabled&&item.trusted&&item.home;
 const setContext=async(id:string)=>{if(id===projectId)return;if(usable&&item.home?.available!==false&&!await confirm({title:t('切换入口项目？'),description:t('页面将重新打开。请先保存业务页面中的修改；切换不会新增项目授权。'),action:t('切换项目')}))return;setProject(id);};
 return <section className="extension-workbench" aria-label={t('扩展工作区')}>
  {item?.home&&<header className="extension-workbench-header"><div className="extension-workbench-identity"><ExtensionIcon icon={item.manifest.icon} size={22}/><div><h1>{businessTitle(item)}</h1><p>{item.manifest.name}</p></div></div><div className="extension-workbench-actions">{item.home.when&&<div className="extension-entry-context" title={t('入口项目仅用于页面可用条件；业务操作由扩展选择项目并请求授权。')}><span>{t('入口项目')}</span><ProjectPicker projects={projects} value={projectId} onChange={id=>void setContext(id)} disabled={false}/></div>}<DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-foreground" aria-label={t('扩展页面操作')}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onClick={()=>setPanel('settings')}>{t('设置与权限')}</DropdownMenuItem><DropdownMenuItem onClick={()=>setPanel('details')}>{t('扩展详情')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div></header>}
  {usable&&item.home?.available!==false?<ExtensionSurface extensionId={item.manifest.id} revision={item.active} projectId={projectId} locale={locale} visible={visible&&!panel} onSettings={()=>setPanel('settings')}/>:<Empty className="extension-workbench-empty"><EmptyHeader><EmptyMedia variant="icon"><Puzzle/></EmptyMedia><EmptyTitle>{t(loading?'正在加载…':error?'暂时无法读取扩展。':usable?'此入口暂不可用':selected?'此扩展入口已不可用':'在这里使用你的业务工具')}</EmptyTitle><EmptyDescription>{error||t(usable?'当前项目或扩展状态尚未满足使用条件。可选择入口项目，或查看设置与权限。':selected?'扩展可能已停用、卸载或移除页面。可在技能与扩展中查看；不会自动打开其他业务。':'安装带有独立页面的扩展，在这里处理工单、查看设备或使用其他业务工具。技能仍在聊天中使用。')}</EmptyDescription></EmptyHeader><EmptyContent><Button variant={selected?'outline':'default'} onClick={usable?()=>setPanel('settings'):selected?manage:discover}>{t(usable?'设置与权限':selected?'技能与扩展':'发现工具')}<ArrowRight data-icon="inline-end"/></Button></EmptyContent></Empty>}
  {panel&&item&&<ManagementDialog title={item.manifest.name+' · '+t(panel==='settings'?'设置与权限':'扩展详情')} wide busy={false} close={close} className="extension-workbench-settings"><ExtensionsPage mode="detail" initialId={item.manifest.id} initialTab={panel} backLabel="返回业务页面" closeGuard={guard} onClose={()=>setPanel(null)}/></ManagementDialog>}
 </section>;
}
