import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,Handle,Position,MarkerType,BaseEdge,getSmoothStepPath,type EdgeProps,type Node,type NodeProps,type ReactFlowInstance,type Viewport} from '@xyflow/react';
import {ZoomIn,ZoomOut,Scan,LocateFixed,Play,Check,Clock,AlertCircle,UserRound,Folder,GitBranch} from 'lucide-react';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import {useCopy} from './WorkforceInputs';
import {executionState} from './workforce-execution-state';
import {needsAttention} from './workforce-space-state';
import {graphTopology,graphLayout,graphRelations,unmetDependencies,dependencyAccepted,previewPackages} from './workforce-plan-graph';
import type {Employee,PackageDefinition,WorkPackage} from './workforce-types';
import type {AgentRun,Project} from './types';
import '@xyflow/react/dist/style.css';
import './workforce-plan-graph.css';

type TaskNode=Node<{title:string;owner:string;project:string;status:string;reason:string;tone:string;relation:string;dimmed:boolean;executing:boolean;move(id:string,direction:number):void;ensureVisible(id:string,element:HTMLElement):void},'task'>;
function TaskGraphNode({id,data,selected}:NodeProps<TaskNode>){
 const Icon=data.tone==='accepted'?Check:data.tone==='running'?Play:data.tone==='attention'?AlertCircle:Clock;
 return <><Handle type="target" position={Position.Left} isConnectable={false}/><button type="button" className="wf-graph-node nodrag nopan" data-package-id={id} data-tone={data.tone} data-executing={data.executing} data-relation={data.relation} data-dimmed={data.dimmed} aria-current={selected} title={[data.title,data.status,data.owner,data.project,data.reason].join('\n')} onFocus={e=>data.ensureVisible(id,e.currentTarget)} onKeyDown={e=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();data.move(id,['ArrowRight','ArrowDown'].includes(e.key)?1:-1);}}}>
 <svg className="wf-graph-node-light" aria-hidden="true" focusable="false"><rect x="1" y="1" rx="11" pathLength="100"/></svg>
 <span className="wf-graph-node-status"><Icon aria-hidden="true"/>{data.status}</span><strong>{data.title}</strong><span className="wf-graph-node-meta"><UserRound aria-hidden="true"/>{data.owner}</span><span className="wf-graph-node-meta"><Folder aria-hidden="true"/>{data.project}</span><small>{data.reason}</small>
 </button><Handle type="source" position={Position.Right} isConnectable={false}/></>;
}
const nodeTypes={task:TaskGraphNode};
// Keep the dependency stroke and arrow static. A separate trace communicates
// direction without changing the meaning of accepted versus unaccepted edges.
function DependencyEdge(props:EdgeProps){
 const [path]=getSmoothStepPath(props);
 return <><BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={0}/>{props.data?.flowing&&<path className="wf-graph-edge-flow" d={path} fill="none" aria-hidden="true"/>}</>;
}
const edgeTypes={dependency:DependencyEdge};
function useGraphMotion(root:{current:HTMLDivElement|null}){
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{
  const element=root.current;if(!element)return;let intersecting=false;
  const update=()=>setEnabled(intersecting&&document.visibilityState==='visible');
  const observer=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;update();});
  observer.observe(element);document.addEventListener('visibilitychange',update);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};
 },[]);
 return enabled;
}


