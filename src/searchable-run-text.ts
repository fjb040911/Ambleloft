import type { AgentRun } from './types';
import { conversationTurns } from './conversation-turns';

export function searchableRunText(run: AgentRun): string {
 const prompts=run.messages.filter(message=>message.role==='user'&&!message.kind).map(message=>message.text);
 const answers=conversationTurns(run).flatMap(turn=>turn.final?[turn.final.text]:[]);
 return [...prompts,...answers].join('\n');
}
