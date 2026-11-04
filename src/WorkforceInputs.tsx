import {useState,useEffect,useCallback,useId} from 'react';
import {FolderOpen,LoaderCircle,ExternalLink} from 'lucide-react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {Alert,AlertDescription} from './components/ui/alert';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './components/ui/tabs';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './components/ui/dialog';
import {Field,FieldLabel,FieldGroup} from './components/ui/field';
import {Checkbox} from './components/ui/checkbox';
import {useLanguage} from './i18n';
import type {StoreCatalog,Skill} from './types';
import type {RoleTemplate,SkillDeclaration} from './workforce-types';
export const sourceKey=(s:SkillDeclaration)=>s.source.kind==='store'?JSON.stringify([s.source.kind,s.source.sourceId,s.source.listingId,s.source.version]):JSON.stringify(s.source);
export const useCopy=()=>{const language=useLanguage();return (zh:string,en:string)=>language==='en'?en:zh;};
// Presentation metadata is resolved from the catalog; persisted declarations keep their fixed identity.
export function useSkillMetadata(roleId?:string){
 const [entries,setEntries]=useState<SkillDeclaration[]>([]);const language=useLanguage();
 useEffect(()=>{let active=true;void Promise.allSettled([window.desktop?.store?.catalog({})||Promise.reject(Error('Store unavailable')),window.desktop?.workforce?.roles()||Promise.reject(Error('Roles unavailable'))]).then(([catalog,roles])=>{if(!active)return;const items:SkillDeclaration[]=[];if(catalog.status==='fulfilled'&&catalog.value.source)for(const s of catalog.value.items.filter(s=>s.kind==='skill'&&s.release.status==='published'))items.push({name:s.entityName,label:language==='en'?s.title.en:s.title.zh,purpose:language==='en'?s.summary.en:s.summary.zh,repository:s.repository,license:s.license,validation:s.validation,runtime:language==='en'?s.runtime.en:s.runtime.zh,source:{kind:'store',sourceId:catalog.value.source.id,listingId:s.id,version:s.release.version,packageDigest:s.release.packageDigest,artifactSha256:s.release.artifactSha256}});if(roles.status==='fulfilled')for(const role of roles.value.items.filter(r=>r.id===roleId))for(const s of role.skills)items.unshift({...s,reason:language==='en'?s.reasonEn||s.reason:s.reason,usage:language==='en'?s.usageEn||s.usage:s.usage});setEntries(items);});return()=>{active=false;};},[roleId,language]);
 return (skill:SkillDeclaration)=>{const found=entries.find(s=>sourceKey(s)===sourceKey(skill));return found?{...found,...skill,repository:skill.repository||found.repository,reason:skill.reason||found.reason,license:skill.license||found.license,validation:skill.validation||found.validation,runtime:skill.runtime||found.runtime}:skill;};
}
export function SkillSummary({skill}:{skill:SkillDeclaration}){
 const L=useCopy();const [error,setError]=useState('');
 const raw=skill.repository?.url||(skill.provenance?.kind==='github'?skill.provenance.repository:undefined);
 let url:URL|undefined;try{const candidate=new URL(raw||'');if(candidate.protocol==='https:'&&candidate.hostname.toLowerCase()==='github.com'&&!candidate.username&&!candidate.password)url=candidate;}catch{}
 const source=url?`GitHub · ${url.pathname.replace(/^\/+|\/+$/g,'')}`:skill.provenance?.kind==='local'?L('本地导入','Local import'):skill.source.kind==='installed'?L('本地技能','Local skill'):skill.source.kind==='store'?L('Store 收录','Store catalog'):L('导入来源','Imported source');
 const stars=skill.repository?.stars;
 return <div className="wf-skill-summary"><p>{skill.purpose||L('暂无功能说明','No description available')}</p><small>{source}{url&&skill.source.kind==='store'?' · Store':''}{url&&(stars===undefined?` · ${L('暂无仓库热度','Repository stars unavailable')}`:` · ☆ ${new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(stars)}${skill.repository?.starsObservedAt?` · ${L('采集于','Observed')} ${new Date(skill.repository.starsObservedAt).toLocaleDateString()}`:''}`)}</small>{skill.reason&&<p className="wf-skill-reason">{L('推荐理由：','Why this role: ')}{skill.reason}</p>}{url&&<a href={url.href} target="_blank" rel="noopener noreferrer" onClick={event=>{if(window.desktop){event.preventDefault();void window.desktop.openLink(url!.href).catch(()=>setError(L('无法打开链接，请重试。','Could not open the link. Please retry.')));}}}>{L('在 GitHub 打开','Open on GitHub')} <ExternalLink aria-hidden="true" size={14}/></a>}{error&&<small role="alert">{error}</small>}</div>;
}
export function Failure({message,retry}:{message:string;retry?():void}){
 const L=useCopy();
 const clean=message.replace(/Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/g,'').replace(/^Error:\s*/,'');
 return message?<Alert variant="destructive"><AlertDescription><span>{clean}</span>{retry&&<Button variant="outline" size="sm" onClick={retry}>{L('刷新状态','Refresh status')}</Button>}{clean!==message&&<details><summary>{L('技术详情','Technical details')}</summary><p className="break-all">{message}</p></details>}</AlertDescription></Alert>:null;
}
export function FormField({label,value,onChange,multiline=false,required=false,placeholder='',maxLength=6000,disabled=false}:{label:string;value:string;onChange(value:string):void;multiline?:boolean;required?:boolean;placeholder?:string;maxLength?:number;disabled?:boolean}){
 const id=useId();return <Field><FieldLabel htmlFor={id}>{label}{required?' *':''}</FieldLabel>{multiline?<Textarea disabled={disabled} id={id} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} required={required} rows={3}/>:<Input disabled={disabled} id={id} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} required={required}/>}</Field>;
}
export function SkillPicker({selected,installed,roleId,close,apply}:{roleId?:string;selected:SkillDeclaration[];installed:Skill[];close():void;apply(value:SkillDeclaration[]):void}){
 const L=useCopy(),language=useLanguage();const [roles,setRoles]=useState<RoleTemplate[]>([]),[tab,setTab]=useState('recommended'),[importing,setImporting]=useState(false);const [draft,setDraft]=useState(selected),[query,setQuery]=useState(''),[catalog,setCatalog]=useState<StoreCatalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[repository,setRepository]=useState(''),[directory,setDirectory]=useState(''),[ref,setRef]=useState(''),[preview,setPreview]=useState<SkillDeclaration|null>(null),[detail,setDetail]=useState<SkillDeclaration|null>(null);
 const load=useCallback(async()=>{try{const [c,r]=await Promise.all([window.desktop!.store!.catalog({refresh:true}),window.desktop!.workforce!.roles()]);setCatalog(c);setRoles(r.items);}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();},[load]);
 const toggle=(candidate:SkillDeclaration)=>{const item=recommendations.find(s=>sourceKey(s)===sourceKey(candidate))||candidate;setDraft(current=>current.some(s=>sourceKey(s)===sourceKey(item))?current.filter(s=>sourceKey(s)!==sourceKey(item)):[...current.filter(s=>s.name!==item.name),{...item,selectionOrigin:{...item.selectionOrigin,kind:'user-selected'}}]);};
 const row=(item:SkillDeclaration,_detailText:string)=>{const expanded=!!detail&&sourceKey(detail)===sourceKey(item),regionId='skill-detail-'+encodeURIComponent(sourceKey(item));return <div className="wf-skill-option flex-col" key={sourceKey(item)}><div className="flex w-full items-start justify-between gap-3"><div className="wf-skill-choice"><Checkbox aria-label={L('选择技能：','Select skill: ')+item.label} checked={draft.some(s=>sourceKey(s)===sourceKey(item))} onCheckedChange={()=>toggle(item)}/><div><strong>{item.label}</strong><SkillSummary skill={item}/></div></div><Button variant="ghost" size="sm" aria-label={L('技能详情：','Skill details: ')+item.label} aria-expanded={expanded} aria-controls={regionId} onClick={()=>setDetail(expanded?null:item)}>{expanded?L('收起详情','Hide details'):L('详情','Details')}</Button></div>{expanded&&<div className="w-full min-w-0" role="region" aria-label={item.label+L('的技能详情',' skill details')} id={regionId}><SkillInformation skill={item}/></div>}</div>;};
 const inspect=async(local:boolean)=>{setError('');setBusy(true);try{setPreview(await(local?window.desktop!.workforce!.importLocal():window.desktop!.workforce!.importRepository({repository,directory,...(ref.trim()?{ref:ref.trim()}:{} )})));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const installedEntries=installed.filter(s=>!(catalog?.items||[]).some(item=>s.fixedRelease&&item.id===s.fixedRelease.listingId&&item.release.version===s.fixedRelease.version&&item.release.packageDigest===s.fixedRelease.packageDigest)).filter(s=>(s.name+' '+s.description).toLowerCase().includes(query.toLowerCase()));
 const storeEntries=(catalog?.items||[]).filter(s=>s.kind==='skill'&&s.release.status==='published'&&[s.entityName,s.title.zh,s.title.en,s.summary.zh,s.summary.en,s.repository?.url||''].join(' ').toLowerCase().includes(query.toLowerCase()));
 const template=roles.find(r=>r.id===roleId);
 const recommendations=(template?.skills||selected).map(s=>({...s,label:language==='en'&&'labelEn' in s?String(s.labelEn||s.label):s.label,purpose:language==='en'&&'purposeEn' in s?String(s.purposeEn||s.purpose||''):s.purpose,reason:language==='en'?s.reasonEn||s.reason:s.reason,usage:language==='en'?s.usageEn||s.usage:s.usage,runtime:language==='en'?s.runtimeEn||s.runtime:s.runtime})).filter(s=>(s.name+' '+s.label+' '+s.purpose).toLowerCase().includes(query.toLowerCase()));
 return <><Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="wf-dialog sm:max-w-[720px] p-6 flex"><DialogHeader><DialogTitle>{L('这个角色需要什么技能？','Which skills does this role need?')}</DialogTitle><DialogDescription>{L('勾选表示专家会使用。提交专家配置时，宿主自动安装缺少的技能。','Select the skills this expert will use. Missing skills are installed when you submit the expert configuration.')}</DialogDescription></DialogHeader>

 <Failure message={error}/><div className="wf-actions"><Button variant="outline" onClick={()=>setImporting(v=>!v)}><FolderOpen data-icon="inline-start"/>{importing?L('返回技能选择','Back to skills'):L('导入来源','Import a source')}</Button></div>
 {!importing&&<Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="recommended">{L('角色推荐','Role recommendations')}</TabsTrigger><TabsTrigger value="all">{L('全部技能','All skills')}</TabsTrigger></TabsList><Input aria-label={L('搜索技能','Search skills')} type="search" placeholder={L('搜索名称或用途','Search by name or purpose')} value={query} onChange={e=>setQuery(e.target.value)}/>
 <TabsContent value="recommended" className="wf-picker-scroll">{recommendations.map(s=>row(s,s.defaultSelected===false?L('可选补充','Optional'):L('角色推荐','Recommended for this role')))}{!recommendations.length&&<p className="wf-muted">{L('暂时没有匹配的推荐，可浏览全部技能或导入来源。','No matching recommendations. Browse all skills or import a source.')}</p>}</TabsContent>
 <TabsContent value="all" className="wf-picker-scroll">{catalog?.error&&<Alert><AlertDescription>{L('暂时无法刷新，保留已缓存的技能。','Could not refresh. Cached skills are preserved.')}<Button variant="outline" size="sm" onClick={()=>void load()}>{L('重试','Retry')}</Button></AlertDescription></Alert>}{!catalog?<p role="status">{L('正在读取技能…','Loading skills…')}</p>:storeEntries.map(s=>row({name:s.entityName,label:L(s.title.zh,s.title.en),purpose:L(s.summary.zh,s.summary.en),repository:s.repository,license:s.license,validation:s.validation,runtime:L(s.runtime.zh,s.runtime.en),source:{kind:'store',sourceId:catalog.source!.id,listingId:s.id,version:s.release.version,packageDigest:s.release.packageDigest,artifactSha256:s.release.artifactSha256},usage:{mode:'when-relevant',when:L(s.summary.zh,s.summary.en),whenNot:L('仅在适用于当前任务时使用。','Use only when relevant to the task.')},selectionOrigin:{kind:'user-selected'}},s.publisher+' · '+s.release.version))}{installedEntries.map(s=>row({name:s.name,label:s.displayName||s.name,purpose:s.displayDescription||s.description,source:{kind:'installed',skillId:s.id,revision:s.revision,version:s.version}},L('自定义技能','Custom skill')))}{catalog&&!storeEntries.length&&!installedEntries.length&&<p className="wf-muted">{L('没有匹配技能，请换一个关键词。','No matches. Try another search term.')}</p>}</TabsContent></Tabs>}
 {importing&&<div className="wf-picker-scroll"><div className="wf-import-heading"><div><strong>{L('本地技能目录','Local skill directory')}</strong><p className="wf-muted">{L('选择包含 SKILL.md 的目录，预览后加入声明。','Choose a directory containing SKILL.md, then review it.')}</p></div><Button variant="outline" disabled={busy} onClick={()=>void inspect(true)}><FolderOpen data-icon="inline-start"/>{L('选择目录','Choose directory')}</Button></div>
 <form onSubmit={e=>{e.preventDefault();void inspect(false);}}><FieldGroup><FormField label={L('GitHub 仓库','GitHub repository')} value={repository} onChange={setRepository} placeholder="https://github.com/owner/repository" required/><FormField label={L('技能子目录','Skill subdirectory')} value={directory} onChange={setDirectory} placeholder="skills/example" required/><FormField label={L('分支、标签或提交（可选）','Branch, tag or commit (optional)')} value={ref} onChange={setRef}/><Button type="submit" variant="outline" disabled={busy||!repository||!directory}>{busy?<LoaderCircle className="animate-spin" data-icon="inline-start"/>:null}{L('解析并预览','Resolve and preview')}</Button></FieldGroup></form>
 {preview&&<div className="wf-import-preview"><strong>{preview.label}</strong><p>{preview.purpose}</p>{preview.provenance&&<p className="wf-muted">{preview.provenance.kind==='github'?preview.provenance.repository+' · '+preview.provenance.directory+' @ '+preview.provenance.commit?.slice(0,12):preview.provenance.path}</p>}<p className="wf-muted">{L('已固定来源，添加到选择后随专家配置一起准备。','Source frozen. Add it to prepare with the expert configuration.')}</p><Button variant="outline" onClick={()=>{toggle(preview);setPreview(null);}}>{L('加入选择','Add to selection')}</Button></div>}</div>}
 <DialogFooter><span className="wf-muted">{L('已选','Selected')} {draft.length} / 20 · {L('包含所有来源','Across all sources')}</span><Button variant="outline" onClick={close}>{L('取消','Cancel')}</Button><Button disabled={draft.length>20} onClick={()=>apply(draft)}>{L('完成选择','Apply selection')}</Button></DialogFooter></DialogContent></Dialog></>;
}

/** Read-only metadata. Expanding details never selects or installs a skill. */
export function SkillInformation({skill}:{skill:SkillDeclaration}){
 const L=useCopy();const rows=[
 [L('推荐理由','Why this role'),skill.reason],
 [L('何时使用','When to use'),skill.usage?.when],
 [L('使用边界','When to skip'),skill.usage?.whenNot],
 [L('固定版本','Fixed release'),skill.source.kind==='store'?skill.source.version:undefined],
 [L('上游来源','Upstream source'),skill.repository?`${skill.repository.url}
${skill.repository.directory}
${skill.repository.commit}`:skill.provenance?.kind==='github'?`${skill.provenance.repository}
${skill.provenance.directory}
${skill.provenance.commit}`:skill.provenance?.path],
 [L('许可证（上游声明）','License (upstream declaration)'),skill.license],
 [L('运行要求','Runtime requirements'),skill.runtime],
 [L('制品校验时间','Package verified'),skill.validation?.packageVerifiedAt],
 [L('源码核验时间','Source checked'),skill.validation?.sourceCheckedAt],
 [L('仓库关注数（采集时）','Repository stars (observed)'),skill.repository?.stars===undefined?undefined:`${skill.repository.stars} · ${skill.repository.starsObservedAt||''}`],
 [L('内容摘要','Content digest'),skill.source.kind==='store'?skill.source.packageDigest:undefined]
 ];return <dl className="wf-role-definition">{rows.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd className="wf-source-value">{value}</dd></div>)}</dl>;
}
