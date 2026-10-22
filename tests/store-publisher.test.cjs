const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {publish}=require('../scripts/publish-store.cjs');
const {verifyEnvelope}=require('../core/catalog-store/catalog.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'store-publisher-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const candidate=JSON.parse(await fs.readFile(path.join(__dirname,'../store/curated.json'),'utf8')).items[0];
 await fs.cp(path.join(__dirname,'../examples/store/travel-registration'),path.join(root,'skill'),{recursive:true});
 candidate.directory='./skill';candidate.requirements.artifactSha256='malicious-override';
 const specFile=path.join(root,'spec.json');await fs.writeFile(specFile,JSON.stringify({sourceId:'curated',items:[candidate]}));
 const pair=crypto.generateKeyPairSync('ed25519'),keyFile=path.join(root,'key.pem');await fs.writeFile(keyFile,pair.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
 const opts={specFile,keyFile,output:path.join(root,'out'),reviewedBy:'Publisher unit test'},source={id:'curated',keyId:'curated-v1',publicKey:pair.publicKey.export({format:'pem',type:'spki'})};return {root,opts,source};
}
test('publisher signs bounded archives with verified identity and immutable hash; requirement fields cannot replace hash',async t=>{
 const {opts,source}=await fixture(t);const result=await publish(opts);const envelope=JSON.parse(await fs.readFile(path.join(opts.output,'catalog.json'),'utf8'));const {catalog,stale}=verifyEnvelope(envelope,source);assert.equal(stale,false);assert.equal(catalog.items[0].entityName,'travel-registration');const release=catalog.items[0].release;assert.equal(release.artifactSha256,crypto.createHash('sha256').update(await fs.readFile(path.join(opts.output,release.artifactPath))).digest('hex'));assert.equal(result.items.length,1);await publish(opts);
});
test('same version cannot publish different contents, existing signed catalog remains byte-for-byte intact',async t=>{
 const {root,opts}=await fixture(t);await publish(opts);const before=await fs.readFile(path.join(opts.output,'catalog.json'));await fs.appendFile(path.join(root,'skill','README.md'),'Changed package contents');await assert.rejects(publish(opts),/Version already published/);assert.deepEqual(await fs.readFile(path.join(opts.output,'catalog.json')),before);
});
test('rejects package symlinks and does not publish a catalog',async t=>{
 const {root,opts}=await fixture(t);await fs.symlink(opts.keyFile,path.join(root,'skill','hidden-key.pem'));await assert.rejects(publish(opts));await assert.rejects(fs.access(path.join(opts.output,'catalog.json')));
});
test('requires expiry bounds and private key permissions',async t=>{
 const {opts}=await fixture(t);await assert.rejects(publish({...opts,days:365}),/expiry-days/);if(process.platform!=='win32'){await fs.chmod(opts.keyFile,0o644);await assert.rejects(publish(opts),/owner-only/);}
});
