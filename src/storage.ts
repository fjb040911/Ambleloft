import type { Device, Workspace } from './types';

const key = 'atelier.workspace.v1';
export const emptyWorkspace = (): Workspace => ({ tasks: [], projects: [], theme: 'system' });
export const bridge = {
  async load(): Promise<Workspace> {
    if (window.desktop) return window.desktop.readWorkspace();
    const raw = localStorage.getItem(key);
    if (!raw) return emptyWorkspace();
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.tasks) || !Array.isArray(state.projects) || !['system', 'light', 'dark'].includes(state.theme) ||
        !state.tasks.every((task: Record<string, unknown>) => task && typeof task.id === 'string' && typeof task.title === 'string' &&
          typeof task.prompt === 'string' && typeof task.modelId === 'string' && typeof task.createdAt === 'string' && task.status === 'draft' &&
          (task.projectId === null || typeof task.projectId === 'string')) ||
        !state.projects.every((project: Record<string, unknown>) => project && typeof project.id === 'string' && typeof project.name === 'string' &&
          typeof project.path === 'string' && typeof project.createdAt === 'string')) throw new Error('工作台数据无法读取，请保留数据后重试。');
    return state;
  },
  async save(state: Workspace) {
    if (window.desktop) return window.desktop.saveWorkspace(state);
    localStorage.setItem(key, JSON.stringify(state));
  },
  async device(): Promise<Device> {
    if (window.desktop) return window.desktop.getDevice();
    return { name: '浏览器预览', chip: '设备信息仅在桌面版可用', memoryGB: null, freeMemoryGB: null, platform: 'browser', arch: '—', mode: 'preview' };
  },
};
