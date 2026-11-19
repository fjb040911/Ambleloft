import type {AgentRun} from './types';
export const runStatus = { preparing: '正在准备', running: '执行中', waiting: '等待审批', stopping: '正在停止', completed: '本轮已结束', failed: '执行失败', interrupted: '已停止 / 中断' };
export const isRunning = (run: AgentRun) => ['preparing', 'running', 'waiting', 'stopping'].includes(run.status);
