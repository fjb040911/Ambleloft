const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {UpdateService}=require('../electron/updates.cjs');
function setup(install=async()=>{}){const updater=new EventEmitter();updater.checkForUpdates=async()=>({updateInfo:{version:'1.1.0'}});updater.downloadUpdate=async()=>{updater.emit('download-progress',{percent:42});updater.emit('update-downloaded');};return {updater,service:new UpdateService({updater,version:'1.0.0',directory:'/unused',install})};}
test('disabled platforms never schedule checks or contact the updater',async()=>{
 const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-updates-disabled-'));
 const updater=new EventEmitter();let calls=0;updater.checkForUpdates=updater.downloadUpdate=async()=>{calls++;};
 const service=new UpdateService({updater,version:'1.0.0',directory,supported:false});
 try{
  await fs.writeFile(path.join(directory,'preferences.json'),JSON.stringify({autoCheck:true,autoDownload:true}));
  await service.initialize();
  assert.equal(service.startTimer,undefined);assert.equal(service.timer,undefined);
  assert.equal((await service.check()).status,'unsupported');
  assert.equal((await service.download()).status,'unsupported');
  assert.equal(calls,0);assert.equal(updater.listenerCount('update-downloaded'),0);
 }finally{service.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('checking does not download or install, and normal quit cannot install',async()=>{const {updater,service}=setup();await service.check();assert.equal(service.state.status,'available');assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);});
test('download reaches ready and installation binds the target version',async()=>{let installed=0;const {service}=setup(async()=>installed++);await service.check();await service.download();assert.equal(service.state.status,'ready');await assert.rejects(()=>service.restart('0.9.0'));assert.equal(installed,0);await service.restart('1.1.0');assert.equal(installed,1);});
test('failed preparation preserves ready state and surfaces blockers',async()=>{const {service}=setup(async()=>{throw Error('busy');});await service.check();await service.download();await service.restart('1.1.0');assert.equal(service.state.status,'ready');assert.equal(service.state.error,'busy');});
test('download failure cannot install',async()=>{const {service,updater}=setup();updater.downloadUpdate=async()=>{throw Error('checksum');};await service.check();await service.download();assert.equal(service.state.status,'download-failed');await assert.rejects(()=>service.restart('1.1.0'));});
test('concurrent checks coalesce',async()=>{const {service,updater}=setup();let resolve;let count=0;updater.checkForUpdates=()=>{count++;return new Promise(r=>resolve=r);};const first=service.check();await service.check();assert.equal(count,1);resolve({updateInfo:{version:'1.0.0'}});await first;assert.equal(service.state.status,'current');});
test('cancellation does not start another download',async()=>{const {service,updater}=setup();let count=0;updater.downloadUpdate=token=>{count++;return new Promise((_,reject)=>token.onCancel(()=>reject(Error('cancel'))));};await service.check();const pending=service.download();service.cancel();await pending;assert.equal(service.state.status,'available');assert.equal(count,1);});
test('cancellation during disk preflight never starts the network download',async()=>{
 const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-cancel-'));
 try{const {service,updater}=setup();service.directory=directory;service.downloadSize=1;let count=0;updater.downloadUpdate=async()=>count++;
 await service.check();service.downloadSize=1;const pending=service.download();service.cancel();await pending;
 assert.equal(service.state.status,'available');assert.equal(count,0);assert.equal(service.busy,false);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('scheduled restart can be revoked and does not install immediately',async()=>{let count=0;const {service}=setup(async()=>count++);await service.check();await service.download();service.schedule('1.1.0');assert.equal(service.state.status,'waiting');assert.equal(count,0);service.cancelSchedule();assert.equal(service.state.status,'ready');service.close();});
test('partial shutdown failure requires recovery instead of retrying installation',async()=>{const {service}=setup(async()=>{throw Object.assign(Error('closed'),{recoveryRequired:true});});await service.check();await service.download();await service.restart('1.1.0');assert.equal(service.state.status,'recovery-required');});
