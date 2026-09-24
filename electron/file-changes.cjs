const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {structuredPatch}=require('diff');
const ignored=new Set(['.git','node_modules','dist','build','.next','.cache','coverage','.venv','venv']);
// Snapshots are bounded, ephemeral, and never follow symlinks.
async function snapshot(root,{maxFiles=10000,maxBytes=64*1024*1024}={}) {
 root=await fs.realpath(root);
 const files=new Map();let bytes=0,count=0,incomplete=false;
 async function walk(directory){
  let entries;try{const resolved=await fs.realpath(directory);if(resolved!==root&&!resolved.startsWith(root+path.sep)){incomplete=true;return;}entries=await fs.readdir(directory,{withFileTypes:true});}catch{incomplete=true;return;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(ignored.has(entry.name)||entry.isSymbolicLink())continue;
   if(++count>maxFiles){incomplete=true;return;}
   const absolute=path.join(directory,entry.name),relative=path.relative(root,absolute);
   if(entry.isDirectory()){await walk(absolute);continue;}
   if(!entry.isFile())continue;
   try{
    const stat=await fs.lstat(absolute);if(!stat.isFile())continue;
    if(stat.size>2*1024*1024||bytes+stat.size>maxBytes){files.set(relative,{signature:`${stat.size}:${stat.mtimeMs}`,limited:true});continue;}
    // O_NOFOLLOW also protects against replacement by a symlink during the scan.
    const handle=await fs.open(absolute,require('node:fs').constants.O_RDONLY|require('node:fs').constants.O_NOFOLLOW);
    let data;try{const buffer=Buffer.alloc(Math.min(2*1024*1024+1,Math.max(1,stat.size+1)));const result=await handle.read(buffer,0,buffer.length,0);data=buffer.subarray(0,result.bytesRead);if(data.length!==stat.size){incomplete=true;continue;}}finally{await handle.close();}
    bytes+=data.length;
    let text;try{if(!data.includes(0)&&! /\.(xlsx|pptx|docx|zip|pdf|png|jpe?g|gif|webp)$/i.test(relative))text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{}
    files.set(relative,{signature:`${stat.size}:${stat.mtimeMs}`,hash:createHash('sha256').update(data).digest('hex'),text});
   }catch{incomplete=true;}
  }
 }
 await walk(root);return {files,incomplete};
}
async function compare(root,before,turnKey){
 const after=await snapshot(root),files=[];let budget=2*1024*1024;
 for(const name of new Set([...before.files.keys(),...after.files.keys()])){
  const old=before.files.get(name),next=after.files.get(name);
  if(old&&next&&((old.limited||next.limited)?old.signature===next.signature:old.hash===next.hash))continue;
  // A missing entry in a partial scan does not prove creation/deletion.
  if((!old&&before.incomplete)||(!next&&after.incomplete))continue;
  const file={id:randomUUID(),path:name,status:!old?'added':!next?'deleted':'modified'};
  if(budget<=0){file.reason='差异内容较大，仅展示文件状态';}
  else if((!old||old.text!==undefined)&&(!next||next.text!==undefined)){
   const patch=structuredPatch(name,name,old?.text||'',next?.text||'','','',{context:3,maxEditLength:20000,timeout:200});
   if(patch){
    file.additions=patch.hunks.reduce((n,h)=>n+h.lines.filter(l=>l.startsWith('+')).length,0);
    file.deletions=patch.hunks.reduce((n,h)=>n+h.lines.filter(l=>l.startsWith('-')).length,0);
    const size=JSON.stringify(patch.hunks).length;
    if(size<=budget){file.hunks=patch.hunks;budget-=size;}else file.reason='差异内容较大，仅展示统计';
   }else file.reason='差异内容较大，仅展示文件状态';
  }else file.reason=old?.limited||next?.limited?'文件较大，仅展示文件状态':'此文件类型仅展示变更状态';
  files.push(file);
 }
 return {turnKey,files,notice:before.incomplete||after.incomplete?'部分文件无法读取或超出扫描上限，列表可能不完整。':undefined};
}
module.exports={snapshot,compare};
