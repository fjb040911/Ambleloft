import {useId,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {ArrowUp,Square,Save} from 'lucide-react';
import {InputGroup,InputGroupAddon,InputGroupButton,InputGroupTextarea} from './components/ui/input-group';
import {t} from './i18n';

export default function ChatComposer({value,onChange,onSubmit,disabled,active=false,stopping=false,onStop,canSend,label,placeholder,sendLabel,saveDraft=false,skills,controls,followup=false,inputRef}: {
 value:string;onChange(value:string):void;onSubmit():void;disabled?:boolean;active?:boolean;stopping?:boolean;onStop?():void;canSend:boolean;
 label:string;placeholder:string;sendLabel:string;saveDraft?:boolean;skills:ReactNode;controls:ReactNode;followup?:boolean;inputRef?:RefObject<HTMLTextAreaElement|null>;
}){
 const localRef=useRef<HTMLTextAreaElement>(null),ref=inputRef||localRef;
 const hintId=useId();const [draftNotice,setDraftNotice]=useState(false);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const resize=()=>{if(!el.clientWidth)return;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,200)}px`;};
  resize();let width=el.clientWidth;
  const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;resize();}});
  observer.observe(el);return()=>observer.disconnect();
 },[value,ref]);
 return <form className={`composer${followup?' followup':''}`} aria-busy={disabled} onSubmit={e=>{e.preventDefault();if(active){setDraftNotice(true);return;}if(!disabled&&canSend)onSubmit();}}>
  <InputGroup className="rounded-2xl">
   <InputGroupTextarea ref={ref} aria-label={label} aria-describedby={hintId} placeholder={placeholder} disabled={disabled} value={value} maxLength={20000} rows={followup?2:3}
    className={`chat-composer-input field-sizing-fixed flex-none max-h-[200px] ${followup?'min-h-[72px]':'min-h-[112px]'}`} onChange={e=>{setDraftNotice(false);onChange(e.target.value);}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();if(active)setDraftNotice(true);else if(!disabled&&canSend)onSubmit();}}}/>
   <InputGroupAddon align="block-start" className="empty:hidden">{skills}</InputGroupAddon>
   <InputGroupAddon align="block-end" className="composer-bottom">{controls}
    {active?<InputGroupButton size="icon-sm" variant="secondary" aria-label={t('停止')} title={t(stopping?'正在停止':'停止')} onClick={onStop} disabled={stopping}><Square size={13} fill="currentColor"/></InputGroupButton>
     :<InputGroupButton size={saveDraft?"sm":"icon-sm"} variant="default" type="submit" aria-label={sendLabel} title={sendLabel} disabled={!canSend||disabled}>{saveDraft?<><Save data-icon="inline-start"/>{t("保存草稿")}</>:<ArrowUp size={17}/>}</InputGroupButton>}
   </InputGroupAddon>
  </InputGroup>
  <p id={hintId} className="composer-hint" role="status">{disabled?t(saveDraft?'正在保存…':'正在发送…'):active?t(draftNotice?'草稿尚未发送，请在本轮结束后发送。':'可先编辑草稿，本轮结束后发送'):t(saveDraft?'Enter 保存草稿 · Shift+Enter 换行':'Enter 发送 · Shift+Enter 换行')}</p>
 </form>;
}
