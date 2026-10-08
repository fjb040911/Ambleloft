import {useState,type FormEvent} from 'react';
import {t} from './i18n';
import type {AgentRun} from './types';
import {Questionnaire,QuestionnaireActions,QuestionnaireChoice,QuestionnaireChoiceDescription,QuestionnaireChoices,QuestionnaireError,QuestionnaireInput,QuestionnaireItem,QuestionnaireNext,QuestionnairePrevious,QuestionnaireProgress,QuestionnaireSubmit,QuestionnaireTitle} from './components/ui/questionnaire';

function QuestionForm({runId,request}:{runId:string;request:NonNullable<AgentRun['questions']>[number]}) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [answered,setAnswered]=useState<Record<string,boolean>>({});
 const [item,setItem]=useState(request.questions[0]?.id);
 const index=request.questions.findIndex(q=>q.id===item);
 const items=request.questions.map(q=>({name:q.id,required:true,choices:q.options?.map(o=>({value:o.label}))}));
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const data=new FormData(event.currentTarget);
  const answers=Object.fromEntries(request.questions.map(q=>[q.id,String(data.get(q.id)||'').trim()]));
  const missing=request.questions.find(q=>!answers[q.id]);
  if(missing){setItem(missing.id);setError(t('请回答每个问题'));return;}
  setBusy(true);setError('');
  try{if(!window.desktop)throw new Error(t('请在桌面版中回答'));await window.desktop.answerRun({runId,requestId:request.id,answers});}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Questionnaire className="task-questionnaire" aria-label={t('任务澄清')} aria-busy={busy} items={items} item={item} onItemChange={setItem} onSubmit={event=>void submit(event)}>
 <div className="flex items-center justify-between gap-3"><strong>{t('等待你的回答')}</strong>{items.length>1&&<QuestionnaireProgress aria-live="polite">{t('问题')} {index+1} / {items.length}</QuestionnaireProgress>}</div>
 <div className="questionnaire-body">
 {request.questions.map(q=><QuestionnaireItem key={q.id} name={q.id} required disabled={busy} onStatusChange={status=>setAnswered(previous=>previous[q.id]===(status==='answered')?previous:{...previous,[q.id]:status==='answered'})}>
 <QuestionnaireTitle>{q.question}</QuestionnaireTitle>
 <QuestionnaireChoices>
 {q.options?.map((option,index)=><QuestionnaireChoice key={index} value={option.label}><span>{option.label}</span>{option.description&&<QuestionnaireChoiceDescription>{option.description}</QuestionnaireChoiceDescription>}</QuestionnaireChoice>)}
 <QuestionnaireInput aria-label={q.question} placeholder={t(q.options?.length?'或填写其他回答…':'请输入你的回答…')} type={q.isSecret?'password':'text'} autoComplete="off" maxLength={20000}/>
 </QuestionnaireChoices>
 <QuestionnaireError>{t('请选择一个选项或填写回答')}</QuestionnaireError>
 </QuestionnaireItem>)}
 </div>
 {error&&<p role="alert" className="error-banner">{error}</p>}
 <QuestionnaireActions><QuestionnairePrevious disabled={busy}>{t('上一题')}</QuestionnairePrevious><QuestionnaireNext disabled={busy||!answered[item]}>{t('下一题')}</QuestionnaireNext><QuestionnaireSubmit disabled={busy||request.questions.some(q=>!answered[q.id])}>{t(busy?'正在提交…':'提交回答')}</QuestionnaireSubmit></QuestionnaireActions>
 </Questionnaire>;
}
export default function QuestionQueue({run}:{run:AgentRun}) {return <div className="question-queue">{run.questions?.map(request=><QuestionForm key={run.id+request.id} runId={run.id} request={request}/>)}</div>;}
