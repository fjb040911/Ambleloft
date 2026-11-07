import {useConfirm} from './Confirmation';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {Separator} from './components/ui/separator';
import {Switch} from './components/ui/switch';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Field,FieldContent,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {useEffect,useState,useId,useRef} from 'react';
import Modal from './Modal';
import {t,useLanguage} from './i18n';
import type {ConfigurationSchema,ExtensionConfiguration} from './types';
export default function ExtensionSettings({id,name,close,inline=false,onDirtyChange,onBusyChange,generation}:{id:string;generation?:number;name:string;close:()=>void;inline?:boolean;onDirtyChange?(dirty:boolean):void;onBusyChange?(busy:boolean):void}){
 const confirm=useConfirm();const locale=useLanguage();
 const fieldPrefix=useId();
 const [data,setData]=useState<ExtensionConfiguration|null>(null),[value,setValue]=useState<Record<string,unknown>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const accept=(next:ExtensionConfiguration)=>{setData(next);setValue(next.value);setDirty(false);};
 const reload=async()=>{if(dirtyRef.current&&!(await confirm({title:t('放弃未保存的修改？'),action:t('放弃修改'),destructive:true})))return;try{accept(await window.desktop!.extensions!.configuration({id}));setError('');}catch(e){setError((e as Error).message);}};
 useEffect(()=>{let alive=true;if(dirtyRef.current){setError(t('扩展授权已变化。当前修改已保留，请重新加载配置后再保存。'));return;}setError('');window.desktop!.extensions!.configuration({id}).then(v=>{if(alive)accept(v);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[id,generation,locale]);
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 const dismiss=async()=>{if(!dirty||(await confirm({title:t('放弃未保存的修改？'),action:t('放弃修改'),destructive:true})))close();};
 const submit=async(action:'save'|'reset')=>{if(!data)return;setBusy(true);setError('');try{accept(await window.desktop!.extensions!.configuration({id,action,value,generation:data.generation,expectedRevision:data.revision}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const field=(key:string,s:ConfigurationSchema,required:boolean)=>{
  const current=value[key];
  const change=(next:unknown)=>{setValue(old=>({...old,[key]:next}));setDirty(true);};
  const controlId=fieldPrefix+'-'+key;
  const controlProps={id:controlId,disabled:busy,'aria-describedby':s.description?controlId+'-description':undefined};
  const label=<FieldLabel htmlFor={controlId}>{key}{required?' *':''}</FieldLabel>;
  const description=s.description&&<FieldDescription id={controlId+'-description'}>{s.description}</FieldDescription>;
  if(s.type==='boolean'&&!s.enum)return (
   <Field key={key} orientation="horizontal" className="extension-config-field" data-disabled={busy||undefined}>
    <FieldContent>{label}{description}</FieldContent>
    <Switch {...controlProps} checked={current===true} onCheckedChange={change}/>
   </Field>
  );
  return <Field key={key} className="extension-config-field" data-disabled={busy||undefined}>
   {label}
   {s.enum?<NativeSelect {...controlProps} className="w-full [&_select]:max-w-none" value={current===undefined?'':JSON.stringify(current)} onChange={e=>change(JSON.parse(e.target.value))} required={required}>
    <NativeSelectOption value="" disabled>{t('请选择')}</NativeSelectOption>
    {s.enum.map(option=><NativeSelectOption key={JSON.stringify(option)} value={JSON.stringify(option)}>{String(option)}</NativeSelectOption>)}
   </NativeSelect>:['string','number','integer'].includes(s.type)?<Input {...controlProps} required={required} type={s.type==='string'?'text':'number'} step={s.type==='integer'?1:'any'} min={s.minimum} max={s.maximum} minLength={s.minLength} maxLength={s.maxLength} value={current===undefined?'':String(current)} onChange={e=>{
    if(e.target.value===''){setValue(old=>{const next={...old};delete next[key];return next;});setDirty(true);}
    else change(s.type==='string'?e.target.value:Number(e.target.value));
   }}/>:<Textarea {...controlProps} className="min-h-28 resize-y" key={data?.revision} defaultValue={JSON.stringify(current??(s.type==='array'?[]:s.type==='null'?null:{}),null,2)} onChange={e=>{
    setDirty(true);
    try{change(JSON.parse(e.target.value));e.target.setCustomValidity('');}
    catch{e.target.setCustomValidity(t('请输入有效的 JSON'));}
   }}/>}
   {description}
  </Field>;
 };
 const form=<form className="extension-config-form flex w-full min-w-0 flex-col gap-6" onSubmit={e=>{e.preventDefault();void submit('save');}}>{error&&<div><p className="error-banner" role="alert">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={()=>void reload()}>{t('重新加载配置')}</Button></div>}{!data&&!error&&<p>{t('正在加载…')}</p>}{data&&<>{data.schema.description&&<p>{data.schema.description}</p>}<FieldGroup>{Object.entries(data.schema.properties||{}).map(([key,s])=>field(key,s,data.schema.required?.includes(key)||false))}</FieldGroup><Separator/><Field orientation="horizontal" className="flex-wrap justify-between gap-4"><Button type="button" variant="outline" disabled={busy} onClick={async()=>{if(await confirm({title:t('恢复默认值'),description:t('清除已保存的配置，恢复扩展默认行为？'),action:t('恢复默认值'),destructive:true}))void submit('reset');}}>{t('恢复默认值')}</Button><div className="extension-config-save"><span role="status" aria-live="polite">{t(busy?'正在保存…':dirty?'有未保存的修改':'已保存')}</span><Button type="submit" disabled={busy||!dirty}>{t('保存配置')}</Button></div></Field></>}</form>;
 return inline?form:<Modal title={name+' · '+t('扩展设置')} close={dismiss} busy={busy}>{form}</Modal>;
}
