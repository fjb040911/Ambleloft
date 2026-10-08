import type { TaskPlan, DeliveredFile, AgentRun } from './types';
export interface ConversationTurn {
  user: AgentRun['messages'][number];
  messages: AgentRun['messages'];
  tools: AgentRun['tools'];
  final?: AgentRun['messages'][number];
  active: boolean;
  model?: string;
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
  const byId = new Map(turns.map(turn => [turn.user.id, turn]));
  for (const tool of run.tools) {
    const turn = tool.turnKey ? byId.get(tool.turnKey) : turns.length === 1 ? turns[0] : undefined;
    turn?.tools.push(tool);
  }
  for (const plan of run.plans || []) {
    const turn = byId.get(plan.turnKey);
    if (turn && !turn.plan) turn.plan = plan;
  }
  for (const file of run.artifacts || []) byId.get(file.turnKey)?.artifacts.push(file);
  let model = turns.some(turn => turn.user.modelChange) ? undefined : run.model;
  turns.forEach((turn, index) => {
    model = turn.user.model || turn.user.modelChange || model;
    turn.model = model;
    const last = index === turns.length - 1;
    turn.active = last && ['preparing','running','waiting','stopping'].includes(run.status);
    turn.outcome=turn.active?undefined:turn.user.timing?.outcome||(last?(run.status==='failed'?'failed':run.status==='interrupted'?'interrupted':'completed'):'completed');
    const answers = turn.messages.filter(message => message.role === 'assistant' && !message.kind);
    turn.final = [...answers].reverse().find(message => message.phase === 'final_answer');
    // Unclassified legacy providers can only be resolved once the turn has ended.
    const completed = turn.user.timing?.outcome === 'completed' || (!turn.user.timing?.outcome && (!last || run.status === 'completed'));
    if (!turn.final && completed) turn.final = [...answers].reverse().find(message => !message.phase);
  });
  return turns;
}
