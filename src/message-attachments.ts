export type ChatAttachment={name:string;path:string};
export const isImageAttachment=(file:ChatAttachment)=>/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(file.path);

// Older messages stored attachment paths as a final, host-generated text block.
// Only recognize a complete block of absolute paths, never inline prose or URLs.
export function messageAttachments(text:string,files?:ChatAttachment[]){
 const marker='\n\n附件：\n',index=text.lastIndexOf(marker);
 const lines=index<0?[]:text.slice(index+marker.length).split('\n');
 const legacy=lines.length>0&&lines.length<=50&&lines.every(line=>/^(\/|[a-zA-Z]:[\\/])/.test(line)&&line.length<=4096);
 const attachments=files?.length?files:legacy?lines.map(path=>({path,name:path.split(/[\\/]/).pop()||path})):[];
 const matches=legacy&&lines.length===attachments.length&&lines.every((line,i)=>line===attachments[i].path);
 return {text:matches?text.slice(0,index):text,attachments};
}
