// Internal curated publisher. Never loads or executes code from a candidate package.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {zipSync} = require('fflate');
const {Worker} = require('node:worker_threads');
const {PackageStore} = require('../core/extensions/packages.cjs');
const {parseSkill} = require('../electron/skills.cjs');
const {validateSkillLocalization} = require('../core/localization/skill.cjs');
const {validateCatalog, hashDirectory, MAX_ARTIFACT} = require('../core/catalog-store/catalog.cjs');

async function atomic(file, value) {
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.mkdir(path.dirname(file), {recursive:true});
  try { await fs.writeFile(tmp, value, {flag:'wx'}); await fs.rename(tmp, file); }
  finally { await fs.rm(tmp, {force:true}); }
}
async function immutable(file, bytes) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  try { await fs.writeFile(file, bytes, {flag:'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; if (!(await fs.readFile(file)).equals(Buffer.from(bytes))) throw Error('Immutable release conflict: ' + path.basename(file)); }
}
async function filesForZip(root) {
  const files = Object.create(null);
  async function visit(dir, prefix='') {
    for (const name of (await fs.readdir(dir)).sort()) {
      const file=path.join(dir,name),stat=await fs.lstat(file),rel=prefix+name;
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink > 1))) throw Error('Links and special files are not publishable');
      if (stat.isDirectory()) await visit(file, rel+'/');
      else files[rel]=[new Uint8Array(await fs.readFile(file)),{mtime:new Date(2000,0,1)}];
    }
  }
  hashDirectory(root); // Bound file count and bytes before reading the archive into memory.
  await visit(root); return files;
}
async function skillRoundTrip(source, stage) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const worker=new Worker(path.join(__dirname,'../core/extensions/package-worker.cjs'),{workerData:{mode:'archive',source,stage,validator:path.join(__dirname,'../core/catalog-store/skill-validator.cjs')}});
    const timer=setTimeout(()=>{settled=true;worker.terminate();reject(Error('Skill validation timed out'));},30000);
    worker.once('message',result=>{settled=true;clearTimeout(timer);worker.terminate();if(result.error)reject(Error(result.error));else resolve(result);});
    worker.once('error',error=>{settled=true;clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{clearTimeout(timer);if(!settled)reject(Error('Skill validator exited without a result ('+code+')'));});
  });
}
async function publish({specFile, keyFile, output, reviewedBy, keyId='curated-v1', days=14, now=new Date()}) {
  if (!specFile || !keyFile || !output || typeof reviewedBy !== 'string' || !reviewedBy.trim()) throw Error('spec, key, out and reviewed-by are required');
  if (!Number.isInteger(days) || days < 1 || days > 30) throw Error('expiry-days must be 1–30');
  const key=crypto.createPrivateKey(await fs.readFile(keyFile));
  if (key.asymmetricKeyType!=='ed25519') throw Error('An Ed25519 signing key is required');
  const stat=await fs.stat(keyFile);
  if (process.platform!=='win32' && (stat.mode & 0o077)) throw Error('Signing key must be owner-only (chmod 600)');
  const spec=JSON.parse(await fs.readFile(specFile,'utf8')),base=path.dirname(path.resolve(specFile));
  output=path.resolve(output);await fs.mkdir(output,{recursive:true});
  const lock=path.join(output,'.publish.lock');await fs.mkdir(lock).catch(()=>{throw Error('Publisher already running; investigate a stale .publish.lock before retrying');});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'amble-store-publish-'));
  try {
    if (!Array.isArray(spec.items) || !spec.items.length || spec.items.length > 200) throw Error('No curated candidates');
    const store=new PackageStore(path.join(temp,'extensions')), items=[], artifacts=[];
    for (const candidate of spec.items) {
      const {directory,version,changelog,requirements={},...listing}=candidate;
      const source=await fs.realpath(path.resolve(base,directory));
      if (output===source || output.startsWith(source+path.sep)) throw Error('Output must be outside a source package');
      await fs.access(path.join(source,'LICENSE'));await fs.access(path.join(source,'README.md'));
      let digest;
      if (listing.kind==='extension') {
        const revision=await store.prepare(source,'directory');
        if (revision.id!==listing.entityName || revision.manifest.version!==version) throw Error('Extension identity or version does not match candidate');
        digest=revision.digest;
      } else if(listing.kind==='skill') {
        const fields=parseSkill(await fs.readFile(path.join(source,'SKILL.md'),'utf8'));
        if(fields.name!==listing.entityName)throw Error('Skill identity does not match candidate');
        await validateSkillLocalization(source);digest=hashDirectory(source);
      } else throw Error('Invalid package kind');
      const archive=Buffer.from(zipSync(await filesForZip(source),{level:6}));
      if(archive.length>MAX_ARTIFACT)throw Error('Artifact too large');
      const ext=listing.kind==='skill'?'zip':'amble-extension',archiveFile=path.join(temp,crypto.randomUUID()+'.'+ext);
      await fs.writeFile(archiveFile,archive);
      const checked=listing.kind==='extension'?await store.prepare(archiveFile,'archive'):await skillRoundTrip(archiveFile,path.join(temp,crypto.randomUUID()));
      if(checked.digest!==digest)throw Error('Archive round-trip digest mismatch');
      const sha=crypto.createHash('sha256').update(archive).digest('hex');
      const compatibility=Object.fromEntries(['hostRequirements','platforms','architectures'].filter(k=>requirements[k]!==undefined).map(k=>[k,requirements[k]]));
      const release={version,status:'published',artifactPath:`artifacts/sha256/${sha}.${ext}`,artifactSha256:sha,artifactSize:archive.length,packageDigest:digest,reviewedAt:now.toISOString(),reviewedBy,changelog,...compatibility};
      items.push({...listing,release});artifacts.push({release,archive,id:listing.id});
    }
    const catalog=validateCatalog({schemaVersion:1,sourceId:spec.sourceId,generatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+days*86400000).toISOString(),items});
    // Check every version before writing anything or switching the live index.
    for(const a of artifacts){const ledger=path.join(output,'releases',a.id,a.release.version+'.json');try{const old=JSON.parse(await fs.readFile(ledger,'utf8'));if(old.artifactSha256!==a.release.artifactSha256||old.packageDigest!==a.release.packageDigest)throw Error('Version already published with different content: '+a.id+'@'+a.release.version);}catch(e){if(e.code!=='ENOENT')throw e;}}
    for(const a of artifacts){await immutable(path.join(output,a.release.artifactPath),a.archive);const ledger=path.join(output,'releases',a.id,a.release.version+'.json');try{await fs.writeFile(ledger,JSON.stringify({artifactSha256:a.release.artifactSha256,packageDigest:a.release.packageDigest},null,2)+'\n',{flag:'wx'});}catch(e){if(e.code==='ENOENT'){await fs.mkdir(path.dirname(ledger),{recursive:true});await fs.writeFile(ledger,JSON.stringify({artifactSha256:a.release.artifactSha256,packageDigest:a.release.packageDigest},null,2)+'\n',{flag:'wx'});}else if(e.code!=='EEXIST')throw e;}}
    const bytes=Buffer.from(JSON.stringify(catalog));
    const envelope={keyId,payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,key).toString('base64')};
    await atomic(path.join(output,'catalog.json'),JSON.stringify(envelope)+'\n');
    return {sourceId:spec.sourceId,items:items.map(i=>({id:i.id,version:i.release.version,sha256:i.release.artifactSha256})),expiresAt:catalog.expiresAt,output};
  } finally {await fs.rm(temp,{recursive:true,force:true});await fs.rm(lock,{recursive:true,force:true});}
}
if(require.main===module){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1]){console.error('Usage: node scripts/publish-store.cjs --spec store/curated.json --key /private/key.pem --out /release/dir --reviewed-by "review identity" [--expiry-days 14]');process.exit(2);}options[args[i].slice(2)]=args[i+1];}
  publish({specFile:options.spec,keyFile:options.key,output:options.out,reviewedBy:options['reviewed-by'],keyId:options['key-id']||'curated-v1',days:Number(options['expiry-days']||14)}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={publish};
