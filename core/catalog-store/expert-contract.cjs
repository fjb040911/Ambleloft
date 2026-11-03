// Shared publisher/host contract. Only this signed, bounded data may authorize a release.
const crypto=require('node:crypto');
const {validateSource,validateCatalog}=require('./catalog.cjs');
const MAX=4*1024*1024, HEX=/^[a-f0-9]{64}$/, ID=/^[a-z0-9][a-z0-9._-]{0,119}$/;
const fail=()=>{throw Error('EXPERT_INVALID_SNAPSHOT');};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifyManifest(envelope,source,now=Date.now()){
 validateSource(source);
 if(!envelope||envelope.keyId!==source.keyId||typeof envelope.payload!=='string'||envelope.payload.length>MAX||typeof envelope.signature!=='string')fail();
 const bytes=Buffer.from(envelope.payload,'base64'),sig=Buffer.from(envelope.signature,'base64');
 if(bytes.toString('base64')!==envelope.payload||sig.toString('base64')!==envelope.signature||sig.length!==64||!crypto.verify(null,bytes,source.publicKey,sig))throw Error('EXPERT_INVALID_SIGNATURE');
 const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const start=Date.parse(m.generatedAt),end=Date.parse(m.expiresAt);
 if(m.schemaVersion!==2||m.sourceId!==source.id||!HEX.test(m.snapshotId)||!Number.isSafeInteger(m.sequence)||m.sequence<1||!Number.isFinite(start)||start>now+300000||!Number.isFinite(end)||end<=start||end-start>31*86400000||!Array.isArray(m.documents)||m.documents.length!==4)fail();
 if(new Set(m.documents.map(d=>d.id)).size!==4)fail();
 for(const d of m.documents)if(!['roles','skills','recommendations','categories'].includes(d.id)||!HEX.test(d.sha256)||!Number.isSafeInteger(d.size)||d.size<1||d.size>MAX||d.path!==`snapshots/${m.snapshotId}/${d.id}.json`)fail();
 return {manifest:m,stale:end<=now};
}
function decodeDocument(bytes,descriptor){if(bytes.length!==descriptor.size||hash(bytes)!==descriptor.sha256)throw Error('EXPERT_DOCUMENT_INTEGRITY');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(value.schemaVersion!==2||value.kind!==descriptor.id||!Array.isArray(value.items))fail();return value.items;}
function validateDocuments(docs){
 const {roles,skills,recommendations,categories}=docs;
 if(!Array.isArray(roles)||roles.length>100||!Array.isArray(skills)||skills.length>200||!Array.isArray(recommendations)||recommendations.length>2000||!Array.isArray(categories))fail();
 const unique=(rows,key)=>{if(new Set(rows.map(key)).size!==rows.length)fail();};
 unique(roles,r=>r.id+'@'+r.version);unique(skills,s=>s.id+'@'+s.release?.version);unique(recommendations,r=>r.id);
 for(const s of skills){
  validateCatalog({schemaVersion:1,sourceId:'curated',generatedAt:'2026-01-01T00:00:00Z',expiresAt:'2026-01-02T00:00:00Z',items:[s]});
  if(s.kind!=='skill'||!s.author||!s.repository||!/^[a-f0-9]{40}$/.test(s.repository.commit)||!s.validation?.packageVerifiedAt)fail();
 }
 for(const r of roles){
  if(!ID.test(r.id)||!/^\d+\.\d+\.\d+$/.test(r.version)||r.status!=='published'||!Array.isArray(r.skills)||r.skills.length>20||!r.skills.some(s=>s.defaultSelected===true))fail();
  for(const lang of ['zh-CN','en']){
   const c=r.content?.[lang];if(!c?.name||!c.summary||!c.domain||!c.responsibilities?.length||!c.deliverables?.length||!c.requiredInputs?.length||!c.workingMethods?.length||!c.boundaries?.length)fail();
  }
  if(JSON.stringify(r.content['zh-CN'].responsibilities.map(x=>x.id))!==JSON.stringify(r.content.en.responsibilities.map(x=>x.id))||JSON.stringify(r.content['zh-CN'].deliverables.map(x=>x.id))!==JSON.stringify(r.content.en.deliverables.map(x=>x.id)))fail();
  unique(r.skills,b=>b.id);unique(r.skills,b=>b.release?.listingId);
  for(const b of r.skills){
   const s=skills.find(s=>s.id===b.release?.listingId&&s.release.version===b.release.version),rec=recommendations.find(x=>x.id===b.recommendationId);
   if(!s||!rec||rec.roleId!==r.id||rec.roleVersion!==r.version||rec.skill.listingId!==s.id||JSON.stringify(rec.skill)!==JSON.stringify(b.release)||s.release.packageDigest!==b.release.packageDigest||s.release.artifactSha256!==b.release.artifactSha256||b.release.sourceId!==r.sourceId||typeof b.defaultSelected!=='boolean'||b.usage?.mode!=='when-relevant'||!b.responsibilityIds?.length||b.responsibilityIds.some(id=>!r.content.en.responsibilities.some(x=>x.id===id)))fail();
   for(const locale of ['zh-CN','en'])if(!rec.reason?.[locale]||!b.usage.when?.[locale]||!b.usage.whenNot?.[locale])fail();
  }
 }
 return docs;
}
function legacyDefinition(c){return {name:c.name,domain:c.domain,responsibilities:c.responsibilities.map(x=>x.text).join('\n'),deliverables:c.deliverables.map(x=>x.name+'\n'+x.acceptanceCriteria.map(a=>'• '+a).join('\n')).join('\n\n'),methods:[...c.workingMethods,...c.boundaries,...c.requiredInputs].join('\n')};}
function declaration(binding,listing,locale,snapshotId,roleVersion){
 const language=locale==='en'?'en':'zh-CN',l=language==='en'?'en':'zh';
 return {name:listing.entityName,label:listing.title[l],purpose:listing.summary[l],source:{kind:'store',...binding.release,snapshotId},usage:{mode:'when-relevant',when:binding.usage.when[language],whenNot:binding.usage.whenNot[language]},selectionOrigin:{kind:binding.defaultSelected?'template-default':'user-selected',templateBindingId:binding.id,recommendationId:binding.recommendationId,roleVersion}};
}
function legacyRoles(docs,snapshotId){return docs.roles.map(r=>({id:r.id,version:r.version,publisher:r.publisher,content:r.content,zh:legacyDefinition(r.content['zh-CN']),en:legacyDefinition(r.content.en),skills:r.skills.map(b=>{const s=docs.skills.find(s=>s.id===b.release.listingId&&s.release.version===b.release.version),rec=docs.recommendations.find(x=>x.id===b.recommendationId);return {...declaration(b,s,'zh-CN',snapshotId,r.version),labelEn:s.title.en,purposeEn:s.summary.en,defaultSelected:b.defaultSelected,reason:rec.reason['zh-CN'],reasonEn:rec.reason.en,usageEn:{mode:'when-relevant',when:b.usage.when.en,whenNot:b.usage.whenNot.en},repository:s.repository,license:s.license,runtime:s.runtime.zh,runtimeEn:s.runtime.en,validation:s.validation};})}));}
module.exports={MAX,hash,verifyManifest,decodeDocument,validateDocuments,legacyRoles,declaration};
