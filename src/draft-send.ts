import type {Task} from './types';

// Refresh only the optimistic-lock metadata, never silently adopt changed content.
export function draftForSend(opened:Task,tasks:Task[]):Task{
 const latest=tasks.find(task=>task.id===opened.id);
 if(!latest)throw new Error('这份草稿已被发送或删除。你的输入仍保留，请重新打开聊天后再继续。');
 if(latest.archivedAt)throw new Error('这份草稿已被归档。你的输入仍保留，请先还原草稿。');
 const content=(task:Task)=>JSON.stringify([task.id,task.title,task.prompt,task.projectId,task.modelId,task.status,task.createdAt,task.selectedSkillIds||[]]);
 if(content(latest)!==content(opened))throw new Error('这份草稿的内容已更新。你的输入仍保留，请重新打开草稿并核对后再发送。');
 if(!Number.isSafeInteger(latest.revision))throw new Error('草稿信息尚未就绪。请重新启动 Amblelost 后再试。');
 return latest;
}
