import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription,EmptyContent} from './components/ui/empty';
import {Spinner} from './components/ui/spinner';
import {Separator} from './components/ui/separator';
import {Button} from './components/ui/button';
import {Kbd,KbdGroup} from './components/ui/kbd';
import {Alert,AlertDescription,AlertAction} from './components/ui/alert';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './components/ui/tabs';
import {useSkills} from './skills';
import {Fragment,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Search,BookOpen,Folder,FileText,Puzzle,Plus,Settings,FolderPlus} from 'lucide-react';
import {Command,CommandDialog,CommandShortcut,CommandInput,CommandList,CommandGroup,CommandItem,CommandEmpty,CommandSeparator} from './components/ui/command';
import {t} from './i18n';
import type {SearchResult} from './types';
import './workspace-search.css';
const categoryLabels={task:'任务',project:'项目',extension:'扩展',skill:'技能'};
export type SearchAction='new-task'|'new-project'|'settings'|'extensions';
const actions=[{id:'new-task' as const,title:'新建任务',keywords:'new task chat',Icon:Plus},{id:'new-project' as const,title:'创建项目',keywords:'new create project',Icon:FolderPlus},{id:'settings' as const,title:'设置',keywords:'settings preferences',Icon:Settings},{id:'extensions' as const,title:'管理扩展',keywords:'extensions plugins',Icon:Puzzle}];
export default function WorkspaceSearch({close,open,fallback,onAction}:{close():void;open(item:SearchResult):void;fallback:SearchResult[];onAction(action:SearchAction):void}){
 const highlight=(text:string)=>{
  const words=query.trim().split(/\s+/).filter(Boolean);if(!words.length)return text;
  const escaped=words.map(word=>word.split('').map(char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).join(''));
  const expression=new RegExp('('+escaped.join('|')+')','gi');
  return text.split(expression).map((part,index)=>index%2?<mark className="rounded-sm bg-accent text-accent-foreground" key={index}>{part}</mark>:part);
 };
 const [category,setCategory]=useState<SearchResult['kind']|'action'>('task');
 const {skills}=useSkills();
 const [query,setQuery]=useState('');
 const [items,setItems]=useState<SearchResult[]>([]),[total,setTotal]=useState(0),[next,setNext]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);const input=useRef<HTMLInputElement>(null);
 const fallbackRef=useRef(fallback);fallbackRef.current=[...fallback,...skills.map(s=>({id:s.id,kind:'skill' as const,title:s.name,snippet:s.description,date:s.updatedAt}))];
 const load=async(cursor?:string,version=generation.current)=>{
  setBusy(true);setError('');
  try{
   let result;
   if(category==='action')result={items:[],total:0,next:null};
   else if(category==='skill'&&window.desktop?.skills){
    const records=await window.desktop.skills.list();
    const words=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const found=records.filter(skill=>words.every(word=>(skill.name+' '+skill.description).normalize('NFKC').toLocaleLowerCase().includes(word))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const offset=Number(cursor||0);
    result={items:found.slice(offset,offset+20).map(skill=>({id:skill.id,kind:'skill' as const,title:skill.name,snippet:skill.description,date:skill.updatedAt})),total:found.length,next:offset+20<found.length?String(offset+20):null};
   }
   else if(window.desktop?.searchWorkspace)result=await window.desktop.searchWorkspace({query,kind:category,cursor});
   else{
    const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const found=fallbackRef.current.filter(i=>i.kind===category&&words.every(w=>(i.title+' '+i.snippet).toLocaleLowerCase().includes(w))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const offset=Number(cursor||0);result={items:found.slice(offset,offset+20),total:found.length,next:offset+20<found.length?String(offset+20):null};
   }
   if(version!==generation.current)return;
   setItems(old=>cursor?[...old,...result.items]:result.items);setTotal(result.total);setNext(result.next);
  }catch(e){if(version===generation.current)setError((e as Error).message);}finally{if(version===generation.current)setBusy(false);}
 };
 useLayoutEffect(()=>{
  const trigger=document.activeElement as HTMLElement;
  const key='workspace-search-'+crypto.randomUUID();
  window.desktop?.extensionPage?.overlay({key,enabled:true});
  return ()=>{
   window.desktop?.extensionPage?.overlay({key,enabled:false});
   queueMicrotask(()=>{if(trigger?.isConnected&&!document.querySelector('[role="dialog"],dialog[open]'))trigger.focus({preventScroll:true});});
  };
 },[]);
 useEffect(()=>{const version=++generation.current;setItems([]);setNext(null);setTotal(0);setBusy(true);const timer=setTimeout(()=>void load(undefined,version),query?150:0);return()=>{clearTimeout(timer);generation.current++;};},[query,category,skills]);
 const matchedActions=category==='action'?actions.filter(action=>query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).every(word=>(t(action.title)+' '+action.title+' '+action.keywords).toLocaleLowerCase().includes(word))):[];
 return <CommandDialog className="workspace-search-dialog top-1/2 -translate-y-1/2 w-[min(900px,calc(100vw-32px))] max-w-none sm:max-w-none" open onOpenChange={value=>{if(!value)close();}} title={t('搜索工作台')} description={t('搜索名称、任务内容或快捷操作')}>
 <Command className="workspace-search gap-4 p-5" shouldFilter={false} loop label={t('搜索工作台')}>
 <CommandInput ref={input} aria-label={t('搜索名称、任务内容或快捷操作')} placeholder={t('搜索名称、任务内容或快捷操作')} maxLength={500} value={query} onValueChange={setQuery}/>
 <Tabs value={category} onValueChange={value=>setCategory(value as typeof category)} className="min-h-0 flex-1" onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight')event.stopPropagation();}}>
 <TabsList activateOnFocus className="search-category-tabs max-w-full shrink-0" aria-label={t('搜索分类')}>
 {([...Object.entries(categoryLabels),['action','快捷操作']] as const).map(([value,label])=><TabsTrigger key={value} value={value}>{t(label)}</TabsTrigger>)}
 </TabsList><Separator/>
 <TabsContent key={category} value={category} className="min-h-0">
 <span className="sr-only" role="status">{busy?t('正在搜索…'):`${total+matchedActions.length} ${t('项结果')}`}</span>
 <CommandList className="search-results h-[min(480px,calc(100dvh-240px))] max-h-none" aria-busy={busy}>
 {[...new Set(items.map(item=>item.kind))].map((kind,index)=><Fragment key={kind}>
 {index>0&&<CommandSeparator alwaysRender/>}
 <CommandGroup heading={t(categoryLabels[kind])}>
 {items.filter(item=>item.kind===kind).map(item=>{const Icon=item.kind==='project'?Folder:item.kind==='extension'?Puzzle:item.kind==='skill'?BookOpen:FileText;const showSnippet=!!item.snippet;return <CommandItem className="search-result" value={item.kind+':'+(item.draft?'draft:':'')+item.id} key={item.kind+':'+(item.draft?'draft:':'')+item.id} onSelect={()=>open(item)}><Icon aria-hidden="true"/><span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{highlight(item.title)}</span>{showSnippet&&<span className="truncate text-xs text-muted-foreground">{highlight(item.snippet)}</span>}</span>{item.date&&<CommandShortcut><time>{new Date(item.date).toLocaleDateString()}</time></CommandShortcut>}</CommandItem>;})}
 </CommandGroup></Fragment>)}
 {next&&<CommandGroup value="pagination"><CommandItem value="load-more" className="search-more" disabled={busy} onSelect={()=>void load(next)}>{t(busy?'正在加载…':'加载更多')}</CommandItem></CommandGroup>}
 {!!items.length&&!!matchedActions.length&&<CommandSeparator alwaysRender/>}
 {!!matchedActions.length&&<CommandGroup heading={t('快捷操作')}>{matchedActions.map(({id,title,Icon})=><CommandItem key={id} value={'action:'+id} className="search-result search-action" onSelect={()=>onAction(id)}><Icon aria-hidden="true"/><span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{highlight(t(title))}</span></span>{id==='new-task'&&<CommandShortcut aria-hidden="true">⌘N</CommandShortcut>}</CommandItem>)}</CommandGroup>}
 {busy&&!items.length&&<div className="flex min-h-48 items-center justify-center gap-2" role="status"><Spinner/>{t('正在搜索…')}</div>}
 {!busy&&!error&&<CommandEmpty><Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon">{category==='skill'?<BookOpen/>:<Search/>}</EmptyMedia><EmptyTitle>{t(query.trim()?'没有找到相关结果':category==='skill'?'尚未安装技能':'暂无搜索结果')}</EmptyTitle><EmptyDescription>{t(query.trim()?'试试其他关键词，或清除筛选条件。':category==='skill'?'导入包含 SKILL.md 的文件夹，开始维护你的技能。':'此分类的内容会显示在这里。')}</EmptyDescription></EmptyHeader>{query.trim()&&<EmptyContent><Button variant="outline" size="sm" onClick={()=>setQuery('')}>{t('清除搜索')}</Button></EmptyContent>}</Empty></CommandEmpty>}
 </CommandList>
 {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription><AlertAction><Button variant="outline" size="xs" disabled={busy} onClick={()=>void load()}>{t('重试')}</Button></AlertAction></Alert>}
 </TabsContent></Tabs><Separator/><div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>{t('选择')}</span><span className="inline-flex items-center gap-2"><Kbd>Enter</Kbd>{t('打开')}</span><span className="inline-flex items-center gap-2"><KbdGroup><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup>{t('切换分类')}</span><span className="inline-flex items-center gap-2"><Kbd>Esc</Kbd>{t('关闭')}</span></div></Command></CommandDialog>;
}