// Persistent supplemental forms have their own events and can be pending while
// the execution still reports running. Inspect the latest attempt, not just waiting runs.
function useWaitingKinds(packages:WorkPackage[],preview:boolean){
 const ids=preview?[]:[...new Set(packages.map(p=>p.attempts.at(-1)?.runId).filter((id):id is string=>!!id))];
 const key=JSON.stringify(ids),[kinds,setKinds]=useState<Record<string,string>>({});
 useEffect(()=>{let live=true;const pushed=new Set<string>(),versions=new Map<string,number>();
  const runs=new Map<string,AgentRun>(),inputs=new Map<string,boolean>();setKinds({});
  const publish=(id:string)=>{if(!live)return;const run=runs.get(id),approval=!!run?.approvals?.length,input=!!run?.questions?.length||inputs.get(id);setKinds(v=>({...v,[id]:approval?(input?'approval-input':'approval'):input?'input':''}));};
  const refreshInputs=async(id:string)=>{const version=(versions.get(id)||0)+1;versions.set(id,version);try{const snapshot=await window.desktop?.inputs?.list({runId:id});if(live&&versions.get(id)===version){inputs.set(id,!!snapshot?.requests.some(r=>r.state==='pending'));publish(id);}}catch{}};
  const unsubscribe=window.desktop?.onRun?.(run=>{if(live&&ids.includes(run.id)){pushed.add(run.id);runs.set(run.id,run);publish(run.id);}});
  const unsubscribeInputs=window.desktop?.inputs?.onChanged(event=>{if(ids.includes(event.runId))void refreshInputs(event.runId);});
  for(const id of ids){
   void window.desktop?.getRunPage?.({id,limit:1}).then(run=>{if(live&&!pushed.has(id)){runs.set(id,run);publish(id);}}).catch(()=>{});
   void refreshInputs(id);
  }
  return()=>{live=false;unsubscribe?.();unsubscribeInputs?.();};
 },[key]);
 return kinds;
}
export default function WorkforcePlanGraph({planId,name,packages,employees,projects,selectedId,onSelect,onClear,matches,preview=false}:{planId:string;name:string;packages:WorkPackage[];employees:Employee[];projects:Project[];selectedId?:string;onSelect(id:string):void;onClear?():void;matches?(p:WorkPackage):boolean;preview?:boolean}){
 const L=useCopy(),root=useRef<HTMLDivElement>(null),probe=useRef<HTMLSpanElement>(null),flow=useRef<ReactFlowInstance<TaskNode>>(null),[size,setSize]=useState({width:320,height:240}),[zoom,setZoom]=useState(1),[notice,setNotice]=useState(''),[canvasWidth,setCanvasWidth]=useState(0);
 const motion=useGraphMotion(root);
 const definitions=packages.map(p=>p.definition),topology=graphTopology(definitions);
 const placement=useMemo(()=>graphLayout(definitions,size.width,size.height),[topology.key,size.width,size.height]);
 useLayoutEffect(()=>{const canvas=root.current?.querySelector<HTMLElement>('.wf-graph-canvas');if(!canvas)return;const measure=()=>{if(canvas.clientWidth>0)setCanvasWidth(canvas.clientWidth);};measure();const observer=new ResizeObserver(measure);observer.observe(canvas);return()=>observer.disconnect();},[topology.key]);
 const relations=graphRelations(definitions,selectedId),waiting=useWaitingKinds(packages,preview);
 const attention=(p:WorkPackage)=>needsAttention(p)||!!waiting[p.attempts.at(-1)?.runId||''];
 const viewportKey='workforce.graph-viewport:'+planId+':'+topology.key;
 const lastViewport=useRef<{key:string;value:Viewport}|null>(null);
 const validViewport=(v:Viewport)=>[v.x,v.y,v.zoom].every(Number.isFinite)&&v.zoom>=.15&&v.zoom<=2;
 const stored=useMemo(()=>{if(preview)return undefined;try{const v=JSON.parse(sessionStorage.getItem(viewportKey)||'null');return v&&[v.x,v.y,v.zoom].every(Number.isFinite)&&v.zoom>=.15&&v.zoom<=2?v as Viewport:undefined;}catch{return undefined;}},[viewportKey,preview]);
 useEffect(()=>{if(!probe.current)return;const observer=new ResizeObserver(([entry])=>{// Hidden tabs report zero: retain the last measured node geometry.
 const scale=entry.contentRect.width;if(!Number.isFinite(scale)||scale<=0)return;const width=scale*320,height=scale*240;setSize(v=>v.width===width&&v.height===height?v:{width,height});});observer.observe(probe.current);return()=>observer.disconnect();},[]);
 const recoverViewport=(v:Viewport)=>{if(validViewport(v))return false;const fallback=lastViewport.current?.key===viewportKey?lastViewport.current.value:stored||{x:0,y:0,zoom:1};setZoom(fallback.zoom);void flow.current?.setViewport(fallback,{duration:0});return true;};
 const saveViewport=(v:Viewport)=>{if(recoverViewport(v))return;lastViewport.current={key:viewportKey,value:v};setZoom(v.zoom);if(!preview)try{sessionStorage.setItem(viewportKey,JSON.stringify(v));}catch{}};
 const focusNode=(id:string)=>{const node=flow.current?.getNode(id);if(!node)return;void flow.current?.setCenter(node.position.x+size.width/2,node.position.y+size.height/2,{zoom:Math.max(.8,flow.current.getZoom()),duration:0});requestAnimationFrame(()=>{const button=[...root.current!.querySelectorAll<HTMLButtonElement>('.wf-graph-node')].find(el=>el.dataset.packageId===id);button?.focus({preventScroll:true});});};
 const ensureVisible=(id:string,element:HTMLElement)=>{const canvas=root.current?.querySelector('.wf-graph-canvas')?.getBoundingClientRect(),node=element.getBoundingClientRect();if(canvas&&(node.right<canvas.left||node.left>canvas.right||node.bottom<canvas.top||node.top>canvas.bottom))focusNode(id);};
 const move=(id:string,direction:number)=>{const i=placement.order.indexOf(id);const next=placement.order[i+direction];if(next)focusNode(next);};
 const locator=useRef({attention:-1,running:-1});
 const locate=(kind:'attention'|'running')=>{const list=packages.filter(p=>kind==='attention'?attention(p):['starting','preparing','running','started'].includes(p.status));if(!list.length)return;const item=list[(++locator.current[kind])%list.length];focusNode(item.id);setNotice(L('已定位：','Located: ')+item.definition.title);};
// Fixed-size nodes have fixed handles. Supplying their geometry prevents React
 // Flow from clearing handle bounds (and briefly unmounting edges) on every snapshot.
 const nodes:TaskNode[]=placement.order.map(id=>packages.find(p=>p.id===id)!).filter(Boolean).map(p=>{
  const project=projects.find(v=>v.id===p.definition.projectId),blocked=unmetDependencies(packages,p),kind=waiting[p.attempts.at(-1)?.runId||''];
  const status=preview?L('计划预览','Plan preview'):p.stale?executionState('stale',L):p.status==='pending'&&blocked.length?L('等待前置验收','Awaiting prerequisites'):kind?kind==='approval'?L('等待授权','Approval needed'):kind==='approval-input'?L('等待授权 · 待补充信息','Approval and input needed'):L('待补充信息','Input needed'):executionState(p.status,L);
  const reason=preview?(p.definition.dependencies.length?L('前置任务验收后才可调度','Scheduled after prerequisites are accepted'):L('无前置任务，可独立调度','No prerequisites; scheduled independently')):blocked.length?L('待验收：','Awaiting acceptance: ')+blocked.map(id=>packages.find(q=>q.id===id)?.definition.title||id).join(' · '):p.reason|| (p.definition.dependencies.length?L('前置任务已全部验收','All prerequisites accepted'):L('无前置任务，可独立调度','No prerequisites; scheduled independently'));
  const environment=project?.environment?.kind==='docker'?'SSH · Docker':project?.type==='ssh'?'SSH':L('本地','Local');
  return {id:p.id,type:'task',position:placement.positions.get(p.id)!,selected:p.id===selectedId,draggable:false,connectable:false,focusable:false,width:size.width,height:size.height,measured:{width:size.width,height:size.height},handles:[{type:'target',position:Position.Left,x:-3.5,y:size.height/2-3.5,width:7,height:7},{type:'source',position:Position.Right,x:size.width-3.5,y:size.height/2-3.5,width:7,height:7}],style:{width:size.width,height:size.height},data:{title:p.definition.title||L('未命名任务','Untitled task'),owner:employees.find(e=>e.id===p.definition.ownerId)?.name||(p.definition.ownerId?L('专家已移除','Expert removed'):L('尚未分配','Unassigned')),project:p.definition.projectId?(project?project.name+' · '+environment:L('项目已移除','Project removed')):L('空间讨论','Space discussion'),status,reason,tone:preview?'draft':attention(p)?'attention':dependencyAccepted(p)?'accepted':['running','preparing','starting','started'].includes(p.status)?'running':'pending',relation:p.id===selectedId?'selected':relations.upstream.has(p.id)?'upstream':relations.downstream.has(p.id)?'downstream':'none',dimmed:!!matches&&!matches(p),executing:!preview&&!p.stale&&!kind&&p.status==='running',move,ensureVisible}};
 });
 const edges=packages.flatMap(p=>p.definition.dependencies.map(id=>{const source=packages.find(q=>q.id===id),accepted=!preview&&source&&dependencyAccepted(source);const highlighted=(relations.upstream.has(id)&&(p.id===selectedId||relations.upstream.has(p.id)))||((id===selectedId||relations.downstream.has(id))&&relations.downstream.has(p.id));return {id:JSON.stringify([id,p.id]),source:id,target:p.id,type:'dependency',focusable:false,selectable:false,interactionWidth:0,markerEnd:{type:MarkerType.ArrowClosed},className:`wf-graph-edge ${accepted?'is-accepted':''} ${highlighted?'is-highlighted':''}`,data:{accepted,flowing:accepted&&!p.stale&&p.status==='running'},ariaLabel:L('前置任务：','Prerequisite: ')+(source?.definition.title||id)+' → '+p.definition.title};}));
 return <div className="wf-plan-graph" ref={root} data-preview={preview} data-motion={motion} data-selected={!!selectedId}><span ref={probe} className="wf-graph-size-probe" aria-hidden="true"/>
 {topology.errors.length?<Alert variant="destructive"><AlertDescription>{L('暂时无法显示流程图，请先修正依赖：','Fix these dependencies to display the graph: ')}{topology.errors.map((e,i)=><p key={i}>{e.kind==='cycle'?L('存在循环依赖：','Circular dependencies: '):e.kind==='duplicate'?L('任务 ID 重复：','Duplicate task IDs: '):L('前置任务不存在：','Missing prerequisite: ')}{e.ids.map(id=>definitions.find(p=>p.id===id)?.title||id).join(' → ')}</p>)}</AlertDescription></Alert>:!packages.length?<p className="wf-empty-note">{L('添加工作包后，可在这里预览依赖。','Add work packages to preview their dependencies.')}</p>:<>
 <div className="wf-graph-toolbar"><div className="wf-actions"><Button variant="outline" size="icon" aria-label={L('缩小流程图','Zoom out graph')} onClick={()=>void flow.current?.zoomOut()}><ZoomOut/></Button><output aria-label={L('缩放比例','Zoom level')}>{Math.round(zoom*100)}%</output><Button variant="outline" size="icon" aria-label={L('放大流程图','Zoom in graph')} onClick={()=>void flow.current?.zoomIn()}><ZoomIn/></Button><Button variant="ghost" onClick={()=>void flow.current?.fitView({padding:.15,maxZoom:1})}><Scan data-icon="inline-start"/>{L('查看全图','Fit graph')}</Button></div>{!preview&&<div className="wf-actions"><Button variant="outline" disabled={!packages.some(attention)} onClick={()=>locate('attention')}><LocateFixed data-icon="inline-start"/>{L('定位待处理','Locate attention')} · {packages.filter(attention).length}</Button><Button variant="ghost" disabled={!packages.some(p=>['running','preparing','starting','started'].includes(p.status))} onClick={()=>locate('running')}><Play data-icon="inline-start"/>{L('定位执行中','Locate running')}</Button></div>}</div>
 <div className="wf-graph-canvas" role="region" aria-label={name+L(' · 只读任务流程图',' · Read-only task graph')} tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget||!flow.current)return;const v=flow.current.getViewport(),delta=80;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();void flow.current.setViewport({...v,x:v.x+(e.key==='ArrowLeft'?delta:e.key==='ArrowRight'?-delta:0),y:v.y+(e.key==='ArrowUp'?delta:e.key==='ArrowDown'?-delta:0)});}if(e.key==='+'||e.key==='='){e.preventDefault();void flow.current.zoomIn();}if(e.key==='-'){e.preventDefault();void flow.current.zoomOut();}}}>
 {canvasWidth>0&&<ReactFlow<TaskNode> key={viewportKey} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onPaneClick={onClear} autoPanOnNodeFocus={false} onNodeClick={(_,node)=>onSelect(node.id)} onInit={instance=>{flow.current=instance;saveViewport(instance.getViewport());}} onMove={(_,v)=>{recoverViewport(v);}} onMoveEnd={(_,v)=>saveViewport(v)} defaultViewport={stored} fitView={!stored} fitViewOptions={{padding:.15,maxZoom:1,...(canvasWidth<600&&nodes[0]?{nodes:[{id:nodes[0].id}],minZoom:.8}:{})}} minZoom={.15} maxZoom={2} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false} edgesReconnectable={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} zoomOnScroll={false} zoomOnDoubleClick={false} panOnDrag preventScrolling={false} colorMode="system">
 </ReactFlow>}
 </div><div className="wf-graph-legend"><span><GitBranch aria-hidden="true"/>{preview?L('箭头表示前置验收依赖；此预览尚未保存。','Arrows require prerequisite acceptance. This preview is unsaved.'):L('实线：已验收 · 虚线：等待验收 · 流光：正在执行','Solid: accepted · Dashed: awaiting acceptance · Flow: executing')}</span><span>{L('拖动空白处平移 · 点击任务看详情','Drag background to pan · Select a task for details')}</span>{selectedId&&<span>{L('已突出上游与下游依赖','Upstream and downstream dependencies highlighted')}</span>}{matches&&packages.some(p=>!matches(p))&&<span>{L('不匹配的任务已淡化，保留完整依赖','Nonmatching tasks are dimmed; dependencies remain visible')}</span>}</div><span className="sr-only" role="status">{notice}</span>
 </>}
 </div>;
}
export function PlanGraphPreview({definitions,employees,projects}:{definitions:PackageDefinition[];employees:Employee[];projects:Project[]}){
 const L=useCopy(),[selected,setSelected]=useState<string>(),[open,setOpen]=useState(false);const item=definitions.find(p=>p.id===selected);
 return <details className="wf-graph-preview" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{L('预览依赖流程','Preview dependencies')} · {definitions.length}</summary>{open&&<WorkforcePlanGraph preview planId="draft" name={L('未保存计划','Unsaved plan')} packages={previewPackages(definitions)} employees={employees} projects={projects} selectedId={selected} onSelect={setSelected} onClear={()=>setSelected(undefined)}/>} {item&&<section className="wf-graph-preview-detail"><h4>{item.title}</h4><p>{item.instruction}</p><p>{L('交付：','Delivery: ')}{item.deliverables}</p><p>{L('验收：','Acceptance: ')}{item.acceptance}</p></section>}</details>;
}
