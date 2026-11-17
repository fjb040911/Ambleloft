// Synthetic cold-process comparison (OS file cache may be warm).
// Usage: node scripts/benchmark-runtime-text-cache.cjs
const {Database}=require('../electron/database.cjs');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
async function measure(mode,directory){
 const db=new Database(directory),opened=performance.now();
 try{
  await db.call('ready');const readyMs=performance.now()-opened;
  if(mode==='seed'){
   const runs=Array.from({length:40},(_,i)=>({id:'r'+i,status:'completed',messages:[{id:'u',role:'user',text:'Task '+i,timing:{outcome:'completed'}},{id:'a',role:'assistant',status:'completed',text:('Final result '+i+' 中文😀 ').repeat(1500)}],tools:Array.from({length:25},(_,j)=>({id:'t'+j,turnKey:'u',type:'commandExecution',status:'completed',detail:('Line '+i+'/'+j+' 中文😀 ').repeat(5000)})),approvals:[],questions:[]}));
   for(const run of runs)await db.call('saveRunUpdates',[run]);return {mode,runs:runs.length,tools:1000,serializedChars:JSON.stringify(runs).length};
  }
  global.gc();const before=process.memoryUsage(),start=performance.now();
  const runs=await db.call(mode==='compact'?'readRuntimeRuns':'readRuns');global.gc();const after=process.memoryUsage();
  return {mode,readyMs,loadMs:performance.now()-start,heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss,runs:runs.length,cache:db.textCache?.stats()};
 }finally{await db.close();}
}
async function main(){
 const [mode,directory]=process.argv.slice(2);
 if(mode){console.log(JSON.stringify(await measure(mode,directory)));return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-runtime-benchmark-'));
 try{
  const results=[];
  for(const name of ['seed','full','compact']){
   const child=spawnSync(process.execPath,['--expose-gc',__filename,name,root],{encoding:'utf8',maxBuffer:1024*1024});
   if(child.status!==0)throw Error(child.stderr||child.error?.message||'Benchmark failed');
   results.push(JSON.parse(child.stdout.trim()));
  }
  console.log(JSON.stringify({platform:process.platform,node:process.version,results},null,2));
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
