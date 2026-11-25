import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {t} from './i18n';
import type {ConversationTurn} from './conversation-turns';
import {Tooltip,TooltipContent,TooltipTrigger} from './components/ui/tooltip';

type Props = {
  offset?:number; turns:ConversationTurn[]; selected:string; jump(id:string):void;
  loadEarlier?:()=>Promise<void>; loadingEarlier?:boolean;
};

export default function TurnNavigation({turns,selected,jump,offset=0,loadEarlier,loadingEarlier}:Props) {
  const prefix=useId();
  const rail=useRef<HTMLElement>(null);
  const [height,setHeight]=useState(0);
  const [browse,setBrowse]=useState<number|null>(null);
  const [previewId,setPreviewId]=useState<string|null>(null);
  const [previewReady,setPreviewReady]=useState(false);
  const [focusTarget,setFocusTarget]=useState<number|null>(null);

  useLayoutEffect(()=>{
    const node=rail.current!;
    const measure=()=>setHeight(node.clientHeight);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);

  // Measurements are in CSS pixels. Reserve the two arrow slots only for paged lists.
  const rowHeight=12, padding=12, arrowSlots=40;
  const paged=!!loadEarlier || turns.length*rowHeight>height-padding;
  const capacity=Math.max(1,Math.floor((height-padding-(paged?arrowSlots:0))/rowHeight));
  const selectedIndex=Math.max(0,turns.findIndex(turn=>turn.user.id===selected));
  const index=Math.min(Math.max(0,turns.length-1),Math.max(0,(browse??(offset+selectedIndex))-offset));
  const start=Math.floor(index/capacity)*capacity;
  const page=turns.slice(start,start+capacity);
  const earlier=start>0 || !!loadEarlier;
  const later=start+page.length<turns.length;
  const hovered=previewId===null?-1:page.findIndex(turn=>turn.user.id===previewId);
  const preview=page[hovered];
  const tabStop=hovered>=0?hovered:Math.max(0,page.findIndex(turn=>turn.user.id===selected));
  const browsing=browse!==null;
  const hasPreview=!!preview;

  useEffect(()=>{
    if(!hasPreview){setPreviewReady(false);return;}
    const timer=window.setTimeout(()=>setPreviewReady(true),120);
    return ()=>window.clearTimeout(timer);
  },[hasPreview]);

  useEffect(()=>{
    if(!browsing)return;
    const resume=(event:Event)=>{
      if(event.target instanceof Node && !rail.current?.contains(event.target)){
        setBrowse(null);
        setFocusTarget(null);
        setPreviewId(null);
      }
    };
    document.addEventListener('pointerdown',resume,true);
    document.addEventListener('wheel',resume,{capture:true,passive:true});
    document.addEventListener('focusin',resume,true);
    return ()=>{
      document.removeEventListener('pointerdown',resume,true);
      document.removeEventListener('wheel',resume,true);
      document.removeEventListener('focusin',resume,true);
    };
  },[browsing]);

  useLayoutEffect(()=>{
    if(focusTarget===null)return;
    const node=rail.current?.querySelector<HTMLElement>(`[data-turn-number="${focusTarget}"]`);
    if(node){node.focus({preventScroll:true});setFocusTarget(null);}
  },[focusTarget,start,offset,capacity]);

  function browseTo(number:number,focus=false){
    setPreviewId(null);
    setBrowse(number);
    setFocusTarget(focus?number:null);
    if(number<offset && !loadingEarlier)void loadEarlier?.();
  }
  function choose(turn:ConversationTurn){
    setPreviewId(null);
    setBrowse(null);
    jump(turn.user.id);
  }
  function arrow(direction:'earlier'|'later'){
    const up=direction==='earlier',available=up?earlier:later;
    const label=t(up?'上一组轮次':'下一组轮次');
    return <div className="turn-page-slot">{available&&<button type="button" className="turn-page-button"
      aria-label={label} title={label} aria-disabled={up&&loadingEarlier||undefined}
      onClick={event=>{
        if(up&&loadingEarlier)return;
        browseTo(offset+start+(up?-1:page.length),event.detail===0);
      }}>{up?<ChevronUp size={13}/>:<ChevronDown size={13}/>}</button>}</div>;
  }

  return <Tooltip open={hasPreview&&previewReady} triggerId={preview?prefix+preview.user.id:null} disableHoverablePopup
    onOpenChange={open=>{if(!open)setPreviewId(null);}}>
    <nav ref={rail} className="turn-navigation" data-paged={paged||undefined} aria-label={t('对话轮次导航')} aria-busy={loadingEarlier||undefined}
      onPointerLeave={()=>setPreviewId(null)} onKeyDown={event=>{
        if(event.key==='Escape'){setPreviewId(null);return;}
        const number=(event.target as HTMLElement).closest<HTMLElement>('[data-turn-number]')?.dataset.turnNumber;
        if(number===undefined||!['ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();
        const target=Number(number)+(event.key==='ArrowUp'?-1:1);
        if((target>=offset||loadEarlier)&&target>=0&&target<offset+turns.length)browseTo(target,true);
      }}>
      {paged&&arrow('earlier')}
      <div className="turn-ticks" onMouseLeave={()=>setPreviewId(null)}>
        {page.map((turn,i)=>{
          const number=offset+start+i,id=turn.user.id;
          const fade=Math.min(earlier?i:3,later?page.length-1-i:3);
          const distance=hovered<0?undefined:Math.abs(hovered-i);
          const label=[t('第'),number+1,t('轮').trim()].filter(Boolean).join(' ');
          return <TooltipTrigger key={id} id={prefix+id} data-turn-number={number} className="turn-anchor"
            tabIndex={i===tabStop?0:-1} data-fade={fade} data-near={distance} aria-label={label+'：'+turn.user.text.slice(0,80)}
            aria-current={selected===id||undefined} onMouseEnter={()=>{setBrowse(number);setPreviewId(id);}}
            onFocus={()=>{setBrowse(number);setPreviewReady(true);setPreviewId(id);}} onBlur={()=>setPreviewId(null)}
            onClick={()=>choose(turn)}><span className="turn-tick" aria-hidden="true"/></TooltipTrigger>;
        })}
      </div>
      {paged&&arrow('later')}
    </nav>
    {preview&&previewReady&&<TooltipContent role="tooltip" side="right" sideOffset={6} className="pointer-events-none flex max-w-72 flex-col items-start gap-1 overflow-hidden">
      <strong className="line-clamp-2 wrap-anywhere">{preview.user.text.slice(0,160)}</strong>
      {preview.final?.text&&<span className="line-clamp-2 wrap-anywhere opacity-80">{preview.final.text.slice(0,200)}</span>}
    </TooltipContent>}
  </Tooltip>;
}
