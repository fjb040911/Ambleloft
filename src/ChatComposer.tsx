import {useId,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {ArrowUp,Square,Save} from 'lucide-react';
import {InputGroup,InputGroupAddon,InputGroupButton,InputGroupTextarea} from './components/ui/input-group';
import {t} from './i18n';

export default function ChatComposer({value,onChange,onSubmit,disabled,active=false,stopping=false,onStop,canSend,label,placeholder,sendLabel,saveDraft=false,skills,controls,followup=false,inputRef,footer,allowActiveSend=false,keepEditable=false,showSendLabel=false}: {
 allowActiveSend?:boolean;keepEditable?:boolean;showSendLabel?:boolean;
 value:string;onChange(value:string):void;onSubmit():void;disabled?:boolean;active?:boolean;stopping?:boolean;onStop?():void;canSend:boolean;
 label:string;placeholder:string;sendLabel:string;saveDraft?:boolean;skills:ReactNode;controls:ReactNode;followup?:boolean;inputRef?:RefObject<HTMLTextAreaElement|null>;footer?:ReactNode;
}){
 const localRef=useRef<HTMLTextAreaElement>(null),ref=inputRef||localRef;
 const hintId=useId();const [draftNotice,setDraftNotice]=useState(false);
 const showStop=active&&(!allowActiveSend||!canSend||disabled||stopping);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  const resize=()=>{if(!el.clientWidth)return;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,200)}px`;};
  resize();let width=el.clientWidth;
  const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;resize();}});
  observer.observe(el);return()=>observer.disconnect();
 },[value,ref]);
 return <form className={`@container/composer composer${followup?' followup':''}`} aria-busy={disabled} onSubmit={e=>{e.preventDefault();if(active&&!allowActiveSend){setDraftNotice(true);return;}if(!disabled&&canSend)onSubmit();}}>
  <InputGroup className="rounded-3xl bg-background shadow-sm has-[[data-slot=input-group-control]:disabled]:opacity-100 has-[[data-slot=input-group-control]:disabled]:bg-background dark:has-[[data-slot=input-group-control]:disabled]:bg-input/30 has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:ring-transparent">
   <InputGroupTextarea ref={ref} aria-label={label} aria-describedby={hintId} placeholder={placeholder} disabled={disabled&&!keepEditable} value={value} maxLength={20000} rows={followup?2:3}
    className={`chat-composer-input field-sizing-fixed flex-none max-h-[200px] px-3.5 pt-3.5 pb-2 focus-visible:outline-none ${followup?'min-h-[80px]':'min-h-[112px]'}`} onChange={e=>{setDraftNotice(false);onChange(e.target.value);}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();if(active&&!allowActiveSend)setDraftNotice(true);else if(!disabled&&canSend)onSubmit();}}}/>
   <InputGroupAddon align="block-start" className="empty:hidden">{skills}</InputGroupAddon>
   <InputGroupAddon align="block-end" className="composer-bottom px-2.5 pt-1 pb-2.5">{controls}
    {showStop?<InputGroupButton className="rounded-full hover:bg-primary disabled:opacity-100" size="icon-sm" variant="default" aria-label={t('停止')} title={t(stopping?'正在停止':'停止')} onClick={onStop} disabled={stopping}><Square size={13} fill="currentColor"/></InputGroupButton>
     :null}
    {!showStop&&<InputGroupButton className={`rounded-full hover:bg-primary ${disabled?'disabled:opacity-100':''}`} size={saveDraft||showSendLabel?"sm":"icon-sm"} variant="default" type="submit" aria-label={sendLabel} title={sendLabel} disabled={!canSend||disabled}>{saveDraft?<><Save data-icon="inline-start"/>{t("保存草稿")}</>:showSendLabel?<><ArrowUp data-icon="inline-start"/>{sendLabel}</>:<ArrowUp size={17}/>}</InputGroupButton>}
   </InputGroupAddon>
  </InputGroup>
  <div className={footer?"composer-footer":"composer-hint-wrapper"}>{footer}
  <p id={hintId} className="composer-hint" role="status">{disabled?t(saveDraft?'正在保存…':'正在发送…'):active&&!allowActiveSend?t(draftNotice?'草稿尚未发送，请在本轮结束后发送。':'可先编辑草稿，本轮结束后发送'):t(active?'Enter 发送补充 · Shift+Enter 换行':saveDraft?'Enter 保存草稿 · Shift+Enter 换行':'Enter 发送 · Shift+Enter 换行')}</p></div>
 </form>;
}
