import {KnowledgeIntro} from './WorkforceIntro';
import {useState,useEffect,useRef} from 'react';
import {Search,BookOpen,ArrowRight} from 'lucide-react';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {InputGroup,InputGroupInput,InputGroupAddon} from './components/ui/input-group';
import {NativeSelect,NativeSelectOption,NativeSelectOptGroup} from './components/ui/native-select';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {Failure,useCopy} from './WorkforceInputs';
import {DocumentDialog,type DocumentDraft} from './WorkforceDocuments';
import type {Employee,SpaceSnapshot,KnowledgeSource} from './workforce-types';
export function KnowledgePanel({onSpaces,data,employees,onOpenTask,refresh,active=true}:{onSpaces():void;active?:boolean;data:SpaceSnapshot;employees:Employee[];onOpenTask(id:string):void;refresh():Promise<void>}){
 const searchInput=useRef<HTMLInputElement>(null);
 const L=useCopy(),[query,setQuery]=useState(''),[scope,setScope]=useState(''),[employee,setEmployee]=useState(''),[items,setItems]=useState<KnowledgeSource[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[doc,setDoc]=useState<DocumentDraft|null>(null);
 const archived=data.spaces.filter(s=>s.archivedAt),current=data.spaces.filter(s=>!s.archivedAt);
 useEffect(()=>{let live=true;setBusy(true);setError('');window.desktop!.spaces!.knowledge({query,spaceIds:scope?[scope]:undefined,employeeId:employee||undefined}).then(value=>{if(live)setItems(value);}).catch(e=>{if(live){setItems([]);setError(e.message);}}).finally(()=>live&&setBusy(false));return()=>{live=false;};},[query,scope,employee,data]);
 return <><KnowledgeIntro search={()=>{searchInput.current?.scrollIntoView({block:'center'});searchInput.current?.focus({preventScroll:true});}} spaces={onSpaces}/>
 <div className="wf-knowledge-filters"><InputGroup><InputGroupAddon><Search/></InputGroupAddon><InputGroupInput ref={searchInput} aria-label={L('搜索已采纳知识','Search adopted knowledge')} value={query} onChange={e=>setQuery(e.target.value)} placeholder={L('搜索职责边界、接口约定或经验','Search boundaries, contracts or experience')}/></InputGroup>
 <NativeSelect aria-label={L('空间范围','Space scope')} value={scope} onChange={e=>setScope(e.target.value)}><NativeSelectOption value="">{archived.length?L('所有空间（含归档）','All spaces (including archived)'):L('所有空间','All spaces')}</NativeSelectOption>{[{label:L('活跃空间','Active spaces'),spaces:current},{label:L('已归档空间','Archived spaces'),spaces:archived}].filter(group=>group.spaces.length).map(group=><NativeSelectOptGroup key={group.label} label={group.label}>{group.spaces.map(s=><NativeSelectOption key={s.id} value={s.id}>{s.name}{s.archivedAt?L('（已归档）',' (archived)'):''}</NativeSelectOption>)}</NativeSelectOptGroup>)}</NativeSelect>
 <NativeSelect aria-label={L('查看专家的知识范围','Expert access')} value={employee} onChange={e=>setEmployee(e.target.value)}><NativeSelectOption value="">{L('我的全部资料','All my sources')}</NativeSelectOption>{employees.map(e=><NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}</NativeSelect></div>
 <Failure message={error}/><div className="wf-knowledge-results" aria-busy={busy}><p className="wf-knowledge-status wf-muted" role="status">{busy?L('正在查询…','Searching…'):error?'':L(`${items.length} 项已采纳资料`,`${items.length} adopted ${items.length===1?'source':'sources'}`)}</p>
 <div className="wf-list">{items.map(item=><article key={item.id} className="wf-knowledge-entry"><div className="wf-section-title"><h2><BookOpen size={18}/> {item.title}</h2><Badge variant="secondary">{L('已采纳','Adopted')} v{item.revision}</Badge></div><div className="wf-knowledge-source"><small className="wf-muted">{item.spaceName} · {item.hash.slice(0,16)}</small>{data.spaces.some(s=>s.id===item.spaceId&&s.archivedAt)&&<Badge variant="outline">{L('来源空间已归档','Source space archived')}</Badge>}</div><p className="wf-knowledge-excerpt">{item.excerpt}</p><Button variant="outline" onClick={()=>void window.desktop!.spaces!.document({id:item.id,revision:item.revision}).then(setDoc).catch(e=>setError(e.message))}>{L('查看原文与替代关系','View source and adoption history')}<ArrowRight data-icon="inline-end"/></Button></article>)}</div>
 {!busy&&!error&&!items.length&&<Empty><EmptyHeader><EmptyTitle>{L('没有匹配的已采纳资料','No matching adopted sources')}</EmptyTitle><EmptyDescription>{query||scope||employee?L('试试其他关键词，或调整空间和专家范围。','Try another keyword or adjust the space and expert filters.'):L('在项目空间的“文档与产物”中整理并采纳结论后，可以在这里查找与追溯。','Save and adopt conclusions in a space’s Documents view to find and trace them here.')}</EmptyDescription></EmptyHeader></Empty>}</div>
 {doc&&<DocumentDialog readOnly={!!data.spaces.find(s=>s.id===doc.spaceId)?.archivedAt} active={active} plans={data.plans||[]} requests={data.requests} initial={doc} spaceId={doc.spaceId!} close={()=>setDoc(null)} refresh={refresh} onOpenTask={onOpenTask}/>}</>;
}
