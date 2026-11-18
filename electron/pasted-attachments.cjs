const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const MAX_BYTES=25*1024*1024;
// Native files retain their paths. Clipboard blobs need durable storage so drafts
// and resumed tasks never refer to a revoked browser URL or a cleared temp file.
async function importPastedAttachments(items,directory){
 if(!Array.isArray(items)||!items.length||items.length>50)throw Error('最多添加 50 个文件或文件夹');
 let total=0;const normalized=[];
 for(const item of items){
  if(item&&typeof item.path==='string'&&path.isAbsolute(item.path)&&item.path.length<=4096){await fs.stat(item.path);normalized.push({path:item.path,name:path.basename(item.path)});continue;}
  if(!item||!(item.bytes instanceof Uint8Array)||!item.bytes.length||(total+=item.bytes.length)>MAX_BYTES)throw Error('单次粘贴内容不能超过 25 MB');
  const name=path.basename(String(item.name||'clipboard.png')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(-180);
  if(!name||name==='.'||name==='..')throw Error('附件名称无效');
  normalized.push({name,bytes:item.bytes});
 }
 const written=[];
 try{
  const output=[];
  for(const item of normalized){
   if(item.path){output.push(item);continue;}
   const folder=path.join(directory,randomUUID());await fs.mkdir(folder,{recursive:true,mode:0o700});written.push(folder);
   const target=path.join(folder,item.name);await fs.writeFile(target,item.bytes,{flag:'wx',mode:0o600});output.push({name:item.name,path:target});
  }
  return output.filter((file,index,all)=>all.findIndex(other=>other.path===file.path)===index);
 }catch(error){await Promise.all(written.map(folder=>fs.rm(folder,{recursive:true,force:true})));throw error;}
}
module.exports={importPastedAttachments,MAX_BYTES};
