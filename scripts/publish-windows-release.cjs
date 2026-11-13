// Build first, push the version tag, then publish all updater assets atomically.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const YAML=require('yaml');
function validate(directory){
 const metadata=YAML.parse(fs.readFileSync(path.join(directory,'latest.yml'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(metadata.version||''))throw Error('Windows releases require a numeric X.Y.Z version');
 const installer=`Ambleloft-${metadata.version}-windows-x64.exe`;
 if(metadata.files?.length!==1||metadata.files[0].url!==installer||metadata.path!==installer)throw Error('Incorrect Windows updater target');
 const bytes=fs.readFileSync(path.join(directory,installer)),digest=crypto.createHash('sha512').update(bytes).digest('base64');
 if(metadata.files[0].size!==bytes.length||metadata.files[0].sha512!==digest||metadata.sha512!==digest)throw Error('Installer metadata mismatch');
 const blockmap=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(directory,installer+'.blockmap'))));
 const file=blockmap.files?.[0];
 if(blockmap.files?.length!==1||!Array.isArray(file?.sizes)||file.sizes.length!==file.checksums?.length||file.sizes.some(n=>!Number.isSafeInteger(n)||n<=0)||file.offset+file.sizes.reduce((a,b)=>a+b,0)!==bytes.length)throw Error('Installer blockmap mismatch');
 const names=[installer,installer+'.blockmap','latest.yml'];
 const zip=installer.replace(/\.exe$/,'.zip');if(fs.existsSync(path.join(directory,zip)))names.push(zip);
 return {version:metadata.version,names};
}
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function publish(directory,notes){
 const {version,names}=validate(directory),repo='fjb040911/Ambleloft',tag='v'+version;
 if(require('../package.json').version!==version)throw Error('Package version does not match artifacts');
 function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout||command+' failed');return r.stdout.trim();}
 if(run('git',['rev-parse',tag+'^{commit}'])!==run('git',['rev-parse','HEAD']))throw Error('Release tag must identify this checkout');
 if(run('git',['diff','HEAD','--name-only']))throw Error('Commit tracked changes before publishing');
 fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),names.map(n=>digest(path.join(directory,n))+'  '+n).join('\n')+'\n');names.push('SHA256SUMS.txt');
 const defaultNotes=`Windows x64. Automatic update notifications include preview and regular releases. Click Update now to download and restart when idle. Unsigned preview installer.\nSource: ${run('git',['rev-parse','--short=12','HEAD'])}\n`;
 const noteArgs=notes?['--notes-file',path.resolve(notes)]:['--notes',defaultNotes];
 // Creation fails if this version already exists: never replace published binaries.
 run('gh',['release','create',tag,'--repo',repo,'--verify-tag','--draft','--prerelease','--title',`Ambleloft ${tag} Windows x64 Preview`,...noteArgs]);
 run('gh',['release','upload',tag,...names.map(n=>path.join(directory,n)),'--repo',repo]);
 const remote=JSON.parse(run('gh',['release','view',tag,'--repo',repo,'--json','assets,isDraft']));
 if(!remote.isDraft||remote.assets.length!==names.length)throw Error('Unexpected release contents; left as draft');
 for(const name of names){const asset=remote.assets.find(a=>a.name===name),file=path.join(directory,name);if(!asset||asset.state!=='uploaded'||asset.size!==fs.statSync(file).size||asset.digest!=='sha256:'+digest(file))throw Error('Remote verification failed: '+name+'; left as draft');}
 run('gh',['release','edit',tag,'--repo',repo,'--draft=false','--prerelease','--latest=false']);
 console.log(run('gh',['release','view',tag,'--repo',repo,'--json','url,isDraft,isPrerelease,publishedAt']));
}
if(require.main===module){try{publish(path.resolve(process.argv[2]||'release'),process.argv[3]);}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validate};
