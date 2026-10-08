import {t} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from './components/ui/card';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Checkbox} from './components/ui/checkbox';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
type Values=Record<string,string|number|boolean>;
type FieldDef={name:string;label:string;type:string;required?:boolean;help?:string;currency?:string;options?:{label:string;value:string}[]};
type Flow={id:string;runId:string;turnKey:string;revision:number;status:string;step:number;error?:string;drafts:Record<string,Values>;template:{title:string;description?:string;steps:{id:string;title:string;fields:FieldDef[];next?:{label:string}}[];submit:{label:string}}};
type Api={list:(p:{runId:string})=>Promise<Flow[]>;action:(p:object)=>Promise<Flow|{flow:Flow;errors:Record<string,string>}>;onChanged:(fn:()=>void)=>()=>void};
const pendingDrafts=new Map<string,{values:Values;flow:Flow}>();
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
 return <>{flows.map(f=><FormCard key={f.id} flow={f} archived={archived}/>)}</>;
}
function FormCard({flow,archived}:{flow:Flow;archived:boolean}){
 const [current,setCurrent]=useState(pendingDrafts.get(flow.id)?.flow||flow),[values,setValues]=useState<Values>(pendingDrafts.get(flow.id)?.values||flow.drafts[flow.template.steps[flow.step].id]||{}),[dirty,setDirty]=useState(pendingDrafts.has(flow.id)),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const editingVersion=useRef(0),inFlight=useRef(false),latestValues=useRef(values);
 const step=current.template.steps[current.step],locked=archived||current.status!=='editing'||busy;
 useEffect(()=>{
  // A broadcast may arrive before the save response. Never replace a local edit
  // or apply an older snapshot after our own successful save.
  if(!dirty&&!inFlight.current&&flow.revision>current.revision){
   pendingDrafts.delete(flow.id);setCurrent(flow);
   const next=flow.drafts[flow.template.steps[flow.step].id]||{};
   latestValues.current=next;setValues(next);
  }
 },[flow,dirty,busy,saving,current.revision]);
 useEffect(()=>{if(!dirty||busy||saving||error)return;const timer=setTimeout(()=>void act('save'),700);return()=>clearTimeout(timer);},[values,dirty,busy,saving,error]);
 const change=(name:string,value:string|boolean)=>{
  const next={...latestValues.current,[name]:value};editingVersion.current++;
  latestValues.current=next;pendingDrafts.set(current.id,{values:next,flow:current});setValues(next);setDirty(true);
 };
 async function act(action:string){
  const client=api();if(!client||inFlight.current)return;
  inFlight.current=true;
  if(action==='save')setSaving(true);else{setBusy(true);setErrors({});}
  setError('');
  try{
   let next=current;
   if(dirty){
    const version=editingVersion.current,snapshot=latestValues.current;
    next=await client.action({runId:current.runId,id:current.id,revision:current.revision,action:'save',values:snapshot}) as Flow;
    setCurrent(next);
    if(version===editingVersion.current){pendingDrafts.delete(current.id);setDirty(false);}
    else{pendingDrafts.set(current.id,{values:latestValues.current,flow:next});setDirty(true);}
   }
   if(action!=='save'){
    const result=await client.action({runId:next.runId,id:next.id,revision:next.revision,action});
    if('flow'in result){next=result.flow;setErrors(result.errors);}else next=result;
    const nextValues=next.drafts[next.template.steps[next.step].id]||{};
    setCurrent(next);latestValues.current=nextValues;setValues(nextValues);
   }
  }catch(e){setError((e as Error).message);}
  finally{inFlight.current=false;setBusy(false);setSaving(false);}
 }
 return <Card className="my-4" aria-label={current.template.title}><CardHeader><CardTitle>{current.template.title}</CardTitle><CardDescription>{current.status==='completed'?t('已提交'):current.status==='unknown'?t('提交结果待核实，请勿重复提交'):t('第 {current} / {total} 步 · {title}').replace('{current}',String(current.step+1)).replace('{total}',String(current.template.steps.length)).replace('{title}',step.title)}</CardDescription></CardHeader><CardContent><FieldGroup>{step.fields.map(f=>{const id=current.id+'-'+f.name;return <Field key={f.name} data-invalid={!!errors[f.name]}><FieldLabel htmlFor={id}>{f.label}{f.required?' *':''}{f.currency?'（'+f.currency+'）':''}</FieldLabel>{f.type==='select'?<NativeSelect id={id} disabled={locked} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]}><NativeSelectOption value="">{t('请选择')}</NativeSelectOption>{f.options?.map(o=><NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}</NativeSelect>:f.type==='checkbox'?<Checkbox id={id} disabled={locked} checked={values[f.name]===true} onCheckedChange={v=>change(f.name,v===true)}/>:f.type==='textarea'?<Textarea id={id} disabled={locked} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]}/>:<Input id={id} disabled={locked} type={f.type==='date'?'date':'text'} inputMode={['number','money'].includes(f.type)?'decimal':undefined} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]}/>} {(errors[f.name]||f.help)&&<FieldDescription role={errors[f.name]?'alert':undefined}>{errors[f.name]||f.help}</FieldDescription>}</Field>;})}</FieldGroup>{(error||current.error)&&<Alert className="mt-4" variant="destructive"><AlertDescription>{error||current.error}</AlertDescription></Alert>}</CardContent><CardFooter className="gap-2 flex-wrap border-border">{current.status==='unknown'&&<Button variant="outline" disabled={busy||archived} onClick={()=>void act('reconcile')}>{t('核实提交结果')}</Button>}{current.status==='editing'&&<><Button variant="outline" disabled={locked||saving||!current.step} onClick={()=>void act('previous')}>{t('上一步')}</Button><Button variant="outline" disabled={locked||saving||!dirty} onClick={()=>void act('save')}>{t('保存草稿')}</Button><Button disabled={locked||saving} onClick={()=>void act('next')}>{busy?t('正在处理…'):current.step===current.template.steps.length-1?current.template.submit.label:step.next?.label||t('下一步')}</Button></>}{error&&<Button variant="outline" disabled={busy||saving} onClick={()=>{pendingDrafts.delete(flow.id);setCurrent(flow);latestValues.current=flow.drafts[flow.template.steps[flow.step].id]||{};setValues(latestValues.current);setDirty(false);setError('');}}>{t('放弃当前修改并重新载入')}</Button>}</CardFooter></Card>;
}
