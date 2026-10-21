import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent,type RefObject,type Dispatch,type SetStateAction} from 'react';
import {useCommandState} from 'cmdk';
import {BookOpen,Puzzle} from 'lucide-react';
import {Command,CommandGroup,CommandItem,CommandList} from './components/ui/command';
import {Popover,PopoverContent,PopoverTitle} from './components/ui/popover';
import {useSkills} from './skills';
import {t} from './i18n';
import type {ExtensionSnapshot} from './types';

type Mention={start:number;end:number;query:string};
type Choice={key:string;id:string;kind:'skill'|'extension';name:string;description:string;search:string;disabled:boolean};
// Only a standalone token immediately before the caret is a mention. Shell
// interpolation, escaped dollars and prices remain ordinary composer text.
function mentionAt(value:string,start:number,end:number):Mention|null {
 if(start!==end)return null;
 const match=/(?:^|\s)\$([\p{L}\p{N}_.-]*)$/u.exec(value.slice(0,start));
 if(!match||/^\d/.test(match[1]))return null;
 return {start:start-match[1].length-1,end:start,query:match[1]};
}

export function useComposerMentions({value,onChange,inputRef,selectedSkillIds=[],onSelectSkill,enabled}:{value:string;onChange(value:string):void;inputRef:RefObject<HTMLTextAreaElement|null>;selectedSkillIds?:string[];onSelectSkill?:(id:string)=>void;enabled:boolean}){
 const {skills,error:skillError}=useSkills();
 const [cursor,setCursor]=useState({start:0,end:0});
 const [focused,setFocused]=useState(false);
 const [dismissed,setDismissed]=useState('');
 const [selection,setSelection]=useState('');
 const [extensions,setExtensions]=useState<ExtensionSnapshot['installed']>([]);
 const [extensionError,setExtensionError]=useState(false);
 const [loading,setLoading]=useState(false);
 const listRef=useRef<HTMLDivElement>(null);
 const [ariaIds,setAriaIds]=useState<{list?:string;item?:string}>({});
 const mention=mentionAt(value,cursor.start,cursor.end);
 const signature=JSON.stringify([value,cursor.start,cursor.end]);
 const open=enabled&&focused&&!!mention&&dismissed!==signature;
 const syncCursor=()=>{const el=inputRef.current;if(el)setCursor({start:el.selectionStart,end:el.selectionEnd});};
 useEffect(()=>{
  if(!open)return;
  let alive=true,version=0;
  const load=async()=>{const current=++version;setLoading(true);try{const snapshot=await window.desktop?.extensions?.list();if(alive&&current===version){setExtensions(snapshot?.installed||[]);setExtensionError(false);}}catch{if(alive&&current===version){setExtensions([]);setExtensionError(true);}}finally{if(alive&&current===version)setLoading(false);}};
  void load();const off=window.desktop?.extensions?.onChanged?.(load);
  window.addEventListener('extensions:changed',load);
  return()=>{alive=false;off?.();window.removeEventListener('extensions:changed',load);};
 },[open]);
 const query=(mention?.query||'').toLocaleLowerCase();
 const choices:Choice[]=[
  ...skills.filter(skill=>skill.enabled).map(skill=>({key:`skill:${skill.id}`,id:skill.id,kind:'skill' as const,name:skill.displayName||skill.name,description:skill.displayDescription||skill.description,search:[skill.name,skill.displayName,skill.description,skill.displayDescription,skill.id].join(' '),disabled:!selectedSkillIds.includes(skill.id)&&selectedSkillIds.length>=20})),
  ...extensions.filter(extension=>extension.enabled&&extension.trusted!==false).map(({manifest})=>({key:`extension:${manifest.id}`,id:manifest.id,kind:'extension' as const,name:manifest.name,description:manifest.description||manifest.id,search:[manifest.name,manifest.id,manifest.description].join(' '),disabled:false})),
 ].filter(choice=>choice.search.toLocaleLowerCase().includes(query));
 const available=choices.filter(choice=>!choice.disabled);
 const selected=available.find(choice=>choice.key===selection)||available[0];
 const dismiss=()=>setDismissed(signature);
 const choose=(choice:Choice)=>{
  if(!mention||choice.disabled||!enabled)return;
  const replacement=choice.kind==='extension'?`${t('使用扩展')}「${choice.name}」(${choice.id}) `:'';
  const next=value.slice(0,mention.start)+replacement+value.slice(mention.end);
  if(next.length>20000)return;
  if(choice.kind==='skill')onSelectSkill?.(choice.id);
  dismiss();onChange(next);setSelection('');
  requestAnimationFrame(()=>{const el=inputRef.current;if(!el||el.value!==next)return;el.focus();const position=mention.start+replacement.length;el.setSelectionRange(position,position);syncCursor();});
 };
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
  if(!open||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return false;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();return true;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();const index=available.findIndex(choice=>choice.key===selected?.key);const delta=event.key==='ArrowDown'?1:-1;
   if(available.length)setSelection(available[(index+delta+available.length)%available.length].key);
   return true;
  }
  if(event.key==='Tab'&&(!selected||event.shiftKey)){dismiss();return false;}
  if((event.key==='Enter'||event.key==='Tab')&&!event.shiftKey){event.preventDefault();if(selected)choose(selected);return true;}
  return false;
 };

 const menu=<Popover open={open} onOpenChange={(next,details)=>{if(!next){if(details.event.target===inputRef.current&&details.reason!=='escape-key'){details.cancel();return;}dismiss();}}}>
  <PopoverContent anchor={inputRef} side="top" align="start" sideOffset={8} initialFocus={false} finalFocus={false} className="w-[min(26rem,calc(100vw-2rem))] p-1" onMouseDown={event=>event.preventDefault()}>
   <PopoverTitle className="sr-only">{t('选择技能或扩展')}</PopoverTitle>
   <Command shouldFilter={false} value={selected?.key||''} onValueChange={setSelection}>
    <CommandList ref={listRef} label={t('选择技能或扩展')}>
     {(['skill','extension'] as const).map(kind=>choices.some(choice=>choice.kind===kind)&&<CommandGroup key={kind} heading={t(kind==='skill'?'技能':'扩展')}>
      {choices.filter(choice=>choice.kind===kind).map(choice=><CommandItem key={choice.key} value={choice.key} disabled={choice.disabled} data-checked={choice.kind==='skill'&&selectedSkillIds.includes(choice.id)} onSelect={()=>choose(choice)}>
       {choice.kind==='skill'?<BookOpen/>:<Puzzle/>}<span className="min-w-0 flex-1"><span className="block truncate">{choice.name}</span><span className="block truncate text-xs text-muted-foreground">{choice.description}</span></span>
      </CommandItem>)}
     </CommandGroup>)}
     {!choices.length&&<p className="px-3 py-5 text-center text-sm text-muted-foreground" role="status">{t(loading?'正在加载…':query?'没有匹配的技能或扩展':'暂无可用的技能或扩展')}</p>}
    </CommandList>
    <MentionAccessibility listRef={listRef} onIds={setAriaIds}/>
   </Command>
   {(skillError||extensionError)&&<p className="px-3 text-xs text-muted-foreground" role="status">{t('部分列表未能加载，重新输入 $ 可重试。')}</p>}
   {selectedSkillIds.length>=20&&<p className="px-3 text-xs text-muted-foreground" role="status">{t('最多选择 20 个技能，请先移除再添加。')}</p>}
   <p className="px-3 pb-2 text-xs text-muted-foreground">{t('↑↓ 选择 · Enter 确认 · Esc 关闭')}</p>
  </PopoverContent>
 </Popover>;
 return {menu,onKeyDown,syncCursor,onEdit:()=>{setDismissed('');syncCursor();},onFocus:()=>{setFocused(true);syncCursor();},onBlur:()=>setFocused(false),aria:{'aria-autocomplete':'list' as const,'aria-expanded':open,'aria-controls':open?ariaIds.list:undefined,'aria-activedescendant':open&&selected?ariaIds.item:undefined}};
}

// cmdk owns option and list IDs, including the initially selected option.
function MentionAccessibility({listRef,onIds}:{listRef:RefObject<HTMLDivElement|null>;onIds:Dispatch<SetStateAction<{list?:string;item?:string}>>}){
 useCommandState(state=>state.value);
 const previous=useRef('');
 useLayoutEffect(()=>{
  const option=listRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  const next={list:listRef.current?.id,item:option?.id};
  onIds(current=>current.list===next.list&&current.item===next.item?current:next);
  if(option&&previous.current!==option.id){option.scrollIntoView({block:'nearest'});previous.current=option.id;}
 });
 return null;
}
