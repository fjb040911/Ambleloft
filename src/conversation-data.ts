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
