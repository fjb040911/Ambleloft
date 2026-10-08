import ExtensionIcon from './ExtensionIcon';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,Puzzle,MoreHorizontal,Folder,ShieldCheck} from 'lucide-react';
import type {ExtensionSnapshot,Project} from './types';
import Markdown from './Markdown';
import ExtensionSettings from './ExtensionSettings';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './components/ui/tabs';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent} from './components/ui/dropdown-menu';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {Skeleton} from './components/ui/skeleton';
import {Alert,AlertDescription} from './components/ui/alert';
import {t} from './i18n';
import './extension-detail.css';

function DetailEmpty({title,description}:{title:string;description:string}) {
 return <Empty><EmptyHeader><EmptyTitle>{t(title)}</EmptyTitle><EmptyDescription>{t(description)}</EmptyDescription></EmptyHeader></Empty>;
}
const permissionName=(key:string)=>t(({'projects.read':'读取项目信息','projects.path.read':'读取项目路径','conversations.create':'创建聊天','conversations.open':'打开聊天','storage':'扩展数据存储','secrets':'安全凭据存储','configuration':'扩展配置'} as Record<string,string>)[key]||key);

export default function ExtensionDetail({item,back,permissions,grantConfiguration,actions,busy,toggle}:{item:ExtensionSnapshot['installed'][number];back():void;permissions():void;grantConfiguration():void;actions:ReactNode;busy:boolean;toggle():void}) {
 const [dirty,setDirty]=useState(false);
 const [tab,setTab]=useState('details'),[error,setError]=useState(''),[projectError,setProjectError]=useState('');
 const [details,setDetails]=useState<{readme:string;publisher:string;size:number|null}|null>(null),[projects,setProjects]=useState<Project[]>([]);
 useEffect(()=>{
  let live=true;setDetails(null);setError('');setProjectError('');
  (window.desktop?.extensions?.details?.(item.manifest.id)||Promise.resolve({readme:'',publisher:'',size:null})).then(data=>{if(live)setDetails(data);}).catch(e=>{if(live)setError(e.message);});
  window.desktop?.readWorkspace().then(state=>{if(live)setProjects(state.projects);}).catch(e=>{if(live)setProjectError(e.message);});
  return()=>{live=false;};
 },[item.manifest.id,item.active]);
 useEffect(()=>{setDirty(false);},[item.active,item.enabled,item.trusted]);
 const canConfigure=!!item.grants?.some(g=>g.capability==='configuration'&&g.resource==='self');
 const projectIds=[...new Set(item.grants?.filter(g=>g.resource.startsWith('project:')).map(g=>g.resource.slice(8))||[])];
 const runtimeLabel=t(!item.hasBackend?'无需后台':({active:'运行中',starting:'启动中',dormant:'待命',failed:'运行异常',stopped:'已停止',stopping:'停止中',recovering:'恢复中',paused:'已暂停'} as Record<string,string>)[item.runtime?.state||'dormant']||'待命');
 const leave=(action:()=>void)=>{if(!dirty||window.confirm(t('放弃未保存的修改？')))action();};
 return <div className="extension-detail">
  <Button variant="ghost" size="sm" onClick={()=>leave(back)}><ArrowLeft data-icon="inline-start"/>{t('返回扩展列表')}</Button>
  <header className="extension-detail-header">
   <span className="extension-detail-logo" aria-hidden="true"><ExtensionIcon icon={item.manifest.icon} size={26}/></span>
   <div className="extension-detail-heading">
    <div className="extension-detail-title"><h1>{item.manifest.name}</h1><Badge variant={item.enabled?'secondary':'outline'}>{t(item.enabled?'已启用':'已停用')}</Badge></div>
    <p className="extension-detail-meta">{details?.publisher||t('开发者未提供')} · {item.manifest.version} · {runtimeLabel}</p>
    <p className="extension-detail-description">{item.manifest.description}</p>
   </div>
   <div className="extension-detail-actions"><Button variant="outline" disabled={busy} onClick={()=>leave(toggle)}>{t(item.enabled?'停用':'启用')}</Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('更多操作')}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52">{actions}</DropdownMenuContent></DropdownMenu></div>
  </header>
  {(item.diagnostic||item.runtime?.diagnostic)&&<Alert variant="destructive"><AlertDescription>{item.diagnostic||item.runtime?.diagnostic}</AlertDescription></Alert>}
  <Tabs value={tab} onValueChange={value=>setTab(String(value))} className="extension-detail-tabs gap-6">
   <div className="extension-detail-tabbar"><TabsList variant="line" aria-label={t('扩展详情')}><TabsTrigger className="transition-none after:transition-none" value="details">{t('详情')}</TabsTrigger><TabsTrigger className="transition-none after:transition-none" value="settings">{t('设置')}</TabsTrigger><TabsTrigger className="transition-none after:transition-none" value="permissions">{t('权限')}</TabsTrigger></TabsList></div>
   <TabsContent value="details" keepMounted>
    {error?<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>:!details?<div role="status" aria-label={t('正在加载…')} className="flex flex-col gap-4"><Skeleton className="h-6 w-40"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-3/4"/></div>:details.readme?<article className="extension-readme"><Markdown text={details.readme}/></article>:<DetailEmpty title="暂无扩展说明" description="开发者尚未提供 README.md。"/>}
    <details className="extension-install-info"><summary>{t('安装信息')}</summary><dl><dt>{t('安装来源')}</dt><dd>{t(item.sourceMode==='directory'?'本地开发目录':'本地安装')}</dd><dt>{t('版本')}</dt><dd>{item.manifest.version}</dd><dt>{t('大小')}</dt><dd>{details?.size!=null?(details.size/1024).toFixed(1)+' KB':t('未记录')}</dd><dt>{t('运行状态')}</dt><dd>{runtimeLabel}</dd></dl></details>
   </TabsContent>
   <TabsContent value="settings" keepMounted>
    {item.hasConfiguration&&item.enabled&&item.trusted?(canConfigure?<ExtensionSettings key={item.active} id={item.manifest.id} generation={item.generation} name={item.manifest.name} close={()=>{}} inline onDirtyChange={setDirty}/>:<section><h2>{t('需要授权扩展配置')}</h2><p>{t('仅授权此扩展读取自己的配置，不授予项目或密钥权限。')}</p><Button variant="outline" disabled={busy} onClick={grantConfiguration}>{t('授权扩展配置')}</Button></section>):<DetailEmpty title={item.hasConfiguration?'启用并信任扩展后可配置':'此扩展暂无设置项'} description="扩展提供的配置选项会显示在这里。"/>}
   </TabsContent>
   <TabsContent value="permissions" keepMounted>
    <section className="extension-permissions" aria-label={t('已授权范围')}>
     <div className="extension-permission-heading"><div><h2>{t('已授权项目')}</h2><p>{t('仅授权所选项目；不会授予其他项目的访问权限。')}</p></div><Button variant="outline" disabled={busy} onClick={permissions}><ShieldCheck data-icon="inline-start"/>{t('管理权限')}</Button></div>
     {projectError?<Alert variant="destructive"><AlertDescription>{projectError}</AlertDescription></Alert>:projectIds.length?<ul className="extension-projects">{projectIds.map(id=><li key={id}><Folder size={18} aria-hidden="true"/><div><strong>{projects.find(p=>p.id===id)?.name||t('项目已移除')}</strong><p>{item.grants?.filter(g=>g.resource===`project:${id}`).map(g=>permissionName(g.capability)).join(' · ')}</p></div><Badge variant="secondary">{t('已授权')}</Badge></li>)}</ul>:<p className="extension-permission-empty">{t('未授权项目')}</p>}
     {!!item.grants?.some(g=>!g.resource.startsWith('project:'))&&<div className="extension-self-grants"><h3>{t('扩展私有数据')}</h3><p>{item.grants.filter(g=>!g.resource.startsWith('project:')).map(g=>permissionName(g.capability)).join(' · ')}</p></div>}
     <details className="extension-install-info"><summary>{t('声明的权限')}</summary>{item.permissions?.length?<dl>{item.permissions.map(p=><div className="extension-permission-definition" key={p.capability}><dt>{permissionName(p.capability)}</dt><dd>{t(p.scope==='project'?'所选项目':'扩展私有数据')}</dd></div>)}</dl>:<p>{t('未声明权限')}</p>}</details>
    </section>
   </TabsContent>
  </Tabs>
 </div>;
}
