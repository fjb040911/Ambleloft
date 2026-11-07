import {ArrowLeft} from 'lucide-react';
import {Button} from './components/ui/button';
import {PlansPanel} from './WorkforcePlans';
import {useCopy} from './WorkforceInputs';
import type {Space,SpaceDocument,Employee,WorkPlan} from './workforce-types';
import type {Project,ProviderCatalog} from './types';
export type TopicPlanTarget={planId:string;packageId?:string};
export default function DiscussionTopicDetail({topicId,plan,space,spaceDocuments,discussionIds,employees,projects,catalog,back,source,refresh,onOpenTask,planTarget}:{topicId:string;plan:WorkPlan;space:Space;spaceDocuments:SpaceDocument[];discussionIds:string[];employees:Employee[];projects:Project[];catalog:ProviderCatalog;back(focus?:boolean):void;source(id:string):void;refresh():Promise<void>;onOpenTask(id:string):void;planTarget:TopicPlanTarget}){
 const L=useCopy();
 return <section className="wf-topic-detail" aria-label={L('本次任务详情','Current task details')}><header className="wf-topic-detail-heading"><Button variant="ghost" size="sm" onClick={()=>back()}><ArrowLeft data-icon="inline-start"/>{L('返回讨论','Back to discussion')}</Button><h3 tabIndex={-1}>{plan.name}</h3></header><PlansPanel key={topicId+plan.id} embeddedScope={topicId} onDiscuss={()=>back(true)} onOpenDiscussion={source} discussionIds={discussionIds} space={space} plans={[plan]} employees={employees} projects={projects} documents={spaceDocuments} catalog={catalog} refresh={refresh} onOpenTask={onOpenTask} target={planTarget} clearTarget={()=>{}}/></section>;
}
