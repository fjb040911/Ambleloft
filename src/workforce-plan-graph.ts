import {graphlib,layout} from '@dagrejs/dagre';
import type {PackageDefinition,WorkPackage} from './workforce-types';

// Only topology participates in layout. Status, translations and selection cannot move nodes.
export function graphTopology(definitions:PackageDefinition[]){
 const seen=new Set<string>(),errors:{kind:'duplicate'|'missing'|'cycle';ids:string[]}[]=[];
 for(const p of definitions){if(seen.has(p.id))errors.push({kind:'duplicate',ids:[p.id]});seen.add(p.id);}
 for(const p of definitions)for(const id of p.dependencies)if(!seen.has(id))errors.push({kind:'missing',ids:[p.id,id]});
 const remaining=new Set(seen),order:string[]=[];
 while(remaining.size){const ready=definitions.filter(p=>remaining.has(p.id)&&p.dependencies.every(id=>!remaining.has(id)));if(!ready.length)break;for(const p of ready){remaining.delete(p.id);order.push(p.id);}}
 if(remaining.size&&!errors.length)errors.push({kind:'cycle',ids:[...remaining]});
 return {errors,order,key:JSON.stringify(definitions.map(p=>[p.id,[...new Set(p.dependencies)].sort()]))};
}
export function graphLayout(definitions:PackageDefinition[],width=320,height=240){
 const topology=graphTopology(definitions);
 if(topology.errors.length)return {positions:new Map<string,{x:number;y:number}>(),...topology};
 const graph=new graphlib.Graph().setGraph({rankdir:'LR',nodesep:48,ranksep:88,marginx:24,marginy:24}).setDefaultEdgeLabel(()=>({}));
 for(const p of definitions)graph.setNode(p.id,{width,height});
 for(const p of definitions)for(const id of [...new Set(p.dependencies)].sort())graph.setEdge(id,p.id);
 layout(graph);
 return {...topology,positions:new Map(definitions.map(p=>{const n=graph.node(p.id);return [p.id,{x:n.x-width/2,y:n.y-height/2}];}))};
}
export function graphRelations(definitions:PackageDefinition[],selected?:string){
 const upstream=new Set<string>(),downstream=new Set<string>();
 const visit=(id:string,direction:'up'|'down',found:Set<string>)=>{
  const next=direction==='up'?definitions.find(p=>p.id===id)?.dependencies||[]:definitions.filter(p=>p.dependencies.includes(id)).map(p=>p.id);
  for(const target of next)if(target!==selected&&!found.has(target)){found.add(target);visit(target,direction,found);}
 };
 if(selected){visit(selected,'up',upstream);visit(selected,'down',downstream);}
 return {upstream,downstream};
}
export const dependencyAccepted=(p:WorkPackage)=>p.status==='accepted'&&!p.stale;
export const unmetDependencies=(packages:WorkPackage[],p:WorkPackage)=>p.definition.dependencies.filter(id=>!packages.some(q=>q.id===id&&dependencyAccepted(q)));
export const previewPackages=(definitions:PackageDefinition[]):WorkPackage[]=>definitions.map(definition=>({id:definition.id,definition,status:'draft',attempts:[]}));
