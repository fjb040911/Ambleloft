import type { Device, Workspace, WorkspaceChange } from './types';

const key = 'atelier.workspace.v1';
export const emptyWorkspace = (): Workspace => ({ tasks: [], projects: [], theme: 'system' });
export function workspaceChanges(before:Workspace, after:Workspace):WorkspaceChange[] {
  const changes:WorkspaceChange[]=[],deletes:WorkspaceChange[]=[];
  for(const [kind,key] of [['project','projects'],['draft','tasks']] as const){
    for(const item of after[key]){
      const previous=before[key].find(p=>p.id===item.id);
      if(!previous||JSON.stringify(previous)!==JSON.stringify(item))changes.push({kind,action:'put',id:item.id,value:item,expectedRevision:previous?.revision??(previous?0:null)});
    }
    for(const item of before[key])if(!after[key].some(p=>p.id===item.id))deletes.push({kind,action:'delete',id:item.id,expectedRevision:item.revision??0});
  }
  // Explicit draft edits run before project deletion cascades, within the same transaction.
  changes.push(...deletes);
  const value:Partial<Pick<Workspace,'theme'|'language'|'fontScale'>>={};
  if(before.theme!==after.theme)value.theme=after.theme;
  if(before.language!==after.language&&after.language!==undefined)value.language=after.language;
  if(before.fontScale!==after.fontScale&&after.fontScale!==undefined)value.fontScale=after.fontScale;
  if(Object.keys(value).length)changes.push({kind:'settings',action:'patch',expectedRevision:before.settingsRevision??0,value});
  return changes;
}
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
  async update(before:Workspace,after:Workspace):Promise<Workspace> {
    if(window.desktop?.patchWorkspace)return window.desktop.patchWorkspace({changes:workspaceChanges(before,after)});
    // Browser preview and older test bridges have no executable extension runtime.
    await bridge.save(after);return after;
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
