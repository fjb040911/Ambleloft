import {inputToolTitle} from './InputToolRecord';
import type {AgentRun} from './types';
import {t} from './i18n';
type Tool=AgentRun['tools'][number];
export function commandPresentation(tool:Pick<Tool,'label'|'status'|'commandActions'>) {
 const actions=tool.commandActions||[];
 const kinds=new Set(actions.map(action=>action.type));
 if(actions.length&&kinds.size===1&& !kinds.has('unknown')) {
  const kind=actions[0].type;
  const names=actions.map(action=>kind==='read'?(action.name||action.path):kind==='search'?[action.query,action.path].filter(Boolean).join(' · '):action.path||t('当前目录')).filter(Boolean);
  return {kind,title:kind==='read'?'读取文件':kind==='search'?'搜索内容':'浏览目录',summary:[...new Set(names)].join(' · ')};
 }
 // Older history has no structured actions. Only recognize unambiguous single commands.
 let command=tool.label.trim();
 const shell=command.match(/^(?:\/[^\s]+\/)?(?:zsh|bash|sh) -[a-z]*c (['"])([\s\S]*)\1$/);
 if(shell)command=shell[2];
 if(!/[;&|<>`$\n]/.test(command)) {
  const read=command.match(/^cat\s+(?:--\s+)?([\w./-]+)$/);
  if(read)return {kind:'read',title:'读取文件',summary:read[1]};
 }
 return {kind:'unknown',title:tool.status==='completed'?'已运行':'运行命令',summary:command};
}

export const toolBusy=(status:string)=>['inProgress','running','pending'].includes(status);
export function toolSummary(tool:AgentRun['tools'][number]):string {
 if(tool.type==='commandExecution')return commandPresentation(tool).summary;
 if(tool.type==='contextCompaction')return '';
 const inputTitle=inputToolTitle(tool.label);if(inputTitle)return t(inputTitle);
 if(tool.progress)return tool.progress;
 try {
  const data=JSON.parse(tool.detail);
  if(tool.type==='webSearch')return data.action?.url||data.query||data.action?.query||'';
  if(tool.type==='fileChange'&&Array.isArray(data))return data.map(item=>item.path?.split('/').pop()).filter(Boolean).join(' · ');
  if(tool.type==='mcpToolCall')return String(data.arguments?.query||data.arguments?.path||data.arguments?.url||tool.label);
 }catch{/* Command output is plain text. */}
 return tool.label;
}
