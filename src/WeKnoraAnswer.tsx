import {useEffect,useState} from 'react';
import type {AgentRun} from './types';
import {Card,CardContent,CardHeader,CardTitle} from './components/ui/card';
import {Badge} from './components/ui/badge';

type Hit={knowledgeBaseId:string;chunkId:string;title:string;text:string};
type Group={scope:string;hits:Hit[]};
type Tool=AgentRun['tools'][number];
const parse=(text:string)=>{try{return JSON.parse(text);}catch{return null;}};
async function evidence(runId:string,tool:Tool):Promise<Group|null>{
 let raw=tool.detail||'';
 if(tool.detailPreview){
  const page=await window.desktop!.getToolText!({id:runId,toolId:tool.id,offset:0,limit:64000});
  raw=page.text;
  if(page.total>raw.length && raw.includes('local.weknora.search'))throw Error('证据记录过长');
 }
 const record=parse(raw);
 if(record?.arguments?.operationId!=='local.weknora.search')return null;
 const result=record.result;
 const payload=result?.structuredContent??result?.content?.filter((part:{type:string})=>part.type==='text').map((part:{text:string})=>parse(part.text)).find((item:{ok?:boolean}|null)=>item?.ok!==undefined);
 if(!payload?.ok||!Array.isArray(payload.value?.hits))throw Error('检索未成功或证据不可用');
 const scope=record.arguments.input?.knowledgeBaseId;
 const hits=payload.value.hits.filter((hit:Hit)=>hit&&[hit.knowledgeBaseId,hit.chunkId,hit.title,hit.text].every(value=>typeof value==='string'&&value.length)&&(!scope||scope===hit.knowledgeBaseId));
 return {scope:scope||'全部配置库',hits};
}
export default function WeKnoraAnswer({tools,runId,answer,children}:{tools:Tool[];runId:string;answer:string;children:React.ReactNode}){
 const candidates=tools.filter(tool=>tool.type==='mcpToolCall'&&tool.label==='extension_invoke_operation');
 const revision=JSON.stringify([runId,...candidates.map(tool=>[tool.id,tool.detailVersion??tool.detail,tool.status])]);
 const [state,setState]=useState<{revision:string;groups:Group[];error?:boolean}>();
 useEffect(()=>{
  if(!candidates.length)return;
  let active=true;
  Promise.all(candidates.map(tool=>evidence(runId,tool))).then(groups=>{if(active)setState({revision,groups:groups.filter((group):group is Group=>!!group)});},()=>{if(active)setState({revision,groups:[],error:true});});
  return ()=>{active=false;};
 },[revision]);
 if(!candidates.length)return children;
 if(state?.revision!==revision)return <p role="status">正在核对工具记录…</p>;
 if(state.error)return <p role="alert">无法核对工具记录，本次不展示原文引用。</p>;
 if(!state.groups.length)return children;
 return <div className="flex flex-col gap-3">{state.groups.map((group,index)=><Card key={index}><CardHeader><CardTitle>知识检索 · {group.scope}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
 {!group.hits.length&&<p>没有可核对的片段。</p>}
 {group.hits.map((hit,position)=>{
  const proposal=parse(answer)?.citations;
  const candidate=Array.isArray(proposal)?proposal.find(row=>row?.call===index+1&&row.knowledgeBaseId===hit.knowledgeBaseId&&row.chunkId===hit.chunkId&&row.title===hit.title&&typeof row.quote==='string'&&row.quote.trim()):undefined;
  const quote=candidate?.quote??hit.text.trimStart().slice(0,160);
  const exact=!!quote.trim()&&hit.text.includes(quote);
  return <article key={position}><Badge variant={exact?'secondary':'outline'}>{exact?'原文':'概括'}</Badge><p className="whitespace-pre-wrap break-words">{quote}</p><small className="break-all text-muted-foreground">{hit.title} · 知识库 {hit.knowledgeBaseId} · 片段 {hit.chunkId}</small></article>;
 })}</CardContent></Card>)}
 {!Array.isArray(parse(answer)?.citations)&&answer&&<details><summary>模型概括（未经逐字核验）</summary><p className="whitespace-pre-wrap">{answer}</p></details>}</div>;
}
