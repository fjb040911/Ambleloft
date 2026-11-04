import type {AgentRun} from './types';
import type {SpaceSnapshot} from './workforce-types';
import type {SpaceDestination} from './workforce-space-state';
export type CollaborationTarget=SpaceDestination&{spaceId:string;serial:number};
export function collaborationDestination(run:AgentRun,state:SpaceSnapshot):Omit<CollaborationTarget,'serial'>|null{
 const origin=run.collaboration;
 if(!origin||!state.spaces.some(s=>s.id===origin.spaceId))return null;
 for(const plan of state.plans||[]){
  if(plan.spaceId!==origin.spaceId)continue;
  const item=plan.packages.find(p=>p.attempts.some(a=>a.runId===run.id||a.requestId===origin.requestId));
  if(item)return {spaceId:origin.spaceId,tab:'tasks',planId:plan.id,packageId:item.id,detailTab:'chat'};
 }
 const request=state.requests.find(r=>r.spaceId===origin.spaceId&&(r.id===origin.requestId||r.participants.some(p=>p.runId===run.id)));
 return request?.mode==='discussion'?{spaceId:origin.spaceId,tab:'discussion',requestId:request.id}:null;
}
