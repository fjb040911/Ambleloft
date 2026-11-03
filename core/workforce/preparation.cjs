const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {definition,semantic,id}=require('./contract.cjs');
const {hashDirectory}=require('../catalog-store/catalog.cjs');
const {installFixed}=require('../catalog-store/fixed-install.cjs');
const now=()=>new Date().toISOString();
// A catalog snapshot refresh does not change the pinned package identity.
const skillIdentity=s=>{const {snapshotId,...source}=s.source;return JSON.stringify({name:s.name,source});};
const terminal=['ready','cancelled','conflict'];
const methods={
 async submit(input){
  if(this.closing)throw Error('应用正在关闭');
  if(!id(input.commandId))throw Error('提交标识无效');
  const value=definition(input.value),fingerprint=createHash('sha256').update(JSON.stringify({id:input.id||null,revision:input.expectedRevision??null,value,draftId:input.draftId||null})).digest('hex');
  const accepted=await this.change(async state=>{
   const receipt=(state.profileSubmissions||[]).find(r=>r.commandId===input.commandId);
   if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('SUBMISSION_KEY_CONFLICT');return receipt.result;}
   const prior=state.jobs.find(j=>j.commandId===input.commandId);
   if(prior){if(prior.fingerprint!==fingerprint)throw Error('SUBMISSION_KEY_CONFLICT');return {jobId:prior.id,id:prior.employeeId,revision:prior.candidate.revision};}
   const old=input.id?state.employees.find(e=>e.id===input.id):null;
   if(input.id&&(!old||old.revision!==input.expectedRevision))throw Error('EMPLOYEE_REVISION_CONFLICT');
   const draft=input.draftId?(state.drafts.find(d=>d.id===input.draftId)||this.editDrafts?.get(input.draftId)):null;
   if(input.draftId&&(!draft||draft.revision!==input.expectedDraftRevision||draft.employeeId!==(input.id||null)))throw Error('DRAFT_REVISION_CONFLICT');
   if(old&&semantic(old)===semantic(value)){
    if(draft)state.drafts=state.drafts.filter(d=>d.id!==draft.id);
    return {id:old.id,revision:old.revision,noChange:true};
   }
   if(old&&state.jobs.some(j=>j.kind==='prepare'&&j.employeeId===old.id&&!terminal.includes(j.status)))throw Error('EMPLOYEE_PREPARATION_PENDING');
   if(!old&&state.employees.length+state.jobs.filter(j=>j.kind==='prepare'&&!j.baseRevision&&!terminal.includes(j.status)).length>=500)throw Error('最多保存 500 位员工');
   const retained=old?new Set(old.skills.map(skillIdentity)):new Set();
   const changed=value.skills.filter(s=>!retained.has(skillIdentity(s)));
   const installed=changed.length||!old?await this.skills.list():[];
   for(const s of changed){
    if(s.source.kind==='installed'){
     const actual=installed.find(v=>v.id===s.source.skillId&&v.name===s.name);if(!actual)throw Error('SKILL_SOURCE_MISSING');
     s.source.revision ||= actual.revision;s.source.version ||= actual.version;
    }
    if(s.source.kind==='import'&&!state.imports.some(i=>i.id===s.source.importId&&i.name===s.name))throw Error('SKILL_SOURCE_MISSING');
    if(s.source.kind==='store'&&s.source.sourceId!==this.catalog.source?.id)throw Error('STORE_INVALID_SOURCE');
   }
   const candidate={...definition(value),id:old?.id||randomUUID(),revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now()};
   const retainedKeys=old?candidate.skills.filter(s=>retained.has(skillIdentity(s))).map(s=>s.key):[];
   const reused=new Map();
   if(old&&changed.length){const mappings=await this.catalog.mappings();for(const entry of candidate.skills.filter(s=>!retainedKeys.includes(s.key))){const found=await this.globalMatch(entry,state,installed,mappings);if(found?.enabled)reused.set(entry.key,found.id);}}
   if(old&&candidate.skills.every(s=>retainedKeys.includes(s.key)||reused.has(s.key))){
    const applied={...candidate,activatedRevision:!retainedKeys.length||old.activatedRevision===old.revision?candidate.revision:old.activatedRevision};
    state.employees=state.employees.map(e=>e.id===old.id?applied:e);
    if(draft)state.drafts=state.drafts.filter(d=>d.id!==draft.id);
    const result={id:applied.id,revision:applied.revision};
    (state.profileSubmissions ||= []).push({commandId:input.commandId,fingerprint,result});
    return result;
   }
   const job={kind:'prepare',id:randomUUID(),commandId:input.commandId,fingerprint,employeeId:candidate.id,revision:candidate.revision,baseRevision:old?.revision||null,candidate,retainedKeys,status:'queued',attempt:0,startedAt:now(),steps:candidate.skills.map(s=>({key:s.key,label:s.label,status:retainedKeys.includes(s.key)?'reused':'pending'})),events:[]};
   state.jobs.unshift(job);if(draft)state.drafts=state.drafts.filter(d=>d.id!==draft.id);
   return {jobId:job.id,id:candidate.id,revision:candidate.revision};
  });
  if(accepted.jobId)this.schedulePreparation(accepted.jobId);
  return accepted;
 },
 schedulePreparation(jobId){
  this.preparing ||= new Map();if(this.preparing.has(jobId))return this.preparing.get(jobId);
  const action=this.installQueue.then(()=>this.runPreparation(jobId));this.installQueue=action.catch(()=>{});this.preparing.set(jobId,action);
  action.finally(()=>{this.preparing.delete(jobId);this.publish();}).catch(()=>{});return action;
 },
 async controlPreparation({jobId,action}){
  if(!['retry','cancel'].includes(action))throw Error('PREPARATION_INVALID_ACTION');
  await this.change(state=>{const j=state.jobs.find(j=>j.id===jobId&&j.kind==='prepare');if(!j)throw Error('PREPARATION_NOT_FOUND');
   if(action==='cancel'){if(j.status==='ready')throw Error('PREPARATION_ALREADY_APPLIED');j.status='cancelled';j.finishedAt=now();}
   else{if(!['failed','interrupted'].includes(j.status))throw Error('PREPARATION_NOT_RETRYABLE');j.status='queued';}
  });
  if(action==='retry')this.schedulePreparation(jobId);
  return {accepted:true};
 },
 async runPreparation(jobId){
  let job=await this.change(s=>{const j=s.jobs.find(j=>j.id===jobId);if(!j||j.status!=='queued')return null;j.status='running';j.attempt++;return j;});if(!job)return;
  const update=(key,status,extra={})=>this.change(s=>{const j=s.jobs.find(j=>j.id===jobId);if(!j||j.status==='cancelled')throw Error('PREPARATION_CANCELLED');if(this.closing)throw Error('PREPARATION_INTERRUPTED');Object.assign(j.steps.find(x=>x.key===key),{status,...extra});j.events.push({seq:(j.events.at(-1)?.seq||0)+1,key,status,at:now()});if(j.events.length>2000)j.events.splice(0,1000);});
  try{
   let failed=false;
   for(const entry of job.candidate.skills){
    if(job.retainedKeys?.includes(entry.key))continue;
    try{
     await update(entry.key,'checking',{error:null});
     const state=await this.read(),installed=await this.skills.list();
     let found=await this.globalMatch(entry,state,installed,await this.catalog.mappings()),reused=!!found;
     if(found&&!found.enabled)throw Error('SKILL_DISABLED');
     if(found&&entry.source.kind==='store'&&entry.source.packageDigest){const listing=await this.resolveSkill(entry.source);if(listing.entityName!==entry.name)throw Error('STORE_PACKAGE_IDENTITY');}
     if(!found&&entry.source.kind==='store'){
      const result=await installFixed(this.catalog,entry.source,ref=>this.resolveSkill(ref),status=>update(entry.key,status));
      found=(await this.skills.list()).find(s=>s.id===result.entityId);reused=result.reused;
     }else if(!found&&entry.source.kind==='import'){
      const ref=state.imports.find(i=>i.id===entry.source.importId);if(!ref)throw Error('SKILL_SOURCE_MISSING');
      const source=path.join(this.root,'sources',ref.id);if(hashDirectory(source,{skillImport:true})!==ref.digest)throw Error('SKILL_SOURCE_CHANGED');
      await update(entry.key,'installing');
      const result=await this.skills.installFrozen(source,{sourceId:'import',listingId:ref.id,version:'1.0.0',packageDigest:hashDirectory(source)},{provenance:ref.provenance});found=result.skill;reused=result.reused;
     }
     if(!found?.enabled)throw Error(found?'SKILL_DISABLED':'SKILL_SOURCE_MISSING');
     if(found.name!==entry.name)throw Error('STORE_PACKAGE_IDENTITY');
     await update(entry.key,reused?'reused':'installed',{skillId:found.id});
    }catch(e){if(['PREPARATION_CANCELLED','PREPARATION_INTERRUPTED'].includes(e.message))throw e;failed=true;await update(entry.key,'failed',{error:e.message});}
   }
   await this.change(s=>{
    const j=s.jobs.find(j=>j.id===jobId);if(j.status==='cancelled')return;
    if(this.closing){j.status='interrupted';return;}
    if(failed){j.status='failed';j.finishedAt=now();return;}
    const old=s.employees.find(e=>e.id===j.employeeId);
    if((old?.revision||null)!==j.baseRevision){j.status='conflict';j.error='EMPLOYEE_REVISION_CONFLICT';return;}
    const applied={...j.candidate,activatedRevision:!j.retainedKeys?.length||old?.activatedRevision===old?.revision?j.candidate.revision:old?.activatedRevision,updatedAt:now()};
    s.employees=old?s.employees.map(e=>e.id===applied.id?applied:e):[applied,...s.employees];j.status='ready';j.finishedAt=now();
   });
  }catch(error){await this.change(s=>{const j=s.jobs.find(j=>j.id===jobId);if(j.status!=='cancelled'){j.status=this.closing?'interrupted':'failed';j.error=error.message;}});}
 },
 async resolveSkill(ref){
  if(this.expert){try{return await this.expert.resolve(ref);}catch(e){if(ref.packageDigest)throw e;}}
  const {catalog}=await this.catalog.refresh();const item=catalog.items.find(i=>i.id===ref.listingId&&i.release.version===ref.version&&i.release.status==='published');
  if(!item)throw Error('STORE_RELEASE_UNAVAILABLE');return item;
 },
};
module.exports={preparationMethods:methods};
