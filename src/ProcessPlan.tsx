import {CircleCheck, CircleDot, Circle, Route} from 'lucide-react';
import {Trace,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent,TraceLine,TraceIcon,TraceTitle,TraceDescription} from './components/ui/trace';
import {useProcessDisclosure} from './process-disclosure';
import type {ConversationTurn} from './conversation-turns';
import {t} from './i18n';

// shadcn Plan composition. Store disclosure separately so collapsed histories
// can unmount the plan without losing the user's choice.
export default function ProcessPlan({plan,active,paused,outcome}:{plan:NonNullable<ConversationTurn['plan']>;active:boolean;paused:boolean;outcome:ConversationTurn['outcome']}){
 const [open,setOpen]=useProcessDisclosure('plan',active);
 if(!plan.steps.length)return null;
 const completed=plan.steps.filter(step=>step.status==='completed').length;
 const running=active&&!paused&&plan.steps.some(step=>step.status==='inProgress');
 return <Trace aria-label={t('任务清单')}>
  <TraceCollapsible open={open} onOpenChange={setOpen}>
   <TraceCollapsibleTrigger><TraceLine status={running?'running':undefined}><TraceIcon><Route/></TraceIcon><TraceTitle>{t('任务清单')}</TraceTitle><TraceDescription>{completed}/{plan.steps.length}</TraceDescription></TraceLine></TraceCollapsibleTrigger>
   <TraceCollapsibleContent>{open&&<>
    {plan.explanation&&<p className="mb-2 text-sm text-muted-foreground">{plan.explanation}</p>}
    <Trace>{plan.steps.map((step,index)=>{
     const done=step.status==='completed',current=step.status==='inProgress';
     const label=done?'已完成':current?active?(paused?'已暂停':'进行中'):outcome==='completed'?'未确认完成':'已暂停':'待处理';
     return <TraceLine key={index} status={current&&running?'running':!done?'pending':undefined}><TraceIcon>{done?<CircleCheck/>:current?<CircleDot/>:<Circle/>}</TraceIcon><TraceTitle title={step.step}>{step.step}</TraceTitle><TraceDescription>{t(label)}</TraceDescription></TraceLine>;
    })}</Trace>
   </>}</TraceCollapsibleContent>
  </TraceCollapsible>
 </Trace>;
}
