import {Alert,AlertDescription} from './components/ui/alert';
import {useEffect,useId,useRef,useState,type ReactNode,type RefObject} from 'react';
import {ArrowUp,Square,Save} from 'lucide-react';
import {InputGroup,InputGroupAddon,InputGroupButton,InputGroupTextarea} from './components/ui/input-group';
import {t} from './i18n';
import {Spinner} from './components/ui/spinner';
import {useComposerMentions,type ExpertMentionOptions} from './ComposerMentions';

export default function ChatComposer({value,onChange,onSubmit,disabled,sending=false,active=false,stopping=false,onStop,canSend,label,placeholder,sendLabel,saveDraft=false,skills,attachments,controls,followup=false,inputRef,footer,allowActiveSend=false,keepEditable=false,showSendLabel=false,selectedSkillIds,onSelectSkill,expertMentions,onPasteAttachments}: {
 onPasteAttachments?(files:{name:string;path:string}[]):void;
 expertMentions?:ExpertMentionOptions;
 selectedSkillIds?:string[];onSelectSkill?:(id:string)=>void;
 allowActiveSend?:boolean;keepEditable?:boolean;showSendLabel?:boolean;
 value:string;onChange(value:string):void;onSubmit():void;disabled?:boolean;sending?:boolean;active?:boolean;stopping?:boolean;onStop?():void;canSend:boolean;
 label:string;placeholder:string;sendLabel:string;saveDraft?:boolean;attachments?:ReactNode;skills:ReactNode;controls:ReactNode;followup?:boolean;inputRef?:RefObject<HTMLTextAreaElement|null>;footer?:ReactNode;
}){
 const localRef=useRef<HTMLTextAreaElement>(null),ref=inputRef||localRef;
 const mentions=useComposerMentions({value,onChange,inputRef:ref,selectedSkillIds,onSelectSkill,experts:expertMentions,enabled:(!!onSelectSkill||!!expertMentions)&&!active&&!disabled});
 const hintId=useId();const [draftNotice,setDraftNotice]=useState(false);
 const [pasting,setPasting]=useState(false),[pasteError,setPasteError]=useState('');
 const pasteBusy=useRef(false),mounted=useRef(true),pasteTarget=useRef(onPasteAttachments);pasteTarget.current=onPasteAttachments;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const paste=async(event:React.ClipboardEvent<HTMLTextAreaElement>)=>{
  const files=Array.from(event.clipboardData.files);if(!files.length||!onPasteAttachments)return;
  event.preventDefault();
  if(disabled||active||pasteBusy.current){setPasteError(t('请等待当前操作结束后再粘贴附件'));return;}
  pasteBusy.current=true;setPasting(true);setPasteError('');
  try{if(!window.desktop?.importAttachments)throw Error(t('请在桌面应用中粘贴图片或文件'));
   const added=await window.desktop.importAttachments(files);if(mounted.current)pasteTarget.current?.(added);
  }catch(error){if(mounted.current)setPasteError(t((error as Error).message));}
  finally{pasteBusy.current=false;if(mounted.current)setPasting(false);}
 };
 const showStop=active&&(!allowActiveSend||!canSend||disabled||stopping);
 return <form className={`@container/composer composer${followup?' followup':''}`} aria-busy={disabled} onSubmit={e=>{e.preventDefault();if(active&&!allowActiveSend){setDraftNotice(true);return;}if(!disabled&&!pasteBusy.current&&canSend)onSubmit();}}>
  <InputGroup className="rounded-2xl border-(--composer-outline) bg-(--composer-fill) transition-[color,box-shadow] duration-200 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/30 dark:bg-(--composer-fill) has-disabled:bg-(--composer-fill) dark:has-disabled:bg-(--composer-fill) has-[textarea:enabled]:opacity-100">
   <InputGroupTextarea onPaste={paste} ref={ref} {...mentions.aria} onSelect={mentions.syncCursor} onFocus={mentions.onFocus} onBlur={mentions.onBlur} aria-label={label} aria-describedby={hintId} placeholder={placeholder} disabled={disabled&&!keepEditable} value={value} maxLength={20000} rows={followup?2:3}
    className="chat-composer-input flex-none max-h-[200px] p-3" onChange={e=>{setDraftNotice(false);onChange(e.target.value);mentions.onEdit();}}
    onKeyDown={e=>{if(mentions.onKeyDown(e))return;if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();if(active&&!allowActiveSend)setDraftNotice(true);else if(!disabled&&!pasteBusy.current&&canSend)onSubmit();}}}/>
   <InputGroupAddon align="block-start" className="max-h-40 flex-col items-stretch gap-2 overflow-y-auto empty:hidden">{attachments}{skills}</InputGroupAddon>
   <InputGroupAddon align="block-end" className="composer-bottom">{controls}
    {showStop?<InputGroupButton className="ml-auto shrink-0 rounded-full" size="icon-sm" variant="default" aria-label={t('停止')} title={t(stopping?'正在停止':'停止')} onClick={onStop} disabled={stopping}><>{sending?<Spinner aria-hidden="true" className="size-3.5 motion-reduce:animate-none"/>:<Square className="size-3" fill="currentColor" aria-hidden="true"/>}</></InputGroupButton>
     :null}
    {!showStop&&<InputGroupButton className="ml-auto shrink-0 rounded-full" size={saveDraft||showSendLabel?"sm":"icon-sm"} variant="default" type="submit" aria-busy={sending} aria-label={sending?t('正在发送…'):sendLabel} title={sending?t('正在发送…'):sendLabel} disabled={!canSend||disabled||pasting}>{sending?<Spinner aria-hidden="true" className="size-3.5 motion-reduce:animate-none"/>:saveDraft?<><Save data-icon="inline-start"/>{t("保存草稿")}</>:showSendLabel?<><ArrowUp data-icon="inline-start"/>{sendLabel}</>:<ArrowUp size={17}/>}</InputGroupButton>}
   </InputGroupAddon>
  </InputGroup>
  {mentions.menu}
  {pasting&&<p role="status" className="composer-notice">{t('正在添加附件…')}</p>}
  {pasteError&&<Alert variant="destructive"><AlertDescription>{pasteError}</AlertDescription></Alert>}
  {footer&&<div className="composer-footer">{footer}</div>}
  <p id={hintId} className={active&&!allowActiveSend&&draftNotice?"composer-notice":"sr-only"} role="status">{disabled?t(saveDraft?'正在保存…':'正在发送…'):active&&!allowActiveSend?t(draftNotice?'草稿尚未发送，请在本轮结束后发送。':'可先编辑草稿，本轮结束后发送'):t(active?'Enter 发送补充 · Shift+Enter 换行':saveDraft?'Enter 保存草稿 · Shift+Enter 换行':'Enter 发送 · Shift+Enter 换行')}</p>
 </form>;
}
