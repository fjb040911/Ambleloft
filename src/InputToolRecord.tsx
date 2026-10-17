import {InputProcessRecord} from './InputProcessRecord';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {Button} from './components/ui/button';
import {t} from './i18n';
import type {AgentRun,PersistentInputRequest} from './types';

const titles:Record<string,string>={input_capabilities:'检查补充信息功能',input_list:'查看待补充事项',input_request:'请求补充信息',input_read_answer:'读取你的回答',input_resolve_from_message:'整理聊天中的回答',input_cancel:'取消补充请求',input_replace:'调整补充问题'};
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const parse=(value:unknown):Record<string,unknown>=>{try{return object(typeof value==='string'?JSON.parse(value):value);}catch{return {};}};
export function inputToolTitle(label:string){const name=inputToolName(label);return name?titles[name]:null;}
export function inputToolName(label:string){const name=label.split(/[/:]/).at(-1)||'';return Object.hasOwn(titles,name)?name:null;}

export default function InputToolRecord({tool,requests}:{tool:AgentRun['tools'][number];requests:PersistentInputRequest[]}){
 const name=inputToolName(tool.label)!;
 const envelope=parse(tool.detail),result=object(envelope.result);
 const content=Array.isArray(result.content)?result.content:[];
 const payload=[result.structuredContent,...content.filter(c=>object(c).type==='text').map(c=>object(c).text),envelope].map(parse).find(p=>typeof p.ok==='boolean')||{};
 const value=object(payload.value),answer=object(value.answer),values=object(answer.values),labels=object(answer.displayLabels);
 const requestId=typeof value.requestId==='string'?value.requestId:object(envelope.arguments).requestId;
 const request=requests.find(r=>r.id===requestId);
 const failed=tool.status==='failed'||payload.ok===false||!!envelope.error||result.isError===true;
 const busy=['running','inProgress','pending'].includes(tool.status);
 const status=failed?'未能完成':busy?'进行中':tool.status==='completed'&&payload.ok===true?'已完成':'未确认完成';
 const fields=request?.template.steps[0].fields||[];
 const questions=name==='input_read_answer'&&Object.keys(values).length?Object.entries(values).flatMap(([key,v])=>{
  if(!['string','number','boolean'].includes(typeof v))return [];
  const field=fields.find(f=>f.name===key);
  return [{id:key,label:typeof labels[key]==='string'?labels[key] as string:field?.label||t('补充内容'),answer:field?.options?.find(o=>o.value===v)?.label??(typeof v==='boolean'?t(v?'是':'否'):String(v))}];
 }):[];
 const description=failed?'这一步未能完成，已保留记录。':busy?'正在处理，请稍候。':payload.ok!==true?'暂时无法显示这一步的结果。':name==='input_read_answer'?(value.state==='pending'?'还在等待你补充信息。':questions.length?'以下是你已经提交的回答。':'这份请求暂时没有可读取的回答。'):name==='input_request'?'已提出补充请求，可在输入框上方填写。':name==='input_cancel'?'已处理取消请求。':name==='input_replace'?'已提出调整，请查看待补充区的最新状态。':name==='input_resolve_from_message'?'已整理聊天中的回答，请以补充记录的确认状态为准。':name==='input_list'?'已查看当前任务的待补充事项。':'已检查当前可用的补充信息功能。';
 return <InputProcessRecord title={t(titles[name])} status={status} questions={failed?[]:questions}>
  <p className="ml-3 my-2 text-sm text-muted-foreground">{t(description)}</p>
  <Collapsible className="ml-3 my-2"><CollapsibleTrigger render={<Button variant="ghost" size="sm"/>}>{t('技术详情')}</CollapsibleTrigger><CollapsibleContent><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground" tabIndex={0}>{tool.detail.slice(-12000)||t('暂无详情')}</pre></CollapsibleContent></Collapsible>
 </InputProcessRecord>;
}
