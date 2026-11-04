// Suggestions are ephemeral; signed Store records alone supply installable identities.
const {createHash}=require('node:crypto');
const {generate}=require('../automation/provider.cjs');
const {id}=require('./contract.cjs');
const RULE_VERSION='expert-skill-matching-v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roleFields=value=>Object.fromEntries(['domain','responsibilities','deliverables','methods'].map(k=>[k,value[k]||'']));
function words(s){
 const result=new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g)||[]));
 for(const segment of s.match(/[\u3400-\u9fff]+/g)||[])for(let i=0;i<segment.length-1;i++)result.add(segment.slice(i,i+2));
 return result;
}
function retrieve(skills,fields){
 const tokens=words(Object.values(fields).join(' '));
 return skills.filter(s=>s.release.status==='published').map(s=>{const search=words([s.entityName,s.title?.zh,s.title?.en,s.summary?.zh,s.summary?.en,...(s.categoryIds||[]),...(s.tags||[])].join(' '));let score=0;for(const t of tokens)if(search.has(t))score++;return {s,score};}).sort((a,b)=>b.score-a.score||a.s.id.localeCompare(b.s.id)).slice(0,30).map(x=>x.s);
}
function cancelled(signal){return new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}
const methods={
 cancelExpertSkillSuggestion({requestId}){const active=this.skillSuggestionRequests?.get(requestId);if(active)active.controller.abort();const removed=this.skillSuggestionResults?.delete(requestId);return {cancelled:!!active||!!removed};},
 async resolveExpertSkillSuggestion({requestId,draftId,draftRevision,snapshotId,listingId,version,locale}){
  if(this.closing)throw Error('SUGGESTION_UNAVAILABLE');
  const result=this.skillSuggestionResults?.get(requestId);
  if(!result||result.draftId!==draftId||result.snapshotId!==snapshotId)throw Error('SUGGESTION_EXPIRED');
  const state=await this.read(),draft=state.drafts.find(d=>d.id===draftId)||this.editDrafts?.get(draftId);
  if(!draft||draft.revision!==draftRevision||digest(roleFields(draft.value))!==result.inputDigest)throw Error('SUGGESTION_DRAFT_CHANGED');
  const candidate=result.items.find(x=>x.id===listingId&&x.version===version);if(!candidate)throw Error('SUGGESTION_INVALID_CANDIDATE');
  const latest=await this.expert.load(true);
  if(this.skillSuggestionResults?.get(requestId)!==result||!latest.docs||latest.stale||latest.manifest.snapshotId!==snapshotId)throw Error('SUGGESTION_EXPIRED');
  const skill=latest.docs.skills.find(s=>s.id===listingId&&s.release.version===version);
  if(!skill||skill.release.status!=='published'||digest(skill)!==digest(candidate.skill))throw Error('SUGGESTION_INVALID_CANDIDATE');
  const current=await this.read(),currentDraft=current.drafts.find(d=>d.id===draftId)||this.editDrafts?.get(draftId);
  if(this.skillSuggestionResults?.get(requestId)!==result||!currentDraft||currentDraft.revision!==draftRevision||digest(roleFields(currentDraft.value))!==result.inputDigest)throw Error('SUGGESTION_DRAFT_CHANGED');
  const lang=locale==='en'?'en':'zh',fallback=lang==='en'?'zh':'en';
  return {name:skill.entityName,label:skill.title?.[lang]||skill.title?.[fallback]||skill.entityName,purpose:skill.summary?.[lang]||skill.summary?.[fallback]||'',source:{kind:'store',sourceId:this.expert.source.id,listingId:skill.id,version:skill.release.version,packageDigest:skill.release.packageDigest,artifactSha256:skill.release.artifactSha256,snapshotId},selectionOrigin:{kind:'user-selected'}};
 },
 async suggestExpertSkills(input){
  if(this.closing)throw Error('SUGGESTION_UNAVAILABLE');
  if(!id(input.requestId)||!id(input.draftId)||!Number.isInteger(input.draftRevision))throw Error('SUGGESTION_INVALID_REQUEST');
  if(!this.providers||!this.expert)throw Error('SUGGESTION_UNAVAILABLE');
  this.skillSuggestionRequests ||= new Map();this.skillSuggestionResults ||= new Map();if(this.skillSuggestionRequests.has(input.requestId)||this.skillSuggestionResults.has(input.requestId))throw Error('SUGGESTION_REQUEST_IN_PROGRESS');
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]);this.skillSuggestionRequests.set(input.requestId,{controller});this.suggestionControllers ||= new Set();this.suggestionControllers.add(controller);
  try{
   const state=await this.read(),draft=state.drafts.find(d=>d.id===input.draftId)||this.editDrafts?.get(input.draftId);
   if(!draft||draft.revision!==input.draftRevision)throw Error('SUGGESTION_DRAFT_CHANGED');
   const revision=draft.revision,fields=roleFields(draft.value),inputDigest=digest(fields),snapshot=await this.expert.load(false);
   if(!snapshot.docs||snapshot.stale||input.snapshotId&&input.snapshotId!==snapshot.manifest.snapshotId)throw Error('SUGGESTION_SNAPSHOT_UNAVAILABLE');
   if(signal.aborted)throw Error('SUGGESTION_CANCELLED');
   const candidates=retrieve(snapshot.docs.skills,fields);if(!candidates.length)return {requestId:input.requestId,draftRevision:revision,snapshotId:snapshot.manifest.snapshotId,inputDigest,ruleVersion:RULE_VERSION,status:'ready',items:[],unmatchedCapabilities:[]};
   const summaries=candidates.map(s=>({id:s.id,version:s.release.version,name:s.entityName,title:s.title,summary:s.summary}));
   const config=await this.providers.secret(input.providerId,input.model);if(signal.aborted)throw Error('SUGGESTION_CANCELLED');
   const schema={type:'object',properties:{items:{type:'array',maxItems:10,items:{type:'object',properties:{id:{type:'string'},version:{type:'string'},reason:{type:'string'},match:{type:'string',enum:['high','additional']},responsibility:{type:'string'}},required:['id','version','reason','match','responsibility'],additionalProperties:false}},unmatchedCapabilities:{type:'array',maxItems:5,items:{type:'string'}}},required:['items','unmatchedCapabilities'],additionalProperties:false};
   const raw=await Promise.race([(this.generateRole||generate)(config,{prompt:'Match only supplied skills to the role. Return only candidate id and version, a concise reason, match label and relevant responsibility. Never invent sources, versions or installable skills. Unmatched capabilities are plain search terms, not skills. Do not install or change selections.',input:{fields,candidates:summaries},outputSchema:schema,maxOutputTokens:8192,repairInvalidOutput:true},signal),cancelled(signal)]);
   if(signal.aborted)throw Error('SUGGESTION_CANCELLED');
   if(!raw||!Array.isArray(raw.items)||raw.items.length>10||!Array.isArray(raw.unmatchedCapabilities)||raw.unmatchedCapabilities.length>5)throw Error('SUGGESTION_INVALID_OUTPUT');
   const current=await this.read(),latestDraft=current.drafts.find(d=>d.id===input.draftId)||this.editDrafts?.get(input.draftId);
   if(!latestDraft||latestDraft.revision!==revision||digest(roleFields(latestDraft.value))!==inputDigest)throw Error('SUGGESTION_DRAFT_CHANGED');
   const latest=await this.expert.load(true);if(signal.aborted)throw Error('SUGGESTION_CANCELLED');
   if(!latest.docs||latest.stale||latest.manifest.snapshotId!==snapshot.manifest.snapshotId)throw Error('SUGGESTION_SNAPSHOT_CHANGED');
   const seen=new Set(),items=raw.items.map(item=>{
    if(!item||Object.keys(item).some(k=>!['id','version','reason','match','responsibility'].includes(k))||typeof item.id!=='string'||typeof item.version!=='string'||!['high','additional'].includes(item.match)||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>1000||typeof item.responsibility!=='string'||item.responsibility.length>1000)throw Error('SUGGESTION_INVALID_OUTPUT');
    const key=item.id+'@'+item.version;if(seen.has(key))throw Error('SUGGESTION_INVALID_CANDIDATE');seen.add(key);
    const original=candidates.find(s=>s.id===item.id&&s.release.version===item.version),now=latest.docs.skills.find(s=>s.id===item.id&&s.release.version===item.version);
    if(!original||!now||now.release.status!=='published'||digest(original)!==digest(now))throw Error('SUGGESTION_INVALID_CANDIDATE');
    return {id:now.id,version:now.release.version,reason:item.reason.trim(),match:item.match,responsibility:item.responsibility.trim(),skill:now};
   });
   const unmatchedCapabilities=raw.unmatchedCapabilities.map(v=>{if(typeof v!=='string'||!v.trim()||v.length>200)throw Error('SUGGESTION_INVALID_OUTPUT');return v.trim();});
   const finalState=await this.read(),finalDraft=finalState.drafts.find(d=>d.id===input.draftId)||this.editDrafts?.get(input.draftId);
   if(signal.aborted)throw Error('SUGGESTION_CANCELLED');
   if(!finalDraft||finalDraft.revision!==revision||digest(roleFields(finalDraft.value))!==inputDigest)throw Error('SUGGESTION_DRAFT_CHANGED');
   const result={requestId:input.requestId,draftId:input.draftId,draftRevision:revision,snapshotId:snapshot.manifest.snapshotId,inputDigest,ruleVersion:RULE_VERSION,status:'ready',items,unmatchedCapabilities};
   this.skillSuggestionResults.set(input.requestId,result);if(this.skillSuggestionResults.size>100)this.skillSuggestionResults.delete(this.skillSuggestionResults.keys().next().value);
   return result;
  }catch(error){throw require('../automation/structured-output.cjs').localizeStructuredError(error,input.locale);}finally{if(this.skillSuggestionRequests.get(input.requestId)?.controller===controller)this.skillSuggestionRequests.delete(input.requestId);this.suggestionControllers.delete(controller);}
 }
};
module.exports={skillSuggestionMethods:methods,retrieve,roleFields,RULE_VERSION};
