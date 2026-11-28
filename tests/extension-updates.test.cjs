const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {ExtensionUpdates,newer}=require('../core/catalog-store/extension-updates.cjs');

function fixture(amount) {
 const keys=crypto.generateKeyPairSync('ed25519'),now=Date.now(),digest='a'.repeat(64);
 const source={id:'curated',baseUrl:'https://test.invalid/',keyId:'key',publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
 const ext=id=>({id,kind:'package',sourceMode:'archive',trusted:true,enabled:true,active:digest,manifest:{version:'1.0.0'},revisions:[]});
 const installed=Array.from({length:amount},(_,i)=>ext('test.'+i)),requests=[],settings=new Map(),notices=[];
 const store={source,now:()=>now,hostVersion:'1.0.0',extensions:{items:[...installed,ext('private.test'),{...ext('test.dev'),sourceMode:'directory'}]},
  readCache:async()=>null,mappings:async()=>installed.map(e=>({entityId:e.id,sourceId:'curated',kind:'extension',installedRevision:e.active})),
  database:{call:async(method,args)=>{if(method==='readSetting')return settings.get(args.key);if(method==='writeSetting')settings.set(args.key,args.value);if(method==='storeUpdateNotification')notices.push(args);}}};
 const response={transform:rows=>rows};
 const updates=new ExtensionUpdates(store,async(url,limit,options)=>{
  const {ids}=JSON.parse(options.body);assert.deepEqual(Object.keys(JSON.parse(options.body)),['ids']);requests.push(ids);
  const rows=ids.map(id=>{
   const data={schemaVersion:1,kind:'extension-update',sourceId:source.id,id,entityName:id,generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),title:{zh:id,en:id},release:{version:'1.0.0',status:'published',artifactSha256:digest,packageDigest:digest},upgradeFromDigests:[]};
   const bytes=Buffer.from(JSON.stringify(data));
   return {id,record:{keyId:source.keyId,payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,keys.privateKey).toString('base64')}};
  });
  return JSON.stringify({items:response.transform(rows)});
 });
 return {updates,requests,response,notices};
}
test('queries only attributable installed archives, caps batches, throttles automatic checks and ignores unrelated packages',async()=>{
 const {updates,requests}=fixture(51);
 const scan=await updates.check();assert.equal(scan.checked,51);assert.equal(scan.failed,0);
 assert.deepEqual(requests.map(r=>r.length),[50,1]);
 assert.equal(requests.flat().some(s=>s==='private.test'||s==='test.dev'),false);
 await updates.check({automatic:true});assert.equal(requests.length,2);
 await updates.check({entityId:'not.installed'});assert.equal(requests.length,2);
});
test('missing, extra, duplicate, malformed and tampered results fail the batch without settling prior notifications',async()=>{
 const {updates,response,notices}=fixture(2);
 for (const transform of [r=>r.slice(1),r=>r.concat({id:'extra',status:'unknown'}),r=>[r[0],r[0]],r=>[null,r[1]],r=>[r[0],{...r[1],record:{...r[1].record,payload:'e30='}}]]){
  response.transform=transform;const result=await updates.check();assert.equal(result.failed,2);assert.equal(notices.length,0);
 }
 response.transform=r=>r;assert.equal((await updates.check()).failed,0);
});
test('one failed batch retains results for the other, unknown response cannot retract a reminder',async()=>{
 const {updates,response,notices}=fixture(51);
 response.transform=r=>r.length===1?[]:r;const result=await updates.check();assert.equal(result.failed,1);assert.equal(Object.keys(result.outcomes).length,50);
 notices.length=0;response.transform=rows=>rows.map(({id})=>({id,status:'unknown'}));
 assert.equal((await updates.check()).outcomes['test.0'],'unknown');assert.equal(notices.length,0);
});
test('disabled automatic check, zero candidates, and numeric stable version ordering',async()=>{
 const {updates,requests}=fixture(0);
 await updates.check();assert.deepEqual(requests,[]);
 await updates.setting('auto',false);await updates.check({automatic:true});assert.deepEqual(requests,[]);
 assert(newer('0.2.10','0.2.5'));assert(!newer('0.2.5','0.2.10'));assert(!newer('0.3.0-beta','0.2.5'));
});
test('same-version conflicts, platform limits, revoked versions and unapproved upgrade paths cannot update',()=>{
 const {classify}=require('../core/catalog-store/extension-updates.cjs');
 const extension={active:'old',manifest:{version:'0.2.2'},revisions:[]};
 const release={version:'0.2.5',status:'published',packageDigest:'new'};
 const result=(changes,from=['old'])=>classify(extension,{release:{...release,...changes},upgradeFromDigests:from},{hostVersion:'1.0.0'});
 assert.equal(result({status:'revoked'}),'revoked');
 assert.equal(result({status:'yanked'}),'yanked');
 assert.equal(result({version:'0.2.2'}),'integrity');
 assert.equal(result({version:'0.2.1'}),'not-newer');
 assert.equal(result({},[]),'unmanaged');
 assert.equal(result({platforms:[]}),'STORE_PLATFORM_UNSUPPORTED');
 assert.equal(result({hostRequirements:{minVersion:'2.0.0'}}),'STORE_HOST_VERSION_UNSUPPORTED');
 assert.equal(result({}),'modified');
});
