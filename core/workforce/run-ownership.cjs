// Execution records remain evidence owned by their space, including archived spaces.
function isReferenced(run,state){
 const origin=run.collaboration;
 return !!(state.spaces?.some(s=>s.id===origin?.spaceId)
  ||state.requests?.some(r=>r.id===origin?.requestId||r.participants?.some(p=>p.runId===run.id))
  ||state.plans?.some(p=>p.packages?.some(w=>w.attempts?.some(a=>a.runId===run.id||origin?.requestId&&a.requestId===origin.requestId)))
  ||state.documents?.some(d=>d.sourceRunId===run.id||d.versions?.some(v=>v.sourceRunId===run.id)));
}
async function assertLifecycleEditable(runtime,run,input){
 if(!run.collaboration||!(input.remove===true||input.archived===true||input.projectId!==undefined&&input.projectId!==run.projectId))return;
 // Fail closed if ownership cannot be checked; never discard evidence on a read failure.
 if(!runtime.spaces||isReferenced(run,await runtime.spaces.read()))throw Object.assign(new Error('此记录属于协作工作平台，不能在普通任务中归档、删除或移动。请在所属项目空间管理。 / This execution belongs to a collaboration space. Manage it in its owning space.'),{code:'COLLABORATION_RECORD_OWNED'});
}
module.exports={isReferenced,assertLifecycleEditable};
