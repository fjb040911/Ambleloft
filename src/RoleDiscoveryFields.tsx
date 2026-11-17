import {useState,useRef,useEffect,useId} from 'react';
import {useLanguage} from './i18n';
import {useCopy} from './WorkforceInputs';
import {Field,FieldLabel,FieldDescription,FieldGroup,FieldSet,FieldLegend} from './components/ui/field';
import {Input} from './components/ui/input';
import {Checkbox} from './components/ui/checkbox';
import categories from '../core/catalog-store/role-categories.json';
import {emptyDiscovery} from './role-discovery';
import type {RoleDiscovery} from './workforce-types';

function ListInput({label,values,max,onChange,onInvalid}:{label:string;values:string[];max:number;onChange(values:string[]):void;onInvalid(invalid:boolean):void}){
 const L=useCopy(),id=useId();
 const [text,setText]=useState(values.join(', '));
 const change=(text:string)=>{setText(text);const items=text.split(/[,，;；\n]/).map(s=>s.trim()).filter(Boolean);const unique=items.filter((s,i)=>items.findIndex(t=>t.normalize('NFKC').toLowerCase()===s.normalize('NFKC').toLowerCase())===i);const invalid=unique.length>max||unique.some(s=>s.length>80);onInvalid(invalid);if(!invalid)onChange(unique);};
 const items=[...new Set(text.split(/[,，;；\n]/).map(s=>s.trim().normalize('NFKC').toLowerCase()).filter(Boolean))],invalid=items.length>max||items.some(s=>s.length>80);
 useEffect(()=>{onInvalid(invalid);},[invalid]);
 return <Field data-invalid={invalid||undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} value={text} aria-invalid={invalid} onChange={e=>change(e.target.value)}/><FieldDescription>{invalid?L(`最多 ${max} 项，每项不超过 80 字符。`,`Up to ${max} items, 80 characters per item.`):L('用逗号分隔。','Separate with commas.')}</FieldDescription></Field>;
}
export function RoleDiscoveryFields({value,onChange,onValidityChange}:{value?:RoleDiscovery;onChange(value:RoleDiscovery):void;onValidityChange(invalid:boolean):void}){
 const L=useCopy(),lang=useLanguage()==='en'?'en':'zh-CN',d=value||emptyDiscovery();
 const originalTags=useRef(d.tags);
 const errors=useRef<Record<string,boolean>>({});
 const invalid=(key:string,bad:boolean)=>{errors.current[key]=bad;onValidityChange(Object.values(errors.current).some(Boolean));};
 return <details className="wf-discovery-editor"><summary>{L('分类与搜索（可选）','Categories and search (optional)')}</summary><FieldGroup>
 <FieldDescription>{L('帮助你找到专家，不会改变职责、安装技能或授予权限。','Helps you find this expert. Does not change responsibilities, install skills or grant permissions.')}</FieldDescription>
 <FieldSet><FieldLegend>{L('工作分类','Work categories')}</FieldLegend><div className="wf-discovery-options">{categories.map(c=><Field key={c.id} orientation="horizontal"><Checkbox id={'role-category-'+c.id} checked={d.categoryIds.includes(c.id)} onCheckedChange={checked=>onChange({...d,categoryIds:checked?[...d.categoryIds,c.id]:d.categoryIds.filter(id=>id!==c.id)})}/><FieldLabel htmlFor={'role-category-'+c.id}>{c.title[lang]}</FieldLabel></Field>)}</div></FieldSet>
 <ListInput key={'tags-'+lang} label={L('能力标签','Capability tags')} values={d.tags.map(t=>t.title[lang])} max={12} onInvalid={bad=>invalid('tags',bad)} onChange={labels=>onChange({...d,tags:labels.map(label=>[...d.tags,...originalTags.current].find(t=>t.title[lang]===label)||{id:'custom-'+crypto.randomUUID(),title:{'zh-CN':label,en:label}})})}/>
 {(['zh-CN','en'] as const).map(locale=><ListInput key={locale} label={locale==='zh-CN'?L('中文搜索关键词','Chinese search keywords'):L('英文搜索关键词','English search keywords')} values={d.keywords[locale]} max={30} onInvalid={bad=>invalid(locale,bad)} onChange={words=>onChange({...d,keywords:{...d.keywords,[locale]:words}})}/>)}
 </FieldGroup></details>;
}
