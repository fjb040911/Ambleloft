import {useId} from 'react';
import ManagementDialog from './ManagementDialog';
import {DialogDescription,DialogFooter} from './components/ui/dialog';
import {Button} from './components/ui/button';
import {Checkbox} from './components/ui/checkbox';
import {Field,FieldContent,FieldLabel,FieldDescription} from './components/ui/field';
import {Alert,AlertTitle,AlertDescription} from './components/ui/alert';
import {Separator} from './components/ui/separator';
import {t} from './i18n';
import type {ExtensionInteractionRequest} from './types';
const capabilityNames:Record<string,string>={'projects.read':'查看项目名称和说明','projects.path.read':'查看项目文件夹的位置','conversations.create':'创建聊天草稿','conversations.open':'打开项目中的聊天','storage':'查看和更新这个扩展保存的内容','configuration':'查看这个扩展的设置','secrets':'使用为这个扩展保存的登录信息'};
const impactNames:Record<string,string>={external:'向其他服务发送或公开发布内容',destructive:'删除内容，或进行无法撤销的修改',bulk:'一次修改多项内容',permissions:'更改谁可以查看或修改内容'};
export default function ExtensionOperationDialog({request,remember,setRemember,busy,error,submit}:{request:ExtensionInteractionRequest;remember:boolean;setRemember(value:boolean):void;busy:boolean;error:string;submit(cancel?:boolean):Promise<void>}){
 const rememberId=useId();
 return <ManagementDialog title={t('确认扩展操作')} busy={busy} close={()=>void submit(true)}>
  <DialogDescription>{request.extensionName} · {t('请确认以下操作是否符合你的预期。')}</DialogDescription>
  <div className="flex min-w-0 flex-col gap-5">
   <section className="min-w-0"><h3 className="m-0 break-words text-base font-medium">{request.title||t('扩展操作')}</h3>{request.description&&<p className="mb-0 mt-2 break-words text-sm leading-relaxed text-muted-foreground">{request.description}</p>}<p className="mb-0 mt-2 text-xs text-muted-foreground">{t('以上操作说明由扩展开发者提供。')}</p></section>
   <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">{request.project&&<><dt className="text-muted-foreground">{t('操作的项目')}</dt><dd className="m-0 break-words">{request.project}</dd></>}<dt className="text-muted-foreground">{t('由谁发起')}</dt><dd className="m-0">{t(request.caller==='agent'?'AI 助手':'扩展页面')}</dd></dl>
   {!!request.impact?.length&&<Alert variant={request.impact.includes('destructive')?'destructive':'default'}><AlertTitle>{t('开发者说明可能发生的变化')}</AlertTitle><AlertDescription><ul className="m-0 flex list-disc flex-col gap-1 pl-4">{request.impact.map(impact=><li key={impact}>{t(impactNames[impact]||impact)}</li>)}</ul></AlertDescription></Alert>}
   {!!request.capabilities.length&&<section><h3 className="m-0 text-sm font-medium">{t('本次操作使用的权限')}</h3><ul className="mb-0 mt-2 flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-muted-foreground">{request.capabilities.map(capability=><li key={capability}>{t(capabilityNames[capability]||capability)}</li>)}</ul>{request.capabilities.includes('conversations.create')&&<p className="mb-0 mt-2 text-sm text-muted-foreground">{t('聊天会先保存为草稿，不会自动发送消息。')}</p>}</section>}
   <details className="min-w-0 text-sm"><summary className="cursor-pointer text-muted-foreground">{t('技术详情')}</summary><p className="text-muted-foreground">{t('以下内容供开发者排查问题，你无需填写或修改。')}</p><pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(request.input,null,2)}</pre></details>
   {request.allowRemember&&<><Separator/><Field orientation="horizontal" data-disabled={busy}><Checkbox id={rememberId} checked={remember} disabled={busy} onCheckedChange={setRemember} aria-describedby={rememberId+'-description'}/><FieldContent><FieldLabel htmlFor={rememberId}>{t('下次不再询问此操作')}</FieldLabel><FieldDescription id={rememberId+'-description'}>{t('仅适用于同一扩展、项目和发起方的相同操作。可在扩展详情中恢复操作确认。')}</FieldDescription></FieldContent></Field></>}
   {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </div>
  <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>void submit(true)}>{t('取消')}</Button><Button disabled={busy} onClick={()=>void submit()}>{t(busy?'正在处理…':'确认执行')}</Button></DialogFooter>
 </ManagementDialog>;
}
