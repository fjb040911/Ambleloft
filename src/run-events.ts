import {applyRunEvent,retainedBytes} from '../electron/run-events.mjs';
import type {AgentRun} from './types';
const listeners=new Set<(run:AgentRun)=>void>();
const records=new Map<string,any>(),pending=new Map<string,any[]>(),loading=new Set<string>();
let unsubscribe:(()=>void)|undefined;let source:unknown;let generation=0;
function deliver(record:any){records.delete(record.run.id);records.set(record.run.id,record);let bytes=0;for(const value of records.values())bytes+=retainedBytes(value);while(records.size&&(records.size>64||bytes>16*1024*1024)){const id=records.keys().next().value!;bytes-=retainedBytes(records.get(id));records.delete(id);}for(const listener of listeners)listener(record.run);}
async function recover(id:string){
 if(loading.has(id)||!window.desktop?.getRunSnapshot)return;
 loading.add(id);const token=generation;let received=false;
 try{
  const snapshot=await window.desktop.getRunSnapshot({id});
  if(token!==generation)return;received=true;
  deliver(applyRunEvent(records.get(id),snapshot));
  const events=pending.get(id)||[];pending.delete(id);
  for(const event of events){const current=records.get(id)||snapshot;if(event.epoch===current?.epoch&&event.revision<=current.revision)continue;try{deliver(applyRunEvent(current,event));}catch{pending.set(id,[event]);}}
 }catch(error){console.error('Could not resynchronize conversation',id,error);}
 finally{if(token===generation)loading.delete(id);}
 // A snapshot can race subsequent changes. Recover again only when a newer gap remains.
 if(received&&token===generation&&pending.has(id))setTimeout(()=>void recover(id),250);
}
function receive(value:any){
 if(!value.kind?.startsWith('run-')){for(const listener of listeners)listener(value);return;}
 const id=value.id||value.run.id,current=records.get(id);
 if(value.epoch===current?.epoch&&value.revision<=current.revision)return;
 try{deliver(applyRunEvent(current,value));}
 catch{pending.set(id,[{epoch:value.epoch,revision:value.revision}]);void recover(id);}
}
export function subscribeRuns(listener:(run:AgentRun)=>void){
 listeners.add(listener);
 const subscribe=window.desktop?.onRunEvent||window.desktop?.onRun;
 if(subscribe&&(!unsubscribe||source!==subscribe)){unsubscribe?.();source=subscribe;unsubscribe=subscribe(receive);}
 return()=>{listeners.delete(listener);if(!listeners.size){unsubscribe?.();unsubscribe=undefined;generation++;records.clear();pending.clear();loading.clear();}};
}
