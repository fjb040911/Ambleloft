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
test('scheduled restart waits for blockers and can be revoked',async()=>{let count=0;const {service}=setup(async()=>{count++;throw Error('busy');});await service.check();await service.download();service.schedule('1.1.0');await new Promise(setImmediate);assert.equal(service.state.status,'waiting');assert.equal(count,1);service.cancelSchedule();assert.equal(service.state.status,'ready');service.close();});
test('partial shutdown failure requires recovery instead of retrying installation',async()=>{const {service}=setup(async()=>{throw Object.assign(Error('closed'),{recoveryRequired:true});});await service.check();await service.download();await service.restart('1.1.0');assert.equal(service.state.status,'recovery-required');});

test('built-in updater accepts preview releases without permitting downgrades',async()=>{const {service,updater}=setup();assert.equal(updater.allowPrerelease,true);assert.equal(updater.allowDowngrade,false);updater.checkForUpdates=async()=>({updateInfo:{version:'0.9.0'}});await service.check();assert.equal(service.state.status,'current');});

test('one click downloads and requests installation only after verification',async()=>{
 let installed=0,scheduled=false;const {service,updater}=setup(async flag=>{installed++;scheduled=flag;});
 let finish;updater.downloadUpdate=()=>new Promise(resolve=>{finish=()=>{updater.emit('update-downloaded');resolve();};});
 await service.check();const operation=service.update();await service.update();assert.equal(installed,0);assert.equal(service.state.restartAfterDownload,true);
 finish();await operation;await new Promise(setImmediate);assert.equal(installed,1);assert.equal(scheduled,true);assert.equal(service.state.restartAfterDownload,false);service.close();
});

test('one click cancellation or checksum failure never schedules installation',async()=>{
 for(const cancel of [true,false]){let installed=0;const {service,updater}=setup(async()=>installed++);updater.downloadUpdate=token=>cancel?new Promise((_,reject)=>token.onCancel(()=>reject(Error('cancel')))):Promise.reject(Error('checksum'));
 await service.check();const operation=service.update();if(cancel)service.cancel();await operation;assert.equal(installed,0);assert.equal(service.scheduleTimer,undefined);assert.equal(service.state.status,cancel?'available':'download-failed');service.close();}
});

test('automatic downloads never authorize an unattended restart',async()=>{let installed=0;const {service}=setup(async()=>installed++);service.state.autoDownload=true;await service.check();assert.equal(service.state.status,'ready');assert.equal(installed,0);assert.equal(service.scheduleTimer,undefined);});

test('one click waits for active work before installing',async t=>{
 t.mock.timers.enable({apis:['setInterval']});let busy=true,installed=0;const {service}=setup(async()=>{if(busy)throw Error('task running');installed++;});
 await service.check();await service.update();await new Promise(setImmediate);assert.equal(service.state.status,'waiting');assert.equal(installed,0);assert.equal(service.state.error,'task running');
 busy=false;t.mock.timers.tick(10000);await new Promise(setImmediate);assert.equal(installed,1);service.close();
});

test('published GitHub preview is discovered through the built-in feed and latest.yml',async()=>{
 const {GitHubProvider}=require('electron-updater/out/providers/GitHubProvider');const {service,updater}=setup();
 updater.currentVersion=require('semver').parse('1.0.0');const requests=[];
 const provider=new GitHubProvider({provider:'github',owner:'fjb040911',repo:'Ambleloft'},updater,{platform:'win32',executor:{request:async options=>{
  requests.push(options.path);
  if(options.path.endsWith('/releases.atom'))return '<feed><entry><title>Windows Preview</title><link href="https://github.com/fjb040911/Ambleloft/releases/tag/v1.1.0"/><content>Preview update</content></entry></feed>';
  if(options.path.endsWith('/v1.1.0/latest.yml'))return 'version: 1.1.0\nfiles:\n  - url: Ambleloft-1.1.0-windows-x64.exe\n    sha512: test\n    size: 100\n';
  throw Error('Unexpected stable-only endpoint: '+options.path);
 }}});
 updater.checkForUpdates=async()=>({updateInfo:await provider.getLatestVersion()});
 await service.check();assert.equal(service.state.status,'available');assert.equal(service.state.version,'1.1.0');assert.equal(requests.length,2);assert.ok(requests[1].endsWith('/v1.1.0/latest.yml'));
});

test('automatic notification checks run after startup and every fifteen minutes',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const {service,updater}=setup();let checks=0;
 updater.checkForUpdates=async()=>{checks++;return {updateInfo:{version:'1.0.0'}};};
 await service.initialize();t.mock.timers.tick(9999);assert.equal(checks,0);t.mock.timers.tick(1);await new Promise(setImmediate);assert.equal(checks,1);
 t.mock.timers.tick(15*60000-10000);await new Promise(setImmediate);assert.equal(checks,2);service.close();
});
