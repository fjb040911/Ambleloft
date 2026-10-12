import {useState} from 'react';
import {FileCode2,Copy,Check,FolderOpen} from 'lucide-react';
import {Button} from './components/ui/button';
import {Popover,PopoverTrigger,PopoverContent,PopoverHeader,PopoverTitle,PopoverDescription} from './components/ui/popover';
import {TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from './components/ui/tooltip';
import {Separator} from './components/ui/separator';
import {t} from './i18n';

import {fileDirectoryHints,filePathParts as parts} from './file-reference';
export {fileDirectoryHints} from './file-reference';
function Filename({value}:{value:string}){
 const characters=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),x=>x.segment);
 const head=characters.length>30?characters.slice(0,-14).join(''):value,tail=characters.length>30?characters.slice(-14).join(''):'';
 return <span className="flex min-w-0"><span className="truncate">{head}</span>{tail&&<span className="shrink-0">{tail}</span>}</span>;
}
/** Display only: authorization and path resolution stay in the bound host callback. */
export default function HostFileReference({path,directoryHint,canLocate,disabledReason,onLocate}:{path:string;directoryHint?:string;canLocate:boolean;disabledReason?:string;onLocate:()=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[tooltip,setTooltip]=useState(false),[copied,setCopied]=useState(false),[notice,setNotice]=useState(''),[locating,setLocating]=useState(false);
 const {filename}=parts(path),hint=directoryHint??fileDirectoryHints([path],t('项目根目录')).get(path);
 async function copy(){try{if(window.desktop?.copyText)await window.desktop.copyText(path);else await navigator.clipboard.writeText(path);setCopied(true);setNotice(t('已复制完整项目相对路径'));}catch{setCopied(false);setNotice(t('复制失败，请选中上方路径手动复制。'));}}
 async function locate(){if(!canLocate||locating)return;setLocating(true);setNotice('');try{await onLocate();setNotice(t('已在文件管理器中定位文件'));}catch(e){setNotice((e as Error).message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')||t('暂时无法定位文件'));}finally{setLocating(false);}}
 return <TooltipProvider delay={400}><Popover open={open} onOpenChange={value=>{setOpen(value);setCopied(false);setNotice('');}}>
  <Tooltip open={open?false:tooltip} onOpenChange={setTooltip}>
   <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" className="h-auto w-full min-w-0 justify-start px-2 py-2 text-left" aria-label={t('查看文件 {name} 的完整路径').replace('{name}',filename)+' · '+hint}/>}/> }>
    <FileCode2 data-icon="inline-start"/><span className="flex min-w-0 flex-1 flex-col gap-1"><Filename value={filename}/><span className="truncate text-muted-foreground">{hint}</span></span>
   </TooltipTrigger>
   <TooltipContent style={{maxWidth:'min(32rem, calc(100vw - 2rem))'}} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{path}</TooltipContent>
  </Tooltip>
  <PopoverContent align="start" style={{width:'min(25rem, calc(100vw - 2rem))'}} className="gap-3 p-4">
   <PopoverHeader><PopoverTitle>{t('文件位置')}</PopoverTitle><PopoverDescription>{t('项目内的相对路径')}</PopoverDescription></PopoverHeader>
   <p className="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-text">{path}</p><Separator/>
   <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void copy()}>{copied?<Check data-icon="inline-start"/>:<Copy data-icon="inline-start"/>}{t(copied?'已复制':'复制路径')}</Button><Button disabled={!canLocate||locating} onClick={()=>void locate()}><FolderOpen data-icon="inline-start"/>{t(locating?'正在定位…':'定位文件')}</Button></div>
   {!canLocate&&<PopoverDescription>{disabledReason||t('此文件暂时无法定位，你仍可以查看和复制路径。')}</PopoverDescription>}
   <span role="status" aria-live="polite">{notice}</span>
  </PopoverContent>
 </Popover></TooltipProvider>;
}
