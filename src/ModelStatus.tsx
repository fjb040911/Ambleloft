import ChangeStatus from './ChangeStatus';
import {useLanguage} from './i18n';
import type {ModelChange} from './types';
export default function ModelStatus({value,inline=false}:{value?:ModelChange;inline?:boolean}){
 const language=useLanguage(),L=(zh:string,en:string)=>language==='en'?en:zh;
 const status=value?.state==='switching'?L('模型切换中，尚未确认生效','Switching model; not yet confirmed'):value?.state==='configured'?L('已设置，等待排队任务开始执行','Configured; awaiting queued execution'):value?.state==='applied'?L('新模型已生效','New model applied'):L('模型切换失败，未确认生效','Model change failed; not confirmed');
 return <ChangeStatus value={value} inline={inline} label={(value?.requested.model||'')+' · '+status}/>;
}
