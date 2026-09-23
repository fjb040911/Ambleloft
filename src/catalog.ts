import type { Capability } from './types';

// Built-in prompt starters; these are not installed extensions.
export const capabilities: Capability[] = [
  { id: 'organize', name: '整理项目资料', category: '效率工具', description: '梳理文件结构，找到资料之间的联系。', icon: 'folder', color: 'blue', prompt: '帮我梳理这个项目的资料，整理关键内容，并给出清晰的文件分类建议。', permissions: ['读取你选择的项目资料', '向项目产物目录写入结果'] },
  { id: 'write', name: '打磨一个想法', category: '设计创作', description: '把零散灵感，变成可以继续推进的方案。', icon: 'pen', color: 'purple', prompt: '我想打磨一个创意。请先帮我明确目标受众、核心需求和三个可能的方向。', permissions: ['读取当前任务中提供的内容'] },
  { id: 'research', name: '阅读与提炼', category: '知识工作', description: '从长篇资料中提炼重点，保留你的思考。', icon: 'research', color: 'orange', prompt: '请帮我阅读资料，提炼主要观点、支持证据和仍然需要确认的问题。', permissions: ['读取你选择的项目资料', '向项目产物目录写入结果'] },
];
