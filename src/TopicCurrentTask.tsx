import {useConfirm} from './Confirmation';
import {useEffect,useRef,useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Button} from './components/ui/button';
import TaskStatusBadge from './TaskStatusBadge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './components/ui/dropdown-menu';
import {Item,ItemGroup,ItemContent,ItemTitle,ItemDescription,ItemActions} from './components/ui/item';
import {Failure,useCopy} from './WorkforceInputs';
import {topicTask,topicTaskDisplayStatus,topicTaskLabel,topicTaskVisualState,type TopicContext} from './discussion-topics';
import {executionState} from './workforce-execution-state';

export default function TopicCurrentTask({context,disabled,prepare,open,refresh,onDiscard}:{context:TopicContext;disabled:boolean;prepare(id?:string):void;open(id:string,packageId?:string):void;refresh():Promise<void>;onDiscard():void}){
 const confirm=useConfirm(),L=useCopy(),task=topicTask(context),{plan,draft,attention}=task;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflictsOpen,setConflictsOpen]=useState(false);
 const actionRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!task.conflict)setConflictsOpen(false);},[task.conflict]);
 const control=async(action:'start'|'resume')=>{if(!plan||busy||disabled||task.conflict||plan.status==='pausing')return;setBusy(true);setError('');try{await window.desktop!.spaces!.controlPlan({id:plan.id,expectedRevision:plan.revision,commandId:crypto.randomUUID(),action});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const discard=async(id:string)=>{const d=task.drafts.find(d=>d.id===id);if(!d||busy||disabled||!await confirm({title:L('结束这份草稿？','End this draft?'),description:L('保留讨论和草稿记录，不会执行其中的任务。','Keep the discussion and draft record without executing its tasks.'),action:L('结束草稿','End draft')}))return;setBusy(true);setError('');try{await window.desktop!.spaces!.discardTaskDraft({id:d.id,expectedRevision:d.revision});onDiscard();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const name=task.conflict?L('存在多个未结束任务','Multiple unfinished tasks'):plan?.name||draft?.value.name||(task.status==='ended'?L('本次任务已结束','Task finished'):L('明确目标后生成任务','Create a task from your goal'));
 // A paused plan may still have a completed delivery. Keep acceptance one click
 // away; resuming is a separate explicit action, never a side effect of review.
 const reviewing=attention?.status==='review'&&!attention.stale;
 const action=task.conflict?{label:L('处理任务冲突','Resolve task conflicts'),run:()=>setConflictsOpen(true)}:
  reviewing?{label:L('查看交付并验收','Review delivery'),run:()=>open(plan!.id,attention.id)}:
  draft?{label:draft.status!=='ready'?L('继续完善','Continue refining'):plan?L('确认修订','Review revision'):L('查看并确认','Review and confirm'),run:()=>prepare(draft.id),mutates:true}:
  plan?.status==='pausing'?{label:L('查看进度','View progress'),run:()=>open(plan.id)}:
  task.status==='paused'?{label:L('恢复执行','Resume task'),run:()=>void control('resume'),mutates:true}:
  task.status==='attention'?{label:L('查看并处理','View and resolve'),run:()=>open(plan!.id,attention?.id)}:
  task.status==='pending'?{label:L('开始执行','Start task'),run:()=>void control('start'),mutates:true}:
  plan?{label:L('查看进度','View progress'),run:()=>open(plan.id)}:
  {label:task.status==='ended'?L('创建下一项任务','Create next task'):L('整理为任务','Create task'),run:()=>prepare(),mutates:true};
 const canResume=task.status==='paused'&&plan?.status!=='pausing'&&reviewing;
 return <section className="wf-current-task" aria-label={L('本次任务','Current task')}>
  <div className="wf-current-task-row">
   <div className="wf-current-task-copy">
    <TaskStatusBadge state={topicTaskVisualState(task)}>{task.conflict?L('需处理','Needs attention'):plan?.status==='pausing'?L('正在暂停','Pausing'):topicTaskLabel(topicTaskDisplayStatus(task),L)}</TaskStatusBadge>
    {!task.conflict&&(plan||draft)?<Button className="wf-current-task-name" size="sm" variant="ghost" title={name} aria-label={L('查看任务：','View task: ')+name} disabled={!plan&&(disabled||busy)} onClick={()=>plan?open(plan.id):prepare(draft!.id)}><span>{name}</span></Button>:<strong className="sr-only">{name}</strong>}
   </div>
   <div className="wf-current-task-actions">
    <Button ref={actionRef} className="wf-current-task-primary" title={name} size="sm" variant={reviewing&&!task.conflict?'default':'outline'} disabled={busy||!!action.mutates&&disabled} onClick={action.run}>{busy?L('正在提交…','Submitting…'):action.label}</Button>
    {!task.conflict&&(draft||canResume)&&<DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={L('更多任务操作','More task actions')}/> }><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent side="top" align="end"><DropdownMenuGroup>
     {canResume&&<DropdownMenuItem disabled={disabled||busy} onClick={()=>void control('resume')}>{L('恢复执行','Resume task')}</DropdownMenuItem>}
     {draft&&reviewing&&<DropdownMenuItem disabled={disabled||busy} onClick={()=>prepare(draft.id)}>{L('确认修订','Review revision')}</DropdownMenuItem>}
     {draft&&<DropdownMenuItem disabled={disabled||busy} onClick={()=>void discard(draft.id)}>{L('结束草稿','End draft')}</DropdownMenuItem>}
    </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
   </div>
  </div>
  {!conflictsOpen&&<Failure message={error}/>}
  <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}><DialogContent className="wf-dialog wf-task-conflicts sm:max-w-xl" finalFocus={actionRef}>
   <DialogHeader><DialogTitle>{L('处理任务冲突','Resolve task conflicts')}</DialogTitle><DialogDescription>{L('同一话题只能推进一项任务。查看已有任务，结束不再需要的草稿；计划的暂停、终止与验收仍在任务详情中处理。','A topic can progress one task at a time. Review existing tasks and end unneeded drafts. Pause, stop and review plans in task details.')}</DialogDescription></DialogHeader>
   <Failure message={error}/>
   <ItemGroup className="wf-task-conflict-list">{task.unfinished.map(p=><Item key={p.id} role="listitem" size="sm"><ItemContent><ItemTitle>{p.name}</ItemTitle><ItemDescription>{executionState(p.status,L)}</ItemDescription></ItemContent><ItemActions><Button size="sm" variant="outline" onClick={()=>{setConflictsOpen(false);open(p.id);}}>{L('查看任务','View task')}</Button></ItemActions></Item>)}
    {task.drafts.map(d=><Item key={d.id} role="listitem" size="sm"><ItemContent><ItemTitle>{d.value.name||L('未命名草稿','Untitled draft')}</ItemTitle><ItemDescription>{d.basePlanId?L('修订草稿','Revision draft'):L('待确认草稿 · 尚未执行','Draft · not executed')}</ItemDescription></ItemContent><ItemActions><Button size="sm" variant="ghost" disabled={disabled||busy} onClick={()=>{setConflictsOpen(false);prepare(d.id);}}>{L('查看草稿','View draft')}</Button><Button size="sm" variant="outline" disabled={disabled||busy} onClick={()=>void discard(d.id)}>{L('结束草稿','End draft')}</Button></ItemActions></Item>)}
   </ItemGroup>
   <DialogFooter><Button variant="outline" onClick={()=>setConflictsOpen(false)}>{L('关闭','Close')}</Button></DialogFooter>
  </DialogContent></Dialog>
 </section>;
}
