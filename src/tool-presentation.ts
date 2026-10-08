import type {AgentRun} from './types';
import {t} from './i18n';
type Tool=AgentRun['tools'][number];
export function commandPresentation(tool:Tool) {
 const actions=tool.commandActions||[];
 const kinds=new Set(actions.map(action=>action.type));
 if(actions.length&&kinds.size===1&& !kinds.has('unknown')) {
  const kind=actions[0].type;
  const names=actions.map(action=>kind==='read'?(action.name||action.path):kind==='search'?[action.query,action.path].filter(Boolean).join(' · '):action.path||t('当前目录')).filter(Boolean);
  return {kind,title:kind==='read'?'读取文件':kind==='search'?'搜索内容':'浏览目录',summary:[...new Set(names)].join(' · ')};
 }
 // Older history has no structured actions. Only recognize unambiguous single commands.
 let command=tool.label.trim();
 const shell=command.match(/^(?:\/[^\s]+\/)?(?:zsh|bash|sh) -[a-z]*c '([^']*)'$/);
 if(shell)command=shell[1];
 if(!/[;&|<>`$\n]/.test(command)) {
  const read=command.match(/^cat\s+(?:--\s+)?([\w./-]+)$/);
  if(read)return {kind:'read',title:'读取文件',summary:read[1]};
  const script=command.match(/^(?:python3?|node|bash|sh)\s+([\w./-]+\.(?:py|js|mjs|cjs|sh))(?:\s|$)/);
  if(script)return {kind:'unknown',title:'运行脚本',summary:script[1]};
  if(/^(?:npm|pnpm|yarn|bun) (?:run )?test(?:\s|$)|^npx (?:playwright test|vitest)(?:\s|$)/.test(command))return {kind:'unknown',title:'运行测试',summary:''};
 }
 return {kind:'unknown',title:actions.length>1?'执行多项操作':'运行命令',summary:t('终端操作')};
}
