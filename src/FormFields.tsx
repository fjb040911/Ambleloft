import {useId,type ReactNode} from 'react';
import {t,useLanguage} from './i18n';
import {Field,FieldGroup,FieldLabel,FieldDescription} from './components/ui/field';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Switch} from './components/ui/switch';
import {Checkbox} from './components/ui/checkbox';
export type FormValues=Record<string,string|number|boolean>;
export type FormFieldDefinition={name:string;label:string;type:string;required?:boolean;help?:string;placeholder?:string;dependsOn?:string[];visibleWhen?:{field:string;equals:string|number|boolean};currency?:string;minLength?:number;maxLength?:number;options?:{label:string;value:string}[]};
export default function FormFields({fields,values,change,locked=false,errors={},renderAfterField}:{fields:FormFieldDefinition[];values:FormValues;change(name:string,value:string|boolean):void;locked?:boolean;errors?:Record<string,string>;renderAfterField?(field:FormFieldDefinition):ReactNode}){
 useLanguage();
 const instanceId=useId();
 return <FieldGroup>{fields.map(f=>{
   const id=instanceId+'-'+f.name,describedBy=(errors[f.name]||f.help)?id+'-description':undefined,boolean=['checkbox','switch','group-toggle'].includes(f.type);
   const control=f.type==='select'?<NativeSelect className="[&_select]:text-foreground" id={id} disabled={locked} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]} aria-describedby={describedBy} aria-required={f.required||undefined}><NativeSelectOption value="">{t('请选择')}</NativeSelectOption>{f.options?.map(o=><NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}</NativeSelect>:f.type==='switch'?<Switch id={id} size="sm" disabled={locked} checked={values[f.name]===true} onCheckedChange={v=>change(f.name,v)} aria-invalid={!!errors[f.name]} aria-describedby={describedBy} aria-required={f.required||undefined}/>:boolean?<Checkbox id={id} disabled={locked} checked={values[f.name]===true} indeterminate={f.type==='group-toggle'&&values[f.name]==='mixed'} onCheckedChange={v=>change(f.name,v===true)} aria-invalid={!!errors[f.name]} aria-describedby={describedBy} aria-required={f.required||undefined}/>:f.type==='textarea'?<Textarea className="text-foreground" id={id} maxLength={f.maxLength??20000} disabled={locked} placeholder={f.placeholder} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]} aria-describedby={describedBy} aria-required={f.required||undefined}/>:<Input className="text-foreground" id={id} maxLength={f.type==='text'?(f.maxLength??2000):undefined} disabled={locked} placeholder={f.placeholder} type={f.type==='date'?'date':'text'} inputMode={['number','money'].includes(f.type)?'decimal':undefined} value={String(values[f.name]??'')} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]} aria-describedby={describedBy} aria-required={f.required||undefined}/>;
   const label=<FieldLabel htmlFor={id}>{f.label}{f.required?' *':''}{f.currency?'（'+f.currency+'）':''}</FieldLabel>;
   return <Field key={f.name} data-invalid={!!errors[f.name]} data-disabled={locked}>
    {boolean?<Field orientation="horizontal">{control}{label}</Field>:<>{label}{control}</>}
    {(errors[f.name]||f.help)&&<FieldDescription id={describedBy} role={errors[f.name]?'alert':undefined}>{errors[f.name]||f.help}</FieldDescription>}
    {f.type==='group-toggle'&&values[f.name]==='mixed'&&<FieldDescription>{t('部分启用；保持不变会保留各项原来的选择。')}</FieldDescription>}
    {renderAfterField?.(f)}
   </Field>;
  })}</FieldGroup>;
}
