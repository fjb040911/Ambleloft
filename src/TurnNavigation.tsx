import { t } from './i18n';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConversationTurn } from './conversation-turns';
export default function TurnNavigation({ turns, selected, jump,offset=0 }: { offset?:number; turns: ConversationTurn[]; selected: string; jump(id: string): void }) {
  const [preview, setPreview] = useState<{ id: string; text: string; number: number; x: number; y: number } | null>(null);
  const show = (button: HTMLButtonElement, turn: ConversationTurn, index: number) => {
    const rect = button.getBoundingClientRect();
    setPreview({id:turn.user.id,text:turn.user.text,number:index+offset+1,x:rect.right+10,y:Math.max(12,Math.min(rect.top,window.innerHeight-220))});
  };
  return <><nav className="turn-navigation" aria-label={t("对话轮次导航")} onScroll={() => setPreview(null)}>{turns.map((turn,index) => <button key={turn.user.id} type="button" className="turn-anchor" aria-label={`第 ${index+offset+1} 轮：${turn.user.text.slice(0,80)}`} aria-current={selected===turn.user.id ? 'true' : undefined} aria-describedby={preview?.id===turn.user.id ? 'turn-question-preview' : undefined}
    onMouseEnter={event=>show(event.currentTarget,turn,index)} onMouseLeave={()=>setPreview(null)} onFocus={event=>show(event.currentTarget,turn,index)} onBlur={()=>setPreview(null)} onKeyDown={event=>{if(event.key==='Escape')setPreview(null);}} onClick={()=>{setPreview(null);jump(turn.user.id);}}><span>{index+offset+1}</span></button>)}</nav>
    {preview && createPortal(<div className="turn-preview" id="turn-question-preview" role="tooltip" style={{left:preview.x,top:preview.y}}><strong>{t("第")}{preview.number}{t("轮")}</strong><p>{preview.text}</p></div>,document.body)}
  </>;
}
