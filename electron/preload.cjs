const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  skills: Object.fromEntries(['list','detail','update','remove','import'].map(action=>[action,input=>ipcRenderer.invoke('skills:'+action,input)])),
  projectFiles: Object.fromEntries(['context','list','search','read','apps','open'].map(action=>[action,input=>ipcRenderer.invoke('files:'+action,input)])),
  selectAttachments: () => ipcRenderer.invoke('attachments:select'),
  copyText: text => ipcRenderer.invoke('clipboard:write-text', text),
  openLink: url => ipcRenderer.invoke('link:open', url),
  getProvider: id => ipcRenderer.invoke('provider:get', id),
  listProviders: () => ipcRenderer.invoke('provider:list'),
  setDefaultProvider: id => ipcRenderer.invoke('provider:default', id),
  removeProvider: id => ipcRenderer.invoke('provider:remove', id),
  saveProvider: input => ipcRenderer.invoke('provider:save', input),
  testProvider: id => ipcRenderer.invoke('provider:test', id),
  editRun: input => ipcRenderer.invoke('agent:edit', input),
  openProject: id => ipcRenderer.invoke('project:open', id),
  getRunPage: input => ipcRenderer.invoke('agent:history',input),
  listRuns: () => ipcRenderer.invoke('agent:list'),
  startRun: input => ipcRenderer.invoke('agent:start', input),
  accessArtifact: input => ipcRenderer.invoke('artifact:access', input),
  stopRun: id => ipcRenderer.invoke('agent:stop', id),
  answerRun: input => ipcRenderer.invoke('agent:answer',input),
  approveRun: input => ipcRenderer.invoke('agent:approve', input),
  onRun: callback => {
    const listener = (_event, run) => callback(run);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  getDevice: () => ipcRenderer.invoke('device:get'),
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  saveWorkspace: (state) => ipcRenderer.invoke('workspace:save', state),
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
});
