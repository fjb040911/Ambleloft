import {useToolText} from './ToolText';
import {useProcessDisclosure} from './process-disclosure';
import {type ReactNode} from 'react';
import {Trace,TraceLine,TraceTitle,TraceIcon,TraceDescription,TraceCollapsible,TraceCollapsibleTrigger,TraceCollapsibleContent} from './components/ui/trace';
import {CodeBlock,CodeBlockContent} from './components/ui/code-block';
import {t} from './i18n';

export function ProcessOutput({text,label,failed=false}:{text:string;label:string;failed?:boolean}) {
 return <CodeBlock size="sm" variant={failed?'destructive':'default'}><CodeBlockContent wrap className="max-h-64" aria-label={t(label)}>{text}</CodeBlockContent></CodeBlock>;
}

/** Shared tool/terminal state. User disclosure choices win over later stream updates. */
export default function ProcessTool({source,disclosureKey,title,summary,status,live,command,output,icon,steps=[]}:{source?:{toolId:string;preview?:boolean;version?:string};disclosureKey?:string;title:string;summary:string;status:string;live:boolean;command:string;output:string;icon:ReactNode;steps?:string[]}) {
 const [open,setOpen]=useProcessDisclosure(disclosureKey);
 const detail=useToolText({...source,toolId:source?.toolId||'',text:output},open);
 const failed=['failed','error','未确认完成','已停止'].includes(status);
 const denied=['declined','denied','rejected'].includes(status);
 const waiting=['pending','approval-requested','waiting'].includes(status);
 const line=<TraceLine status={failed?'error':waiting?'pending':live?'running':undefined}>
  <TraceIcon>{icon}</TraceIcon><TraceTitle className="activity-tool-title shrink-0">{t(title)}</TraceTitle>
  {summary&&<TraceTitle className="activity-tool-summary" title={summary}>{summary}</TraceTitle>}
  <TraceDescription className="activity-tool-status">{t(denied?'已拒绝':waiting?'待处理':live?'进行中':status==='completed'?'已完成':status==='failed'?'失败':waiting?'待处理':status)}</TraceDescription>
 </TraceLine>;
 if(denied||waiting||(!output&&!command&&!steps.length))return line;
 return <TraceCollapsible open={open} onOpenChange={setOpen}>
  <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
  <TraceCollapsibleContent className="flex flex-col gap-2">
   {open&&<>
   {!!steps.length&&<Trace>{steps.map((step,index)=><TraceLine key={index}><TraceTitle>{step}</TraceTitle></TraceLine>)}</Trace>}
   {command&&<ProcessOutput text={command} label="执行命令"/>}
   {output&&<ProcessOutput text={source?.preview?detail.text:output.slice(-12000)} label="工具输出" failed={failed}/>}
   {detail.controls}
   {!source?.preview&&output.length>12000&&<TraceDescription>{t('仅显示最后 12000 字，完整记录已保留。')}</TraceDescription>}
   </>}
  </TraceCollapsibleContent>
 </TraceCollapsible>;
}
