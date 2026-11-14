import type {AgentRun} from './types';

// Live events contain the latest page, not the whole conversation. Preserve only
// the prefix before that page; the incoming page remains authoritative for edits,
// removals and current requests/status. Never merge unrelated or disjoint runs.
export function retainRunHistory(previous:AgentRun,incoming:AgentRun):AgentRun{
 if(previous.id!==incoming.id||previous.summaryOnly||incoming.summaryOnly||!incoming.historyBefore||(incoming.turnOffset??0)<=(previous.turnOffset??0))return incoming;
 const boundary=previous.messages.findIndex(message=>message.id===incoming.historyBefore);
 if(boundary<=0)return incoming;
 const prefix=previous.messages.slice(0,boundary),keys=new Set(prefix.filter(message=>message.role==='user'&&!message.turnKey).map(message=>message.id));
 const retain=<T extends {turnKey?:string}>(old:T[]|undefined,next:T[]|undefined)=>[...(old||[]).filter(item=>!!item.turnKey&&keys.has(item.turnKey)),...(next||[])];
 return {...incoming,messages:[...prefix,...incoming.messages],tools:retain(previous.tools,incoming.tools),plans:retain(previous.plans,incoming.plans),artifacts:retain(previous.artifacts,incoming.artifacts),taskApps:retain(previous.taskApps,incoming.taskApps),fileChanges:retain(previous.fileChanges,incoming.fileChanges),historyBefore:previous.historyBefore,turnOffset:previous.turnOffset??0};
}

// Index once per snapshot rather than scanning the current page for every row.
export function mergeHistory<T>(older:readonly T[]|undefined,current:readonly T[]|undefined,key:(item:T)=>string):T[]{
 const latest=current||[];
 const ids=new Set(latest.map(key));
 return [...(older||[]).filter(item=>!ids.has(key(item))),...latest];
}
export function groupByTurn<T extends {turnKey?:string}>(items:readonly T[]|undefined){
 const groups=new Map<string,T[]>();
 for(const item of items||[]){if(!item.turnKey)continue;const group=groups.get(item.turnKey);if(group)group.push(item);else groups.set(item.turnKey,[item]);}
 return groups;
}
