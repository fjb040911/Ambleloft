import {useId, useState} from 'react';
import {t} from './i18n';
import type {ConversationTurn} from './conversation-turns';
import {Button} from './components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from './components/ui/tooltip';

type Props = {offset?: number; turns: ConversationTurn[]; selected: string; jump(id: string): void};

export default function TurnNavigation({turns, selected, jump, offset = 0}: Props) {
  const prefix = useId();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const index = previewId === null ? -1 : turns.findIndex(turn => turn.user.id === previewId);
  const preview = turns[index];
  return <Tooltip open={!!preview} triggerId={preview ? prefix + previewId : null} disableHoverablePopup
    onOpenChange={open => {if (!open) setPreviewId(null);}}>
    <nav className="turn-navigation" aria-label={t('对话轮次导航')} onScroll={() => setPreviewId(null)}>
      {turns.map((turn, i) => {
        const number = i + offset + 1;
        const id = turn.user.id;
        return <TooltipTrigger key={id} id={prefix + id} onMouseEnter={() => setPreviewId(id)}
          onFocus={() => setPreviewId(id)} onBlur={() => setPreviewId(null)} onMouseLeave={() => setPreviewId(null)}
          render={<Button className="turn-anchor shrink-0" type="button" size="icon-sm" variant="ghost"
            aria-label={`第 ${number} 轮：${turn.user.text.slice(0,80)}`} aria-current={selected === id || undefined}
            onClick={() => {setPreviewId(null); jump(id);}}/>}><span aria-hidden="true" className="turn-tick"/></TooltipTrigger>;
      })}
    </nav>
    {preview && <TooltipContent role="tooltip" side="right" align="start" className="flex max-h-48 flex-col items-start overflow-hidden">
      <strong>{t('第')}{offset + index + 1}{t('轮')}</strong>
      <p className="whitespace-pre-wrap wrap-anywhere">{preview.user.text.length>100?preview.user.text.slice(0,100)+'…':preview.user.text}</p>
    </TooltipContent>}
  </Tooltip>;
}
