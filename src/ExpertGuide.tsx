import ChatQuestionCard from './ChatQuestionCard';
import ChatComposer from './ChatComposer';
import FormFields from './FormFields';
import Markdown from './Markdown';
import {Button} from './components/ui/button';
import {Alert,AlertDescription} from './components/ui/alert';
import type {GuideMessage,RoleDefinition} from './workforce-types';
import {useCopy} from './WorkforceInputs';
import {Message, MessageContent} from './components/ui/message';
import ChatBubble from './ChatBubble';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from './components/ui/empty';
import {MessageScrollerProvider,MessageScroller,MessageScrollerViewport,MessageScrollerContent,MessageScrollerItem,MessageScrollerButton} from './components/ui/message-scroller';

export default function ExpertGuide({messages,input,onInput,onSend,onStop,onChoice,onAnswer,onApply,onContinue,busy,value}:{messages:GuideMessage[];input:string;onInput(s:string):void;onSend():void;onStop():void;onChoice(id:string,value:string):void;onAnswer(id:string):void;onApply(key:keyof RoleDefinition,value:string):void;onContinue(fields:GuideMessage['fields']):void;busy:boolean;value:RoleDefinition}){
 const L=useCopy();
 const names={name:L('专家名称','Expert name'),domain:L('专业方向','Specialization'),responsibilities:L('主要职责','Responsibilities'),deliverables:L('预期交付','Deliverables'),methods:L('工作方法与边界','Working methods and boundaries')};
 const last=messages.at(-1);
 return <div className="wf-guide">
  <MessageScrollerProvider autoScroll defaultScrollPosition="end"><MessageScroller className="h-auto"><MessageScrollerViewport className="max-h-[55dvh]" aria-label={L('专家构思对话','Expert design conversation')} aria-live="polite"><MessageScrollerContent className="gap-4 p-1" spacerClassName="hidden">
   {!messages.length&&<Empty><EmptyHeader><EmptyTitle>{L('说说你需要什么样的专家','Describe the expert you need')}</EmptyTitle><EmptyDescription>{L('从一个想法开始，我会先了解关键问题，再帮你整理职责和工作方式。','Start with an idea. I’ll ask about the important details, then help shape the responsibilities and working methods.')}</EmptyDescription></EmptyHeader></Empty>}
   {messages.map((message,index)=><MessageScrollerItem key={message.id} messageId={message.id}><Message align={message.role==='user'?'end':'start'} role="article" aria-label={message.role==='user'?L('你的消息','Your message'):L('AI 的回复','AI response')}>
    <MessageContent><ChatBubble user={message.role==='user'}><Markdown text={message.text}/></ChatBubble>
    {message.question&&<ChatQuestionCard title={message.question.source.definition.title} actions={index===messages.length-1&&<Button size="sm" disabled={busy||!message.question.prefill.choice} onClick={()=>onAnswer(message.id)}>{L('提交回答','Submit answer')}</Button>}>
     <FormFields fields={message.question.source.definition.fields} values={message.question.prefill} change={(_,v)=>onChoice(message.id,String(v))} locked={busy||index!==messages.length-1}/>
    </ChatQuestionCard>}
    {message.fields&&Object.values(message.fields).some(Boolean)&&<Alert><AlertDescription><strong>{L('角色建议 · 尚未应用','Role suggestions · not applied')}</strong><dl className="wf-suggestion-fields">{Object.entries(message.fields).map(([key,suggestion])=>{if(!suggestion)return null;const field=key as keyof typeof names;return <div key={key}><dt>{names[field]}</dt>{value[field]&&<dd>{L('当前：','Current: ')}{value[field]}</dd>}<dd>{L('建议：','Suggested: ')}{suggestion}</dd><Button size="sm" variant="outline" onClick={()=>onApply(field,suggestion)}>{L('采用此项','Apply this field')}</Button></div>;})}</dl><Button variant="outline" onClick={()=>onContinue(message.fields)}>{L('采用空白项并继续','Apply empty fields and continue')}</Button><p className="wf-muted">{L('已有填写不会被覆盖；需要替换时请逐项采用。','Existing fields stay unchanged; apply individual suggestions to replace them.')}</p></AlertDescription></Alert>}
   </MessageContent></Message></MessageScrollerItem>)}
   {busy&&<p role="status" className="wf-muted">{L('正在思考…','Thinking…')}</p>}
  </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton aria-label={L('回到最新消息','Back to latest message')}/></MessageScroller></MessageScrollerProvider>
  {last?.role==='user'&&!busy&&!input.trim()&&<Button variant="outline" size="sm" onClick={onSend}>{L('重试回复','Retry response')}</Button>}
  <ChatComposer value={input} onChange={onInput} onSubmit={onSend} active={busy} onStop={onStop} canSend={!!input.trim()} label={L('告诉 AI 你的需求','Describe what you need')} placeholder={L('例如：我需要一位懂芯片行业的产品经理…','For example: I need a product manager who understands semiconductors…')} sendLabel={L('发送','Send')} skills={null} controls={null} followup/>
 </div>;
}
