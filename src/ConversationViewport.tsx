import type {ComponentProps,ReactNode} from 'react';
import {MessageScroller,MessageScrollerViewport,MessageScrollerContent} from './components/ui/message-scroller';
import {t} from './i18n';

type Props=ComponentProps<typeof MessageScrollerViewport>&{
 navigation?:ReactNode;
 beforeViewport?:ReactNode;
 scrollButton?:ReactNode;
 busy:boolean;
 inert?:boolean;
};

// Keep the first outgoing turn in the same column and scroll viewport as acknowledged turns.
export default function ConversationViewport({navigation,beforeViewport,scrollButton,busy,inert,children,...viewport}:Props){
 return <div className="conversation-body" inert={inert} aria-hidden={inert||undefined}>
  {navigation??<div aria-hidden="true" className="turn-navigation"/>}
  <MessageScroller className="min-w-0 flex-1">
   {beforeViewport}
   <MessageScrollerViewport className="conversation-scroll" aria-label={t('任务消息')} {...viewport}>
    <MessageScrollerContent spacerClassName="hidden" className="conversation-content w-full gap-0 pt-[14px]" aria-busy={busy}>
     {children}
    </MessageScrollerContent>
   </MessageScrollerViewport>
   {scrollButton}
  </MessageScroller>
 </div>;
}
