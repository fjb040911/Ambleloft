// Opt-in public-read API integration; no publishing or model calls.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ExpertClient}=require('../core/catalog-store/expert-client.cjs');
const {verifyManifest,decodeDocument}=require('../core/catalog-store/expert-contract.cjs');
async function main(){
 const base=process.argv[2],source={...require('../core/catalog-store/sources.json')[0],baseUrl:base};let checks=0;
 const get=async(route)=>{const response=await fetch(new URL('api/v1/'+route,base));assert.equal(response.status,200,route);return {response,data:await response.json()};};
 const {data:manifestEnvelope}=await get('manifest'),{manifest}=verifyManifest(manifestEnvelope,source);checks++;
 assert.throws(()=>verifyManifest({...manifestEnvelope,payload:Buffer.from('{}').toString('base64')},source),/SIGNATURE/);checks++;
 const {data:cap}=await get('capabilities');assert.equal(cap.roleSkillDefaults,true);assert.equal(cap.roleSkillUsage,true);checks++;
 const query=`sourceId=curated&snapshotId=${manifest.snapshotId}&locale=en&limit=3`;
 let page=await get('roles?'+query),all=[...page.data.items];const first=page;
 while(page.data.nextCursor){page=await get('roles?'+query+'&cursor='+encodeURIComponent(page.data.nextCursor));all.push(...page.data.items);}
 assert.equal(all.length,10);assert.equal(new Set(all.map(r=>r.id)).size,10);checks++;
 const dataRole=all.find(r=>r.id==='amble.data');assert.equal(dataRole.defaultSkillCount,4);assert.equal(dataRole.defaultSkillsPreview.length,3);
 const {data:detail}=await get(`roles/amble.data?sourceId=curated&snapshotId=${manifest.snapshotId}&version=${dataRole.version}&locale=en`);assert.equal(detail.item.skills.filter(s=>s.defaultSelected).length,4);assert.ok(detail.item.skills.every(s=>s.recommendation.reason&&s.listing.release.packageDigest&&s.usage.when));checks++;
 const bad=await fetch(new URL('api/v1/roles?'+query.replace('locale=en','locale=zh-CN')+'&cursor='+encodeURIComponent(first.data.nextCursor),base));assert.equal(bad.status,400);assert.equal((await bad.json()).error.code,'INVALID_CURSOR');checks++;
 const same=await fetch(new URL('api/v1/roles?'+query,base),{headers:{'If-None-Match':first.response.headers.get('etag')}});assert.equal(same.status,304);
 const chinese=await fetch(new URL('api/v1/roles?'+query.replace('locale=en','locale=zh-CN'),base),{headers:{'If-None-Match':first.response.headers.get('etag')}});assert.equal(chinese.status,200);assert.equal(chinese.headers.get('content-language'),'zh-CN');assert.equal(chinese.headers.get('vary'),'Accept-Language');checks++;
 const header=await fetch(new URL('api/v1/roles',base),{headers:{'Accept-Language':'fr;q=1, en-US;q=0.8, zh;q=0.2'}});assert.equal((await header.json()).requestedLocale,'en');checks++;
 assert.equal((await fetch(new URL('api/v1/roles?locale=fr',base))).status,400);assert.equal((await fetch(new URL('api/v1/admin/publish',base))).status,404);checks++;
 const release=detail.item.skills[0].release;const {data:resolved}=await get(`releases/${release.listingId}/${release.version}?locale=en`);assert.equal(resolved.item.packageDigest,release.packageDigest);assert.deepEqual(resolved.item,detail.item.skills[0].listing.release);assert.ok(resolved.item.validation.packageVerifiedAt);assert.ok(Array.isArray(resolved.item.runtimeRequirements));checks++;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-expert-api-'));try{
  const client=new ExpertClient({directory:root,source});const roles=await client.roles(true);assert.equal(roles.items.length,10);assert.equal(roles.stale,false);checks++;
  const descriptors=manifest.documents;const bytes=Buffer.from(await (await fetch(new URL(descriptors[0].path,base))).arrayBuffer());const badBytes=Buffer.from(bytes);badBytes[badBytes.length-2]^=1;assert.throws(()=>decodeDocument(badBytes,descriptors[0]),/INTEGRITY/);checks++;
  client.fetcher=async()=>{throw Error('offline');};const offline=await client.roles(true);assert.equal(offline.items.length,10);assert.equal(offline.stale,true);checks++;
 }finally{await fs.rm(root,{recursive:true,force:true});}
 console.log(JSON.stringify({checks,source:base,snapshotId:manifest.snapshotId,roles:all.length,passed:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
