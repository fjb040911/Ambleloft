const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const exec=require('node:util').promisify(require('node:child_process').execFile);
// File paths are arguments, never interpolated into executable JXA source.
const macIconSource=`function iconData(file) {try {
 const source=$.NSWorkspace.sharedWorkspace.iconForFile(file);
 const bitmap=$.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null,32,32,8,4,true,false,$.NSDeviceRGBColorSpace,0,0);
 $.NSGraphicsContext.saveGraphicsState;
 try {$.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmap));source.drawInRectFromRectOperationFraction($.NSMakeRect(0,0,32,32),$.NSZeroRect,$.NSCompositingOperationSourceOver,1);}finally{$.NSGraphicsContext.restoreGraphicsState;}
 return 'data:image/png;base64,'+ObjC.unwrap(bitmap.representationUsingTypeProperties($.NSPNGFileType,$.NSDictionary.dictionary).base64EncodedStringWithOptions(0));
}catch{return null;}}`;
const script=`ObjC.import('AppKit'); ${macIconSource} function run(argv) {
 const ws=$.NSWorkspace.sharedWorkspace, url=$.NSURL.fileURLWithPath(argv[0]);
 const preferred=ws.URLForApplicationToOpenURL(url);
 const urls=ws.URLsForApplicationsToOpenURL(url);
 const result=[];for(let i=0;i<urls.count;i++){const item=urls.objectAtIndex(i);result.push({path:ObjC.unwrap(item.path),icon:iconData(item.path),name:ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(item.path)).replace(/\\.app$/i,'')});}
 return JSON.stringify({defaultPath:preferred.isNil()?null:ObjC.unwrap(preferred.path),apps:result});
}`;
// The renderer receives the same metadata on every platform. Native identifiers
// stay opaque; only this service interprets them or starts applications.
const textTypes=new Set('txt md markdown mdx log csv tsv json jsonc yaml yml toml ini conf cfg xml css scss less js jsx mjs cjs ts tsx py rb go rs java kt c h cpp hpp cs swift sql graphql vue svelte sh bash zsh env gitignore'.split(' '));
function commonApplications(file,paths){
 const ext=paths.extname(file).slice(1).toLowerCase();
 if(['html','htm'].includes(ext))return /chrome|safari|edge|firefox|brave|opera|arc|千问|qianwen/i;
 if(['md','markdown','mdx'].includes(ext))return /typora|obsidian|marktext|code|cursor|sublime|zed|文本编辑|notepad/i;
 if(textTypes.has(ext))return /code|cursor|windsurf|sublime|zed|notepad|文本编辑/i;
 if(['png','jpg','jpeg','gif','webp','svg','bmp','ico','avif'].includes(ext))return /preview|预览|photos|照片|paint|photoshop|gimp|affinity/i;
 if(ext==='pdf')return /preview|预览|acrobat|foxit|pdf|edge|chrome|wps/i;
 if(['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp'].includes(ext))return /word|excel|powerpoint|office|wps|pages|numbers|keynote/i;
 return null;
}
function createFileApplications({platform=process.platform,execute=exec,getIcon=async()=>undefined,stat=fs.stat,spawn=require('node:child_process').spawn}={}) {
 const cache=new Map(),icons=new Map();
 const paths=platform==='win32'?path.win32:path;
 const identity=id=>platform==='win32'?id.toLowerCase():id;
 async function icon(id){
  if(!icons.has(id)){
   const load=async()=>{
    if(platform==='darwin')try{const value=(await execute('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('AppKit'); ${macIconSource} function run(argv){return iconData(argv[0])||'';}`,id],{timeout:5000,maxBuffer:256*1024})).stdout.trim();if(value.startsWith('data:image/'))return value;}catch{}
    try{return await getIcon(id);}catch{return undefined;}
   };
   icons.set(id,load());if(icons.size>100)icons.delete(icons.keys().next().value);
  }
  return icons.get(id);
 }
 async function windows(action,file,id='') {
  const source=await fs.readFile(path.join(__dirname,'windows-file-applications.ps1'),'utf8');
  return execute(paths.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{
   windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,env:{...process.env,ATELIER_FILE_APP_ACTION:action,ATELIER_FILE_APP_PATH:file,ATELIER_FILE_APP_ID:id}
  });
 }
 async function validApplication(id){
  if(typeof id!=='string'||!paths.isAbsolute(id))return false;
  try{const info=await stat(id);return platform==='darwin'?id.endsWith('.app')&&info.isDirectory():platform==='win32'&&/\.exe$/i.test(id)&&info.isFile();}catch{return false;}
 }
 async function discover(file){
  let apps=[];
  if(platform==='darwin'){
   let result={apps:[]};
   try{result=JSON.parse((await execute('/usr/bin/osascript',['-l','JavaScript','-e',script,file],{timeout:5000,maxBuffer:256*1024})).stdout);}catch{/* System default remains usable when discovery is unavailable. */}
   apps=(result.apps||[]).filter(a=>typeof a.path==='string'&&path.isAbsolute(a.path)&&a.path.endsWith('.app')).map(a=>({id:a.path,name:a.name||path.basename(a.path,'.app'),icon:a.icon,isDefault:a.path===result.defaultPath}));
   if(result.defaultPath&&!apps.some(a=>a.id===result.defaultPath))apps.unshift({id:result.defaultPath,name:path.basename(result.defaultPath,'.app'),isDefault:true});
   // Editors are useful for source/text only, never injected into images or Office files.
   if(textTypes.has(path.extname(file).slice(1).toLowerCase()))for(const name of ['Visual Studio Code','Cursor','Windsurf','Zed'])for(const dir of ['/Applications',path.join(os.homedir(),'Applications')]){
    const id=path.join(dir,name+'.app');if(await validApplication(id)){if(!apps.some(a=>a.id===id))apps.push({id,name});break;}
   }
  }else if(platform==='win32'){
   try{const value=JSON.parse((await windows('list',file)).stdout.replace(/^\uFEFF/,''));apps=(Array.isArray(value)?value:[value]).filter(a=>a&&typeof a.id==='string'&&a.id.startsWith('windows:')&&typeof a.name==='string');}catch{/* PowerShell may be disabled by system policy; keep default opening available. */}
  }
  const unique=[...new Map(apps.map(a=>[identity(a.id),a])).values()];
  const defaultApp=unique.find(a=>a.isDefault);
  const common=commonApplications(file,paths);
  const remaining=unique.filter(a=>a!==defaultApp).sort((a,b)=>Number(!!common?.test(b.name))-Number(!!common?.test(a.name)));
  const choices=[...(defaultApp?[defaultApp]:[]),...remaining].slice(0,30);
  const decorated=await Promise.all(choices.map(async a=>({...a,recommended:a===defaultApp||!common||common.test(a.name),icon:a.icon||await icon(a.id.startsWith('windows:')?a.id.slice(8):a.id)})));
  const preferred=decorated.find(a=>a.isDefault);
  return [{id:'default',name:preferred?.name||'系统默认应用',icon:preferred?.icon,isDefault:true,applicationId:preferred?.id},...decorated.filter(a=>a!==preferred)];
 }
 async function list(file){const saved=cache.get(file);if(saved&&Date.now()-saved.time<60000)return saved.value;const value=discover(file);cache.set(file,{time:Date.now(),value});if(cache.size>100)cache.delete(cache.keys().next().value);return value;}
 async function describe(id){return {id,name:paths.basename(id).replace(/\.(app|exe)$/i,''),icon:await icon(id)};}
 return {
  list,describe,validApplication,
  async choose(dialog,window){
   if(!['darwin','win32'].includes(platform))throw new Error('当前平台请使用系统默认应用');
   const selected=await dialog.showOpenDialog(window,{title:'选择打开此文件的应用',...(platform==='darwin'?{defaultPath:'/Applications'}:{}),properties:['openFile'],filters:[{name:'应用',extensions:[platform==='darwin'?'app':'exe']}]});
   if(selected.canceled)return null;const id=selected.filePaths[0];if(!await validApplication(id))throw new Error('请选择应用程序');return id;
  },
  async open(file,id){
   if(platform==='win32'&&id.startsWith('windows:')){await windows('open',file,id);const selected=(await list(file)).find(a=>a.id===id||a.applicationId===id);return selected?{...selected,id}:describe(id);}
   if(!await validApplication(id))throw new Error('应用已不可用，请重新选择打开方式');
   if(platform==='darwin')await execute('/usr/bin/open',['-a',id,file]);
   else await new Promise((resolve,reject)=>{const child=spawn(id,[file],{shell:false,detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
   return describe(id);
  }
 };
}
module.exports={createFileApplications,script};
