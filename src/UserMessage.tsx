import MessageBody from './MessageBody';
import type {AgentRun} from './types';
import type {ReactNode} from 'react';
import {Message,MessageContent} from './components/ui/message';
import {Bubble,BubbleContent} from './components/ui/bubble';
import {t} from './i18n';

/** Shared user surface for persisted, pending and collaboration messages. */
export default function UserMessage({text,context,label,message}:{message?:AgentRun['messages'][number];text:string;context?:ReactNode;label?:string}){
 return <Message align="end" role="article" aria-label={label||t('你的消息')} data-message-role="user" className="my-[18px]"><MessageContent><Bubble align="end" variant="user"><BubbleContent>{context}<div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message?.textPreview?<MessageBody message={message} plain/>:text}</div></BubbleContent></Bubble></MessageContent></Message>;
}
