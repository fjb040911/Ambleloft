const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {download}=require('./service.cjs');
const {MAX,verifyManifest,decodeDocument,validateDocuments,legacyRoles}=require('./expert-contract.cjs');
class ExpertClient{
 constructor({directory,source,fetcher}){Object.assign(this,{root:path.join(directory,'expert-store'),source,fetcher});this.queue=Promise.resolve();}
 async cached(){try{const envelope=JSON.parse(await fs.readFile(path.join(this.root,'manifest.json'),'utf8')),verified=verifyManifest(envelope,this.source),docs={};for(const d of verified.manifest.documents)docs[d.id]=decodeDocument(await fs.readFile(path.join(this.root,d.path)),d);return {...verified,docs:validateDocuments(docs)};}catch{return null;}}
 load(refresh=false){const action=this.queue.then(()=>this.loadOne(refresh));this.queue=action.catch(()=>{});return action;}
 async loadOne(refresh){
  let value=await this.cached(),error;
  if(refresh||!value||value.stale)try{
   const raw=await download(new URL('api/v1/manifest',this.source.baseUrl).href,MAX,{fetcher:this.fetcher});
   const next=verifyManifest(JSON.parse(raw),this.source);if(next.stale)throw Error('EXPERT_SNAPSHOT_EXPIRED');
   if(value&&(next.manifest.sequence<value.manifest.sequence||next.manifest.sequence===value.manifest.sequence&&next.manifest.snapshotId!==value.manifest.snapshotId))throw Error('EXPERT_SNAPSHOT_ROLLBACK');
   const docs={},files=[];
   for(const d of next.manifest.documents){const bytes=await download(new URL(d.path,this.source.baseUrl).href,d.size,{fetcher:this.fetcher});docs[d.id]=decodeDocument(bytes,d);files.push([d.path,bytes]);}
   validateDocuments(docs);
   for(const [name,bytes]of files){const file=path.join(this.root,name);await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID();await fs.writeFile(tmp,bytes);await fs.rename(tmp,file);}
   const file=path.join(this.root,'manifest.json'),tmp=file+'.'+randomUUID();await fs.writeFile(tmp,raw);await fs.rename(tmp,file);value={...next,docs};
  }catch(e){error=e.message;}
  return {...value,error,stale:!value||value.stale||!!error};
 }
 async roles(refresh){const v=await this.load(refresh);return {items:v.docs?legacyRoles(v.docs,v.manifest.snapshotId):[],source:this.source.id,stale:v.stale,error:v.error,snapshotId:v.manifest?.snapshotId};}
 async resolve(ref,{refresh=true}={}){
  const v=await this.load(refresh);if(!v.docs||v.stale)throw Error(v.error||'EXPERT_SNAPSHOT_EXPIRED');
  const s=v.docs.skills.find(s=>s.id===ref.listingId&&s.release.version===ref.version);
  if(!s||s.release.status!=='published')throw Error('STORE_RELEASE_UNAVAILABLE');
  if(ref.packageDigest&&ref.packageDigest!==s.release.packageDigest||ref.artifactSha256&&ref.artifactSha256!==s.release.artifactSha256)throw Error('STORE_PACKAGE_IDENTITY');
  return s;
 }
}
module.exports={ExpertClient};
