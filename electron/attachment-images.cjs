const fs=require('node:fs/promises');
const path=require('node:path');
const MAX_IMAGE_BYTES=25*1024*1024;
function imageMime(data){
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
 if(/^GIF8[79]a$/.test(data.toString('ascii',0,6)))return 'image/gif';
 if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(data.toString('ascii',4,8)==='ftyp'&&['avif','avis'].includes(data.toString('ascii',8,12)))return 'image/avif';
 if(data.toString('ascii',0,2)==='BM')return 'image/bmp';
 if(data.subarray(0,4).equals(Buffer.from([0,0,1,0])))return 'image/x-icon';
 return null;
}
async function readAttachmentImage(input,nativeImage){
 if(!input||typeof input.path!=='string'||!path.isAbsolute(input.path)||input.path.length>4096)throw Error('附件路径无效');
 const stat=await fs.stat(input.path).catch(error=>{if(['ENOENT','EACCES','EPERM'].includes(error.code))throw Error('图片文件不可访问，可能已移动或删除');throw error;});
 if(!stat.isFile())throw Error('无法预览此图片');
 if(stat.size>MAX_IMAGE_BYTES)throw Error('图片超过 25 MB，无法预览');
 const data=await fs.readFile(input.path);
 if(data.length>MAX_IMAGE_BYTES)throw Error('图片超过 25 MB，无法预览');
 const mime=imageMime(data);if(!mime)throw Error('无法预览此图片');
 if(input.thumbnail){
  let image;
  // The OS thumbnailer avoids decoding a full-resolution screenshot on the UI thread.
  if(process.platform!=='linux')try{image=await nativeImage.createThumbnailFromPath(input.path,{width:192,height:192});}catch{}
  if(!image||image.isEmpty())image=nativeImage.createFromBuffer(data);
  if(!image.isEmpty()){
   const {width,height}=image.getSize();
   if(Math.max(width,height)>192)image=image.resize(width>=height?{width:192}:{height:192});
   return {dataUrl:image.toDataURL()};
  }
  throw Error('无法预览此图片');
 }
 // Raster-only data URLs; never expose file:// access or execute SVG/HTML attachments.
 return {dataUrl:`data:${mime};base64,${data.toString('base64')}`};
}
module.exports={readAttachmentImage,imageMime,MAX_IMAGE_BYTES};
