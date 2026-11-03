import {useId} from 'react';
import {Field,FieldLabel,FieldDescription} from './components/ui/field';
import {NativeSelect,NativeSelectOption,NativeSelectOptGroup} from './components/ui/native-select';
import {useCopy} from './WorkforceInputs';
import type {ProviderCatalog} from './types';
import type {RoleDefinition} from './workforce-types';
type Choice=RoleDefinition['modelChoice'];
export function expertModelLabel(choice:Choice,catalog:ProviderCatalog|undefined,L:(zh:string,en:string)=>string){
 if(!choice){
  const provider=catalog?.providers.find(p=>p.id===catalog.defaultId)||catalog?.providers[0];
  return L('使用默认模型','Use default model')+(provider?.model?' · '+provider.model+' · '+provider.name: L('（尚未配置）',' (not configured)'));
 }
 const provider=catalog?.providers.find(p=>p.id===choice.providerId);
 return choice.model+(provider?' · '+provider.name:'')+(catalog&&(!provider||!(provider.models||[provider.model]).includes(choice.model))?L('（当前不可用）',' (currently unavailable)'):'');
}
export default function ExpertModelPreference({value,catalog,onChange,disabled}:{value:Choice;catalog:ProviderCatalog;onChange(value:Choice):void;disabled?:boolean}){
 const L=useCopy(),id=useId();
 const key=(choice:NonNullable<Choice>)=>JSON.stringify([choice.providerId,choice.model]);
 const available=!value||catalog.providers.some(p=>p.id===value.providerId&&(p.models||[p.model]).includes(value.model));
 return <Field><FieldLabel htmlFor={id}>{L('专家默认模型','Expert default model')}</FieldLabel><NativeSelect id={id} className="w-full" value={value?key(value):''} disabled={disabled} onChange={event=>{if(!event.target.value){onChange(undefined);return;}const [providerId,model]=JSON.parse(event.target.value);onChange({providerId,model});}}>
 <NativeSelectOption value="">{L('使用默认模型','Use default model')}</NativeSelectOption>
 {!available&&value&&<NativeSelectOption value={key(value)} disabled>{expertModelLabel(value,catalog,L)}</NativeSelectOption>}
 {catalog.providers.filter(p=>p.id).map(p=><NativeSelectOptGroup key={p.id} label={p.name}>{(p.models||[p.model]).map(model=><NativeSelectOption key={model} value={key({providerId:p.id!,model})}>{model} · {p.name}</NativeSelectOption>)}</NativeSelectOptGroup>)}</NativeSelect>
 <FieldDescription>{L('为这位专家指定常用模型。不指定时沿用任务选择的模型，任务未选择时使用系统默认模型。更改仅影响新任务。','Choose a preferred model for this expert. Otherwise use the task model, or the system default when none is selected. Changes apply to new tasks.')}</FieldDescription>
 {!available&&<FieldDescription>{L('该模型服务或模型已移除，请重新选择。执行时不会自动切换到其他服务。','This provider or model was removed. Choose another; execution will not silently switch providers.')}</FieldDescription>}
 </Field>;
}
