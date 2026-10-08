import {useEffect,useRef,useState,useId} from 'react';
import {Folder,ChevronDown,Check} from 'lucide-react';
import type {Project} from './types';
import {t} from './i18n';
import {Button} from './components/ui/button';
import {Popover,PopoverTrigger,PopoverContent} from './components/ui/popover';

export default function ProjectPicker({projects,value,onChange,disabled}:{projects:Project[];value:string;onChange(value:string):void;disabled:boolean}){
 const [open,setOpen]=useState(false);const id=useId();
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const options=[{id:'',name:t('不关联项目'),path:''},...projects];
 const selected=options.find(option=>option.id===value)||options[0];
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger render={<Button ref={trigger} type="button" variant="ghost" size="sm" className="project-picker-trigger max-w-full sm:max-w-90" disabled={disabled} role="combobox" aria-label={t('当前项目')} aria-haspopup="listbox" aria-controls={open?id:undefined} title={selected.path||selected.name} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);}}}/> }><Folder/><span className="min-w-0 truncate">{selected.name}</span><ChevronDown/></PopoverTrigger>
  <PopoverContent ref={popup} id={id} role="listbox" aria-label={t('当前项目')} side="top" align="start" sideOffset={8}
   initialFocus={()=>popup.current?.querySelector<HTMLElement>('[aria-selected="true"]')||popup.current}
   finalFocus={trigger}
   className="project-picker-popover w-80 max-w-[calc(100vw-24px)] max-h-[min(380px,var(--available-height))] overflow-y-auto gap-1 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"
   onKeyDown={event=>{
    const items=Array.from(popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]'));const index=items.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==' '){const next=items.slice(index+1).concat(items.slice(0,index+1)).find(item=>item.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));next?.focus();}
   }}>
   {options.map(option=><Button variant={option.id===selected.id?'secondary':'ghost'} className="w-full justify-start" type="button" role="option" aria-selected={option.id===selected.id} tabIndex={-1} key={option.id} title={option.path||option.name} onClick={()=>{onChange(option.id);setOpen(false);}}><span className="min-w-0 flex-1 truncate text-left">{option.name}</span>{option.id===selected.id&&<Check/>}</Button>)}
  </PopoverContent>
 </Popover>;
}
