const fs = require('node:fs/promises');
const path = require('node:path');
class UpdateService {
  constructor({updater,version,directory,publish=()=>{},install=async()=>{},supported=true}) {
    Object.assign(this,{updater,directory,publish,install});
    this.state={status:supported?'idle':'unsupported',currentVersion:version,version:null,progress:null,error:'',autoCheck:true,autoDownload:false};
    this.supported=supported;
    this.recovery=null;this.busy=false;this.installing=false;
    if(!supported)return;
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
    updater.on('download-progress',p=>this.set({status:'downloading',progress:Math.max(0,Math.min(100,p.percent))}));
    updater.on('update-downloaded',()=>{if(!this.cancelled)this.set({status:'ready',progress:100,error:''});});
    // Errors also reject the relevant promise; never leave an unhandled EventEmitter error.
    updater.on('error',()=>{if(this.state.status==='installing')this.set({status:'recovery-required',error:'Installation failed. Please restart the application and retry.'});});
  }
  snapshot(){return structuredClone(this.state);}
  set(value){Object.assign(this.state,value);this.publish(this.snapshot());}
  async initialize(){
    try{const transaction=JSON.parse(await fs.readFile(path.join(this.directory,'transaction.json'),'utf8'));if(transaction.status==='installing')this.state.error=transaction.target===this.state.currentVersion?'应用已升级；如遇异常请导出版本信息反馈。':'上次更新未完成，可重新检查并下载更新。';}catch{}
    try{const p=JSON.parse(await fs.readFile(path.join(this.directory,'preferences.json'),'utf8'));for(const k of ['autoCheck','autoDownload'])if(typeof p[k]==='boolean')this.state[k]=p[k];}catch{}
    if(this.supported){this.startTimer=setTimeout(()=>{if(this.state.autoCheck)void this.check();},60000);this.startTimer.unref();this.timer=setInterval(()=>{if(this.state.autoCheck)void this.check();},6*3600000+Math.random()*300000);this.timer.unref();}
  }
  async preferences(input){for(const k of Object.keys(input||{}))if(!['autoCheck','autoDownload'].includes(k)||typeof input[k]!=='boolean')throw Error('Invalid update preference');await fs.mkdir(this.directory,{recursive:true});const p={autoCheck:this.state.autoCheck,autoDownload:this.state.autoDownload,...input};await fs.writeFile(path.join(this.directory,'preferences.json.tmp'),JSON.stringify(p));await fs.rename(path.join(this.directory,'preferences.json.tmp'),path.join(this.directory,'preferences.json'));this.set(p);return this.snapshot();}
  async check(){
    if(!this.supported||this.busy||['ready','waiting','downloading','installing'].includes(this.state.status))return this.snapshot();
    this.busy=true;this.set({status:'checking',error:''});
    try{const result=await this.updater.checkForUpdates();const info=result?.updateInfo;this.downloadSize=Math.max(0,...(info?.files||[]).map(f=>Number(f.size)||0));const newer=info&&require('semver').gt(info.version,this.state.currentVersion);this.set({status:newer?'available':'current',version:newer?info.version:null,lastChecked:new Date().toISOString()});}
    catch{this.set({status:'check-failed',error:'无法检查更新，请检查网络后重试。'});}
    finally{this.busy=false;}
    if(this.state.status==='available'&&this.state.autoDownload)return this.download();return this.snapshot();
  }
  async download(){
    if(!this.supported||this.busy||!['available','download-failed'].includes(this.state.status))return this.snapshot();
    this.busy=true;this.cancelled=false;this.set({status:'downloading',progress:0,error:''});
    try{if(this.downloadSize){await fs.mkdir(this.directory,{recursive:true});const disk=await fs.statfs(this.directory);if(Number(disk.bavail)*Number(disk.bsize)<this.downloadSize*4)throw Error('Insufficient disk space');}this.token=new (require('builder-util-runtime').CancellationToken)();await this.updater.downloadUpdate(this.token);if(!this.cancelled)this.set({status:'ready',progress:100});}
    catch{this.set({status:this.cancelled?'available':'download-failed',progress:null,error:this.cancelled?'':'下载或校验失败，当前版本未改变，请重试。'});}
    finally{this.busy=false;this.token=null;}return this.snapshot();
  }
  cancel(){this.cancelled=true;this.token?.cancel();return this.snapshot();}
  async restart(version){
    if(this.installing||this.state.status!=='ready'||version!==this.state.version)throw Error('更新状态已改变，请重新查看');
    this.installing=true;
    try{await this.install();}catch(error){this.set({status:error.recoveryRequired?'recovery-required':'ready',error:error.message});}finally{this.installing=false;}return this.snapshot();
  }
  schedule(version){
    if(this.state.status!=='ready'||this.installing||version!==this.state.version)throw Error('Update state changed');
    this.deadline=Date.now()+600000;this.set({status:'waiting',error:''});
    this.scheduleTimer=setInterval(async()=>{
      if(this.installing||this.state.status!=='waiting')return;
      if(Date.now()>this.deadline){this.cancelSchedule();this.set({error:'任务仍未结束，本次自动重启已取消。'});return;}
      this.installing=true;
      try{await this.install(true);clearInterval(this.scheduleTimer);}
      catch(error){if(error.recoveryRequired){clearInterval(this.scheduleTimer);this.set({status:'recovery-required',error:error.message});}else this.set({status:'waiting',error:error.message});}
      finally{this.installing=false;}
    },10000);this.scheduleTimer.unref();return this.snapshot();
  }
  cancelSchedule(){if(this.installing)throw Error('正在准备安装，请稍候');clearInterval(this.scheduleTimer);if(this.state.status==='waiting')this.set({status:'ready',error:''});return this.snapshot();}
  close(){clearInterval(this.scheduleTimer);clearTimeout(this.startTimer);clearInterval(this.timer);}
}
module.exports={UpdateService};
