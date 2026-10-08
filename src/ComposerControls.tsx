import {useEffect,useState} from 'react';
import {Plus,X,ChevronDown,ShieldCheck,Folder,Sparkles} from 'lucide-react';
import {t} from './i18n';
import {useSkills} from './skills';
import type {ProviderCatalog} from './types';
import {Button} from './components/ui/button';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle,PopoverDescription} from './components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem} from './components/ui/command';
export interface ComposerOptions {selectedSkillIds?:string[];providerId?:string;model?:string;permission?:'default'|'full';attachments?:{name:string;path:string}[];confirmProviderChange?:boolean}
const popupLayout='w-80 max-w-[calc(100vw-24px)] max-h-[min(380px,var(--available-height))] overflow-y-auto motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none';
export default function ComposerControls({catalog,value,onChange,disabled,openSettings,previousProviderId,previousBaseUrl}:{catalog:ProviderCatalog;value:ComposerOptions;onChange(value:ComposerOptions):void;disabled?:boolean;openSettings(section:string):void;previousProviderId?:string;previousBaseUrl?:string}){
 const {skills,error:skillsError}=useSkills();
 const [menu,setMenu]=useState(''),[query,setQuery]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(disabled)setMenu('');},[disabled]);
 const select=async()=>{try{if(!window.desktop?.selectAttachments)throw new Error(t('请在桌面应用中添加文件和文件夹'));const files=await window.desktop.selectAttachments();onChange({...value,attachments:[...(value.attachments||[]),...files].filter((f,i,a)=>a.findIndex(x=>x.path===f.path)===i)});setError('');setMenu('');}catch(e){setError((e as Error).message);}};
 return <div className="composer-options">
  {!!value.attachments?.length&&<div className="composer-chips">{value.attachments.map(file=><Button variant="secondary" size="sm" key={file.path} title={file.path} aria-label={`${t('移除附件')} ${file.name}`} disabled={disabled} onClick={()=>onChange({...value,attachments:value.attachments?.filter(f=>f.path!==file.path)})}><Folder size={13}/><span>{file.name}</span><X size={12}/></Button>)}</div>}
  {error&&<small role="alert">{error}</small>}
  <div className="composer-option-row">
   <Popover open={menu==='add'||menu==='skills'} onOpenChange={open=>{setMenu(open?'add':'');if(open)setQuery('');}}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t(menu==='add'||menu==='skills'?'关闭添加菜单':'添加内容')}/>}>{menu==='add'||menu==='skills'?<X/>:<Plus/>}</PopoverTrigger>
    <PopoverContent className={popupLayout} side="top" align="start" sideOffset={8} aria-label={t('添加内容')}>
     <PopoverTitle className="sr-only">{t('添加内容')}</PopoverTitle>
     {menu==='skills'?<><Command><CommandInput autoFocus aria-label={t('搜索技能')} placeholder={t('搜索技能')} value={query} onValueChange={setQuery}/><CommandList aria-label={t('技能')}><CommandEmpty>{t('未找到匹配的技能')}</CommandEmpty><CommandGroup heading={t('仅对本次请求指定使用')}>{skills.filter(c=>c.enabled).map(c=><CommandItem key={c.id} value={c.id} keywords={[c.name,c.description]} data-checked={value.selectedSkillIds?.includes(c.id)||false} disabled={!value.selectedSkillIds?.includes(c.id)&&(value.selectedSkillIds?.length||0)>=20} onSelect={()=>{const selected=value.selectedSkillIds||[];onChange({...value,selectedSkillIds:selected.includes(c.id)?selected.filter(id=>id!==c.id):[...selected,c.id]});}}><span className="min-w-0 flex-1 break-words">{c.name}<span className="block text-xs text-muted-foreground line-clamp-2">{c.description}</span></span></CommandItem>)}</CommandGroup></CommandList></Command>{skillsError&&<p role="alert">{skillsError}</p>}{!skills.some(c=>c.enabled)&&<PopoverDescription>{t('暂无已启用的技能，请先导入。')}</PopoverDescription>}<Button variant="ghost" size="sm" onClick={()=>{setMenu('');openSettings('skills');}}>{t('管理技能')}</Button></>:<><Button variant="ghost" className="justify-start" onClick={()=>void select()}><Folder/>{t('文件和文件夹')}</Button><Button variant="ghost" className="justify-start" onClick={()=>setMenu('skills')}><Sparkles/>{t('技能')}</Button></>}
    </PopoverContent>
   </Popover>
   <Popover open={menu==='permission'} onOpenChange={open=>setMenu(open?'permission':'')}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" disabled={disabled}/> }><ShieldCheck/>{t(value.permission==='full'?'完全访问':'默认权限')}<ChevronDown/></PopoverTrigger>
    <PopoverContent className={popupLayout} side="top" align="start" sideOffset={8} aria-label={t('权限审批')}>
     <PopoverTitle>{t('权限审批')}</PopoverTitle><PopoverDescription>{t('默认以只读权限执行，需要修改文件或提升权限时请求批准。')}</PopoverDescription>
     <Button variant="outline" role="switch" aria-checked={value.permission==='full'} className="justify-between" onClick={()=>{const full=value.permission!=='full';if(full&&!window.confirm(t('允许当前任务完全访问？AI 可以修改文件和执行命令，无需逐次批准。')))return;onChange({...value,permission:full?'full':'default'});setMenu('');}}>{t('允许完全访问')}<span aria-hidden="true">{t(value.permission==='full'?'已开启':'未开启')}</span></Button>
    </PopoverContent>
   </Popover>
   <div className="composer-model-anchor">
    <Popover open={menu==='models'} onOpenChange={open=>setMenu(open?'models':'')}>
     <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="max-w-full" disabled={disabled} aria-label={t('选择模型')}/> }><span className="composer-model-name">{value.model||t('选择模型')}</span><ChevronDown/></PopoverTrigger>
     <PopoverContent className={popupLayout} side="top" align="end" sideOffset={8} aria-label={t('模型列表')}>
      <PopoverTitle className="sr-only">{t('模型列表')}</PopoverTitle>
      <Command><CommandInput aria-label={t('搜索模型')} placeholder={t('搜索模型')}/><CommandList aria-label={t('模型列表')}><CommandEmpty>{t('未找到匹配的模型')}</CommandEmpty>{catalog.providers.map(p=><CommandGroup key={p.id} heading={p.name}>{(p.models||[p.model]).map(model=><CommandItem key={model} value={`${p.id}:${model}`} keywords={[p.name||p.id||p.baseUrl,model]} aria-label={`${model} ${p.name}`} data-checked={value.providerId===p.id&&value.model===model} onSelect={()=>{const crossing=(!!previousProviderId&&previousProviderId!==p.id)||(!!previousBaseUrl&&previousBaseUrl!==p.baseUrl);if(crossing&&!window.confirm(t('切换服务后，当前任务历史将发送到新的模型服务。是否继续？')))return;onChange({...value,providerId:p.id,model,confirmProviderChange:crossing});setMenu('');}}><span className="min-w-0 break-all">{model}</span></CommandItem>)}</CommandGroup>)}</CommandList></Command>
      {!catalog.providers.length&&<PopoverDescription>{t('尚未配置模型服务')}</PopoverDescription>}<Button variant="ghost" size="sm" onClick={()=>{setMenu('');openSettings('providers');}}>{t('配置模型服务')}</Button>
     </PopoverContent>
    </Popover>
   </div>
  </div>
 </div>;
}
