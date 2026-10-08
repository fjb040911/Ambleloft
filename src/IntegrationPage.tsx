import {createContext,useState,type ReactNode} from 'react';
import {Compass,ChevronRight} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Input} from './components/ui/input';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './components/ui/tabs';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {cn} from 'cn';
import {t} from './i18n';
import './integrations.css';
export const IntegrationActionsContext=createContext<HTMLDivElement|null>(null);
export type IntegrationFilter='all'|'enabled'|'disabled';
export function IntegrationEmpty({title,description}:{title:string;description:string}) {
 return <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Compass/></EmptyMedia><EmptyTitle>{t(title)}</EmptyTitle><EmptyDescription>{t(description)}</EmptyDescription></EmptyHeader></Empty>;
}
export function IntegrationEntry({name,description,meta,enabled,icon,onClick,disabled,className}:{name:string;description?:string;meta:string;enabled:boolean;icon:ReactNode;onClick():void;disabled?:boolean;className?:string}) {
 return <Button variant="ghost" className={cn('integration-entry h-auto w-full justify-start gap-4 p-4 whitespace-normal',className)} onClick={onClick} disabled={disabled}>
  <span className="integration-entry-icon" aria-hidden="true">{icon}</span><span className="integration-entry-copy"><strong>{name}</strong><span className="integration-entry-description">{description}</span><span className="integration-entry-meta">{meta}</span></span>
  <Badge className="integration-entry-status" variant={enabled?'secondary':'outline'}>{t(enabled?'已启用':'已停用')}</Badge><ChevronRight aria-hidden="true"/>
 </Button>;
}
export default function IntegrationPage({kind,children}:{kind:'连接'|'扩展'|'技能';children?:(query:string,filter:IntegrationFilter)=>ReactNode}) {
 const [actions,setActions]=useState<HTMLDivElement|null>(null);
 const [tab,setTab]=useState('installed');
 const [query,setQuery]=useState('');const [filter,setFilter]=useState<IntegrationFilter>('all');
 return <section className={cn('integration-page',kind==='扩展'&&'integration-extensions')}>
  <header className="integration-heading"><div><h1>{t(kind)}</h1><p>{t(kind==='扩展'?'管理扩展、配置和项目访问权限。':kind==='技能'?'启用后可按任务自动使用；任务中选择可指定本次使用。':'管理你的工具，让工作更顺手。')}</p></div><div ref={setActions} className="integration-actions" hidden={tab!=='installed'}/></header>
  <Tabs value={tab} onValueChange={value=>setTab(String(value))} className="gap-5">
   <div className="integration-tab-row"><TabsList activateOnFocus variant="line" aria-label={t(kind)}><TabsTrigger value="installed" className="transition-none after:transition-none">{t('已安装')}</TabsTrigger><TabsTrigger value="market" className="transition-none after:transition-none">{t(kind+'市场')}</TabsTrigger></TabsList></div>
   {tab==='installed'&&<div className="integration-tools"><Input type="search" className="min-w-0 flex-1" aria-label={t('搜索'+kind)} placeholder={t('搜索名称或描述')} value={query} onChange={e=>setQuery(e.target.value)}/><NativeSelect aria-label={t('过滤'+kind)} value={filter} onChange={e=>setFilter(e.target.value as IntegrationFilter)}><NativeSelectOption value="all">{t('全部状态')}</NativeSelectOption><NativeSelectOption value="enabled">{t('已启用')}</NativeSelectOption><NativeSelectOption value="disabled">{t('已停用')}</NativeSelectOption></NativeSelect>{(query||filter!=='all')&&<Button variant="ghost" onClick={()=>{setQuery('');setFilter('all');}}>{t('清除筛选')}</Button>}</div>}
   <IntegrationActionsContext.Provider value={actions}>
    <TabsContent value="installed" keepMounted hidden={tab!=='installed'}>{children?children(query,filter):<IntegrationEmpty title="连接功能即将开放" description="未来可在这里连接常用应用，并管理访问权限。当前尚未接入连接服务。"/>}</TabsContent>
    <TabsContent value="market" hidden={tab!=='market'}><IntegrationEmpty title={kind+'市场即将开放'} description="这里将汇集更多可安装的工具。当前暂无市场内容。"/></TabsContent>
   </IntegrationActionsContext.Provider>
  </Tabs>
 </section>;
}
