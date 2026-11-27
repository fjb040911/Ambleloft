import {useToolText,type TextSource} from './ToolText';
import {useProcessDisclosure} from './process-disclosure';
import {type ReactNode} from 'react';
import {Trace,TraceLine,TraceTitle,TraceIcon,TraceDescription} from './components/ui/trace';
import {Tool,ToolOutput,displayValue,readCallDetails,mcpResultText,extensionFailure} from './components/ai-elements/tool';
import {Terminal} from './components/ai-elements/terminal';
import {t} from './i18n';

/** Shared tool/terminal state. User disclosure choices win over later stream updates. */
export default function ProcessTool({type,source,disclosureKey,title,summary,status,live,command,output,icon,steps=[],operationCatalog}:{operationCatalog?:string;type:string;source?:TextSource;disclosureKey?:string;title:string;summary:string;status:string;live:boolean;command:string;output:string;icon:ReactNode;steps?:string[]}) {
 const [open,setOpen]=useProcessDisclosure(disclosureKey);
 const terminal=type==='commandExecution';
 const detail=useToolText({...source,toolId:source?.toolId||'',text:output},open,true);
 const failed=['failed','error','interrupted','未确认完成','已停止'].includes(status);
 const denied=['declined','denied','rejected'].includes(status);
 const waiting=['pending','approval-requested','waiting'].includes(status);
 const statusLabel=denied?'已拒绝':waiting?'待处理':live?'进行中':status==='completed'?'已完成':status==='interrupted'?'已中断':status==='failed'?'失败':status;
 const showSummary=!!summary&&summary!==title;
 const line=<TraceLine title={terminal?command:undefined} status={failed||denied?'error':waiting?'pending':live?'running':undefined}>
  <TraceIcon>{icon}</TraceIcon><TraceTitle className={showSummary?'activity-tool-title shrink-0':'activity-tool-title'}>{t(title)}</TraceTitle>
  {showSummary&&<TraceTitle className="activity-tool-summary" title={terminal?command:summary}>{summary}</TraceTitle>}
  {status==='completed'?<span className="sr-only">{t(statusLabel)}</span>:<span className="activity-tool-status shrink-0">{t(statusLabel)}</span>}
 </TraceLine>;
 const truncated=!source?.preview&&!source?.activityId&&output.length>12000;
 const text=open?(truncated?output.slice(-12000):detail.text):'';
 const complete=source?.preview?detail.completePage:!truncated;
 const fields=open&&(type==='mcpToolCall'||type==='tool')&&complete?readCallDetails(text):null;
 const args=fields?.arguments;
 const hasOutput=fields?.result!=null||fields?.error!=null;
 const showArgs=args!=null&&(!hasOutput||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length>0);
 const resultText=fields?.result!=null?displayValue(fields.result,failed):undefined;
 const resultBody=fields?mcpResultText(fields.result)??resultText:undefined;
 const failure=failed&&resultBody?extensionFailure(resultBody,args,operationCatalog):undefined;
 const multipleFields=Number(showArgs)+Number(fields?.result!=null)+Number(fields?.error!=null)>1;
 return <Tool header={line} open={open} onOpenChange={setOpen} expandable={!denied&&!waiting&&!!(output||source?.preview||command||steps.length)}>
   {open&&<>
    {failure&&<p className="m-0 text-sm wrap-anywhere">{failure.reason}{failure.notStarted&&<> {t('操作尚未开始执行。')}</>}</p>}
    {!!steps.length&&<Trace>{steps.map((step,index)=><TraceLine key={index}><TraceTitle>{step}</TraceTitle></TraceLine>)}</Trace>}
    {type==='commandExecution'?<Terminal command={command} output={text} live={live&&!source?.preview} failed={failed}/>:fields?<>
      {showArgs&&<ToolOutput text={displayValue(args)} label="工具输入" showLabel={multipleFields||!hasOutput}/>}
      {resultText!==undefined&&<ToolOutput text={resultBody??resultText} copyText={resultText} label="工具输出" showLabel={multipleFields} failed={failed}/>}
      {fields.error!=null&&<ToolOutput text={displayValue(fields.error,true)} label="工具错误" showLabel={multipleFields} failed/>}
    </>:text&&<ToolOutput text={text} label="工具输出" failed={failed}/>}
    {detail.controls}
    {truncated&&<TraceDescription>{t('仅显示最后 12000 字，完整记录已保留。')}</TraceDescription>}
   </>}
 </Tool>;
}
