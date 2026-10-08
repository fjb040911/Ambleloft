import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,ChevronRight,File,Folder,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './components/ui/dialog';
import {ResizablePanelGroup,ResizablePanel,ResizableHandle} from './components/ui/resizable';
import {ScrollArea} from './components/ui/scroll-area';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Tabs,TabsList,TabsTrigger} from './components/ui/tabs';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {Spinner} from './components/ui/spinner';
import {Alert,AlertDescription} from './components/ui/alert';
import Markdown from './Markdown';
import FileCode from './FileCode';
import type {SkillDetail,SkillFilePreview} from './types';
import {t} from './i18n';
import {Field,FieldGroup,FieldLabel} from './components/ui/field';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {skillsChanged} from './skills';
type Node={name:string;path:string;children:Map<string,Node>;file:boolean};
function FileTree({nodes,selected,select}:{nodes:Map<string,Node>;selected:string;select(path:string):void}){
 return <div className="flex flex-col gap-1">{[...nodes.values()].sort((a,b)=>Number(a.file)-Number(b.file)||a.name.localeCompare(b.name)).map(node=>node.file?<Button key={node.path} variant={selected===node.path?'secondary':'ghost'} className="w-full justify-start" size="sm" aria-pressed={selected===node.path} title={node.path} onClick={()=>select(node.path)}><File data-icon="inline-start"/><span className="truncate">{node.name}</span></Button>:<Collapsible key={node.path} defaultOpen><CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group w-full justify-start"/>}><ChevronRight data-icon="inline-start" className="group-data-panel-open:rotate-90"/><Folder data-icon="inline-start"/><span className="truncate">{node.name}</span></CollapsibleTrigger><CollapsibleContent className="pl-3"><FileTree nodes={node.children} selected={selected} select={select}/></CollapsibleContent></Collapsible>)}</div>;
}
export default function SkillPreview({skill,close,updated}:{skill:SkillDetail;close():void;updated(skill:SkillDetail):void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState({name:skill.name,description:skill.description,body:skill.body});
 const [busy,setBusy]=useState(false),[saveError,setSaveError]=useState(''),[notice,setNotice]=useState('');
 const [confirm,setConfirm]=useState<'close'|'cancel'|'delete'|null>(null);const inFlight=useRef(false),editButton=useRef<HTMLButtonElement>(null);
 const dirty=draft.name!==skill.name||draft.description!==skill.description||draft.body!==skill.body;
 const valid=!!draft.name.trim()&&!!draft.description.trim()&&!!draft.body.trim()&&draft.body.length<=200000;
 const finishEdit=()=>{setEditing(false);setMode('preview');setSaveError('');requestAnimationFrame(()=>editButton.current?.focus());};
 const requestLeave=(action:'close'|'cancel')=>{if(inFlight.current)return;if(editing&&dirty){setConfirm(action);return;}if(action==='close')close();else finishEdit();};
 const save=async()=>{
  if(inFlight.current||!dirty||!valid)return;inFlight.current=true;setBusy(true);setSaveError('');
  try{const result=await window.desktop!.skills!.update({id:skill.id,version:skill.version,...draft});updated({...skill,...result,body:draft.body.trim()});skillsChanged();setSelected('SKILL.md');finishEdit();setNotice(t('技能已保存'));}
  catch(e){setSaveError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}
 };
 const manage=async(remove=false)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setSaveError('');
  try{if(remove){await window.desktop!.skills!.remove(skill.id);skillsChanged();close();}else{const result=await window.desktop!.skills!.update({id:skill.id,enabled:!skill.enabled});updated({...skill,...result});skillsChanged();setNotice(t(skill.enabled?'技能已停用':'技能已启用'));}}
  catch(e){setSaveError((e as Error).message);}finally{inFlight.current=false;setBusy(false);setConfirm(null);}
 };
 const beginEdit=()=>{setDraft({name:skill.name,description:skill.description,body:skill.body});setEditing(true);setSelected('SKILL.md');setMode('edit');setSaveError('');setNotice('');};
 const [selected,setSelected]=useState('SKILL.md');const [mode,setMode]=useState('preview');
 const [file,setFile]=useState<SkillFilePreview|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [retry,setRetry]=useState(0);
 const tree=useMemo(()=>{const root=new Map<string,Node>();for(const path of new Set(['SKILL.md',...skill.files])){let children=root;const parts=path.replaceAll('\\','/').split('/');parts.forEach((name,index)=>{if(!children.has(name))children.set(name,{name,path:parts.slice(0,index+1).join('/'),children:new Map(),file:index===parts.length-1});children=children.get(name)!.children;});}return root;},[skill.files]);
 useEffect(()=>{let active=true;setLoading(true);setError('');setFile(null);
 const read=window.desktop?.skills?.readFile;
 const legacyPreview=():SkillFilePreview=>{if(selected==='SKILL.md')return {path:selected,size:new TextEncoder().encode(skill.body).length,kind:'markdown',text:skill.body};throw new Error(t('请重启应用以启用文件预览'));};
 const request=Promise.resolve().then(()=>read?read({id:skill.id,file:selected}):legacyPreview()).catch((e:unknown)=>{
  // A refreshed renderer/preload can still be connected to an older Electron main process.
  if(e instanceof Error&&/No handler registered for ['"]skills:readFile['"]/.test(e.message))return legacyPreview();
  throw e;
 });
 void request.then(value=>{if(active)setFile(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[skill.id,skill.version,selected,retry]);
 const primary=selected==='SKILL.md';
 const previewText=primary?(editing?draft.body:skill.body):(file?.text||'').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
 return <Dialog open onOpenChange={open=>{if(!open)requestLeave('close');}}><DialogContent showCloseButton={false} aria-busy={busy} className="skill-preview flex h-[min(800px,90dvh)] w-[min(1150px,94vw)] max-w-none flex-col overflow-hidden sm:max-w-none" onKeyDown={event=>{if(editing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void save();}}}>
 <DialogHeader className="shrink-0 pr-8"><div className="flex flex-wrap items-center gap-2"><DialogTitle>{skill.name}</DialogTitle><Badge variant="secondary">{t(skill.enabled?'已启用':'已停用')}</Badge><Badge variant="outline">v{skill.version}</Badge>{editing?<Badge variant="outline">{t(dirty?'未保存':'编辑中')}</Badge>:<Button ref={editButton} variant="outline" size="sm" disabled={busy} onClick={beginEdit}>{t('编辑')}</Button>}</div><DialogDescription>{editing?t('编辑技能名称、描述和指令。附属文件仅供查看。'):skill.description}</DialogDescription></DialogHeader>
 <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label={t('关闭')} disabled={busy} onClick={()=>requestLeave('close')}><X/></Button>
 <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
 <ResizablePanel defaultSize="75%" minSize="35%"><div className="flex h-full min-w-0 flex-col gap-3 pr-3">
 {editing&&<FieldGroup className="shrink-0 gap-3 border-b border-border pb-4">
  <Field orientation="horizontal" className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3">
   <FieldLabel htmlFor="skill-edit-name" className="flex h-8 items-center">{t('名称')}</FieldLabel>
   <Input id="skill-edit-name" value={draft.name} maxLength={120} disabled={busy} onChange={e=>setDraft({...draft,name:e.target.value})}/>
  </Field>
  <Field orientation="horizontal" className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3">
   <FieldLabel htmlFor="skill-edit-description" className="flex h-8 items-center">{t('描述')}</FieldLabel>
   <Textarea id="skill-edit-description" rows={2} className="field-sizing-fixed min-h-16 max-h-24 resize-none" value={draft.description} maxLength={2000} disabled={busy} onChange={e=>setDraft({...draft,description:e.target.value})}/>
  </Field>
 </FieldGroup>}

 <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><span className="truncate" title={selected}>{selected}{!primary&&<Badge variant="outline" className="ml-2">{t('只读')}</Badge>}</span>{(primary||file?.kind==='markdown')&&<Tabs value={mode} onValueChange={value=>setMode(String(value))}><TabsList><TabsTrigger value="preview">{t('预览')}</TabsTrigger><TabsTrigger value={editing&&primary?'edit':'source'}>{t(editing&&primary?'编辑':'源码')}</TabsTrigger></TabsList></Tabs>}</div>
 {editing&&<div className={primary&&mode==='edit'?'flex min-h-0 flex-1 flex-col':'hidden'}><FileCode text={draft.body} path="SKILL.md" wrap position={0} onScroll={()=>{}} editable={!busy} onChange={body=>setDraft(current=>({...current,body}))} onSave={()=>void save()}/></div>}
 {!(editing&&primary&&mode==='edit')&&(loading&&!(editing&&primary)?<div className="flex flex-1 items-center justify-center gap-2" role="status"><Spinner/>{t('正在加载…')}</div>:error&&!(editing&&primary)?<Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>{t('重试')}</Button></Alert>:file?.kind==='text'||mode==='source'?<div className="flex min-h-0 flex-1 flex-col"><FileCode text={primary?(file?.text||skill.body):file?.text||''} path={selected} wrap position={0} onScroll={()=>{}}/></div>:<ScrollArea className="min-h-0 flex-1"><div className="p-3">{primary||file?.kind==='markdown'?<Markdown text={previewText}/>:file?.kind==='image'?<img src={file.dataUrl} alt={selected} className="max-w-full"/>:<Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen/></EmptyMedia><EmptyTitle>{t('暂不支持预览')}</EmptyTitle><EmptyDescription>{t(file?.reason||'此文件格式暂不支持预览')} · {file?.size??0} B</EmptyDescription></EmptyHeader></Empty>}</div></ScrollArea>)}
 </div></ResizablePanel><ResizableHandle withHandle/><ResizablePanel defaultSize="25%" minSize="20%"><ScrollArea className="h-full"><nav aria-label={t('技能文件')} className="flex flex-col gap-3 pl-3"><strong>{t('技能文件')}</strong><FileTree nodes={tree} selected={selected} select={path=>{setSelected(path);setMode(editing&&path==='SKILL.md'?'edit':'preview');}}/><p className="text-xs text-muted-foreground break-all">{t('导入来源')}：{skill.sourcePath}</p></nav></ScrollArea></ResizablePanel>
 </ResizablePanelGroup>
 {saveError&&<Alert variant="destructive" className="shrink-0"><AlertDescription>{saveError}</AlertDescription></Alert>}
 <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
 <span role="status" className="text-xs text-muted-foreground">{editing?t(draft.body.length>200000?'技能指令不能超过 200000 字符':dirty?'有未保存的修改 · Ctrl / ⌘ + S 保存':'尚未修改'):notice}</span>
 <div className="flex items-center gap-2">{editing?<><Button variant="outline" disabled={busy} onClick={()=>requestLeave('cancel')}>{t('取消编辑')}</Button><Button disabled={busy||!dirty||!valid} onClick={()=>void save()}>{busy&&<Spinner/>}{t(busy?'正在保存…':'保存修改')}</Button></>:<><Button variant="ghost" disabled={busy} onClick={()=>setConfirm('delete')}>{t('删除技能')}</Button><Button variant="outline" disabled={busy} onClick={()=>void manage()}>{t(skill.enabled?'停用':'启用')}</Button></>}</div>
 </div>
 <Dialog open={!!confirm} onOpenChange={open=>{if(!open&&!busy)setConfirm(null);}}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>{t(confirm==='delete'?'删除此技能？':'放弃未保存的修改？')}</DialogTitle><DialogDescription>{t(confirm==='delete'?'历史消息中的技能记录会保留。':'尚未保存的修改将丢失。')}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>{t(confirm==='delete'?'取消':'继续编辑')}</Button><Button variant="destructive" disabled={busy} onClick={()=>{if(confirm==='delete'){void manage(true);return;}const action=confirm;setConfirm(null);if(action==='close')close();else finishEdit();}}>{t(confirm==='delete'?'确认删除':'放弃修改')}</Button></div></DialogContent></Dialog>
 </DialogContent></Dialog>;
}
