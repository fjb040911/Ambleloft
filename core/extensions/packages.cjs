const {Worker}=require('node:worker_threads');const fs=require('node:fs/promises');const path=require('node:path');const {randomUUID}=require('node:crypto');
async function compare(a,b){
 const stat=await fs.lstat(b);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Package integrity changed');
 const left=(await fs.readdir(a)).sort(),right=(await fs.readdir(b)).sort();if(JSON.stringify(left)!==JSON.stringify(right))throw Error('Package integrity changed');
 for(const name of left){const x=path.join(a,name),y=path.join(b,name),xs=await fs.lstat(x),ys=await fs.lstat(y);if(ys.isSymbolicLink())throw Error('Package integrity changed');if(xs.isDirectory())await compare(x,y);else if(!ys.isFile()||ys.nlink>1||xs.size!==ys.size||!(await fs.readFile(x)).equals(await fs.readFile(y)))throw Error('Package integrity changed');}
}
function runWorker(workerData){return new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(__dirname,'package-worker.cjs'),{workerData,resourceLimits:{maxOldGenerationSizeMb:512}});let settled=false;
 const finish=async(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);await worker.terminate().catch(()=>{});error?reject(error):resolve(value);};
 const timer=setTimeout(()=>void finish(Error('Package validation timed out')),30000);
 worker.once('message',value=>void finish(value.error?Error(value.error):null,value));worker.once('error',error=>void finish(error));worker.once('exit',()=>void finish(Error('Package worker exited without a result')));
});}
class PackageStore{
 constructor(directory,validator){this.root=path.join(directory,'extension-packages');this.validator=validator||path.join(__dirname,'manifest.cjs');}
 async validateValue(valueSchema,value){return (await runWorker({validator:this.validator,valueSchema,value})).valid;}
 async initialize(){await fs.rm(path.join(this.root,'staging'),{recursive:true,force:true});}
 async prepare(source,mode='archive'){
  const stage=path.join(this.root,'staging',randomUUID());await fs.mkdir(stage,{recursive:true});
  try{
   const result=await runWorker({source,mode,stage,validator:this.validator});
   const target=path.join(this.root,'revisions',result.id,result.digest);await fs.mkdir(path.dirname(target),{recursive:true});
   try{await fs.rename(stage,target);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;await compare(stage,target);await fs.rm(stage,{recursive:true,force:true});}
   return {...result,relativePath:path.relative(this.root,target),sourceMode:mode};
  }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
 }
}
module.exports={PackageStore};
