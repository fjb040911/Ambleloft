import type {AgentRun} from './types';

// Ordinary follow-ups belong in the chat even when a legacy/expert execution
// path did not involve the conversation agent. Form answers retain their dock.
export function isConversationMessage(message:AgentRun['messages'][number]){
 return message.agentRole==='conversation'||message.role==='user'&&!!(message.userInputId||message.inputSource==='user');
}
