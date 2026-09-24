import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {Plus,X,ChevronDown,Check,ShieldCheck,Folder, Sparkles} from 'lucide-react';
import {t} from './i18n';
import {useSkills} from './skills';
import type {ProviderCatalog} from './types';
export interface ComposerOptions {selectedSkillIds?:string[];providerId?:string;model?:string;permission?:'default'|'full';attachments?:{name:string;path:string}[];confirmProviderChange?:boolean}
export default function ComposerControls({catalog,value,onChange,disabled,openSettings,previousProviderId,previousBaseUrl}:{catalog:ProviderCatalog;value:ComposerOptions;onChange(value:ComposerOptions):void;disabled?:boolean;openSettings(section:string):void;previousProviderId?:string;previousBaseUrl?:string}){
 const {skills,error:skillsError}=useSkills();
 const [menu,setMenu]=useState('');const [query,setQuery]=useState('');const [error,setError]=useState('');const root=useRef<HTMLDivElement>(null);
 const menuId=useId();
 const trigger=useRef<HTMLElement|null>(null);
 const dismiss=(restore=false)=>{setMenu('');if(restore)trigger.current?.focus({preventScroll:true});};
 useEffect(()=>{
  if(!menu)return;
  const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setMenu('');};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&root.current?.contains(document.activeElement)){e.preventDefault();setMenu('');trigger.current?.focus({preventScroll:true});}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
 },[menu]);
 useEffect(()=>{if(disabled)setMenu('');},[disabled]);
 useLayoutEffect(()=>{
  if(!menu)return;
  const pop=root.current?.querySelector<HTMLElement>('.composer-popover');if(!pop)return;
  const position=()=>{
   const anchor=pop.parentElement!.getBoundingClientRect();
   const aboveSpace=anchor.top-20,belowSpace=window.innerHeight-anchor.bottom-20;
   const above=aboveSpace>=Math.min(280,belowSpace);
   const width=Math.min(320,window.innerWidth-24);
   const left=Math.max(12,Math.min(menu==='models'?anchor.right-width:anchor.left,window.innerWidth-width-12));
   Object.assign(pop.style,{position:'fixed',width:width+'px',left:left+'px',right:'auto',bottom:above?(window.innerHeight-anchor.top+8)+'px':'auto',top:above?'auto':(anchor.bottom+8)+'px',maxHeight:Math.max(0,Math.min(380,above?aboveSpace:belowSpace))+'px',transformOrigin:Math.max(0,Math.min(width,anchor.left+anchor.width/2-left))+'px '+(above?'bottom':'top')});
  };
  trigger.current=root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')||trigger.current;
  position();pop.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus({preventScroll:true});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[menu]);
 const toggle=(name:string)=>setMenu(menu===name?'':name);
 const select=async()=>{try{if(!window.desktop?.selectAttachments)throw new Error(t('请在桌面应用中添加文件和文件夹'));const files=await window.desktop.selectAttachments();onChange({...value,attachments:[...(value.attachments||[]),...files].filter((f,i,a)=>a.findIndex(x=>x.path===f.path)===i)});dismiss(true);}catch(e){setError((e as Error).message);}};
 return <div className="composer-options" ref={root} onKeyDown={event=>{
  const target=event.target as HTMLElement;
  const popover=target.closest('.composer-popover');
  if(!popover||!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||target.tagName==='INPUT')return;
  const items=Array.from(popover.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if(!items.length)return;
  event.preventDefault();const index=items.indexOf(target as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[next].focus();
 }} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setMenu('');}}>
 {!!value.attachments?.length&&<div className="composer-chips">{value.attachments.map(file=><button type="button" key={file.path} title={file.path} aria-label={`${t('移除附件')} ${file.name}`} disabled={disabled} onClick={()=>onChange({...value,attachments:value.attachments?.filter(f=>f.path!==file.path)})}><Folder size={13}/><span>{file.name}</span><X size={12}/></button>)}</div>}
 {error&&<small role="alert">{error}</small>}
 <div className="composer-option-row"><div className="composer-option-anchor"><button type="button" className="icon-button" disabled={disabled} aria-label={t(menu==='add'||menu==='skills'?'关闭添加菜单':'添加内容')} aria-haspopup="dialog" aria-controls={menu==='add'||menu==='skills'?menuId:undefined} aria-expanded={menu==='add'||menu==='skills'} onClick={()=>setMenu(menu==='add'||menu==='skills'?'':'add')}>{menu==='add'||menu==='skills'?<X size={20}/>:<Plus size={20}/>}</button>
 {(menu==='add'||menu==='skills')&&<div id={menuId} className="composer-popover" role="dialog" aria-label={t('添加内容')}>{menu==='add'?<><button type="button" onClick={()=>void select()}><Folder size={17}/>{t('文件和文件夹')}</button><button type="button" onClick={()=>setMenu('skills')}><Sparkles size={17}/>{t('技能')}</button></>:<><input autoFocus type="search" aria-label={t('搜索技能')} placeholder={t('搜索技能')} value={query} onChange={e=>setQuery(e.target.value)}/><small>{t('仅对本次请求指定使用')}</small>{skillsError&&<p role="alert">{skillsError}</p>}{skills.filter(c=>c.enabled&&(c.name+' '+c.description).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(c=><button type="button" key={c.id} disabled={!value.selectedSkillIds?.includes(c.id)&&(value.selectedSkillIds?.length||0)>=20} aria-pressed={value.selectedSkillIds?.includes(c.id)||false} onClick={()=>{const selected=value.selectedSkillIds||[];onChange({...value,selectedSkillIds:selected.includes(c.id)?selected.filter(id=>id!==c.id):[...selected,c.id]});}}><span>{c.name}<small>{c.description}</small></span>{value.selectedSkillIds?.includes(c.id)&&<Check size={16}/>}</button>)}{!skills.some(c=>c.enabled)&&<p>{t('暂无已启用的技能，请先导入。')}</p>}<button type="button" onClick={()=>{setMenu('');openSettings('skills');}}>{t('管理技能')}</button></>}</div>}
 </div><div className="composer-option-anchor"><button type="button" className="model-pill" disabled={disabled} onClick={()=>toggle('permission')} aria-haspopup="dialog" aria-controls={menu==='permission'?menuId:undefined} aria-expanded={menu==='permission'}><ShieldCheck size={16}/>{t(value.permission==='full'?'完全访问':'默认权限')}<ChevronDown size={12}/></button>{menu==='permission'&&<div id={menuId} className="composer-popover" role="dialog" aria-label={t('权限审批')}><p>{t('默认以只读权限执行，需要修改文件或提升权限时请求批准。')}</p><button type="button" role="switch" aria-checked={value.permission==='full'} onClick={()=>{const full=value.permission!=='full';if(full&&!window.confirm(t('允许当前会话完全访问？AI 可以修改文件和执行命令，无需逐次批准。')))return;onChange({...value,permission:full?'full':'default'});dismiss(true);}}>{t('允许完全访问')}<span className={`permission-toggle ${value.permission==='full'?'enabled':''}`} aria-hidden="true"><span/></span></button></div>}</div>
 <div className="composer-option-anchor composer-model-anchor"><button type="button" className="model-pill" disabled={disabled} aria-label={t('选择模型')} aria-haspopup="dialog" aria-controls={menu==='models'?menuId:undefined} aria-expanded={menu==='models'} onClick={()=>toggle('models')}><span className="composer-model-name">{value.model||t('选择模型')}</span>{value.model&&<small className="pill-location">{t('自定义模型')}</small>}<ChevronDown size={13}/></button>{menu==='models'&&<div id={menuId} className="composer-popover model-popover" role="dialog" aria-label={t('模型列表')}><small>{t('自定义模型')}</small>{catalog.providers.flatMap(p=>(p.models||[p.model]).map(model=><button type="button" key={`${p.id}:${model}`} aria-pressed={value.providerId===p.id&&value.model===model} onClick={()=>{const crossing=(!!previousProviderId&&previousProviderId!==p.id)||(!!previousBaseUrl&&previousBaseUrl!==p.baseUrl);if(crossing&&!window.confirm(t('切换服务后，当前会话历史将发送到新的模型服务。是否继续？')))return;onChange({...value,providerId:p.id,model,confirmProviderChange:crossing});dismiss(true);}}><span>{model}<small>{p.name}</small></span>{value.providerId===p.id&&value.model===model&&<Check size={16}/>}</button>))}{!catalog.providers.length&&<p>{t('尚未配置模型服务')}</p>}<button type="button" onClick={()=>{setMenu('');openSettings('providers');}}>{t('配置模型服务')}</button></div>}</div></div></div>;
}
