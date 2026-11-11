import {useLanguage} from './i18n';
import type {ModelChange} from './types';
export default function ModelStatus({value}:{value?:ModelChange}){
 const language=useLanguage(),L=(zh:string,en:string)=>language==='en'?en:zh;if(!value)return null;
 const status=value.state==='switching'?L('模型切换中，尚未确认生效','Switching model; not yet confirmed'):value.state==='configured'?L('已设置，等待排队任务开始执行','Configured; awaiting queued execution'):value.state==='applied'?L('新模型已生效','New model applied'):L('模型切换失败，未确认生效','Model change failed; not confirmed');
 return <p className="m-0 px-3.5 py-1 text-xs text-muted-foreground break-words" role={value.state==='failed'?'alert':'status'}>{value.requested.model} · {status}{value.error&&' · '+value.error}</p>;
}
