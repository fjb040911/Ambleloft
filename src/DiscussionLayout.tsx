import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import type {PanelImperativeHandle} from 'react-resizable-panels';
import {cn} from 'cn';
import {ResizablePanelGroup,ResizablePanel,ResizableHandle} from './components/ui/resizable';
import {useCopy} from './WorkforceInputs';

const preferenceKey='workforce.discussion-sidebar.v1';
function readPreference(){
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return {collapsed:value.collapsed===true,width:typeof value.width==='number'&&Number.isFinite(value.width)?Math.max(240,Math.min(480,value.width)):280};}
 catch{return {collapsed:false,width:280};}
}
export function useDiscussionLayout(){
 const [preference,setPreference]=useState(readPreference),[mobileOpen,setMobileOpen]=useState(false);
 const [width,setWidth]=useState(window.innerWidth),root=useRef<HTMLDivElement>(null),panel=useRef<PanelImperativeHandle|null>(null);
 const narrow=width<=800,open=narrow?mobileOpen:!preference.collapsed;
 const preferenceRef=useRef(preference);preferenceRef.current=preference;
 const save=(patch:Partial<typeof preference>)=>{
  const next={...preferenceRef.current,...patch};preferenceRef.current=next;setPreference(next);
  try{localStorage.setItem(preferenceKey,JSON.stringify(next));}catch{}
 };
 useLayoutEffect(()=>{const element=root.current;if(!element)return;const measure=()=>{if(element.clientWidth>0)setWidth(element.clientWidth);};measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{
  if(narrow)return;
  if(preference.collapsed)panel.current?.collapse();else panel.current?.resize(preferenceRef.current.width);
 },[narrow,preference.collapsed]);
 return {root,panel,narrow,open,preference,width,
  toggle:()=>{if(narrow)setMobileOpen(value=>!value);else save({collapsed:!preference.collapsed});},
  resized:(collapsed:boolean)=>{if(collapsed!==preferenceRef.current.collapsed)save({collapsed});},
  rememberWidth:(size:number)=>{if(size>=240)save({width:Math.round(size)});},
 };
}

export function DiscussionLayout({layout,children}:{layout:ReturnType<typeof useDiscussionLayout>;children:[ReactNode,ReactNode,ReactNode]}){
 const L=useCopy(),[main,toggle,context]=children;
 const group=useRef<HTMLDivElement>(null),separator=useRef<HTMLDivElement>(null);
 return <div ref={layout.root} className="wf-discussion-layout" data-narrow={layout.narrow} data-context-open={layout.open}>
  {layout.narrow?<>{main}{toggle}{context}</>:<ResizablePanelGroup elementRef={group} orientation="horizontal" className="wf-discussion-panels" style={{overflow:'visible'}} onLayoutChanged={(sizes,meta)=>{
   // The callback precedes DOM layout; derive pixels from the new percentages.
   if(meta.isUserInteraction&&group.current)layout.rememberWidth((sizes['discussion-context']??0)/100*(group.current.clientWidth-(separator.current?.offsetWidth??0)));
  }}>
   <ResizablePanel id="discussion-chat" minSize={360} className="wf-discussion-chat-pane" style={{overflow:'visible'}}>{main}</ResizablePanel>
   <ResizableHandle elementRef={separator} withHandle className={cn('wf-discussion-divider items-start',!layout.open&&'hidden')} disabled={!layout.open} aria-label={L('调整讨论侧栏宽度','Resize discussion sidebar')} title={L('拖动调整侧栏宽度，也可使用方向键','Drag to resize the sidebar, or use arrow keys')}/>
   <ResizablePanel id="discussion-context" panelRef={layout.panel} collapsible collapsedSize={0} defaultSize={layout.preference.collapsed?0:layout.preference.width} minSize={240} maxSize={Math.min(480,layout.width*.45)} groupResizeBehavior="preserve-pixel-size" className="wf-discussion-context-pane" style={{overflow:layout.open?'visible':'hidden'}} onResize={size=>layout.resized(size.inPixels===0)}>
    <div hidden={!layout.open} className="wf-discussion-context-content">{context}</div>
   </ResizablePanel>
  </ResizablePanelGroup>}
 </div>;
}
