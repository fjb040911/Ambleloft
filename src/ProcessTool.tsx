import {useToolText,type TextSource} from './ToolText';
import {useProcessDisclosure} from './process-disclosure';
import {type ReactNode} from 'react';
import {Trace,TraceLine,TraceTitle,TraceIcon,TraceDescription} from './components/ui/trace';
import {Tool,ToolOutput,displayValue,readCallDetails} from './components/ai-elements/tool';
import {Badge} from './components/ui/badge';
import {Terminal} from './components/ai-elements/terminal';
import {t} from './i18n';

/** Shared tool/terminal state. User disclosure choices win over later stream updates. */
export default function ProcessTool({type,source,disclosureKey,title,summary,status,live,command,output,icon,steps=[]}:{type:string;source?:TextSource;disclosureKey?:string;title:string;summary:string;status:string;live:boolean;command:string;output:string;icon:ReactNode;steps?:string[]}) {
 const [open,setOpen]=useProcessDisclosure(disclosureKey);
 const terminal=type==='commandExecution';
 const detail=useToolText({...source,toolId:source?.toolId||'',text:output},open,terminal);
 const failed=['failed','error','interrupted','未确认完成','已停止'].includes(status);
 const denied=['declined','denied','rejected'].includes(status);
 const waiting=['pending','approval-requested','waiting'].includes(status);
 const statusLabel=denied?'已拒绝':waiting?'待处理':live?'进行中':status==='completed'?'已完成':status==='interrupted'?'已中断':status==='failed'?'失败':status;
 const variant=denied||waiting?'warning':failed?'destructive':live?'info':status==='completed'?'success':'secondary';
 const line=<TraceLine title={terminal?command:undefined} status={failed?'error':waiting?'pending':live?'running':undefined}>
  <TraceIcon>{icon}</TraceIcon><TraceTitle className={summary?'activity-tool-title shrink-0':'activity-tool-title'}>{t(title)}</TraceTitle>
  {summary&&summary!==title&&<TraceTitle className="activity-tool-summary" title={terminal?command:summary}>{summary}</TraceTitle>}
  {(!terminal||status!=='completed')&&<Badge variant={variant} className="activity-tool-status">{t(statusLabel)}</Badge>}
 </TraceLine>;
 const truncated=!source?.preview&&!source?.activityId&&output.length>12000;
 const text=open?(truncated?output.slice(-12000):detail.text):'';
 const complete=source?.preview?detail.completePage:!truncated;
 const fields=open&&(type==='mcpToolCall'||type==='tool')&&complete?readCallDetails(text):null;
 return <Tool header={line} open={open} onOpenChange={setOpen} expandable={!denied&&!waiting&&!!(output||source?.preview||command||steps.length)}>
   {open&&<>
    {!!steps.length&&<Trace>{steps.map((step,index)=><TraceLine key={index}><TraceTitle>{step}</TraceTitle></TraceLine>)}</Trace>}
    {type==='commandExecution'?<Terminal command={command} output={text} live={live&&!source?.preview} failed={failed}/>:fields?<>
      {fields.arguments!=null&&<ToolOutput text={displayValue(fields.arguments)} label="工具输入"/>}
      {fields.result!=null&&<ToolOutput text={displayValue(fields.result,failed)} label="工具输出" failed={failed}/>}
      {fields.error!=null&&<ToolOutput text={displayValue(fields.error,true)} label="工具错误" failed/>}
    </>:text&&<ToolOutput text={text} label="工具输出" failed={failed}/>}
    {detail.controls}
    {truncated&&<TraceDescription>{t('仅显示最后 12000 字，完整记录已保留。')}</TraceDescription>}
   </>}
 </Tool>;
}
