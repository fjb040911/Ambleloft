import type {ModelLimits} from './types';
const fields: [keyof ModelLimits,string][]=[['contextWindow','上下文窗口'],['autoCompactTokenLimit','自动压缩阈值'],['maxOutputTokens','最大输出长度']];
export default function ModelLimitSettings({value,onChange,inherited={}}:{value:ModelLimits;onChange(value:ModelLimits):void;inherited?:ModelLimits}){
 return <div>{fields.map(([key,label])=><label key={key}>{label}（tokens）<input type="number" min="1" step="1" aria-label={label} value={value[key]??''} placeholder={String(inherited[key]??(key==='autoCompactTokenLimit'&&(value.contextWindow||inherited.contextWindow)?Math.floor((value.contextWindow||inherited.contextWindow!)*.8):'使用默认值'))} onChange={e=>{const next={...value};if(e.target.value==='')delete next[key];else next[key]=Number(e.target.value);onChange(next);}}/></label>)}</div>;
}
