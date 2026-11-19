import {useEffect,useMemo,useRef} from 'react';
import {useDraftState,writeDraft} from './useDraftState';
import type {ComposerOptions} from './ComposerControls';
export type ComposerReceipt={id:string;text:string;options:ComposerOptions;runId?:string;kind:'start'|'append'|'discussion';state:'sending'|'accepted'|'failed';deliveryState?:string;restoreDraft?:boolean};
const optionsKey=(o:ComposerOptions)=>JSON.stringify([o.employeeId||'',o.providerId||'',o.model||'',o.permission||'default',!!o.confirmProviderChange,o.selectedSkillIds||[],(o.attachments||[]).map(f=>[f.path,f.name])]);
export function useComposerReceipt(scope:string,restore:(receipt:ComposerReceipt)=>void,onAccepted?:(runId?:string,receipt?:ComposerReceipt)=>void){
 const [record,setRecord,error]=useDraftState<ComposerReceipt|null>(scope+':receipt',null,value=>{
  const r=value as ComposerReceipt;return r&&typeof r.id==='string'&&typeof r.text==='string'&&r.options&&['start','append','discussion'].includes(r.kind)&&['sending','accepted','failed'].includes(r.state)?r:null;
 });
 const currentScope=useRef(scope);currentScope.current=scope;
 const active=useMemo(()=>({current:record}),[scope]);active.current=record;
 const live=useMemo(()=>({current:false}),[scope]),callbacks=useMemo(()=>({current:{restore,onAccepted}}),[scope]);callbacks.current={restore,onAccepted};
 const check=async(r:ComposerReceipt)=>{
  if(!window.desktop?.composerSendStatus)return 'unknown';
  const result=await window.desktop.composerSendStatus({clientMutationId:r.id,runId:r.runId,kind:r.kind});
  if(currentScope.current!==scope||active.current?.id!==r.id||active.current.state!=='sending')return 'stale';
  if(result.state==='accepted'){active.current={...r,state:'accepted',deliveryState:result.deliveryState};setRecord(active.current);callbacks.current.onAccepted?.(result.runId??result.discussionId,r);}
  if(result.state==='absent'){active.current={...r,state:'failed'};setRecord(active.current);callbacks.current.restore(r);}
  return result.state;
 };
 useEffect(()=>{
  if(record?.state!=='sending'||live.current)return;
  let closed=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{await check(record);}catch{/* Unknown delivery is never retried automatically. */}if(!closed)timer=setTimeout(poll,1000);};
  void poll();return()=>{closed=true;clearTimeout(timer);};
 },[record]);
 return {pending:record?.state==='sending',error,record,
  begin(text:string,options:ComposerOptions,kind:'start'|'append'|'discussion',runId?:string,restoreDraft=true){const previous=active.current;const retry=previous?.state==='failed'&&previous.text===text&&previous.kind===kind&&previous.runId===runId&&optionsKey(previous.options)===optionsKey(options);const next:ComposerReceipt={id:retry?previous.id:crypto.randomUUID(),text,options,kind,runId,restoreDraft,state:'sending'};writeDraft(scope+':receipt',next);live.current=true;active.current=next;setRecord(next);return next.id;},
  accepted(){live.current=false;const r=active.current;if(r){active.current={...r,state:'accepted'};setRecord(active.current);}},
  async uncertain(){live.current=false;const r=active.current;if(!r)return;if(!window.desktop?.composerSendStatus){active.current={...r,state:'failed'};setRecord(active.current);callbacks.current.restore(r);return;}try{await check(r);}catch{}// Keep a new identity for the effect dependency when a failed reply needs polling.
   if(active.current?.state==='sending')setRecord({...r});
  },
 };
}
