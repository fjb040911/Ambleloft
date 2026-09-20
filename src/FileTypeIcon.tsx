import {Braces,File,FileArchive,FileCode2,FileImage,FileMusic,FileText,FileVideo,Folder,GitBranch,Hash,Sheet,Presentation,Settings,Terminal,Zap} from 'lucide-react';
export default function FileTypeIcon({name,directory=false}:{name:string;directory?:boolean}) {
 const lower=name.split('/').pop()!.toLowerCase(),ext=lower.split('.').pop()||'';
 let Icon=File,color='var(--muted)',badge='';
 if(directory)Icon=Folder;
 else if(lower.startsWith('.git')){Icon=GitBranch;color='#e66b45';}
 else if(lower.startsWith('vite.config')){Icon=Zap;color='#a052cf';}
 else if(['ts','tsx','js','jsx'].includes(ext)){badge=ext.toUpperCase();color=['ts','tsx'].includes(ext)?'#3186d5':'#aa8509';}
 else if(['json','jsonc'].includes(ext)){Icon=Braces;color='#d87826';}
 else if(['html','htm'].includes(ext)){Icon=Hash;color='#dc782d';}
 else if(['md','markdown'].includes(ext)){badge='M↓';color='#269a52';}
 else if(['css','scss','sass','less'].includes(ext)){Icon=Hash;color='#8071d0';}
 else if(['png','jpg','jpeg','gif','svg','webp','avif','ico'].includes(ext)){Icon=FileImage;color='#a65abb';}
 else if(['pdf','doc','docx','txt','rtf'].includes(ext)){Icon=FileText;color=ext==='pdf'?'#d65b59':ext==='txt'?'var(--muted)':'#397dc1';}
 else if(['csv','xls','xlsx','ods'].includes(ext)){Icon=Sheet;color='#2a9963';}
 else if(['ppt','pptx','odp'].includes(ext)){Icon=Presentation;color='#d37744';}
 else if(['zip','gz','tar','7z','rar'].includes(ext)){Icon=FileArchive;color='#b58a44';}
 else if(['mp3','wav','ogg','flac'].includes(ext)){Icon=FileMusic;color='#c15b90';}
 else if(['mp4','mov','webm'].includes(ext)){Icon=FileVideo;color='#9c62c9';}
 else if(['sh','bash','zsh','ps1'].includes(ext)){Icon=Terminal;color='#4b9b84';}
 else if(['yaml','yml','toml','ini','env'].includes(ext)){Icon=Settings;color='#8e8c59';}
 else if(['py','go','rs','java','c','cpp','h','cs','swift','rb','php','vue','svelte'].includes(ext)){Icon=FileCode2;color='#4b9dba';}
 return <span className="file-type-icon" data-file-type={directory?'folder':ext} style={{color}} aria-hidden="true">{badge?<span className="file-type-badge">{badge}</span>:<Icon size={16}/>}</span>;
}
