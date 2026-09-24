const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createHash,randomUUID}=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const LIMIT=32*1024*1024;
const version=stat=>`${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
async function converter(){
 const candidates=[process.env.AMBLELOFT_SOFFICE,'/Applications/LibreOffice.app/Contents/MacOS/soffice',path.join(os.homedir(),'Applications/LibreOffice.app/Contents/MacOS/soffice'),...(process.env.PATH||'').split(path.delimiter).map(p=>path.join(p,process.platform==='win32'?'soffice.exe':'soffice')),process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'LibreOffice/program/soffice.exe')].filter(Boolean);
 for(const candidate of candidates)try{await fs.access(candidate,require('node:fs').constants.X_OK);return candidate;}catch{}
 throw new Error('需要安装 LibreOffice 才能预览 PPT。安装后点击刷新，或使用外部应用打开。');
}
function parse(file,kind){return new Promise((resolve,reject)=>{
 const workerPath=__dirname.includes('app.asar')?path.join(process.resourcesPath,'tools/office-worker.cjs'):path.join(__dirname,'office-worker.cjs');
 const worker=new Worker(workerPath,{workerData:{file,kind},resourceLimits:{maxOldGenerationSizeMb:256}});
 const timer=setTimeout(()=>{void worker.terminate();reject(new Error('文档解析超时，请使用外部应用打开。'));},20000);
 worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.error?reject(new Error(message.error)):resolve(message.value);});
 worker.once('error',error=>{clearTimeout(timer);reject(error);});
 worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error('文档解析失败，请使用外部应用打开。'));});
});}
function createOfficePreview({directory,convert,parseFile=parse}={}){
 const cache=directory||path.join(os.tmpdir(),'ambleloft-office-preview');
 let queue=Promise.resolve();const pending=new Map(),grants=new Map();
 async function convertPdf(input,output,profile){
  const executable=await converter();
  await fs.mkdir(path.join(profile,'user'),{recursive:true});
  await fs.writeFile(path.join(profile,'user/registrymodifications.xcu'),'<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
  await exec(executable,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--norestore','--convert-to','pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}','--outdir',output,input],{timeout:90000,maxBuffer:1024*1024,windowsHide:true});
 }
 async function prune(){
  const entries=await fs.readdir(cache,{withFileTypes:true});const values=[];
  for(const entry of entries)if(entry.isDirectory()&&!entry.name.startsWith('.')){const full=path.join(cache,entry.name);values.push({full,time:(await fs.stat(full)).mtimeMs});}
  for(const item of values.sort((a,b)=>b.time-a.time).slice(12))await fs.rm(item.full,{recursive:true,force:true});
 }
 async function build(full,expected){
  const stat=await fs.stat(full);if(!stat.isFile()||stat.size>LIMIT)throw new Error('Office 文件超过 32 MiB，请使用外部应用打开。');
  if(expected&&version(stat)!==expected)throw new Error('文件正在变化，等待下一次更新。');
  const ext=path.extname(full).toLowerCase();if(!['.xlsx','.xls','.pptx','.ppt'].includes(ext))throw new Error('不支持此 Office 格式');
  const handle=await fs.open(full,'r');let data;
  try{const buffer=Buffer.alloc(stat.size+1);const read=await handle.read(buffer,0,buffer.length,0);if(read.bytesRead!==stat.size)throw new Error('文件正在变化，等待下一次更新。');data=buffer.subarray(0,read.bytesRead);}finally{await handle.close();}
  if(version(await fs.stat(full))!==version(stat))throw new Error('文件正在变化，等待下一次更新。');
  const id=createHash('sha256').update('office-v1'+ext).update(data).digest('hex'),target=path.join(cache,id);
  await fs.mkdir(cache,{recursive:true,mode:0o700});
  let result;
  try{result=JSON.parse(await fs.readFile(path.join(target,'preview.json'),'utf8'));if(result.kind==='presentation')await fs.access(path.join(target,'source.pdf'));await fs.utimes(target,new Date(),new Date());}catch{
   const work=await fs.mkdtemp(path.join(cache,'.convert-'));
   try{
    const input=path.join(work,'source'+ext);await fs.writeFile(input,data,{mode:0o600});
    if(ext==='.xlsx'||ext==='.xls')result=await parseFile(input,'spreadsheet');
    else{
     result=ext==='.pptx'?await parseFile(input,'presentation'):{kind:'presentation',slides:[],legacy:true};
     await (convert||convertPdf)(input,work,path.join(work,'profile'));
     const pdf=await fs.readFile(path.join(work,'source.pdf'));
     if(pdf.length>LIMIT||pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('PPT 转换未生成有效 PDF，请使用外部应用打开。');
    }
    // Retain only preview output; the source copy and temporary Office profile are deleted.
    await fs.rm(input,{force:true});await fs.rm(path.join(work,'profile'),{recursive:true,force:true});
    await fs.writeFile(path.join(work,'preview.json'),JSON.stringify(result),{mode:0o600});
    await fs.rm(target,{recursive:true,force:true});await fs.rename(work,target);
   }catch(error){await fs.rm(work,{recursive:true,force:true});throw error;}
  }
  if(version(await fs.stat(full))!==version(stat))throw new Error('文件正在变化，等待下一次更新。');
  grants.set(full,id);if(grants.size>128)grants.delete(grants.keys().next().value);
  void prune().catch(()=>{});
  return {...result,version:version(stat),asset:id};
 }
 function preview(full,expected){
  const key=full+'\0'+(expected||'');if(pending.has(key))return pending.get(key);
  const job=queue.then(()=>build(full,expected));queue=job.catch(()=>{});pending.set(key,job);
  void job.finally(()=>pending.delete(key)).catch(()=>{});return job;
 }
 async function resource(full,id){if(!/^[a-f0-9]{64}$/.test(id)||grants.get(full)!==id)throw new Error('预览已失效');return fs.readFile(path.join(cache,id,'source.pdf'));}
 return {preview,resource};
}
module.exports={createOfficePreview,converter};
