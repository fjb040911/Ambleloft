const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomUUID}=require('node:crypto');const {zipSync}=require('fflate');const {PackageStore}=require('../core/extensions/packages.cjs');
async function packExtension(source,output,{force=false}={}){
 source=await fs.realpath(source);output=path.resolve(output);await fs.mkdir(path.dirname(output),{recursive:true});const parent=await fs.realpath(path.dirname(output));output=path.join(parent,path.basename(output));
 const relative=path.relative(source,output);if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('Output must be outside the package directory');
 if(path.extname(output)!=='.amble-extension')throw Error('Output must use .amble-extension');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'amble-pack-'));const store=new PackageStore(temp);let partial;
 try{const revision=await store.prepare(source,'directory'),root=path.join(store.root,revision.relativePath),files=Object.create(null);
  async function collect(directory,prefix=''){for(const name of (await fs.readdir(directory)).sort()){const target=path.join(directory,name),stat=await fs.lstat(target);if(stat.isDirectory())await collect(target,prefix+name+'/');else files[prefix+name]=[new Uint8Array(await fs.readFile(target)),{mtime:new Date(2000,0,1)}];}}
  await collect(root);const archive=zipSync(files,{level:6});if(archive.length>100*1024*1024)throw Error('Archive exceeds 100 MiB');
  const checkFile=path.join(temp,'check.amble-extension');await fs.writeFile(checkFile,archive);const checked=await store.prepare(checkFile,'archive');if(checked.digest!==revision.digest)throw Error('Archive round-trip digest mismatch');
  partial=path.join(parent,'.'+path.basename(output)+'.'+randomUUID()+'.tmp');await fs.writeFile(partial,archive,{flag:'wx'});
  if(force){try{if(!(await fs.lstat(output)).isFile())throw Error('Output exists and is not a regular file');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.rename(partial,output);}else{await fs.link(partial,output);await fs.unlink(partial);}partial=null;
  return {extensionId:revision.id,version:revision.manifest.version,digest:revision.digest,bytes:archive.length,output};
 }finally{if(partial)await fs.rm(partial,{force:true});await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module){const args=process.argv.slice(2),force=args.includes('--force'),paths=args.filter(a=>a!=='--force');if(paths.length!==2){console.error('Usage: npm run extensions:pack -- <staged-directory> <output.amble-extension> [--force]');process.exitCode=2;}else packExtension(paths[0],paths[1],{force}).then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={packExtension};
