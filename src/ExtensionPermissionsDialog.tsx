import {useId} from 'react';
import ManagementDialog from './ManagementDialog';
import {Button} from './components/ui/button';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {DialogDescription,DialogFooter} from './components/ui/dialog';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from './components/ui/field';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Separator} from './components/ui/separator';
import type {ExtensionSnapshot,Project} from './types';
import {t} from './i18n';
const permissionName=(key:string)=>t(({'projects.read':'读取项目信息','projects.path.read':'读取项目路径','files.read':'读取项目文件','files.write':'修改项目文件','tasks.read':'读取任务','tasks.write':'管理任务','storage':'扩展数据存储','secrets':'安全凭据存储','configuration':'扩展配置'} as Record<string,string>)[key]||key);
export default function ExtensionPermissionsDialog({item,projects,projectId,setProjectId,busy,error,close,grant,revoke}:{item:ExtensionSnapshot['installed'][number];projects:Project[];projectId:string;setProjectId(id:string):void;busy:boolean;error:string;close():void;grant():void;revoke():void}){
 const projectControl=useId();
 const permissions=item.permissions||[],grants=item.grants||[];
 const needsProject=permissions.some(permission=>permission.scope==='project');
 return <ManagementDialog title={t('管理权限')} busy={busy} close={close}>
  <DialogDescription>{item.manifest.name} · {t('查看扩展需要的权限，并管理授权范围。')}</DialogDescription>
  <div className="flex min-w-0 flex-col gap-5">
   <FieldSet><FieldLegend variant="label">{t('声明的权限')}</FieldLegend>
    {permissions.length?<div className="flex flex-col gap-3">{permissions.map(permission=><div key={permission.capability} className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-sm">{permissionName(permission.capability)}</span><Badge variant="outline" className="shrink-0">{t(permission.scope==='project'?'所选项目':'扩展私有数据')}</Badge></div>)}</div>:<FieldDescription>{t('未声明权限')}</FieldDescription>}
   </FieldSet>
   <Separator/>
   <FieldSet><FieldLegend variant="label">{t('已授权范围')}</FieldLegend>
    {grants.length?<div className="flex flex-col gap-3">{grants.map(grant=><div key={grant.capability+grant.resource} className="grid min-w-0 grid-cols-2 gap-3 text-sm"><span className="break-words">{permissionName(grant.capability)}</span><span className="break-words text-muted-foreground">{grant.resource.startsWith('project:')?projects.find(project=>project.id===grant.resource.slice(8))?.name||t('项目已移除'):t('扩展私有数据')}</span></div>)}</div>:<FieldDescription>{t('尚未授予任何权限')}</FieldDescription>}
   </FieldSet>
   <Separator/>
   <FieldGroup>{needsProject?<Field data-disabled={busy}><FieldLabel htmlFor={projectControl}>{t('选择授权项目')}</FieldLabel><NativeSelect id={projectControl} className="w-full" disabled={busy||!projects.length} value={projectId} onChange={event=>setProjectId(event.target.value)} aria-describedby={projectControl+'-description'}><NativeSelectOption value="">{t('请选择项目')}</NativeSelectOption>{projects.map(project=><NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}</NativeSelect><FieldDescription id={projectControl+'-description'}>{t(projects.length?'仅授权所选项目；不会授予其他项目的访问权限。':'暂无可授权项目，请先创建项目。')}</FieldDescription></Field>:<FieldDescription>{t('此扩展无需选择项目，仅授权其声明的扩展私有权限。')}</FieldDescription>}</FieldGroup>
   {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </div>
  <DialogFooter className="mt-1 flex-wrap"><Button variant="destructive" className="sm:mr-auto" disabled={busy||!grants.length} onClick={revoke}>{t('撤销全部授权')}</Button><Button variant="outline" disabled={busy} onClick={close}>{t('取消')}</Button><Button disabled={busy||!permissions.length||(needsProject&&!projectId)} onClick={grant}>{t('确认授权')}</Button></DialogFooter>
 </ManagementDialog>;
}
