import ChangeStatus from './ChangeStatus';
import {useLanguage} from './i18n';
import type {PermissionChange} from './types';
export default function PermissionStatus({value,inline=false}:{value?:PermissionChange;inline?:boolean}){
 const language=useLanguage(),L=(zh:string,en:string)=>language==='en'?en:zh;
 const name=value?.requested==='full'?L('完全访问','Full access'):L('默认权限','Default permissions');
 const label=value?.state==='switching'?L('权限切换中，尚未确认生效','Switching permissions; not yet confirmed'):value?.state==='applied'?L('权限已生效','Permissions applied'):value?.state==='configured'?L('已设置，将在专家开始执行时生效','Configured for the next expert execution'):L('权限切换失败，未确认生效','Permission change failed; not confirmed');
 return <ChangeStatus value={value} inline={inline} label={name+' · '+label}/>;
}
