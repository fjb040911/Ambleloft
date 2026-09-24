import {useRef,useState} from 'react';
import {Folder,Search,Trash2} from 'lucide-react';
import Modal from './Modal';
import {t} from './i18n';
import type {Project} from './types';
import type {NavTask} from './WorkspaceNavigation';
const key=(task:NavTask)=>(task.draft?'draft:':'run:')+task.id;
export default function ArchivedConversations({tasks,projects,restore,remove}:{tasks:NavTask[];projects:Project[];restore:(task:NavTask)=>Promise<void>;remove:(task:NavTask)=>Promise<void>}) {
 const [query,setQuery]=useState(''),[project,setProject]=useState('all'),[kind,setKind]=useState('all');
 const [selected,setSelected]=useState<Set<string>>(new Set()),[confirmation,setConfirmation]=useState<NavTask[]|null>(null);
 const [pending,setPending]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false);
 const projectKey=(task:NavTask)=>projects.some(p=>p.id===task.projectId)?task.projectId!:'none';
 const projectName=(task:NavTask)=>projects.find(p=>p.id===task.projectId)?.name||t('未关联项目');
 const visible=tasks.filter(task=>(project==='all'||projectKey(task)===project)&&(kind==='all'||(kind==='draft')===!!task.draft)&&`${task.title} ${projectName(task)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(b.archivedAt||'').localeCompare(a.archivedAt||''));
 const groups=new Map<string,{name:string;tasks:NavTask[]}>();
 for(const task of visible){const id=projectKey(task);if(!groups.has(id))groups.set(id,{name:projectName(task),tasks:[]});groups.get(id)!.tasks.push(task);}
 const picked=visible.filter(task=>selected.has(key(task)));
 const changeFilter=(fn:()=>void)=>{fn();setSelected(new Set());setError('');setNotice('');};
 const toggle=(items:NavTask[])=>setSelected(old=>{const next=new Set(old),all=items.every(task=>next.has(key(task)));items.forEach(task=>all?next.delete(key(task)):next.add(key(task)));return next;});
 const ask=(items:NavTask[])=>{setError('');setNotice('');setConfirmation([...items]);setProgress(0);};
 const deleteConfirmed=async()=>{
  if(lock.current||!confirmation)return;lock.current=true;setPending(true);setError('');setProgress(0);
  const failed:NavTask[]=[];let firstError='';
  for(let index=0;index<confirmation.length;index++){
   const task=confirmation[index];
   try{await remove(task);setSelected(old=>{const next=new Set(old);next.delete(key(task));return next;});}
   catch(e){failed.push(task);firstError||=(e as Error).message;}
   setProgress(index+1);
  }
  setNotice(`${t('已删除')} ${confirmation.length-failed.length} ${t('条会话')}`);
  setConfirmation(failed.length?failed:null);
  if(failed.length)setError(`${failed.length} ${t('条会话删除失败，可重试。')} ${firstError}`);
  setPending(false);lock.current=false;
 };
 const restoreOne=async(task:NavTask)=>{if(lock.current)return;lock.current=true;setPending(true);setError('');try{await restore(task);setSelected(old=>{const next=new Set(old);next.delete(key(task));return next;});}catch(e){setError((e as Error).message);}finally{lock.current=false;setPending(false);}};
 return <div className="archived-conversations"><div className="section-heading"><h1>{t('已归档会话')}</h1><button className="secondary-button danger" disabled={pending||!visible.length} onClick={()=>ask(visible)}><Trash2 size={15}/>{t(query||project!=='all'||kind!=='all'?'删除筛选结果':'全部删除')}</button></div><p className="page-description">{t('还原后继续工作，或永久删除不再需要的记录。')}</p>
 <div className="archive-filters"><label className="archive-search"><Search size={17}/><input type="search" aria-label={t('搜索已归档会话')} placeholder={t('搜索会话标题或项目')} value={query} disabled={pending} onChange={e=>changeFilter(()=>setQuery(e.target.value))}/></label><select aria-label={t('会话类型')} disabled={pending} value={kind} onChange={e=>changeFilter(()=>setKind(e.target.value))}><option value="all">{t('全部会话')}</option><option value="chat">{t('已执行会话')}</option><option value="draft">{t('草稿')}</option></select><select aria-label={t('筛选项目')} disabled={pending} value={project} onChange={e=>changeFilter(()=>setProject(e.target.value))}><option value="all">{t('所有项目')}</option><option value="none">{t('未关联项目')}</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
 <div className="archive-selection"><label><input type="checkbox" disabled={pending||!visible.length} checked={!!visible.length&&picked.length===visible.length} ref={node=>{if(node)node.indeterminate=picked.length>0&&picked.length<visible.length;}} onChange={()=>toggle(visible)}/>{t('全选当前结果')}</label><span>{visible.length} / {tasks.length} {t('条会话')} · {t('已选择')} {picked.length}</span><button className="text-button danger" disabled={pending||!picked.length} onClick={()=>ask(picked)}>{t('删除所选')} ({picked.length})</button></div>
 {error&&!confirmation&&<p role="alert" className="error-banner">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!visible.length?<div className="empty-state"><Folder size={30}/><p>{t(tasks.length?'没有匹配的已归档会话。':'暂无已归档会话。')}</p></div>:[...groups].map(([id,group])=><section key={id} className="archive-project-group" aria-label={group.name}><header><label><input type="checkbox" aria-label={t('选择项目分组')+' '+group.name} checked={group.tasks.every(task=>selected.has(key(task)))} ref={node=>{if(node)node.indeterminate=group.tasks.some(task=>selected.has(key(task)))&&!group.tasks.every(task=>selected.has(key(task)));}} disabled={pending} onChange={()=>toggle(group.tasks)}/><Folder size={17}/><h2>{group.name}</h2></label><span>{group.tasks.length} {t('条会话')}</span></header><div className="archive-group-card">{group.tasks.map(task=><div className="archive-row" key={key(task)}><input type="checkbox" aria-label={t('选择会话')+' '+task.title} disabled={pending} checked={selected.has(key(task))} onChange={()=>toggle([task])}/><div className="archive-task-info"><strong title={task.title}>{task.title}</strong><small>{task.archivedAt?new Date(task.archivedAt).toLocaleString():''} {task.draft?t('· 草稿'):''}</small></div><button className="text-button danger" disabled={pending} onClick={()=>ask([task])} title={t('永久删除')} aria-label={t('永久删除')}><Trash2 size={16}/></button><button className="secondary-button" disabled={pending} onClick={()=>void restoreOne(task)}>{t('还原')}</button></div>)}</div></section>)}
 {confirmation&&<Modal title={t('确认永久删除')} busy={pending} close={()=>setConfirmation(null)}><p>{t('将永久删除以下会话，无法撤销；不会删除本机项目文件。')}</p><strong>{confirmation.length} {t('条会话')}</strong><ul className="archive-confirm-list">{confirmation.map(task=><li key={key(task)}>{task.title}<small>{projectName(task)}</small></li>)}</ul>{error&&<p role="alert" className="error-banner">{error}</p>}{pending&&<p role="status">{t('正在删除')} {progress} / {confirmation.length}</p>}<div className="modal-actions"><button className="secondary-button" disabled={pending} onClick={()=>setConfirmation(null)}>{t('取消')}</button><button className="danger-button" disabled={pending} onClick={()=>void deleteConfirmed()}>{t('确认永久删除')}</button></div></Modal>}
 </div>;
}
