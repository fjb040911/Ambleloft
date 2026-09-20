import type { Capability, Model } from './types';

// Product catalog concepts, not installable releases. No unverified size or hardware claims.
export const models: Model[] = [
  { id: 'concept/deepseek', name: 'DeepSeek', publisher: 'DeepSeek', initials: 'D', color: 'blue', description: '从一个问题，到一个清晰的思路。探索中文对话与推理。', tags: ['中文对话', '推理'], location: 'local', details: '本地模型候选。具体模型、量化版本和运行引擎将在兼容性测试后确定。当前没有可下载的模型制品。' },
  { id: 'concept/qwen', name: 'Qwen', publisher: 'Qwen', initials: 'Q', color: 'purple', description: '连接语言与工作，探索多语言资料的理解与整理。', tags: ['多语言', '资料整理'], location: 'local', details: '本地模型候选。目录中的用途是产品规划，具体能力需要按选定版本验证。当前尚未接入推理服务。' },
  { id: 'concept/vision', name: '视觉助手', publisher: '待选型', initials: 'V', color: 'orange', description: '让图片成为上下文，为创意资料增加一个理解视角。', tags: ['图片理解', '创意'], location: 'local', details: '视觉模型能力规划。文本模型不会自动具备图片理解能力，最终模型与运行条件尚未确定。' },
  { id: 'concept/cloud', name: '云端增强', publisher: '待接入', initials: 'C', color: 'green', description: '为更复杂的工作预留空间，在你的授权范围内使用云端。', tags: ['端云协作', '按需使用'], location: 'cloud', details: '云端服务尚未接入。选择此项仅保存草稿偏好，不会上传资料或产生模型费用。服务、授权与计费将在接入时明确。' },
];
export const capabilities: Capability[] = [
  { id: 'organize', name: '整理项目资料', category: '效率工具', description: '梳理文件结构，找到资料之间的联系。', icon: 'folder', color: 'blue', prompt: '帮我梳理这个项目的资料，整理关键内容，并给出清晰的文件分类建议。', permissions: ['读取你选择的项目资料', '向项目产物目录写入结果'] },
  { id: 'write', name: '打磨一个想法', category: '设计创作', description: '把零散灵感，变成可以继续推进的方案。', icon: 'pen', color: 'purple', prompt: '我想打磨一个创意。请先帮我明确目标受众、核心需求和三个可能的方向。', permissions: ['读取当前任务中提供的内容'] },
  { id: 'research', name: '阅读与提炼', category: '知识工作', description: '从长篇资料中提炼重点，保留你的思考。', icon: 'research', color: 'orange', prompt: '请帮我阅读资料，提炼主要观点、支持证据和仍然需要确认的问题。', permissions: ['读取你选择的项目资料', '向项目产物目录写入结果'] },
];
