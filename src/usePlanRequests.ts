import {useEffect,useState} from 'react';
import type {WorkPackage} from './workforce-types';
import type {AgentRun} from './types';

export function usePlanRequests(packages:WorkPackage[],preview:boolean){
 return useRunRequests(preview?[]:packages.flatMap(p=>p.attempts.at(-1)?.runId?[p.attempts.at(-1)!.runId!]:[]));
}
// A single source for overview, graph and node request indicators. Unknown is
// deliberately not an empty queue; preserve known requests while reloading.
export function useRunRequests(runIds:string[]){
 const ids=[...new Set(runIds)].sort(),key=JSON.stringify(ids);
 const [kinds,setKinds]=useState<Record<string,string>>({});
 useEffect(()=>{let live=true;const runVersions=new Map<string,number>(),versions=new Map<string,number>();
  const runs=new Map<string,AgentRun>(),inputs=new Map<string,boolean>(),failed=new Set<string>();
  const publish=(id:string)=>{if(!live)return;const run=runs.get(id),approval=!!run?.approvals?.length,input=!!run?.questions?.length||inputs.get(id);setKinds(v=>({...v,[id]:approval?(input?'approval-input':'approval'):input?'input':!runs.has(id)||!inputs.has(id)?failed.has(id)?'unknown':'loading':''}));};
  const refreshInputs=async(id:string)=>{const version=(versions.get(id)||0)+1;versions.set(id,version);try{const snapshot=await window.desktop?.inputs?.list({runId:id});if(live&&versions.get(id)===version){inputs.set(id,!!snapshot?.requests.some(r=>r.state==='pending'));publish(id);}}catch{if(live&&versions.get(id)===version){inputs.delete(id);failed.add(id);publish(id);}}};
  const refreshRun=async(id:string)=>{const version=(runVersions.get(id)||0)+1;runVersions.set(id,version);try{const run=await window.desktop?.getRunPage?.({id,limit:1});if(live&&runVersions.get(id)===version&&run){runs.set(id,run);publish(id);}}catch{if(live&&runVersions.get(id)===version){runs.delete(id);failed.add(id);publish(id);}}};
  const unsubscribe=window.desktop?.onRun?.(run=>{if(live&&ids.includes(run.id)){runVersions.set(run.id,(runVersions.get(run.id)||0)+1);runs.set(run.id,run);publish(run.id);}});
  const unsubscribeInputs=window.desktop?.inputs?.onChanged(event=>{if(ids.includes(event.runId))void refreshInputs(event.runId);});
  const refresh=()=>{for(const id of ids){void refreshRun(id);void refreshInputs(id);}};
  setKinds({});refresh();window.addEventListener('focus',refresh);window.addEventListener('workforce-refresh-requests',refresh);
  return()=>{live=false;unsubscribe?.();unsubscribeInputs?.();window.removeEventListener('focus',refresh);window.removeEventListener('workforce-refresh-requests',refresh);};
 },[key]);
 return Object.fromEntries(ids.map(id=>[id,kinds[id]??'loading']));
}
