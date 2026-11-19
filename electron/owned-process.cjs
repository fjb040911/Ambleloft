const {execFile}=require('node:child_process');
const path=require('node:path');
const stops=new WeakMap();
const jobs=new WeakMap();
function spawnOwnedProcess(spawn,executable,args,options){
 if(process.platform!=='win32')return spawn(executable,args,options);
 const app=process.versions.electron&&require('electron').app;
 const host=app?.isPackaged?path.join(process.resourcesPath,'tools/windows-process-host.exe'):path.join(__dirname,'../build/windows-process-host.exe');
 if(!require('node:fs').existsSync(host))throw Error('Windows engine process host missing; run node scripts/prepare-windows-process.cjs');
 const token=require('node:crypto').randomUUID();const child=spawn(host,[String(process.pid),token,executable,...args],{...options,windowsHide:true});if(Number.isSafeInteger(child.pid)&&child.pid>0)jobs.set(child,{host,token});return child;
}
// Windows does not propagate termination to descendants. Keep the owned root
// alive until taskkill has enumerated its tree; killing the root first or waiting
// for inherited pipe EOF leaves background Git processes holding the cwd open.
function stopOwnedProcess(child,{platform=process.platform,execute=execFile}={}){
 if(stops.has(child))return stops.get(child);
 const stopped=child.exitCode!==null&&child.exitCode!==undefined||child.signalCode!==null&&child.signalCode!==undefined;
 if(stopped)return Promise.resolve();
 if(jobs.has(child)){const {host,token}=jobs.get(child);const operation=new Promise((resolve,reject)=>execute(host,['--stop',token],{windowsHide:true,timeout:10000},error=>{if(error&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');reject(Object.assign(Error('Windows job cleanup failed'),{code:'ENGINE_TREE_CLEANUP_FAILED'}));}else resolve();}));stops.set(child,operation);return operation;}
 if(platform!=='win32'||!Number.isSafeInteger(child.pid)||child.pid<=0){child.kill('SIGTERM');return Promise.resolve();}
 const operation=new Promise((resolve,reject)=>{
  execute(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000},error=>{
   if(!error)return resolve();
   // Never hide an unsuccessful tree cleanup, even if the root exits meanwhile.
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
   reject(Object.assign(Error('Windows engine process-tree cleanup failed'),{code:'ENGINE_TREE_CLEANUP_FAILED',cause:error}));
  });
 });
 stops.set(child,operation);return operation;
}
module.exports={stopOwnedProcess,spawnOwnedProcess};
