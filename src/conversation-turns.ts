import type { TaskPlan, DeliveredFile, AgentRun } from './types';
export interface ConversationTurn {
  user: AgentRun['messages'][number];
  messages: AgentRun['messages'];
  tools: AgentRun['tools'];
  final?: AgentRun['messages'][number];
  active: boolean;
  outcome?: 'completed'|'failed'|'interrupted';
  plan?:TaskPlan;
  artifacts:DeliveredFile[];
}
export function conversationTurns(run: AgentRun): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of run.messages) {
    if (message.role === 'user') turns.push({ user: message, messages: [], tools: [], active: false, artifacts:[] });
    else if (turns.length) turns[turns.length - 1].messages.push(message);
  }
  turns.forEach((turn, index) => {
    const last = index === turns.length - 1;
    turn.active = last && ['preparing','running','waiting','stopping'].includes(run.status);
    turn.tools = run.tools.filter(tool => tool.turnKey === turn.user.id || (!tool.turnKey && turns.length === 1));
    turn.plan=run.plans?.find(plan=>plan.turnKey===turn.user.id);
    turn.artifacts=run.artifacts?.filter(file=>file.turnKey===turn.user.id)||[];
    turn.outcome=turn.active?undefined:turn.user.timing?.outcome||(last?(run.status==='failed'?'failed':run.status==='interrupted'?'interrupted':'completed'):'completed');
    const answers = turn.messages.filter(message => message.role === 'assistant' && !message.kind);
    turn.final = [...answers].reverse().find(message => message.phase === 'final_answer');
    // Unclassified legacy providers can only be resolved once the turn has ended.
    const completed = turn.user.timing?.outcome === 'completed' || (!turn.user.timing?.outcome && (!last || run.status === 'completed'));
    if (!turn.final && completed) turn.final = [...answers].reverse().find(message => !message.phase);
  });
  return turns;
}
