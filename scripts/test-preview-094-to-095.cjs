// Network integration probe: real Electron transport; isolated cache; never installs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {NsisUpdater}=require('electron-updater/out/NsisUpdater');
const {ElectronHttpExecutor:NodeHttpExecutor}=require('electron-updater/out/electronHttpExecutor');
const {UpdateService}=require('../electron/updates.cjs');
(async()=>{
 await require('electron').app.whenReady();
 if(!process.argv[2])throw Error('Pass the original v0.9.4 installer path. Run this probe with Electron.');
 const oldInstaller=path.resolve(process.argv[2]);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(oldInstaller)).digest('hex'),'e9a97bd76df1763256625f2e7af6b4e46ebc561bafa82c9c5c6b9a2e585a518e');
 fs.mkdirSync('.cache',{recursive:true});
 const root=fs.mkdtempSync(path.resolve('.cache/preview-download-'));
 const config=path.join(root,'app-update.yml');
 fs.writeFileSync(config,'provider: generic\nurl: https://github.com/fjb040911/Ambleloft/releases/download/v0.9.5/\nchannel: preview\nuseMultipleRangeRequest: false\nupdaterCacheDirName: ambleloft-updater\n');
 const cache=path.join(root,'ambleloft-updater');fs.mkdirSync(cache);
 fs.copyFileSync(oldInstaller,path.join(cache,'installer.exe'));
 let rangeBytes=0,ranges=0;
 class MeteredExecutor extends NodeHttpExecutor{createRequest(options,callback){return super.createRequest(options,res=>{if(res.statusCode===206){ranges++;res.on('end',()=>{rangeBytes+=Number(res.headers['content-length']||0);});}callback(res);});}}
 const updater=new NsisUpdater(null,{version:'0.9.4',name:'Ambleloft',isPackaged:true,appUpdateConfigPath:config,userDataPath:root,baseCachePath:root,whenReady:async()=>{}});
 updater.httpExecutor=new MeteredExecutor(()=>{});updater._testOnlyOptions={isUseDifferentialDownload:true};
 updater.logger={info:console.log,warn:console.warn,error:console.error,debug:()=>{}};
 const service=new UpdateService({updater,version:'0.9.4',directory:path.join(root,'preferences')});
 await service.check();assert.equal(service.snapshot().status,'available');assert.equal(service.snapshot().version,'0.9.5');assert.equal(updater.allowPrerelease,false);
 await service.download();assert.equal(service.snapshot().status,'ready',JSON.stringify(service.snapshot()));
 assert.ok(rangeBytes>0&&rangeBytes<233177466);assert.ok(ranges>0);
 const result={from:'0.9.4',to:'0.9.5',status:service.snapshot().status,rangeBytes,ranges,fullSize:233177466,savedPercent:100*(1-rangeBytes/233177466),sha256:crypto.createHash('sha256').update(fs.readFileSync(updater.installerPath)).digest('hex')};
 assert.equal(result.sha256,'e3b1ba7bd187490b4f2e1046f755d0656518f3cb28b921d33012737c77025e7e');
 fs.writeFileSync('.cache/preview-download-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().then(()=>require('electron').app.exit(0)).catch(error=>{console.error(error);require('electron').app.exit(1);});
