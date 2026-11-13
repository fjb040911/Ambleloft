import {useEffect,useState,useRef,type ComponentProps} from 'react';
import Conversation from './Conversation';
import type {ComposerOptions} from './ComposerControls';
import Markdown from './Markdown';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import {Failure,useCopy} from './WorkforceInputs';
import type {AgentRun,ProviderCatalog,TurnFileChanges} from './types';

// Evidence stays in the space. The shared transcript owns paging and tool details.
export default function TaskDelivery({onOptionsChange,runId,catalog,onOpenTask,onReady,awaitingRun=false,readOnly=false,active=true,mode='delivery',hidden=false,onRework}:{awaitingRun?:boolean;onOptionsChange?(options:ComposerOptions):void;onRework?(text:string,options:ComposerOptions):Promise<void>;active?:boolean;mode?:'chat'|'delivery'|'actions';hidden?:boolean;readOnly?:boolean;onReady?(ready:boolean):void;runId?:string;catalog:ProviderCatalog;onOpenTask(id:string):void}){
 const L=useCopy(),[run,setRun]=useState<AgentRun|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[changes,setChanges]=useState<TurnFileChanges|null>(null),[file,setFile]=useState<{name:string;text:string}|null>(null),[reload,setReload]=useState(0);
 const [selectedInput,setSelectedInput]=useState<{id:string;key:number}>(),actionRoot=useRef<HTMLDivElement>(null);
 useEffect(()=>{let live=true,receivedUpdate=false;setSelectedInput(undefined);onReady?.(false);setFile(null);setChanges(null);setError('');if(!runId){if(!awaitingRun)setRun(null);setLoading(false);return;}
 setLoading(true);void (window.desktop?.getRunPage?window.desktop.getRunPage({id:runId}):Promise.reject(Error(L('执行记录接口暂不可用','Execution history is unavailable')))).then(r=>{if(live&&!receivedUpdate){setRun(r);onReady?.(r.status==='completed');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
 const unsubscribe=window.desktop?.onRun?.(r=>{if(live&&r.id===runId){receivedUpdate=true;setError('');setLoading(false);setRun(r);onReady?.(r.status==='completed');}});return()=>{live=false;unsubscribe?.();};
 },[runId,reload,awaitingRun]);
 const switching=!!run&&run.id!==runId;
 const output=run?.messages.filter(m=>m.role==='assistant'&&m.kind!=='reasoning');
 const finals=output?.filter(m=>m.phase==='final_answer');
 const delivery=(finals?.length?finals:output?.slice(-1))||[];
 const conversationProps:ComponentProps<typeof Conversation>|null=run?{
  onOptionsChange:mode==='chat'&&!switching?onOptionsChange:undefined,
  run:readOnly||switching?{...run,archivedAt:run.archivedAt||'read-only'}:run,catalog,submitting:switching,inputsInPanel:true,autoOpenPending:mode==='chat',visible:active&&!hidden,
  send:async(text,options)=>{if(!onRework)throw Error(L('当前状态不能修改交付，请先处理任务状态。','This delivery cannot be changed in its current state.'));await onRework(text,options);},
  stop:()=>{if(!readOnly)void window.desktop!.stopRun(run.id).catch(e=>setError(e.message));},
  approve:async(id,decision)=>{if(readOnly)throw Error(L('空间已归档，只能查看执行记录','Archived space: execution records are read-only'));await window.desktop!.approveRun({runId:run.id,approvalId:id,decision});},
  openSettings:()=>onOpenTask(run.id),openChanges:setChanges,
  openFile:a=>void window.desktop!.accessArtifact({runId:run.id,id:a.id,preview:true}).then(r=>{if(r)setFile({name:a.name,text:r.text});}).catch(e=>setError(e.message)),
 }:null;
 if(mode==='actions')return <section><Failure message={error}/>{loading&&<p role="status">{L('正在读取待处理请求…','Loading requests…')}</p>}{conversationProps&&<Conversation key={run!.id} {...conversationProps} actionsOnly refreshRun={()=>setReload(n=>n+1)}/>}</section>;
 return <section className="wf-task-delivery" hidden={hidden}><Failure message={error}/>{error&&<Button variant="outline" onClick={()=>setReload(n=>n+1)}>{L('重新读取证据','Reload evidence')}</Button>}{loading&&!run&&<p role="status">{L('正在读取执行结果…','Loading execution results…')}</p>}
 {!runId&&!awaitingRun&&<p className="wf-muted">{L('尚未执行，没有实际交付。','No execution or actual delivery yet.')}</p>}
 {run&&<>{readOnly?<p className="wf-muted">{L('空间已归档，只能查看执行记录；恢复空间后再处理请求。','Archived space: execution records are read-only. Restore the space to handle requests.')}</p>:mode==='delivery'?<div ref={actionRoot}><Conversation key={run.id} {...conversationProps!} actionsOnly selectedInput={selectedInput} refreshRun={()=>setReload(n=>n+1)}/></div>:null}{mode==='delivery'&&<><h3>{L('实际交付','Actual delivery')}</h3>{!delivery.length&&['preparing','running','waiting','stopping'].includes(run.status)?<p className="wf-muted">{L('任务尚在进行，交付结果将在这里显示。','Work is in progress. Results will appear here.')}</p>:!delivery.length?<Alert><AlertDescription>{L('此执行没有可展示的交付说明，请核对下方执行过程与文件。','This run has no delivery summary. Inspect the execution and files below.')}</AlertDescription></Alert>:delivery.map(m=><Markdown key={m.id} text={m.text}/>)}
 </>}{!!run.artifacts?.length&&<div className="wf-actions">{run.artifacts.map(a=><Button variant="outline" key={a.id} onClick={()=>void window.desktop!.accessArtifact({runId:run.id,id:a.id,preview:true}).then(result=>{if(result)setFile({name:a.name,text:result.text});else setError(L('此文件无法内联预览','This file cannot be previewed inline'));}).catch(e=>setError(e.message))}>{a.title||a.name}</Button>)}</div>}
 {file&&<section><div className="wf-section-title"><h3>{file.name}</h3><Button variant="ghost" onClick={()=>setFile(null)}>{L('关闭预览','Close preview')}</Button></div><pre className="wf-evidence-text">{file.text}</pre></section>}
 {changes&&<section><div className="wf-section-title"><h3>{L('本轮文件变更','File changes for this turn')}</h3><Button variant="ghost" onClick={()=>setChanges(null)}>{L('收起变更','Hide changes')}</Button></div>{changes.notice&&<p>{changes.notice}</p>}{changes.files.map(f=><details open key={f.id}><summary>{f.path} · {f.status} +{f.additions??'?'} −{f.deletions??'?'}</summary>{f.hunks?.map((h,i)=><pre className="wf-evidence-text" key={i}>{h.lines.join('\n')}</pre>)}{!f.hunks?.length&&<p>{f.reason||L('没有可展示的差异内容，请核对文件。','No inline diff is available. Inspect the file.')}</p>}</details>)}</section>}
 {mode==='chat'?<><p className="wf-muted">{onRework?L('提交修改要求将保留本次交付并发起返工，完成后需重新验收。','Submitting changes preserves this delivery and requests rework for a new review.'):L('查看执行进展与产物；可在下方处理当前授权或补充请求。','Inspect progress and deliverables; handle pending approvals or input requests below.')}</p><div className="wf-node-conversation" data-readonly={readOnly}><Conversation reworkMode={!!onRework} key={run.id} {...conversationProps!} run={!onRework&&!['running','waiting','preparing','stopping'].includes(run.status)?{...conversationProps!.run,archivedAt:'read-only'}:conversationProps!.run} refreshRun={()=>setReload(n=>n+1)}/></div></>:<details className="wf-execution-evidence"><summary>{L('执行过程与工具证据','Execution and tool evidence')}</summary><Conversation key={run.id} {...conversationProps!} embedded hidePendingActions onOpenInput={id=>{setSelectedInput({id,key:Date.now()});requestAnimationFrame(()=>actionRoot.current?.scrollIntoView({block:'start'}));}}/></details>}
 </>}
 </section>;
}
