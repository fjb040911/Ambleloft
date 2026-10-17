import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {interruptedQuestion} from '../core/inputs/interrupted-question.mjs';
import type {AgentRun,PersistentInputRequest} from './types';
import {t,useLanguage} from './i18n';
import InputRequestFields from './InputRequestFields';
import {inputRequestController} from './input-request-controller';
import QuestionQueue from './QuestionQueue';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Textarea} from './components/ui/textarea';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from './components/ui/alert-dialog';
import {ChevronDown,ChevronUp,ClipboardList,X} from 'lucide-react';

function RequestDecision({controller,request,action,disabled,onDone,resume}:{controller:ReturnType<typeof inputRequestController>;request:PersistentInputRequest;action:'cancel'|'acceptProposal'|'rejectProposal';disabled:boolean;onDone():Promise<void>;resume?:{expectedPolicyGeneration:number}}){
 const [preview,setPreview]=useState<PersistentInputRequest|null>(null);
 const label=action==='cancel'?'取消这项补充':action==='rejectProposal'?'保留原填写':'查看并确认';
 const proposal=preview?.proposal;
 const fields=proposal?.kind==='replacement'?proposal.record.template.steps[0].fields:preview?.template.steps[0].fields||[];
 const values=proposal?.kind==='replacement'?proposal.record.draft:proposal?.answer.values||{};
 return <AlertDialog onOpenChange={open=>{if(open)setPreview(structuredClone(request));}}><AlertDialogTrigger disabled={disabled} render={<Button size="sm" variant="outline"/>}>{t(label)}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(action==='cancel'?'取消这项补充？':action==='rejectProposal'?'保留原填写？':'确认补充内容')}</AlertDialogTitle><AlertDialogDescription>{t(action==='cancel'?'这项补充将结束，已填写内容保留在记录中，不会作为回答提交。':action==='rejectProposal'?'忽略这次建议，继续填写原来的表单。':'请检查下方内容。确认后原填写不会自动迁移，历史记录仍然保留。')}</AlertDialogDescription></AlertDialogHeader>
 {action==='acceptProposal'&&proposal&&<div className="flex max-h-[40dvh] flex-col gap-3 overflow-y-auto"><p className="font-medium">{proposal.kind==='replacement'?proposal.record.template.title:preview?.template.title}</p>{proposal.kind==='replacement'&&<p className="text-sm text-muted-foreground">{proposal.record.reason}</p>}<dl className="flex flex-col gap-2">{fields.map(f=><div key={f.name}><dt className="text-sm text-muted-foreground">{f.label}</dt><dd className="m-0 whitespace-pre-wrap break-words">{f.options?.find(o=>o.value===values[f.name])?.label??(values[f.name]===undefined?t('尚未填写'):typeof values[f.name]==='boolean'?t(values[f.name]?'是':'否'):String(values[f.name]))}</dd></div>)}</dl>{proposal.kind==='messageResolution'&&proposal.answer.sourceMessages?.map(m=><blockquote key={m.id} className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">{m.text}</blockquote>)}</div>}
 <AlertDialogFooter><AlertDialogCancel>{t('返回')}</AlertDialogCancel><AlertDialogAction onClick={()=>{if(preview)void controller.decide(action,preview.revision,preview.proposal?.id,resume).then(onDone);}}>{t(action==='acceptProposal'?(resume?'确认并继续':'确认采用'):action==='cancel'?'确认取消':'保留原填写')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function RequestEditor({request,paused,generation,archived,refresh,onSubmitted}:{request:PersistentInputRequest;paused:boolean;generation:number;archived:boolean;refresh():Promise<void>;onSubmitted():void}){
 const controller=inputRequestController(request),state=useSyncExternalStore(controller.subscribe,controller.snapshot),body=useRef<HTMLDivElement>(null);
 useEffect(()=>controller.update(request),[controller,request]);
 const locked=archived||state.request.state!=='pending'||state.request.sourceInvalid||state.conflict;
 const submit=async()=>{await controller.submit(paused?{expectedPolicyGeneration:generation}:undefined);await refresh();if(controller.snapshot().request.state==='answered')onSubmitted();body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();};
 return <>
  <CardHeader className="max-h-[16dvh] shrink-0 overflow-y-auto"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{t(request.originKey==='model'?'当前任务':request.originKey.startsWith('extension:')?'扩展表单':'技能表单')}</Badge><span className="text-xs text-muted-foreground" role="status">{t(state.busy?'正在保存…':state.dirty?'尚未保存':'填写已保存')}</span></div><CardTitle>{request.template.title}</CardTitle><CardDescription>{request.reason}</CardDescription></CardHeader>
  <CardContent ref={body} className="min-h-0 max-h-[min(35dvh,360px)] overflow-y-auto overscroll-contain">
   <div className="flex flex-col gap-4">
    {request.template.description&&<p className="text-sm text-muted-foreground">{request.template.description}</p>}
    {state.error&&<Alert variant="destructive"><AlertDescription>{t(state.error)}
     {state.conflict&&<Textarea readOnly aria-label={t('保留的填写内容')} className="max-h-24 text-foreground" value={request.template.steps[0].fields.map(f=>`${f.label}：${f.options?.find(o=>o.value===state.values[f.name])?.label??String(state.values[f.name]??'')}`).join('\n')}/>}
     {state.conflict?<AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="outline"/>}>{t('查看最新版本')}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('载入最新填写内容？')}</AlertDialogTitle><AlertDialogDescription>{t('这会放弃此窗口尚未保存的填写。请先复制需要保留的内容。')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('取消')}</AlertDialogCancel><AlertDialogAction onClick={()=>void controller.loadLatest().then(refresh)}>{t('载入最新版本')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>:<Button size="sm" variant="outline" disabled={state.busy} onClick={()=>void controller.save().then(refresh)}>{t('重试')}</Button>}
    </AlertDescription></Alert>}
    {state.request.proposal&&<Alert><AlertDescription><p>{t(state.request.proposal.kind==='replacement'?'任务提出了新的补充表单，你的原填写仍保留。':'任务从聊天中整理了一份回答，请确认是否采用。')}</p><div className="mt-2 flex flex-wrap gap-2"><RequestDecision controller={controller} request={state.request} action="acceptProposal" disabled={!!locked||state.busy||state.dirty} resume={paused&&state.request.proposal.kind==='messageResolution'?{expectedPolicyGeneration:generation}:undefined} onDone={refresh}/><RequestDecision controller={controller} request={state.request} action="rejectProposal" disabled={!!locked||state.busy||state.dirty} onDone={refresh}/></div>{paused&&state.request.proposal.kind==='messageResolution'&&<p>{t('仅发送这份回答，其他待发内容继续保留。')}</p>}</AlertDescription></Alert>}
    <InputRequestFields request={state.request} values={state.values} onChange={(name,value)=>controller.change(name,value)} errors={state.fields} disabled={locked||state.submitting}/>
   </div>
  </CardContent>
  <CardFooter className="flex shrink-0 flex-wrap justify-between gap-3"><RequestDecision controller={controller} request={state.request} action="cancel" disabled={!!locked||state.busy||state.dirty} onDone={refresh}/><p className="text-xs text-muted-foreground">{t(paused?'仅发送这份回答，其他待发内容继续保留。':'提交后用于继续当前任务，不会执行业务操作。')}</p><Button size="sm" disabled={!!locked||state.busy} onClick={()=>void submit()}>{t(paused?'提交并继续':'提交补充信息')}</Button></CardFooter>
 </>;
}

export default function SupplementalInputDock({run,requests,policy,refresh,selection}:{run:AgentRun;requests:PersistentInputRequest[];policy?:{paused:boolean;generation:number};refresh():Promise<void>;selection?:{id:string;key:number}}){
 useLanguage();const [selected,setSelected]=useState(''),[collapsed,setCollapsed]=useState(false),[dismissed,setDismissed]=useState(''),region=useRef<HTMLElement>(null);
 const pending=requests.filter(r=>r.state==='pending'||inputRequestController(r).snapshot().dirty),native=run.questions||[];
 const options=[...native.map(r=>({id:'native:'+r.id,title:r.questions[0]?.question||t('等待你的回答')})),...pending.map(r=>({id:r.id,title:r.template.title}))];
 const active=options.some(o=>o.id===selected)?selected:options[0]?.id;
 useEffect(()=>{if(selection){setSelected(selection.id);setCollapsed(false);region.current?.focus();}},[selection]);
 const lastRecord=interruptedQuestion(run.messages);
 const interrupted=lastRecord?.inputRecord?.state==='pending'&&!native.length&&!['preparing','running','waiting','stopping'].includes(run.status)?lastRecord:undefined;
 if(!options.length){
  if(!interrupted)return null;
  return <section aria-label={t('上次未回答的问题')} className="mb-3">
   {dismissed===interrupted.id?<Button size="sm" variant="ghost" onClick={()=>setDismissed('')}>{t('查看上次未回答的问题')}</Button>:<Card size="sm"><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>{t('上次未回答的问题')}</CardTitle><Button size="icon" variant="ghost" aria-label={t('收起问题提示')} onClick={()=>setDismissed(interrupted.id)}><X/></Button></div><CardDescription>{t('任务停止后，原提问已失效。你可以在聊天中补充回答；仅发送“继续”不会补齐这些信息。')}</CardDescription></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5">{interrupted.inputRecord!.questions.map(q=><li key={q.id} className="whitespace-pre-wrap break-words">{q.label}</li>)}</ul></CardContent></Card>}
  </section>;
 }
 return <section ref={region} tabIndex={-1} aria-label={t('待补充信息')} className="mb-3 min-w-0">
  <Card size="sm" className="max-h-[55dvh]">
   <div className="flex shrink-0 items-center gap-2 px-4"><ClipboardList className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/><span className="text-sm font-medium">{t('待补充信息')}</span><Badge variant="secondary">{options.length}</Badge><div className="min-w-0 flex-1"/>
    <Button variant="ghost" size="sm" aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{t(collapsed?'继续填写':'稍后填写')}{collapsed?<ChevronDown data-icon="inline-end"/>:<ChevronUp data-icon="inline-end"/>}</Button>
   </div>
   <div className={collapsed?'hidden':'flex min-h-0 flex-col gap-3 overflow-hidden'}>
    {options.length>1&&<div className="shrink-0 px-4"><NativeSelect className="w-full [&_select]:text-foreground" aria-label={t('选择待补充事项')} value={active} onChange={e=>setSelected(e.target.value)}>{options.map(o=><NativeSelectOption key={o.id} value={o.id}>{o.title}</NativeSelectOption>)}</NativeSelect></div>}
    <QuestionQueue run={run} selectedId={active?.startsWith('native:')?active.slice(7):null}/>
    {pending.map(request=><div key={request.id} className={active===request.id?'flex min-h-0 flex-col gap-3 overflow-hidden':'hidden'}><RequestEditor request={request} paused={!!policy?.paused} generation={policy?.generation||0} archived={!!run.archivedAt||run.status==='stopping'} refresh={refresh} onSubmitted={()=>setCollapsed(true)}/></div>)}
   </div>
  </Card>
 </section>;
}
