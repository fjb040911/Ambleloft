import runtimeTranslations from '../core/catalog-store/curated-runtime.zh-CN.json';
import {storeTrialPrompt} from './store-trial-prompt';
import CatalogDetailsButton from './CatalogDetailsButton';
import CatalogTagFilters from './CatalogTagFilters';
import InstalledToolCard from './InstalledToolCard';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronDown,BookOpen,Check,FolderOpen,Package,RefreshCw,Search,Settings2,Sparkles,WandSparkles} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './components/ui/tabs';
import CatalogDetailDialog from './CatalogDetailDialog';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './components/ui/dialog';
import {Alert,AlertDescription} from './components/ui/alert';
import {InputGroup,InputGroupInput,InputGroupAddon} from './components/ui/input-group';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {WorkforceDirectoryEmpty} from './WorkforceDirectoryEmpty';
import {Skeleton} from './components/ui/skeleton';
import {Spinner} from './components/ui/spinner';
import {Textarea} from './components/ui/textarea';
import {useSkills,skillsChanged} from './skills';
import {useExtensions,extensionsChanged,openExtensionView} from './extensions';
import {CREATOR_ID,type CreationState} from './CreationGuide';
import LocalInstallMenu from './LocalInstallMenu';
import SkillManager from './SkillManager';
import ExtensionsPage from './ExtensionsPage';
import {t,useLanguage,formatDate} from './i18n';
import type {AgentRun,Project,StoreCategory,StoreListing} from './types';
import {ToggleGroup,ToggleGroupItem} from './components/ui/toggle-group';
import {useStoreCatalog} from './useStoreCatalog';
import LoadMore from './LoadMore';
import './skill-extension-center.css';

// Previously published skill listings used the English runtime note for both locales.
const runtimeChinese = new Map(Object.entries(runtimeTranslations));
function runtimeDescription(item:StoreListing,language:string){
 const {zh,en}=item.runtime;
 if(language==='en')return en;
 return zh===en ? runtimeChinese.get(en)??zh : zh;
}

export type CenterRequest={serial:number;tab?:'discover'|'installed'|'creations';kind?:'skill'|'extension';entityId?:string;listingId?:string;sourceId?:string;manage?:boolean;openError?:'STORE_UNTRUSTED_SOURCE'};
type UseRequest={title:string;prompt:string;skillId?:string;localOnly?:boolean};
const errorText=(error:unknown)=>{
 const message=error instanceof Error?error.message:String(error);const code=message.match(/STORE_[A-Z_]+/)?.[0];
 const labels:Record<string,string>={STORE_NOT_CONFIGURED:'尚未连接精选目录。已安装内容仍可管理和使用。',STORE_UNTRUSTED_SOURCE:'此链接来自尚未信任的目录，无法打开或安装。请向团队确认来源，并按测试文档配置可信目录。',STORE_DOWNLOAD_FAILED:'下载失败，请检查网络后重试。',STORE_CATALOG_EXPIRED:'目录已过期，请刷新后重试。',STORE_IDENTITY_CONFLICT:'已有同名内容。请先管理本机安装，避免覆盖已有工作。',STORE_INSTALL_BUSY:'此内容正在安装，请等待完成。',STORE_INSTALL_CANCELLED:'安装已取消，原有内容未改变。',STORE_DOWNLOAD_CANCELLED:'安装已取消，原有内容未改变。',STORE_RELEASE_UNAVAILABLE:'此发行版本已停止提供，请刷新目录。',STORE_HOST_VERSION_UNSUPPORTED:'当前应用版本不满足此内容的要求，请先更新应用。',STORE_PLATFORM_UNSUPPORTED:'此内容暂不支持当前系统或处理器。'};
 if(code)return t(labels[code]||'目录或安装包校验未通过，请刷新后重试。');
 if(/fetch failed|failed to fetch|networkerror|network request failed|ECONN|ENOTFOUND|ETIMEDOUT|ERR_CONNECTION|Download failed/i.test(message))return t('连接失败，请检查网络或测试服务连接后重试。');
 return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
};

function StoreProcessPreview({steps}:{steps:NonNullable<StoreListing['previewSteps']>}){
 const language=useLanguage();const [step,setStep]=useState('0');const text=(value:{zh:string;en:string})=>language==='en'?value.en:value.zh;
 return <section className="store-process-preview" aria-label={t('流程预览')}>
  <h3>{t('流程预览')}</h3>
  <Tabs value={step} onValueChange={value=>setStep(String(value))} className="gap-4">
   <TabsList variant="line" activateOnFocus aria-label={t('预览步骤')} className="store-preview-list" style={{gridTemplateColumns:`repeat(${Math.min(steps.length,3)},minmax(0,1fr))`}}>
    {steps.map((item,index)=><TabsTrigger key={index} value={String(index)} className="store-preview-step transition-none after:transition-none"><span aria-hidden="true">{index+1}.</span>{text(item.title)}</TabsTrigger>)}
   </TabsList>
   {steps.map((item,index)=><TabsContent key={index} value={String(index)}><p className="store-preview-description">{text(item.description)}</p></TabsContent>)}
  </Tabs>
 </section>;
}

