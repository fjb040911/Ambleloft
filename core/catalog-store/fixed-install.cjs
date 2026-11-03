const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {download}=require('./service.cjs');
const {checkCompatibility,hashDirectory,MAX_ARTIFACT}=require('./catalog.cjs');
// Called from the host, never from renderer-provided artifact URLs.
async function installFixed(store,reference,resolve,onProgress=()=>{}){
 const item=await resolve(reference),r=item.release;
 checkCompatibility(r,{version:store.hostVersion});
 const identity={sourceId:reference.sourceId,listingId:reference.listingId,version:r.version,packageDigest:r.packageDigest,artifactSha256:r.artifactSha256};
 const installed=await store.skills.list();
 for(const skill of installed)if(skill.fixedRelease&&JSON.stringify(skill.fixedRelease)===JSON.stringify(identity)){
  if(!skill.enabled)throw Error('SKILL_DISABLED');
  try{if(hashDirectory(path.dirname(skill.path))===r.packageDigest)return {entityId:skill.id,reused:true};}catch{}
 }
 await onProgress('downloading');
 const bytes=await download(new URL(r.artifactPath,store.source.baseUrl).href,Math.min(MAX_ARTIFACT,r.artifactSize),{fetcher:store.fetcher});
 if(bytes.length!==r.artifactSize||crypto.createHash('sha256').update(bytes).digest('hex')!==r.artifactSha256)throw Error('STORE_ARTIFACT_INTEGRITY');
 await onProgress('verifying');
 const stage=await fs.mkdtemp(path.join(store.root,'fixed-'));
 try{
  const file=path.join(stage,'package.zip');await fs.writeFile(file,bytes);
  const revision=await store.skillPackages.prepare(file,'archive'),source=path.join(store.skillPackages.root,revision.relativePath);
  if(revision.digest!==r.packageDigest||revision.manifest.name!==item.entityName)throw Error('STORE_PACKAGE_IDENTITY');
  await onProgress('installing');
  const result=await store.skills.installFrozen(source,identity);
  await store.saveMapping({sourceId:identity.sourceId,listingId:identity.listingId,kind:'skill',entityId:result.skill.id,releaseVersion:r.version,installedRevision:result.skill.revision,installedDigest:r.packageDigest,artifactSha256:r.artifactSha256,installedAt:new Date().toISOString()});
  return {entityId:result.skill.id,reused:result.reused};
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={installFixed};
