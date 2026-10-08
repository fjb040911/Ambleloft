import {t} from './i18n';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Checkbox} from './components/ui/checkbox';
import {Field,FieldLabel,FieldGroup,FieldSet} from './components/ui/field';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {SettingsCard,SettingsEmpty} from './SettingsPrimitives';
import type {ModelLimits} from './types';
const fields: [keyof ModelLimits,string][]=[['contextWindow','上下文窗口'],['autoCompactTokenLimit','自动压缩阈值'],['maxOutputTokens','最大输出长度']];
export default function ModelLimitSettings({value,onChange,inherited={}}:{value:ModelLimits;onChange(value:ModelLimits):void;inherited?:ModelLimits}){
 return <FieldGroup>{fields.map(([key,label])=><Field key={key}><FieldLabel className="flex-col items-start w-full">{t(label)}（tokens）<Input type="number" min="1" step="1" aria-label={t(label)} value={value[key]??''} placeholder={String(inherited[key]??(key==='autoCompactTokenLimit'&&(value.contextWindow||inherited.contextWindow)?Math.floor((value.contextWindow||inherited.contextWindow!)*.8):t('使用默认值')))} onChange={e=>{const next={...value};if(e.target.value==='')delete next[key];else next[key]=Number(e.target.value);onChange(next);}}/></FieldLabel></Field>)}</FieldGroup>;
}