export default function SkillExtensionCenter({projects,runs,request,onUse,onOpenTask,onAddProject,draftContext}:{draftContext?:{projectId:string;prompt:string};projects:Project[];runs:AgentRun[];request?:CenterRequest;onUse(projectId:string,prompt:string,skillId?:string):void;onOpenTask(id:string):void;onAddProject():void}){
 const lang=useLanguage();const local=(value:{zh:string;en:string}|undefined)=>value?(lang==='en'?value.en:value.zh):'';
 const {skills,systemSkills,error:skillError}=useSkills();const {snapshot:extensions,error:extensionError}=useExtensions();
 const api=window.desktop?.store;
 const [busy,setBusy]=useState<string|null>(null);
 const [noticeError,setNoticeError]=useState('');
 const [tab,setTab]=useState(request?.tab||'installed'),[query,setQuery]=useState(''),[kind,setKind]=useState('all');
 const [creationLimit,setCreationLimit]=useState(24);
 const creationCache=useRef(new Map<string,CreationState|null>());
 const [category,setCategory]=useState('');
 const [tag,setTag]=useState(''),[localLimit,setLocalLimit]=useState(24),[builtinLimit,setBuiltinLimit]=useState(24);
 const {catalog,loading,loadingMore,error,setError,pageError,reload,loadMore}=useStoreCatalog(api,{query:tab==='discover'?query:'',kind:tab==='discover'?kind:'all',category:tab==='discover'?category:'',tag:tab==='discover'?tag:''},tab==='discover');
 useEffect(()=>{setLocalLimit(24);setBuiltinLimit(24);if(tab!=='creations'){creationCache.current.clear();setCreationLimit(24);}},[query,kind,tab]);
 // Keep the filter buttons mounted and focused while a new page is being fetched.
 const [lastCategories,setLastCategories]=useState<{kind:string;items:StoreCategory[]}>({kind:'all',items:[]});
 const receivedCategories=catalog.pagination?.categories;
 useEffect(()=>{if(receivedCategories && !loading)setLastCategories({kind,items:receivedCategories});},[receivedCategories,loading,kind]);
 const categories=receivedCategories ?? (loading && lastCategories.kind===kind ? lastCategories.items : []);
 const chooseCategory=(id:string)=>{setCategory(id);setTag('');};
 const managementTrigger=useRef<string|null>(null);
 const closeManagement=()=>{setManagement(null);void reload();requestAnimationFrame(()=>{const row=Array.from(document.querySelectorAll<HTMLElement>('.store-installed-row')).find(row=>row.dataset.toolId===managementTrigger.current);(row?.querySelector<HTMLButtonElement>('button:not(:disabled)')||document.querySelector<HTMLInputElement>('.store-search input'))?.focus();});};
 const detailTrigger=useRef<HTMLElement|null>(null);
 const [selectedSource,setSelectedSource]=useState<string|undefined>();
 const [selected,setSelected]=useState<string|null>(null),[management,setManagement]=useState<{kind:'skill'|'extension';id?:string}|null>(null);
 const [useRequest,setUseRequest]=useState<UseRequest|null>(null),[projectId,setProjectId]=useState(''),[draft,setDraft]=useState('');
 const [creations,setCreations]=useState<CreationState[]>([]),[creationError,setCreationError]=useState(''),[creationLoading,setCreationLoading]=useState(false);
 const mounted=useRef(true),installing=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!request)return;detailTrigger.current=null;setNoticeError(request.openError||'');setTab(request.tab||(request.listingId||request.openError?'discover':'installed'));setManagement(request.manage&&request.kind&&request.entityId?{kind:request.kind,id:request.entityId}:null);setQuery('');setCategory('');setTag('');setKind(request.kind||'all');setSelectedSource(request.sourceId);setSelected(request.listingId||null);},[request?.serial]);
 const runIds=useMemo(()=>runs.filter(run=>!run.archivedAt).map(run=>run.id),[runs.map(run=>run.id+':'+Boolean(run.archivedAt)).join('|')]);
 useEffect(()=>{
  if(tab!=='creations'||!window.desktop?.creation)return;const creation=window.desktop.creation;let live=true,serial=0;
  const load=async()=>{const ticket=++serial;setCreationLoading(true);const found:CreationState[]=[];let failed=false;for(let i=0;i<Math.min(runIds.length,creationLimit);i+=8){const results=await Promise.allSettled(runIds.slice(i,Math.min(i+8,creationLimit)).map(async runId=>{if(creationCache.current.has(runId))return creationCache.current.get(runId);const result=await creation.read({runId});if(live&&ticket===serial)creationCache.current.set(runId,result);return result;}));if(!live||ticket!==serial)return;for(const result of results){if(result.status==='fulfilled'&&result.value)found.push(result.value);else if(result.status==='rejected')failed=true;}}if(live&&ticket===serial){setCreations(found);setCreationError(failed?t('部分创建进度读取失败，请重新打开此页面重试。'):'');setCreationLoading(false);}};
  void load();const off=creation.onChanged(()=>{creationCache.current.clear();void load();});return()=>{live=false;off();};
 },[tab,runIds,lang,creationLimit]);
 const prepareUse=(input:UseRequest)=>{const next={...input,localOnly:input.localOnly||!input.skillId||catalog.installed.some(item=>item.kind==='skill'&&item.entityId===input.skillId)};setSelected(null);setUseRequest(next);setDraft(draftContext?.prompt.trim()?(draftContext.prompt.includes(next.prompt)?draftContext.prompt:draftContext.prompt+'\n\n'+next.prompt):next.prompt);setProjectId(projects.find(project=>project.id===draftContext?.projectId&&(!next.localOnly||project.type!=='ssh'))?.id||projects.find(project=>!next.localOnly||project.type!=='ssh')?.id||'');};
 const creator=skills.find(skill=>skill.id===CREATOR_ID);
 const create=()=>{if(!creator?.enabled){openManaged('skill',CREATOR_ID);return;}prepareUse({title:t('用技能大师创建'),skillId:CREATOR_ID,localOnly:true,prompt:t('请用技能大师引导我创建并安装一个技能或扩展。先了解我想解决的问题，再逐步给出建议、生成和验证；需要接入工具、系统或设备时，请推荐合适的扩展方式。')});};
 const mapping=(item:StoreListing)=>catalog.installed.find(installed=>installed.listingId===item.id&&installed.sourceId===catalog.source?.id);
 const installed=(item:StoreListing)=>{const entry=mapping(item);return entry&&(entry.kind==='skill'?skills.some(skill=>skill.id===entry.entityId):extensions.installed.some(extension=>extension.manifest.id===entry.entityId))?entry:undefined;};
 const openManaged=(type:'skill'|'extension',id?:string)=>{managementTrigger.current=type+':'+id;setSelected(null);setManagement({kind:type,id});setTab('installed');};
 const upgradeDigest=(item:StoreListing)=>{
  const active=item.kind==='extension'&&extensions.installed.find(extension=>extension.manifest.id===item.entityName)?.active;
  return active&&item.upgradeFromDigests?.includes(active)?active:undefined;
 };
 const install=async(item:StoreListing)=>{
  if(!api||!catalog.source||installing.current)return;installing.current=true;setBusy(item.id);setError('');
  try{const result=await api.install({listingId:item.id,sourceId:catalog.source.id,upgradeFromDigest:upgradeDigest(item)});if(result.cancelled)return;skillsChanged();extensionsChanged();await reload();if(mounted.current){setSelected(null);setTab('installed');if(result.kind==='extension')setManagement({kind:'extension',id:result.entityId});}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{installing.current=false;if(mounted.current)setBusy(null);}
 };
 const cancel=async(id:string)=>{try{await api?.cancel({listingId:id});}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const terms=query.trim().toLocaleLowerCase();
 const matches=(name:string,description:string,type:string)=>(kind==='all'||kind===type)&&(!terms||(name+' '+description).toLocaleLowerCase().includes(terms));
 const visible=catalog.items;
 const filtered=!!(terms||kind!=='all'||category||tag),clear=()=>{setQuery('');setKind('all');setCategory('');setTag('');};
 const visibleSkills=skills.filter(skill=>!skill.builtIn&&matches(skill.displayName||skill.name,skill.displayDescription||skill.description,'skill'));
 const visibleBuiltins=[...skills.filter(skill=>skill.builtIn),...systemSkills].filter(skill=>matches(skill.displayName||skill.name,skill.displayDescription||skill.description,'skill'));
 const visibleExtensions=extensions.installed.filter(item=>matches(item.manifest.name,item.manifest.description||'','extension'));
 const [fetchedDetail,setFetchedDetail]=useState<StoreListing|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(''),[detailRetry,setDetailRetry]=useState(0);
 useEffect(()=>{setFetchedDetail(null);setDetailError('');if(!selected||!api)return;let live=true;setDetailLoading(true);void api.catalog({detailId:selected}).then(result=>{if(live)setFetchedDetail(result.source?.id===selectedSource||!selectedSource?result.items.find(item=>item.id===selected)||null:null);}).catch(e=>{if(live)setDetailError(errorText(e));}).finally(()=>{if(live)setDetailLoading(false);});return()=>{live=false;};},[api,selected,selectedSource,detailRetry]);
 const detail=(fetchedDetail?.id===selected?fetchedDetail:null)||catalog.items.find(item=>item.id===selected&&(!selectedSource||selectedSource===catalog.source?.id));
 const detailInstalled=detail&&installed(detail);
 const detailUsable=detailInstalled&&(detailInstalled.kind==='skill'?skills.some(skill=>skill.id===detailInstalled.entityId&&skill.enabled):extensions.installed.some(item=>item.manifest.id===detailInstalled.entityId&&item.enabled&&item.trusted!==false));
 const promptFor=(kind:'skill'|'extension',id:string,name:string,listing?:StoreListing,sourceId?:string)=>{
  const text=listing?storeTrialPrompt(listing,sourceId,lang):t('请使用')+' '+name+' '+t('帮助我完成任务。先确认目标，再开始。');
  return kind==='extension'?t('使用扩展')+'「'+name+'」('+id+')\n'+text:text;
 };
 const useInstalled=async(type:'skill'|'extension',id:string,name:string)=>{
  const mapping=catalog.installed.find(item=>item.kind===type&&item.entityId===id);
  try{
   const result=mapping&&api?await api.catalog({detailId:mapping.listingId}):null;
   const listing=result?.source?.id===mapping?.sourceId?result?.items.find(item=>item.id===mapping?.listingId):undefined;
   const cached=mapping?.sourceId===catalog.source?.id?catalog.items.find(item=>item.id===mapping?.listingId):undefined;
   prepareUse({title:name,skillId:type==='skill'?id:undefined,prompt:promptFor(type,id,name,listing??cached,mapping?.sourceId)});
  }catch(e){setNoticeError(errorText(e));}
 };
 const sourceError=catalog.error?errorText(catalog.error):'';
 const empty=(title:string,description?:string)=><WorkforceDirectoryEmpty Icon={Package} title={title} description={description}/>;
 const statusFor=(item:typeof extensions.installed[number])=>!item.enabled?'已停用':!item.trusted&&item.kind==='package'?'待信任':item.diagnostic||item.runtime?.state==='failed'?'运行异常':'已启用';
 const inspect=(item:StoreListing,trigger:HTMLElement)=>{detailTrigger.current=trigger;setError('');setNoticeError('');setSelectedSource(catalog.source?.id);setSelected(item.id);};
 const isInstalling=(item:StoreListing)=>busy===item.id||catalog.busy.includes(item.id);
 const addButton=(item:StoreListing,compact=false)=>{
  const added=!!installed(item),upgradable=!!upgradeDigest(item),working=isInstalling(item);
  const label=working?t('添加中'):upgradable?(lang==='en'?'Update':'更新'):added?t('已安装'):t('添加');
  return <Button size={compact?'sm':'default'} className={compact?'rounded-full min-h-9':undefined}
    disabled={(added&&!upgradable)||working||!api||!catalog.source||catalog.stale||!!busy||item.release.status!=='published'}
    aria-label={label+(lang==='en'?': ':'：')+local(item.title)} onClick={()=>void install(item)}>
    {working&&<Spinner data-icon="inline-start"/>}{label}{!compact&&!working&&<ArrowRight data-icon="inline-end"/>}
  </Button>;
 };
 const listCard=(item:StoreListing)=><Card key={item.id} className="store-card"><div className="store-card-banner" data-tone={item.kind==='skill'?'lilac':'mint'}>{item.kind==='skill'?<BookOpen aria-hidden="true"/>:<Package aria-hidden="true"/>}<CardTitle><button type="button" onClick={event=>inspect(item,event.currentTarget)}>{local(item.title)}</button></CardTitle><Badge variant="outline">{t(item.kind==='skill'?'技能':'扩展')}</Badge></div><CardHeader><CardDescription>{local(item.summary)}</CardDescription></CardHeader><CardContent><div className="store-card-tags" aria-label={t('分类与标签')}>{item.categories?.map(entry=><Button key={entry.id} variant="secondary" size="sm" aria-pressed={category===entry.id} onClick={()=>chooseCategory(category===entry.id?'':entry.id)}>{local(entry.title)}</Button>)}{!item.categories?.length && item.tags.slice(0,3).map(label=><Button variant="outline" size="sm" aria-pressed={tag===label} key={label} onClick={()=>setTag(tag===label?'':label)}>{label}</Button>)}</div><p className="store-publisher">{item.publisher} · {item.release.version}</p></CardContent><CardFooter><span className="store-state">{installed(item)?t('已安装'):item.release.status==='published'?t('精选目录'):t(item.release.status==='yanked'?'已停止分发':'风险公告')}</span><div className="ml-auto flex flex-wrap items-center gap-2"><CatalogDetailsButton title={local(item.title)} onClick={event=>inspect(item,event.currentTarget)}/>{addButton(item,true)}</div></CardFooter></Card>;
 return <section className="skill-extension-center" aria-label={t('技能与扩展')}>
  <header className="store-heading"><div><h1>{t('技能与扩展')}</h1><p>{t('管理已安装的工具，发现新能力，或创建自己的工具。')}</p></div>{!management&&<div className="store-heading-actions"><LocalInstallMenu onError={setNoticeError}/>{!(tab==='discover'&&!filtered)&&<Button disabled={!window.desktop?.creation||!creator} onClick={create}><WandSparkles data-icon="inline-start"/>{t('创建技能 / 扩展')}</Button>}</div>}</header>
  {management?.kind==='extension'&&management.id?<ExtensionsPage key={management.id} initialId={management.id} mode="detail" onClose={closeManagement}/>:<Tabs value={tab} onValueChange={value=>{setTab(String(value) as typeof tab);setQuery('');setKind('all');setCategory('');setTag('');}} className="gap-6">
   <TabsList variant="line" aria-label={t('技能与扩展')}><TabsTrigger className="transition-none after:transition-none" value="installed">{t('已安装')} <span>{skills.length+systemSkills.length+extensions.installed.length}</span></TabsTrigger><TabsTrigger className="transition-none after:transition-none" value="discover">{t('发现')}</TabsTrigger><TabsTrigger className="transition-none after:transition-none" value="creations">{t('我的创作')}</TabsTrigger></TabsList>
   {!api&&<Alert><AlertDescription>{t('请在桌面应用中浏览精选目录、安装和使用技能与扩展。浏览器预览不会执行安装。')}</AlertDescription></Alert>}
   {noticeError&&<Alert variant="destructive"><AlertDescription>{errorText(noticeError)}<Button variant="ghost" size="sm" onClick={()=>setNoticeError('')}>{t('关闭提示')}</Button></AlertDescription></Alert>}
   {(error||skillError||extensionError)&&<Alert variant="destructive"><AlertDescription>{errorText(error||skillError||extensionError)}{error&&<Button variant="outline" size="sm" disabled={loading} onClick={()=>void reload(true)}>{t('重试')}</Button>}</AlertDescription></Alert>}
    {tab==='discover'&&!filtered&&<section className="store-feature"><div><span className="store-eyebrow">{t('从一个真实需求开始')}</span><h2>{t('让现有软件，拥有新的交互入口。')}</h2><p>{t('用技能组织方法和表单，用扩展连接系统、工具与设备。通过对话，把事情做完。')}</p><Button variant="default" disabled={!window.desktop?.creation||!creator} onClick={create}>{t('描述你想做的事')}<ArrowRight data-icon="inline-end"/></Button></div><div className="store-feature-flow" aria-label={t('从需求到使用')}><span><BookOpen aria-hidden="true"/>{t('说明目标')}</span><ArrowRight aria-hidden="true"/><span><Settings2 aria-hidden="true"/>{t('生成并配置')}</span><ArrowRight aria-hidden="true"/><span><Check aria-hidden="true"/>{t('在对话中使用')}</span></div></section>}
   {(tab==='discover'||tab==='installed')&&<div className="store-tools"><InputGroup className="store-search"><InputGroupInput type="search" aria-label={t('搜索技能与扩展')} placeholder={t('搜索用途、名称或关键词')} maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/><InputGroupAddon><Search aria-hidden="true"/></InputGroupAddon></InputGroup><ToggleGroup variant="outline" size="sm" className="store-types" aria-label={t('类型')} value={[kind]} onValueChange={values=>{setKind(String(values[0]||'all'));chooseCategory('');}}>{['all','skill','extension'].map(value=><ToggleGroupItem key={value} value={value}>{t(value==='all'?'全部类型':value==='skill'?'技能':'扩展')}</ToggleGroupItem>)}</ToggleGroup>{tab==='discover'&&<Button variant="ghost" size="icon" aria-label={t('刷新目录')} disabled={!api||loading} onClick={()=>void reload(true)}>{loading?<Spinner/>:<RefreshCw/>}</Button>}</div>}
   <TabsContent value="discover" className="store-tab-content">

    <p className="store-footnote">{t('浏览精选工具，查看用途和使用条件。安装后统一在“已安装”中管理。')}</p>
    {!!categories.length && <ToggleGroup className="store-categories" variant="outline" size="sm" aria-label={t('按用途分类筛选')} value={[category||'all']} onValueChange={values=>chooseCategory(values[0]==='all'?'':String(values[0]||''))}>
      <ToggleGroupItem value="all">{t('全部分类')}</ToggleGroupItem>
      {categories.map(entry=><ToggleGroupItem key={entry.id} value={entry.id}>{local(entry.title)}</ToggleGroupItem>)}
    </ToggleGroup>}
    {!!catalog.pagination?.tags.length && <details className="store-keywords"><summary>{t('按标签筛选')}</summary><CatalogTagFilters tags={(catalog.pagination?.tags||[]).map(item=>({id:item.label,...item}))} value={tag} onChange={setTag}/></details>}
    <div className="store-results"><span role="status">{loading?t('正在加载…'):t('已显示 {count} 项，共 {total} 项').replace('{count}',String(visible.length)).replace('{total}',String(catalog.pagination?.total??visible.length))}</span>{tag&&<Button size="sm" variant="secondary" onClick={()=>setTag('')}>{tag} ×</Button>}{filtered&&<Button size="sm" variant="ghost" onClick={clear}>{t('清除筛选')}</Button>}</div>
    {(sourceError||(catalog.source&&catalog.stale))&&<Alert><AlertDescription>
     {sourceError&&<span>{sourceError}</span>}
     {catalog.stale&&(catalog.items.length>0||!sourceError)&&<span>{t('正在显示上次保存的目录。刷新并验证后才能安装。')}</span>}
     {catalog.source&&<Button variant="outline" size="sm" className="justify-self-start" disabled={loading} onClick={()=>void reload(true)}>{t('重试')}</Button>}
    </AlertDescription></Alert>}
    {loading&&!catalog.items.length?<div className="store-grid" role="status" aria-label={t('正在加载…')}>{[0,1].map(key=><Skeleton key={key} className="h-60 w-full"/>)}</div>:visible.length?<div className="store-grid">{visible.map(listCard)}</div>:empty(t(filtered?'没有匹配的内容':api&&!catalog.source?'未连接精选目录':'精选内容即将出现在这里'),filtered?t('试试其他关键词，或清除筛选条件。'):api&&!catalog.source?undefined:t('连接精选目录后，可在这里查看团队审核的技能与扩展。'))}
    <LoadMore hasMore={!!catalog.pagination?.nextCursor} loading={loading||loadingMore} error={pageError} onLoad={()=>void loadMore()} onRestart={()=>void reload()}/>
    {catalog.source&&<p className="store-footnote">{t('目录来源')}：{catalog.source.title} · {t('按发行版本审核')}</p>}
   </TabsContent>
   <TabsContent value="installed" className="store-tab-content">
    <p className="store-footnote">{t('在这里使用工具、修改设置和管理权限。聊天中输入 $ 可快速选择已启用的工具。')}</p>

    {(!!visibleSkills.length||!!visibleExtensions.length)&&<div className="store-results"><span role="status">{t('已显示 {count} 项，共 {total} 项').replace('{count}',String(Math.min(localLimit,visibleSkills.length+visibleExtensions.length))).replace('{total}',String(visibleSkills.length+visibleExtensions.length))}</span>{terms||kind!=='all'?<Button variant="ghost" size="sm" onClick={clear}>{t('清除筛选')}</Button>:null}</div>}
    {(!!visibleSkills.length||!!visibleExtensions.length)&&<h2>{t('已安装的技能与扩展')}</h2>}
    <div className="store-installed-list">
     {visibleSkills.slice(0,localLimit).map(skill=><InstalledToolCard id={'skill:'+skill.id} key={'skill:'+skill.id} Icon={BookOpen} title={skill.displayName||skill.name} description={skill.displayDescription||skill.description} onDetails={()=>openManaged('skill',skill.id)} metadata={<><Badge variant="outline">{t('技能')}</Badge><span>{t(skill.builtIn?'应用内置':'本机安装')}</span><span>{t(skill.enabled?'已启用':'已停用')}</span></>}><Button variant="ghost" size="icon" aria-label={t('管理')+' '+(skill.displayName||skill.name)} onClick={()=>openManaged('skill',skill.id)}><Settings2/></Button><Button variant="outline" disabled={!skill.enabled} onClick={()=>skill.id===CREATOR_ID?create():void useInstalled('skill',skill.id,skill.displayName||skill.name)}>{t('在聊天中使用')}<ArrowRight data-icon="inline-end"/></Button></InstalledToolCard>)}
     {visibleExtensions.slice(0,Math.max(0,localLimit-visibleSkills.length)).map(item=><InstalledToolCard id={'extension:'+item.manifest.id} key={'extension:'+item.manifest.id} Icon={Package} title={item.manifest.name} description={item.manifest.description} onDetails={()=>openManaged('extension',item.manifest.id)} metadata={<><Badge variant="outline">{t('扩展')}</Badge><span>{item.manifest.version}</span><span>{t(statusFor(item))}</span></>}>{item.enabled&&!item.diagnostic&&(item.trusted||item.kind!=='package')&&<Button variant="ghost" size="icon" aria-label={t('管理')+' '+item.manifest.name} onClick={()=>openManaged('extension',item.manifest.id)}><Settings2/></Button>}{!item.enabled||item.diagnostic||!item.trusted&&item.kind==='package'?<Button variant="outline" onClick={()=>openManaged('extension',item.manifest.id)}>{t('设置与权限')}<ArrowRight data-icon="inline-end"/></Button>:item.home?<Button variant="outline" onClick={()=>openExtensionView(item.manifest.id)}>{t('打开扩展')}<ArrowRight data-icon="inline-end"/></Button>:<Button variant="outline" onClick={()=>void useInstalled('extension',item.manifest.id,item.manifest.name)}>{t('在聊天中使用')}<ArrowRight data-icon="inline-end"/></Button>}</InstalledToolCard>)}
    </div>{!visibleSkills.length&&!visibleExtensions.length&&!visibleBuiltins.length&&empty(t('没有匹配的已安装内容'),t('在发现中选择工具，或导入你自己的技能与扩展。'))}
    <LoadMore hasMore={localLimit<visibleSkills.length+visibleExtensions.length} onLoad={()=>setLocalLimit(value=>value+24)}/>
    {!!visibleBuiltins.length&&<Collapsible key={terms?'search':'browse'} defaultOpen={!!terms}><CollapsibleTrigger render={<Button variant="ghost" className="group"/>}>{t('系统内置')} · {visibleBuiltins.length}<ChevronDown data-icon="inline-end" className="group-data-panel-open:rotate-180"/></CollapsibleTrigger><CollapsibleContent><section aria-label={t('系统内置')} className="flex flex-col gap-3"><p className="store-footnote">{t('随应用提供，无需安装；在对应场景自动使用。')}</p><div className="store-installed-list">{visibleBuiltins.slice(0,builtinLimit).map(skill=><InstalledToolCard id={'skill:'+skill.id} key={skill.id} Icon={BookOpen} title={skill.displayName||skill.name} description={skill.displayDescription||skill.description} onDetails={()=>openManaged('skill',skill.id)} metadata={<><Badge variant="outline">{t('内置 · 只读')}</Badge><span>{t(skill.builtIn?.hostManaged?'空间讨论与任务创建':skill.builtIn?.key==='skill-master'?'技能与扩展创建':'聊天中的信息补充')}</span><span>{t(skill.enabled?'已启用':'已停用')}</span></>}><Button variant="outline" aria-label={t('查看详情')+' '+(skill.displayName||skill.name)} onClick={()=>openManaged('skill',skill.id)}>{t('查看详情')}</Button></InstalledToolCard>)}<LoadMore hasMore={builtinLimit<visibleBuiltins.length} onLoad={()=>setBuiltinLimit(value=>value+24)}/></div></section></CollapsibleContent></Collapsible>}
   </TabsContent>
   <TabsContent value="creations" className="store-tab-content"><section className="store-create-banner"><WandSparkles aria-hidden="true"/><div><h2>{t('从想法到自己的工具')}</h2><p>{t('告诉技能大师你的需求，提供接口或工具文档，一起生成、验证、安装和试用。')}</p><small>{t('当前请在本地项目创建。远端产物需导入本机后安装。')}</small></div></section>{creationError&&<Alert variant="destructive"><AlertDescription>{creationError}</AlertDescription></Alert>}{creationLoading?<Skeleton className="h-24 w-full"/>:creations.length?<div className="store-installed-list">{creations.map(item=><InstalledToolCard key={item.runId} Icon={FolderOpen} title={item.title||t('创建技能 / 扩展')} description={item.nextStep||item.summary} metadata={<><Badge variant="outline">{t(item.kind==='skill'?'技能':'扩展')}</Badge><span>{t(item.trial==='confirmed'?'已试用确认':({brief:'了解需求',building:'生成与验证',ready:'文件已检查，待安装',installed:'已安装，待试用'}[item.stage]))}</span></>}><Button variant="outline" onClick={()=>onOpenTask(item.runId)}>{t('回到创建任务')}<ArrowRight data-icon="inline-end"/></Button></InstalledToolCard>)}</div>:empty(t('还没有创建记录'),t('从一个本地项目开始，由技能大师逐步协助你完成。'))}<LoadMore hasMore={creationLimit<runIds.length} loading={creationLoading} error={creationError} onLoad={()=>setCreationLimit(value=>value+24)}/></TabsContent>
  </Tabs>}
  {management?.kind==='skill'&&management.id&&<SkillManager key={management.id} initialSkillId={management.id} mode="detail" onClose={closeManagement}/>}
  {selected&&<CatalogDetailDialog
   title={detail?local(detail.title):t(detailLoading?'正在加载…':'目录条目')}
   description={detail?local(detail.summary):detailLoading?t('正在加载…'):detailError||t('当前可信目录中没有此条目。请刷新目录，或确认链接来源。')}
   onClose={()=>setSelected(null)} returnFocus={useRequest||management?false:detailTrigger.current}
   actions={detail?<>{isInstalling(detail)&&<Button variant="outline" onClick={()=>void cancel(detail.id)}>{t('取消')}</Button>}
    {detailInstalled&&!upgradeDigest(detail)?<><Button variant="outline" onClick={()=>openManaged(detailInstalled.kind,detailInstalled.entityId)}>{t('管理已安装内容')}</Button><Button disabled={!detailUsable} onClick={()=>prepareUse({title:local(detail.title),prompt:promptFor(detailInstalled.kind,detailInstalled.entityId,local(detail.title),detail,detailInstalled.sourceId),skillId:detailInstalled.kind==='skill'?detailInstalled.entityId:undefined})}>{t('准备试用')}<ArrowRight data-icon="inline-end"/></Button></>:addButton(detail)}</>
    :<Button variant="outline" disabled={!api||loading||detailLoading} onClick={()=>void reload(true).then(()=>setDetailRetry(value=>value+1))}>{t('刷新目录')}</Button>}>
   {detail&&<>
    <div className="wf-role-tags">{[t(detail.kind==='skill'?'技能':'扩展'),...(detail.categories||[]).map(entry=>local(entry.title)),...detail.tags].map((label,index)=><Badge variant="outline" key={index}>{label}</Badge>)}</div>
    {error&&<Alert variant="destructive"><AlertDescription>{errorText(error)}</AlertDescription></Alert>}
    <dl className="wf-role-definition">
     {[[t('用途'),local(detail.description)],[t('从这句话开始'),storeTrialPrompt(detail,selectedSource||catalog.source?.id,lang)],[t('运行环境与要求'),runtimeDescription(detail,lang)],[t('使用前准备'),local(detail.setup)],[t('许可'),detail.license],[t('来源'),detail.publisher+' · '+detail.release.version]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {!!detail.previewSteps?.length&&<StoreProcessPreview key={detail.id} steps={detail.previewSteps}/>}
    {detailInstalled?.locallyModified&&<Alert><AlertDescription>{t('此技能有本地修改。当前版本将保留，不会被目录内容覆盖。')}</AlertDescription></Alert>}{detail.release.status!=='published'&&<Alert variant="destructive"><AlertDescription>{t(detail.release.status==='revoked'?'此发行版本有风险公告，已停止新安装。请查看发行说明。':'此发行版本已停止分发。已安装内容不会自动删除。')}</AlertDescription></Alert>}
    <details className="store-release-details"><summary>{t('版本与审核记录')}</summary><p>{local(detail.release.changelog)}</p><dl><dt>{t('审核')}</dt><dd>{detail.release.reviewedBy} · {formatDate(detail.release.reviewedAt)}</dd><dt>{t('来源')}</dt><dd>{catalog.source?.title}</dd><dt>SHA-256</dt><dd><code>{detail.release.artifactSha256}</code></dd></dl></details>
    <p className="store-footnote">{t(detail.kind==='extension'?'扩展可运行本机代码。安装前请核对来源、用途与权限。':'安装后可在聊天中选择使用；不会自动发送消息。')}</p>
   </>}
  </CatalogDetailDialog>}

  <Dialog open={!!useRequest} onOpenChange={open=>{if(!open)setUseRequest(null);}}><DialogContent className="store-use-dialog"><DialogHeader><DialogTitle>{useRequest?.title}</DialogTitle><DialogDescription>{t('选择项目，将引导填入聊天输入框。你确认发送后才会开始。')}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="store-use-project">{t('项目')}</FieldLabel><NativeSelect id="store-use-project" value={projectId} onChange={e=>setProjectId(e.target.value)}><NativeSelectOption value="" disabled>{t('请选择项目')}</NativeSelectOption>{projects.filter(project=>!useRequest?.localOnly||project.type!=='ssh').map(project=><NativeSelectOption value={project.id} key={project.id}>{project.name}{project.type==='ssh'?' · SSH':''}</NativeSelectOption>)}</NativeSelect>{useRequest?.localOnly&&<FieldDescription>{t('当前仅支持在本地项目中使用。远端项目暂不可选。')}</FieldDescription>}</Field><Field><FieldLabel htmlFor="store-use-prompt">{t('聊天引导')}</FieldLabel><Textarea id="store-use-prompt" rows={5} value={draft} onChange={e=>setDraft(e.target.value)}/></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={()=>{setUseRequest(null);onAddProject();}}>{t('新建项目')}</Button><Button disabled={!projectId||!draft.trim()||!window.desktop} onClick={()=>{if(useRequest){onUse(projectId,draft.trim(),useRequest.skillId);setUseRequest(null);}}}>{t('填入聊天输入框')}<ArrowRight data-icon="inline-end"/></Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
