import {useState} from 'react';
import {t} from './i18n';
import type {AgentRun} from './types';

function QuestionForm({runId,request}:{runId:string;request:NonNullable<AgentRun['questions']>[number]}) {
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(){setBusy(true);setError('');try{if(!window.desktop)throw new Error('请在桌面版中回答');await window.desktop.answerRun({runId,requestId:request.id,answers});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="question-card" aria-label={t('任务澄清')} onSubmit={e=>{e.preventDefault();void submit();}}>
 <h2>{t('等待你的回答')}</h2>
 {request.questions.map(q=><fieldset key={q.id} disabled={busy}><legend>{q.question}</legend>
 {!!q.options?.length&&<div className="question-options">{q.options.map((option,index)=><label key={index}><input type="radio" name={request.id+q.id} checked={answers[q.id]===option.label} onChange={()=>setAnswers({...answers,[q.id]:option.label})}/><span>{option.label}<small>{option.description}</small></span></label>)}</div>}
 <label>{t('你的回答')}<input aria-label={q.question} type={q.isSecret?'password':'text'} autoComplete="off" maxLength={20000} value={answers[q.id]||''} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>
 </fieldset>)}
 {error&&<p role="alert">{error}</p>}
 <button className="primary-button" disabled={busy||request.questions.some(q=>!answers[q.id]?.trim())}>{t(busy?'正在提交…':'提交回答')}</button>
 </form>;
}
export default function QuestionQueue({run}:{run:AgentRun}) {return <div className="question-queue">{run.questions?.map(request=><QuestionForm key={run.id+request.id} runId={run.id} request={request}/>)}</div>;}
