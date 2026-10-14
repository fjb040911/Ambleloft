import TaskUi,{type UiFlow} from './TaskUi';
import {t} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import FormFields,{type FormValues as Values,type FormFieldDefinition as FieldDef} from './FormFields';
type Flow={displayTemplate?:Flow['template'];displayLocale?:string;id:string;runId:string;turnKey:string;revision:number;status:string;step:number;error?:string;staleFields?:string[];results?:Record<string,unknown>;drafts:Record<string,Values>;template:{title:string;description?:string;steps:{id:string;title:string;description?:string;fields:FieldDef[];next?:{label:string}}[];submit:{label:string;kind?:string}}};
type Api={list:(p:{runId:string})=>Promise<Flow[]>;action:(p:object)=>Promise<Flow|{flow:Flow;errors:Record<string,string>}>;onChanged:(fn:()=>void)=>()=>void};
const pendingDrafts=new Map<string,{values:Values;flow:Flow;touched?:string[]}>();
const api=()=> (window.desktop as unknown as {forms?:Api})?.forms;
export function useTaskForms(runId:string){
 const [flows,setFlows]=useState<Flow[]>([]);
 useEffect(()=>{
  let live=true,running=false,queued=false;
  const client=api();setFlows([]);
  const load=async()=>{
   if(!client||!live)return;
   if(running){queued=true;return;}
   running=true;
   do {
    queued=false;
    try{const next=await client.list({runId});if(live)setFlows(next);}catch{/* A later broadcast retries loading. */}
   }while(live&&queued);
   running=false;
  };
  void load();const off=client?.onChanged(()=>void load());
  return()=>{live=false;off?.();};
 },[runId]);
 return flows;
}
export default function TaskForms({flows,archived}:{flows:Flow[];archived:boolean}){
 return <>{flows.map(f=>(f as unknown as UiFlow).kind==='ui'?<TaskUi key={f.id} flow={f as unknown as UiFlow} archived={archived}/>:<FormCard key={f.id} flow={f} archived={archived}/>)}</>;
}
function FormCard({flow,archived}:{flow:Flow;archived:boolean}){
 const [current,setCurrent]=useState(pendingDrafts.get(flow.id)?.flow||flow),[values,setValues]=useState<Values>(pendingDrafts.get(flow.id)?.values||flow.drafts[flow.template.steps[flow.step].id]||{}),[dirty,setDirty]=useState(pendingDrafts.has(flow.id)),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const touchedFields=useRef(new Set(pendingDrafts.get(flow.id)?.touched||[]));
 const editingVersion=useRef(0),inFlight=useRef(false),latestValues=useRef(values);
 const template=(flow.revision===current.revision?flow.displayTemplate:current.displayTemplate)||current.template;
 const step=template.steps[current.step],locked=archived||current.status!=='editing'||busy;
 useEffect(()=>{
  // A broadcast may arrive before the save response. Never replace a local edit
  // or apply an older snapshot after our own successful save.
  if(!dirty&&!inFlight.current&&flow.revision>current.revision){
   pendingDrafts.delete(flow.id);setCurrent(flow);setError('');setErrors({});
   const next=flow.drafts[flow.template.steps[flow.step].id]||{};
   latestValues.current=next;setValues(next);
  }
 },[flow,dirty,busy,saving,current.revision]);
 useEffect(()=>{if(!dirty||busy||saving||error)return;const timer=setTimeout(()=>void act('save'),700);return()=>clearTimeout(timer);},[values,dirty,busy,saving,error]);
 const change=(name:string,value:string|boolean)=>{
  const next={...latestValues.current,[name]:value};editingVersion.current++;touchedFields.current.add(name);
  latestValues.current=next;pendingDrafts.set(current.id,{values:next,flow:current,touched:[...touchedFields.current]});setValues(next);setDirty(true);
 };
 async function act(action:string,field?:string){
  const client=api();if(!client||inFlight.current)return;
  inFlight.current=true;
  if(action==='save')setSaving(true);else{setBusy(true);setErrors({});}
  setError('');
  try{
   let next=current;
   if(dirty){
    const version=editingVersion.current,snapshot=latestValues.current;
    next=await client.action({runId:current.runId,id:current.id,revision:current.revision,action:'save',values:snapshot,touchedFields:[...touchedFields.current]}) as Flow;
    setCurrent(next);
    if(version===editingVersion.current){pendingDrafts.delete(current.id);touchedFields.current.clear();setDirty(false);}
    else{pendingDrafts.set(current.id,{values:latestValues.current,flow:next,touched:[...touchedFields.current]});setDirty(true);}
   }
   if(action!=='save'){
    const result=await client.action({runId:next.runId,id:next.id,revision:next.revision,action,field});
    if('flow'in result){next=result.flow;setErrors(result.errors);}else next=result;
    const nextValues=next.drafts[next.template.steps[next.step].id]||{};
    setCurrent(next);latestValues.current=nextValues;setValues(nextValues);
   }
  }catch(e){setError((e as Error).message);}
  finally{inFlight.current=false;setBusy(false);setSaving(false);}
 }
 const answers=Object.fromEntries(current.template.steps.flatMap(s=>s.fields.map(f=>{const v=s.id===step.id?values[f.name]:current.drafts[s.id]?.[f.name];return [s.id+'.'+f.name,f.type==='number'&&typeof v==='string'&&v.trim()!==''?Number(v):v];})));
 const visibleFields=step.fields.filter(f=>!f.visibleWhen||answers[f.visibleWhen.field]===f.visibleWhen.equals);
 return <Card className="my-4" aria-label={template.title}>
  <CardHeader><CardTitle>{template.title}</CardTitle><CardDescription aria-live="polite">{current.status==='completed'?(current.template.submit.kind==='chat'?t('已发送'):t('已提交')):current.status==='unknown'?t('提交结果待核实，请勿重复提交'):current.status==='pending'?t('答案已保存，正在送达。你可以继续其他操作。'):t('第 {current} / {total} 步 · {title}').replace('{current}',String(current.step+1)).replace('{total}',String(current.template.steps.length)).replace('{title}',step.title)}</CardDescription>{template.description&&<CardDescription>{template.description}</CardDescription>}{step.description&&step.description!==template.description&&<CardDescription>{step.description}</CardDescription>}</CardHeader>
  <CardContent><FormFields fields={visibleFields} values={values} change={change} locked={locked} errors={errors} renderAfterField={f=>current.staleFields?.includes(step.id+'.'+f.name)?<Alert><AlertDescription>{t('前面的选择已变化，请检查此项。')}<Button size="sm" variant="outline" disabled={locked||saving} onClick={()=>void act('confirmField',f.name)}>{t('确认保留此值')}</Button></AlertDescription></Alert>:null}/>
  {current.status==='completed'&&current.results?.[step.id]!==undefined&&<section className="mt-4 flex flex-col gap-2" aria-label={t('提交结果')}><h4 className="text-sm font-medium">{t('提交结果')}</h4><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs" tabIndex={0}>{JSON.stringify(current.results[step.id],null,2)}</pre></section>}
  {(error||current.error)&&<Alert className="mt-4" variant="destructive"><AlertDescription>{error||current.error}</AlertDescription></Alert>}</CardContent>
  <CardFooter className="gap-2 flex-wrap border-border">{current.status==='unknown'&&<Button variant="outline" disabled={busy||archived} onClick={()=>void act('reconcile')}>{t('核实提交结果')}</Button>}{current.status==='editing'&&<>
   {!!current.step&&<Button variant="outline" disabled={locked||saving} onClick={()=>void act('previous')}>{t('上一步')}</Button>}
   <Button variant="ghost" size="sm" disabled={locked||saving||!dirty} onClick={()=>void act('save')}>{saving?t('正在保存…'):t('保存草稿')}</Button>
   <Button disabled={locked||saving} onClick={()=>void act('next')}>{busy?t('正在处理…'):current.step===current.template.steps.length-1?template.submit.label:step.next?.label||t('下一步')}</Button>
  </>}{error&&<Button variant="outline" disabled={busy||saving} onClick={()=>{pendingDrafts.delete(flow.id);setCurrent(flow);latestValues.current=flow.drafts[flow.template.steps[flow.step].id]||{};setValues(latestValues.current);setDirty(false);setError('');}}>{t('放弃当前修改并重新载入')}</Button>}</CardFooter>
 </Card>;
}
