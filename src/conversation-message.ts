import type {AgentRun} from './types';

// Ordinary follow-ups belong in the chat even when a legacy/expert execution
// path did not involve the conversation agent. Form answers retain their dock.
export function isConversationMessage(message:AgentRun['messages'][number]){
 return message.agentRole==='conversation'||message.role==='user'&&!!(message.userInputId||message.inputSource==='user');
}

// The initial planning reply becomes process history once the executor answers.
// Replies to later user questions remain part of the visible conversation.
export function isCompletedPlan(message:AgentRun['messages'][number], turn:import('./conversation-turns').ConversationTurn){
 return turn.outcome==='completed' && !!turn.final && message.id!==turn.final.id
  && message.agentRole==='conversation' && message.phase==='commentary' && message.id==='conversation:'+turn.user.id;
}
