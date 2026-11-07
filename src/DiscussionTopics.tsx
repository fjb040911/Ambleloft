import {useState} from 'react';
import {ChevronDown,Plus} from 'lucide-react';
import {Button} from './components/ui/button';
import TaskStatusBadge from './TaskStatusBadge';
import {Input} from './components/ui/input';
import {Item,ItemGroup,ItemContent} from './components/ui/item';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {executionState} from './workforce-execution-state';
import {useCopy} from './WorkforceInputs';
import type {SpaceRequest} from './workforce-types';
import {topicTask,topicTaskDisplayStatus,topicTaskLabel,topicTaskVisualState,type TopicContext} from './discussion-topics';

export type TopicView='list'|'tasks';
export default function DiscussionTopics({topics,selectedId,open,openPlan,create,archived}:{topics:{root:SpaceRequest;context:TopicContext}[];selectedId:string|null;open(id:string,view:TopicView):void;openPlan(topicId:string,planId:string):void;create():void;archived:boolean}){
 const L=useCopy(),[query,setQuery]=useState('');
 const matches=topics.filter(({root})=>root.prompt.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className="wf-topic-browser" aria-label={L('话题与相关内容','Topics and related content')}>
  <header className="wf-topic-toolbar"><div className="wf-section-title"><h3>{L('话题','Topics')}</h3><Button variant="ghost" size="sm" disabled={archived} onClick={create}><Plus data-icon="inline-start"/>{L('新话题','New topic')}</Button></div><Input aria-label={L('搜索话题','Search topics')} placeholder={L('搜索话题…','Search topics…')} value={query} onChange={e=>setQuery(e.target.value)}/></header>
  <div className="wf-topic-scroll">
   {matches.length?<ItemGroup aria-label={L('话题列表','Topic list')}>{matches.map(({root,context})=>{
    const selected=selectedId===root.id,task=topicTask(context),historyCount=task.history.length+task.discarded.length;
    return <Item role="listitem" key={root.id} size="xs" className="wf-topic-item" data-selected={selected} data-topic-id={root.id}><ItemContent className="min-w-0">
     <button type="button" className="wf-topic-title" aria-current={selected?'true':undefined} onClick={()=>open(root.id,'list')}>{root.prompt}</button>
     <div className="wf-topic-meta"><TaskStatusBadge state={topicTaskVisualState(task)} className="wf-topic-status">{task.conflict?L('待处理','Needs attention'):topicTaskLabel(topicTaskDisplayStatus(task),L)}</TaskStatusBadge></div>
     {!!historyCount&&<Collapsible className="wf-topic-records"><CollapsibleTrigger render={<Button className="max-w-full justify-start px-0" variant="ghost" size="sm"/>}>{L('任务记录','Task records')} · {historyCount}<ChevronDown data-icon="inline-end"/></CollapsibleTrigger><CollapsibleContent><ul aria-label={L('历史任务','Task history')}>
      {task.history.map(p=><li key={p.id}><Button className="wf-topic-record-link h-auto min-w-0 w-full justify-start whitespace-normal p-0 text-left" variant="ghost" size="sm" title={p.name} onClick={()=>openPlan(root.id,p.id)}><span className="min-w-0 flex-1 line-clamp-2 [overflow-wrap:anywhere]">{p.name}</span></Button><TaskStatusBadge state={p.status}>{executionState(p.status,L)}</TaskStatusBadge></li>)}
      {task.discarded.map(d=><li key={d.id}><span className="wf-topic-record-name" title={d.value.name}>{d.value.name||L('未命名草稿','Untitled draft')}</span><TaskStatusBadge state="discarded">{L('已结束，未执行','Ended without execution')}</TaskStatusBadge></li>)}
     </ul></CollapsibleContent></Collapsible>}
    </ItemContent></Item>;
   })}</ItemGroup>:<Empty><EmptyHeader><EmptyTitle>{query?L('没有匹配的话题','No matching topics'):L('还没有话题','No topics yet')}</EmptyTitle><EmptyDescription>{query?L('试试其他关键词。','Try another keyword.'):L('发起讨论，逐步明确目标和下一步。','Start a discussion to clarify your goal and next steps.')}</EmptyDescription></EmptyHeader></Empty>}
  </div>
 </section>;
}
