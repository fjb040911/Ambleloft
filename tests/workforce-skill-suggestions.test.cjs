const test=require('node:test'),assert=require('node:assert/strict');
const {skillSuggestionMethods,retrieve}=require('../core/workforce/skill-suggestions.cjs');
function fixture(){
 const skill={id:'design',entityName:'design',title:{en:'Design'},summary:{en:'Architecture'},release:{version:'1.0.0',status:'published',packageDigest:'valid'}};
 const draft={id:'draft',revision:1,value:{domain:'architecture',responsibilities:'design',deliverables:'plan',methods:'review',skills:[{name:'existing'}]}};
 const snapshot={docs:{skills:[skill]},manifest:{snapshotId:'snapshot'},stale:false};
 const svc={...skillSuggestionMethods,providers:{secret:async()=>({})},read:async()=>({drafts:[draft]}),expert:{load:async()=>snapshot},generateRole:async()=>({items:[{id:'design',version:'1.0.0',reason:'Helps design',match:'high',responsibility:'design'}],unmatchedCapabilities:[]})};
 return {svc,skill,draft,snapshot,input:{requestId:'request',draftId:'draft',draftRevision:1}};
}
test('Chinese responsibility terms and public categories rank relevant candidates before unrelated entries',()=>{
 const candidate=(id,title,categoryIds=[])=>({id,entityName:id,title:{zh:title,en:id},summary:{zh:'',en:''},categoryIds,release:{status:'published'}});
 const matches=retrieve([candidate('alpha','系统架构'),candidate('zeta','差旅申请需求', ['product'])],{responsibilities:'分析差旅申请需求'});
 assert.equal(matches[0].id,'zeta');
});
test('recommendation uses only explicit fields and verified identity, never changes selections',async()=>{
 const f=fixture();let sent;const original=f.svc.generateRole;f.svc.generateRole=async(c,j)=>{sent=j.input;return original();};
 const out=await f.svc.suggestExpertSkills(f.input);assert.equal(out.items[0].skill.release.packageDigest,'valid');assert.deepEqual(f.draft.value.skills,[{name:'existing'}]);assert.deepEqual(Object.keys(sent.fields),['domain','responsibilities','deliverables','methods']);assert.equal(JSON.stringify(sent).includes('existing'),false);
});
test('rejects unknown, duplicate, changed and revoked candidate',async()=>{
 for(const mode of ['unknown','duplicate','changed','revoked']){
  const f=fixture(),item={id:mode==='unknown'?'invented':'design',version:'1.0.0',reason:'reason',match:'high',responsibility:'design'};
  f.svc.generateRole=async()=>({items:mode==='duplicate'?[item,item]:[item],unmatchedCapabilities:[]});
  if(mode==='changed'||mode==='revoked'){let n=0;f.svc.expert.load=async()=>++n===1?structuredClone(f.snapshot):({...structuredClone(f.snapshot),docs:{skills:[{...f.skill,release:{...f.skill.release,...(mode==='revoked'?{status:'revoked'}:{packageDigest:'changed'})}}]}});}
  await assert.rejects(f.svc.suggestExpertSkills(f.input),/SUGGESTION_INVALID_CANDIDATE/);
 }
});
test('cancel and edited draft reject late answers',async()=>{
 for(const mode of ['cancel','edit']){
  const f=fixture();let resolve;f.svc.generateRole=async()=>new Promise(r=>resolve=r);
  const request=f.svc.suggestExpertSkills(f.input);while(!resolve)await new Promise(r=>setImmediate(r));
  if(mode==='cancel')assert.equal(f.svc.cancelExpertSkillSuggestion({requestId:'request'}).cancelled,true);else f.draft.revision++;
  resolve({items:[],unmatchedCapabilities:[]});await assert.rejects(request);
 }
});
test('empty and stale catalog never calls model',async()=>{
 const f=fixture();f.snapshot.docs.skills=[];f.svc.generateRole=async()=>{throw Error('must not call')};assert.deepEqual((await f.svc.suggestExpertSkills(f.input)).items,[]);
 f.snapshot.stale=true;await assert.rejects(f.svc.suggestExpertSkills({...f.input,requestId:'next'}),/SUGGESTION_SNAPSHOT_UNAVAILABLE/);
});
test('applying suggestion revalidates draft and release, cancellation invalidates',async()=>{
 const f=fixture();f.svc.expert.source={id:'trusted'};await f.svc.suggestExpertSkills(f.input);
 const args={requestId:'request',draftId:'draft',draftRevision:1,snapshotId:'snapshot',listingId:'design',version:'1.0.0'};
 const declaration=await f.svc.resolveExpertSkillSuggestion(args);assert.equal(declaration.source.sourceId,'trusted');assert.equal(declaration.source.packageDigest,'valid');
 f.skill.release.status='revoked';await assert.rejects(f.svc.resolveExpertSkillSuggestion(args),/SUGGESTION_INVALID_CANDIDATE/);
 f.skill.release.status='published';f.draft.revision++;await assert.rejects(f.svc.resolveExpertSkillSuggestion(args),/SUGGESTION_DRAFT_CHANGED/);
 f.draft.revision--;f.svc.cancelExpertSkillSuggestion({requestId:'request'});await assert.rejects(f.svc.resolveExpertSkillSuggestion(args),/SUGGESTION_EXPIRED/);
});
test('multiple selections preserve recommendations when role fields have not changed',async()=>{
 const f=fixture();f.svc.expert.source={id:'trusted'};await f.svc.suggestExpertSkills(f.input);
 const args={requestId:'request',draftId:'draft',draftRevision:1,snapshotId:'snapshot',listingId:'design',version:'1.0.0'};
 await f.svc.resolveExpertSkillSuggestion(args);f.draft.value.skills.push({name:'another'});f.draft.revision++;
 assert.equal((await f.svc.resolveExpertSkillSuggestion({...args,draftRevision:2})).name,'design');
 f.draft.value.responsibilities='changed';f.draft.revision++;await assert.rejects(f.svc.resolveExpertSkillSuggestion({...args,draftRevision:3}),/SUGGESTION_DRAFT_CHANGED/);
});
