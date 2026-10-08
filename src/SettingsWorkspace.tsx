import ManagementDialog from './ManagementDialog';
import {SidebarProvider,Sidebar,SidebarContent,SidebarGroup,SidebarGroupLabel,SidebarMenu,SidebarMenuItem,SidebarMenuButton} from './components/ui/sidebar';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Checkbox} from './components/ui/checkbox';
import {Field,FieldLabel,FieldGroup,FieldSet} from './components/ui/field';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {SettingsCard,SettingsEmpty} from './SettingsPrimitives';
import {GlobalSidebarActions} from './GlobalActions';
import NotificationSettingsIcon from './NotificationSettingsIcon';
import AccountSettings from './AccountSettings';
import {NotificationSettings} from './MessageCenter';
import IntegrationPage from './IntegrationPage';
import ExtensionCategoryIcon from './ExtensionCategoryIcon';
import ArchivedConversations from './ArchivedConversations';
import ExtensionsPage from './ExtensionsPage';
import { t } from './i18n';
import {useEffect,useRef,useState,useCallback} from 'react';
import {ArrowLeft, Settings, MessageCircle, PlugZap, Puzzle, BookOpen, Compass, Database, Box, SlidersHorizontal, Cpu, Cloud, Monitor, Sun, Moon, Check, Type, Languages, ShieldCheck, Info, Plus} from 'lucide-react';
import type {Workspace, ProviderConfig, ProviderCatalog} from './types';
import type {NavTask} from './WorkspaceNavigation';
import SkillManager from './SkillManager';
import ProviderSettings from './ProviderSettings';
export const settingsGroups=[
 {name:'设置',items:[{id:'general',label:'通用',icon:Settings},{id:'conversations',label:'任务',icon:MessageCircle},{id:'notifications',label:'通知',icon:NotificationSettingsIcon},{id:'accounts',label:'账号',icon:ShieldCheck}]},
 {name:'集成',items:[{id:'apps',label:'连接',icon:PlugZap},{id:'plugins',label:'扩展',icon:ExtensionCategoryIcon},{id:'skills',label:'技能',icon:BookOpen}]},
 {name:'模型服务',items:[{id:'providers',label:'模型提供商',icon:Cloud}]},
];
export default function SettingsWorkspace({initialSkillId,section,setSection,workspace,save,back,archived,restore,remove,catalog,refresh,busy}:{initialSkillId?:string;section:string;setSection(value:string):void;workspace:Workspace;save(update:Partial<Workspace>):Promise<void>;back():void;archived:NavTask[];restore(task:NavTask):Promise<void>;remove(task:NavTask):Promise<void>;catalog:ProviderCatalog;refresh():Promise<void>;busy:boolean}){
 const backRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{backRef.current?.focus({preventScroll:true});},[]);
 const [editor,setEditor]=useState<ProviderConfig|null|undefined>();
 const [pending,setPending]=useState(false);const [error,setError]=useState('');const [deleting,setDeleting]=useState<string|null>(null);const [result,setResult]=useState<Record<string,string>>({});
 const act=async(fn:()=>Promise<unknown>)=>{setPending(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setPending(false);}};
 const [editState,setEditState]=useState({dirty:false,busy:false});
 const onEditorState=useCallback((dirty:boolean,busy:boolean)=>setEditState({dirty,busy}),[]);
 const [leaveAction,setLeaveAction]=useState<(()=>void)|null>(null),[notice,setNotice]=useState('');
 const change=(fn:()=>void)=>{if(editState.busy)return;const proceed=()=>{setEditState({dirty:false,busy:false});setEditor(undefined);setDeleting(null);setError('');setNotice('');fn();};if(editState.dirty){setLeaveAction(()=>proceed);return;}proceed();};
 const label=settingsGroups.flatMap(g=>g.items).find(i=>i.id===section)?.label||'通用';
 return <div className="settings-workspace" aria-label={t("设置工作区")}><SidebarProvider className="contents" keyboardShortcut={false}><Sidebar collapsible="none" className="settings-sidebar w-auto" role="complementary"><GlobalSidebarActions beforeNavigate={change}/><div className="settings-return"><Button ref={backRef} variant="outline" size="lg" onClick={()=>change(back)}><ArrowLeft size={16}/>{t("返回应用")}</Button></div><SidebarContent><nav aria-label={t("设置导航")}>{settingsGroups.map(group=><SidebarGroup key={group.name} className="p-0"><SidebarGroupLabel>{t(group.name)}</SidebarGroupLabel><SidebarMenu>{group.items.map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton isActive={section===item.id} className="settings-nav-item h-9" aria-current={section===item.id?'page':undefined} onClick={()=>{if(section!==item.id)change(()=>setSection(item.id));}}><item.icon/><span>{t(item.label)}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>)}</nav></SidebarContent></Sidebar></SidebarProvider><div className="settings-main"><header className="toolbar"><strong>{t(label)}</strong></header><main className="settings-content" key={section}>
 {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{notice&&<p role="status">{notice}</p>}
 {section==='general'&&<><h1>{t("舒服地，开始工作")}</h1><p className="page-description">{t("简单的设置，适合你的习惯。")}</p><p role="status" className="text-sm text-muted-foreground">{t(pending?'正在保存…':'更改自动保存并立即生效。')}</p>
 <section className="settings-group"><h2><Languages size={18}/>{t("语言")}</h2><div className="setting-row"><span>{t("界面语言")}<small>{t("不改变任务内容或模型回答语言。")}</small></span><NativeSelect aria-label={t("界面语言")} value={workspace.language||'zh-CN'} disabled={busy||pending} onChange={e=>void act(()=>save({language:e.target.value as Workspace['language']}))}><NativeSelectOption value="system">{t("跟随系统")}</NativeSelectOption><NativeSelectOption value="zh-CN">{t("简体中文")}</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></div></section>
 <section className="settings-group font-size-setting"><h2><Type size={18}/>{t('字体大小')}</h2><div className="setting-row"><span>{t('调整界面和阅读文字大小')}<small>{t('立即生效，不改变文档本身的格式。')}</small></span><Button variant="ghost" disabled={busy||pending||(workspace.fontScale||100)===100} onClick={()=>void act(()=>save({fontScale:100}))}>{t('恢复默认')}</Button></div><div className="font-size-control"><NativeSelect aria-label={t('字体大小')} value={workspace.fontScale||100} disabled={busy||pending} onChange={event=>void act(()=>save({fontScale:Number(event.target.value)}))}>{[90,100,110,120,130].map(scale=><NativeSelectOption key={scale} value={scale}>{scale}%{scale===100?' · '+t('默认'):''}</NativeSelectOption>)}</NativeSelect></div></section>
 <section className="settings-group"><h2><Monitor size={18}/>{t("外观")}</h2><p>{t("默认跟随系统，也可以选择你喜欢的模式。")}</p><div className="theme-options">{([{id:'system',label:'跟随系统',icon:Monitor},{id:'light',label:'浅色',icon:Sun},{id:'dark',label:'深色',icon:Moon}] as const).map(theme=><Button variant={workspace.theme===theme.id?'secondary':'outline'} key={theme.id} disabled={busy||pending} aria-pressed={workspace.theme===theme.id} className="h-auto min-h-20 flex-1 flex-col gap-2" onClick={()=>void act(()=>save({theme:theme.id}))}><theme.icon/><span>{t(theme.label)}</span></Button>)}</div></section>
 <section className="settings-group"><h2><ShieldCheck size={18}/>{t("数据与隐私")}</h2><div className="setting-row"><span><strong>{t("工作台数据")}</strong><small>{t("任务和设置保存在本机，服务密钥使用系统加密存储。")}</small></span><span className="badge green">{t("本地保存")}</span></div><div className="setting-row"><span><strong>{t("云端与模型调用")}</strong><small>{t("任务及所用上下文仅发送至该任务绑定的模型服务。")}</small></span></div></section>
 <section className="settings-group"><h2><Info size={18}/>{t("关于 Ambleloft")}</h2><p>{t("v0.2.1 · 桌面预览")}</p><p>{t("你的个人 AI 工作台。支持模型服务、多轮对话与执行审批。")}</p></section></>}
 {section==='notifications'&&<NotificationSettings/>}
 {section==='accounts'&&<AccountSettings onStateChange={onEditorState} onCancel={change}/>}
 {section==='conversations'&&<ArchivedConversations tasks={archived} projects={workspace.projects} restore={restore} remove={remove}/>}
 {section==='providers'&&<><div className="section-heading"><h1>{t("模型提供商")}</h1><Button variant="default" disabled={!window.desktop||pending} onClick={()=>change(()=>setEditor(null))}><Plus size={16}/>{t("添加服务")}</Button></div><p className="page-description">{t("连接多个模型服务。默认设置用于新任务，已有任务保留原来的服务和模型。")}</p>{editor!==undefined?<><Button variant="ghost" onClick={()=>change(()=>{})}>{t("返回服务列表")}</Button><ProviderSettings key={editor?.id||'new'} config={editor} onStateChange={onEditorState} onSaved={()=>{setEditState({dirty:false,busy:false});setNotice(t('配置已保存'));setEditor(undefined);setResult({});void act(refresh);}}/></>:<>{!catalog.providers.length&&<SettingsEmpty icon={<Cloud/>} title={t("尚未配置模型服务。")} description={!window.desktop?'请在桌面版中添加服务。':undefined}/>}{catalog.providers.map(provider=><SettingsCard key={provider.id} title={provider.name||provider.model}><div className="section-heading">{provider.id===catalog.defaultId&&<Badge variant="secondary">{t("默认服务")}</Badge>}</div><p className="provider-url">{provider.baseUrl}</p><p>{(provider.models||[provider.model]).join(' · ')}</p><small>{provider.hasKey?t("密钥已加密保存"):t("未设置密钥")}{t("· 默认模型：")}{provider.model}</small><div className="settings-actions"><Button variant="outline" onClick={()=>setEditor(provider)}>{t("编辑")}</Button><Button variant="outline" disabled={pending} onClick={()=>void act(async()=>{setResult(current=>({...current,[provider.id!]:''}));const response=await window.desktop!.testProvider(provider.id);setResult({...result,[provider.id!]:response.message});})}>{t("测试连接")}</Button>{provider.id!==catalog.defaultId&&<Button variant="ghost" disabled={pending} onClick={()=>void act(async()=>{await window.desktop!.setDefaultProvider(provider.id!);await refresh();})}>{t("设为默认")}</Button>}<Button variant="destructive" disabled={pending} onClick={()=>setDeleting(provider.id!)}>{t("删除服务")}</Button></div>{result[provider.id!]&&<p role="status">{result[provider.id!]}</p>}{deleting===provider.id&&<ManagementDialog title={t('删除服务')} busy={pending} close={()=>setDeleting(null)}><p>{t("删除此服务配置和已保存密钥？仍被任务引用的服务不能删除。")}</p><Button variant="outline" onClick={()=>setDeleting(null)}>{t("取消")}</Button><Button variant="destructive" disabled={pending} onClick={()=>void act(async()=>{await window.desktop!.removeProvider(provider.id!);await refresh();setDeleting(null);})}>{t("确认删除服务")}</Button></ManagementDialog>}</SettingsCard>)}</>}</>}
 {section==='plugins'&&<IntegrationPage kind="扩展">{(query,filter)=><ExtensionsPage query={query} filter={filter}/>}</IntegrationPage>}
 {section==='skills'&&<IntegrationPage kind="技能">{(query,filter)=><SkillManager initialSkillId={initialSkillId} query={query} filter={filter}/>}</IntegrationPage>}
 {section==='apps'&&<IntegrationPage kind="连接"/>}

 </main></div>{leaveAction&&<ManagementDialog title={t('放弃未保存的修改？')} busy={false} close={()=>setLeaveAction(null)}><p>{t('离开后，本次未保存的修改将丢失。')}</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setLeaveAction(null)}>{t('继续编辑')}</Button><Button variant="destructive" onClick={()=>{const proceed=leaveAction;setLeaveAction(null);proceed();}}>{t('放弃修改')}</Button></div></ManagementDialog>}</div>;
}
