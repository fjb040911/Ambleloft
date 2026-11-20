import {Message, MessageContent, MessageHeader} from './components/ui/message';
import ChatDisclosure from './ChatDisclosure';
import {Alert, AlertDescription} from './components/ui/alert';
import UserMessage from './UserMessage';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Card,CardHeader,CardTitle,CardAction,CardContent} from './components/ui/card';
import {Fragment,useEffect,useRef,useState} from 'react';
import {MessageScrollerProvider,MessageScroller,MessageScrollerViewport,MessageScrollerContent,MessageScrollerItem,MessageScrollerButton} from './components/ui/message-scroller';
import {Button} from './components/ui/button';
import Markdown from './Markdown';
import type {ExpertChatState,ExpertReference} from './expert-chat-types';
import './expert-chat.css';
import {InvestigationPanel} from './Investigation';
export function useExpertChat(conversationId?:string,projectId?:string|null,enabled=true){
 const api=window.desktop?.expertChat;
 const [directory,setDirectory]=useState<{employees:{id:string;name:string;description:string}[];domains:{id:string;name:string}[]}>({employees:[],domains:[]});
 const [state,setState]=useState<ExpertChatState|null>(null),[selectedIds,setSelectedIds]=useState<string[]>([]),[replyTo,setReplyTo]=useState(''),[domainId,setDomainId]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false);
 const scope=useRef(conversationId);scope.current=conversationId;
 const command=useRef<{key:string;id:string}|null>(null),lock=useRef(false);
 useEffect(()=>{if(!api||!enabled)return;let alive=true;void api.directory().then(d=>{if(alive)setDirectory(d);}).catch(()=>{});return()=>{alive=false;};},[api,enabled]);
 useEffect(()=>{
  setState(null);setSelectedIds([]);setReplyTo('');setDomainId('');setError('');command.current=null;
  if(!api||!conversationId||!enabled)return;
  let alive=true,sequence=0,first=true;
  const refresh=()=>{const request=++sequence;void api.read({conversationId}).then(s=>{if(alive&&request===sequence){setState(s);if(first){first=false;const last=s.turns.at(-1);setSelectedIds(current=>current.length?current:last?[...new Set(s.turns.filter(t=>last.roundId?t.roundId===last.roundId:t.id===last.id).map(t=>t.employee.id))]:[]);}}}).catch(e=>{if(alive&&request===sequence)setError(e.message);});};refresh();
  const remove=api.onChanged(e=>{if(e.conversationId===conversationId)refresh();});
  const workforce=window.desktop?.workforce?.onChanged(refresh);window.addEventListener('focus',refresh);
  return()=>{alive=false;remove();workforce?.();window.removeEventListener('focus',refresh);};
 },[api,conversationId,enabled]);
 const selected=selectedIds[0]||'';
 const busy=sending||!!state?.turns.some(t=>['preparing','responding'].includes(t.status));
 async function submit(text:string){
  if(!api||!selected||lock.current||busy)return null;lock.current=true;setSending(true);setError('');
  const key=JSON.stringify([conversationId,projectId,text,selectedIds,domainId,replyTo]);if(command.current?.key!==key)command.current={key,id:crypto.randomUUID()};
  try{const result=await api.submit({commandId:command.current.id,conversationId,projectId,text,selectedEmployeeIds:selectedIds,domainId:domainId||undefined,replyToContributionId:replyTo||undefined});const next=await api.read(result);command.current=null;if(scope.current===conversationId)setState(next);return result;}
  catch(e){setError((e as Error).message);return null;}finally{lock.current=false;setSending(false);}
 }
 async function exclude(reference:ExpertReference){if(!api||!state)return;try{const next=await api.exclude({conversationId:state.id,sourceKey:reference.ref.sourceKey});if(scope.current===conversationId)setState(next);}catch(e){setError((e as Error).message);}}
 async function revokeTaskContext(turnId:string){if(!api||!state)return;try{const next=await api.revokeTaskContext({conversationId:state.id,turnId});if(scope.current===conversationId)setState(next);}catch(e){setError((e as Error).message);}}
 async function stop(turnId?:string){if(!api||!state)return;const turn=state.turns.find(t=>(!turnId||t.id===turnId)&&['preparing','responding'].includes(t.status));if(turn)try{await api.cancel({conversationId:state.id,turnId:turn.id,attempt:turn.attempt||1});}catch(e){setError((e as Error).message);}}
 const retryCommands=useRef(new Map<string,string>());
 async function retry(turnId:string){if(!api||!state)return;const turn=state.turns.find(t=>t.id===turnId);if(!turn)return;const key=turnId+':'+(turn.attempt||1);if(!retryCommands.current.has(key))retryCommands.current.set(key,crypto.randomUUID());try{await api.retry({conversationId:state.id,turnId,expectedAttempt:turn.attempt||1,commandId:retryCommands.current.get(key)!});const next=await api.read({conversationId:state.id});if(scope.current===conversationId)setState(next);}catch(e){setError((e as Error).message);}}
 return {api,state,selected,selectedIds,setSelectedIds,replyTo,setReplyTo,retry,domainId,setDomainId,directory,error,setError,busy,submit,exclude,revokeTaskContext,stop,mentions:api&&enabled?{items:directory.employees,selectedIds,onSelect:(id:string)=>setSelectedIds(current=>current.includes(id)?current:[...current,id].slice(0,4)),limit:4,label:'我的专家'}:undefined};
}
export type ExpertChatController=ReturnType<typeof useExpertChat>;
export function ExpertRecipient({chat}:{chat:ExpertChatController}){
 if(!chat.selected&&!chat.busy)return null;
 return <div className="expert-recipient"><span>讨论对象（{chat.selectedIds.length}/4）：</span>{chat.selectedIds.map(id=><Button key={id} variant="outline" size="sm" disabled={chat.busy} aria-label={'移除专家 '+(chat.directory.employees.find(e=>e.id===id)?.name||id)} onClick={()=>chat.setSelectedIds(current=>current.filter(value=>value!==id))}>{chat.directory.employees.find(e=>e.id===id)?.name||'专家'} ×</Button>)}<span className="text-muted-foreground">独立讨论 · 不执行工具</span><Button variant="ghost" size="sm" disabled={chat.busy} onClick={()=>chat.setSelectedIds([])}>取消专家</Button><label>业务背景 <NativeSelect size="sm" aria-label="业务背景领域" value={chat.domainId} disabled={chat.busy} onChange={e=>chat.setDomainId(e.target.value)}><NativeSelectOption value="">自动识别 / 延续上次</NativeSelectOption>{chat.directory.domains.map(d=><NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}</NativeSelect></label>{chat.replyTo&&<span>回应：{chat.state?.turns.find(t=>t.id===chat.replyTo)?.employee.name}<Button size="sm" variant="ghost" disabled={chat.busy} onClick={()=>chat.setReplyTo('')}>取消回应</Button></span>}</div>;
}
export function ExpertTranscript({chat,standalone=false}:{chat:ExpertChatController;standalone?:boolean}){
 const [detail,setDetail]=useState<{title:string;body:string;conditions?:string}|null>(null),[loading,setLoading]=useState(false);
 const detailKey=JSON.stringify([chat.state?.id,chat.state?.revision,chat.state?.turns.map(t=>[t.id,t.attempt,t.contextUnavailable])]),detailScope=useRef(detailKey);detailScope.current=detailKey;
 useEffect(()=>setDetail(null),[detailKey]);
 async function source(turnId:string,sourceId:string){if(!chat.api||!chat.state)return;const key=detailKey;setLoading(true);setDetail(null);try{const value=await chat.api.source({conversationId:chat.state.id,turnId,sourceId});if(detailScope.current===key)setDetail(value);}catch(e){chat.setError((e as Error).message);}finally{setLoading(false);}}
 async function exportChat(){if(!chat.api||!chat.state)return;try{const text=await chat.api.export({conversationId:chat.state.id});const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='专家讨论.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){chat.setError((e as Error).message);}}
 const rows = <>
  {chat.state?.turns.map((turn,index)=>{
   const row = <article className="expert-turn">{(!turn.roundId||chat.state?.turns[index-1]?.roundId!==turn.roundId)&&<div className="expert-question"><UserMessage text={turn.text}/>{turn.roundId&&chat.state!.turns.filter(t=>t.roundId===turn.roundId).length>1&&<p className="text-xs text-muted-foreground">本轮 {chat.state!.turns.filter(t=>t.roundId===turn.roundId).length} 位专家独立回复</p>}</div>}<Message role="article" aria-label={turn.employee.name} data-message-role="assistant"><MessageContent><MessageHeader className="expert-speaker gap-2"><strong>{turn.employee.name}</strong><span>{turn.model}</span><time>{new Date(turn.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></MessageHeader>
   {turn.taskContextInfo&&<ChatDisclosure className="expert-references" heading={<>任务现场 · 版本 {turn.taskContextInfo.revision} · 已提供 {turn.taskContextInfo.included} 项</>}><p>截至 {new Date(turn.taskContextInfo.capturedAt).toLocaleString()}；{turn.taskContextInfo.files?.length?`已读取 ${turn.taskContextInfo.files.length} 个受控文件片段，未扫描其他文件。`:'未读取项目文件。'}执行状态不代表验收通过。</p>{turn.taskContextInfo.files?.map(file=><p key={file.path}>{file.path} · 第 {file.startLine}–{file.endLine} 行 · SHA-256 {file.contentHash.slice(0,12)} · {file.currentState==='unchanged'?'当前版本一致':file.currentState==='changed'?'文件已变化，仅展示采集版本':file.currentState==='missing'?'文件已删除，仅展示采集版本':'采集版本'} · 记录变更：{({added:'新增',modified:'修改',deleted:'删除'} as Record<string,string>)[file.recorded.status]||'未知'}{file.recorded.additions!=null?` +${file.recorded.additions}`:''}{file.recorded.deletions!=null?` −${file.recorded.deletions}`:''} · {file.recordedVersionMatch===null?'缺少执行时指纹':file.recordedVersionMatch?'与执行记录指纹一致':'与执行记录指纹不同'}{file.recorded.partial?' · 原变更扫描不完整':''}</p>)}{turn.taskContextInfo.omissions.map((item,i)=><p key={i}>{item.reason}</p>)}<Button size="sm" variant="outline" onClick={()=>void chat.revokeTaskContext(turn.id)}>撤回本轮任务委托</Button></ChatDisclosure>}
   {turn.answer&&<Markdown text={turn.answer}/>}
   {!!turn.unresolvedQuestions?.length&&<div><strong>待确认</strong><ul>{turn.unresolvedQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
   {turn.contextUnavailable&&<p role="status">此回答的背景已失效或被排除，不再展示或用于后续回复。</p>}
   {['preparing','responding'].includes(turn.status)&&<p role="status">{turn.status==='preparing'?(turn.phase==='ready'?'上下文已就绪，等待同轮准备…':'正在核对授权背景…'):'专家正在回复…'} <Button size="sm" variant="ghost" onClick={()=>void chat.stop(turn.id)}>停止回复</Button></p>}
   {turn.error&&<Alert variant="destructive"><AlertDescription>{turn.error}</AlertDescription></Alert>}
   {['failed','cancelled','interrupted'].includes(turn.status)&&(turn.roundId||turn.id)===(chat.state?.turns.at(-1)?.roundId||chat.state?.turns.at(-1)?.id)&&<Button size="sm" variant="outline" onClick={()=>void chat.retry(turn.id)}>重试此专家</Button>}
   {turn.status==='completed'&&!turn.contextUnavailable&&!turn.taskContextInfo&&<Button size="sm" variant="ghost" disabled={chat.busy} onClick={()=>chat.setReplyTo(turn.id)}>作为下一轮回应对象</Button>}
   {turn.status==='completed'&&turn.taskContextInfo&&<p className="text-xs text-muted-foreground">此发言使用了本轮任务委托，暂不转交给其他专家；可邀请其他专家独立评审现场。</p>}
   {chat.state&&<InvestigationPanel conversationId={chat.state.id} turnId={turn.id} files={turn.references.filter(r=>r.fileEvidence).map(r=>({id:r.ref.id,title:r.title}))} enabled={turn.status==='completed'&&!turn.contextUnavailable&&!!turn.taskContextInfo&&!chat.busy}/>}
   {(turn.attempt||1)>1&&<span className="text-xs text-muted-foreground">第 {turn.attempt} 次尝试</span>}
   {!turn.references.length&&turn.status==='completed'&&!turn.contextUnavailable&&<p className="text-xs text-muted-foreground">本轮未加载历史业务背景</p>}
   {!!turn.references.length&&<ChatDisclosure className="expert-references" heading={<>本轮背景 {turn.references.length} 项 · 引用 {turn.references.filter(r=>r.cited).length} 项</>}>{turn.references.map(r=><div className="flex flex-wrap items-center gap-1" key={r.ref.id}><Button size="sm" variant="ghost" disabled={turn.contextUnavailable||loading} onClick={()=>void source(turn.id,r.ref.id)}>{r.title} · {r.ref.revisionKey}{r.cited?' · 已引用':' · 已提供给专家'}</Button><span>{r.authority==='adopted'?'已采纳':r.authority==='user-instruction'?'用户指令':'参考资料'}</span><Button size="sm" variant="ghost" disabled={chat.state?.excludedSourceKeys.includes(r.ref.sourceKey)} onClick={()=>void chat.exclude(r)}>{chat.state?.excludedSourceKeys.includes(r.ref.sourceKey)?'已排除':'本次不使用'}</Button></div>)}</ChatDisclosure>}
  </MessageContent></Message></article>;
   return standalone
     ? <MessageScrollerItem key={turn.id} messageId={turn.id}>{row}</MessageScrollerItem>
     : <Fragment key={turn.id}>{row}</Fragment>;
  })}
  {detail&&<Card className="expert-source"><CardHeader><CardTitle>{detail.title}</CardTitle><CardAction><Button size="sm" variant="ghost" onClick={()=>setDetail(null)}>关闭来源</Button></CardAction></CardHeader><CardContent>{detail.conditions&&<p>适用条件：{detail.conditions}</p>}<Markdown text={detail.body}/></CardContent></Card>}
  {chat.error&&<Alert variant="destructive"><AlertDescription>{chat.error}</AlertDescription></Alert>}
  {!!chat.state?.excludedSourceKeys.length&&<p className="text-xs text-muted-foreground">本聊天已排除 {chat.state.excludedSourceKeys.length} 项背景，后续回复与历史回答复用均不再使用。</p>}
 </>;
 return <section className="expert-transcript" aria-label="专家讨论">
  {!!chat.state?.turns.length&&<div className="expert-transcript-heading"><span>专家讨论</span><Button size="sm" variant="ghost" onClick={()=>void exportChat()}>导出讨论</Button></div>}
  {standalone && chat.state?.turns.length ? <MessageScrollerProvider key={chat.state.id} autoScroll defaultScrollPosition="end">
   <MessageScroller className="h-auto"><MessageScrollerViewport className="max-h-[55dvh]" aria-label="专家消息">
    <MessageScrollerContent className="gap-0" spacerClassName="hidden">{rows}</MessageScrollerContent>
   </MessageScrollerViewport><MessageScrollerButton aria-label="回到最新消息"/></MessageScroller>
  </MessageScrollerProvider> : rows}
 </section>;
}
