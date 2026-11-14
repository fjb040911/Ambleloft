import type {WorkPackage} from './workforce-types';
import {executionState} from './workforce-execution-state';

// Shared presentation of persisted automation. Never infer success from an executor ending.
export function automationStage(p:WorkPackage){
 if(p.stale)return null;
 if(p.status==='review'&&p.attempts.at(-1)?.automaticReview?.state==='checking')return 'checking';
 if(p.status==='pending'&&p.retryAt)return 'retry';
 if((p.autoRepairs||0)>0&&['pending','starting','preparing','running'].includes(p.status))return 'repair';
 return null;
}
export const hasPendingRequest=(kind?:string)=>['approval','input','approval-input'].includes(kind||'');
export function automaticFallback(p:WorkPackage){
 const report=p.attempts.at(-1)?.automaticReview;
 return !p.stale&&p.status==='review'&&report?.state==='done'&&(report.outcome==='fail'||report.outcome==='indeterminate');
}
export function packageState(p:WorkPackage,L:(zh:string,en:string)=>string){
 if(p.stale)return executionState('stale',L);
 const stage=automationStage(p);
 if(stage==='checking')return L('自动验收中','Verifying automatically');
 if(stage==='retry')return L('等待自动重试','Automatic retry scheduled');
 if(stage==='repair')return L('自动修复中','Repairing automatically');
 if(automaticFallback(p))return L('需要你处理','Needs your attention');
 if(p.status==='accepted'&&p.acceptance?.source==='completion-policy')return L('已放行（未核验）','Released (not verified)');
 return executionState(p.status,L);
}
