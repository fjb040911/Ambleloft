const { contextBridge, ipcRenderer } = require('electron');

if(process.isMainFrame)contextBridge.exposeInMainWorld('desktop', {
  forms:{list:input=>ipcRenderer.invoke('forms:list',input),action:input=>ipcRenderer.invoke('forms:action',input),onChanged:listener=>{const h=()=>listener();ipcRenderer.on('forms:event',h);return()=>ipcRenderer.removeListener('forms:event',h);}},
  taskApps:{onContextChanged:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('task-app:context',handler);return()=>ipcRenderer.removeListener('task-app:context',handler);},...Object.fromEntries(['open','close','rpc'].map(method=>[method,input=>ipcRenderer.invoke('task-app:'+method,input)])),onClosed:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('task-app:closed',handler);return()=>ipcRenderer.removeListener('task-app:closed',handler);}},
  authentication:{sessions:()=>ipcRenderer.invoke('auth:sessions'),disconnect:input=>ipcRenderer.invoke('auth:disconnect',input),connections:input=>ipcRenderer.invoke('auth:connections',input),onChanged:listener=>{const handler=()=>listener();ipcRenderer.on('auth:event',handler);return()=>ipcRenderer.removeListener('auth:event',handler);}},
  messages:{...Object.fromEntries(['list','sources','markRead','dismiss','bulk','setPreferences','execute'].map(method=>[method,input=>ipcRenderer.invoke('messages:'+method,input)])),onChanged:listener=>{const handler=()=>listener();ipcRenderer.on('messages:event',handler);return()=>ipcRenderer.removeListener('messages:event',handler);}},
  newWindow:()=>ipcRenderer.invoke('window:new'),
  extensionPage:{
   ...Object.fromEntries(['open','layout','close','context'].map(action=>[action,input=>ipcRenderer.invoke('extension-page:'+action,input)])),
   overlay:input=>ipcRenderer.sendSync('extension-page:overlay',input),
   respond:input=>ipcRenderer.invoke('extension:interaction-response',input),
   onClosed:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('extension-page:closed',handler);return()=>ipcRenderer.removeListener('extension-page:closed',handler);},
   onInteraction:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('extension:interaction',handler);return()=>ipcRenderer.removeListener('extension:interaction',handler);},
   onInteractionClose:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('extension:interaction-close',handler);return()=>ipcRenderer.removeListener('extension:interaction-close',handler);}
  },
  extensions: {onChanged:listener=>{const handler=()=>listener();ipcRenderer.on('extensions:event',handler);return()=>ipcRenderer.removeListener('extensions:event',handler);},...Object.fromEntries(['details','configuration','list','install','enable','remove','command','rollback','grants','resetConfirmations','activate','development'].map(action=>[action,input=>ipcRenderer.invoke('extensions:'+action,input)]))},
  skills: Object.fromEntries(['list','detail','readFile','update','remove','import'].map(action=>[action,input=>ipcRenderer.invoke('skills:'+action,input)])),
  projectFiles: Object.fromEntries(['context','list','search','read','office','apps','open'].map(action=>[action,input=>ipcRenderer.invoke('files:'+action,input)])),
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
  touchSearchItem: input => ipcRenderer.invoke('workspace:search-touch',input),
  searchWorkspace: input => ipcRenderer.invoke('workspace:search',input),
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
  onOpenConversation:callback=>{const listener=(_event,ref)=>callback(ref);ipcRenderer.on('extension:open-conversation',listener);return()=>ipcRenderer.removeListener('extension:open-conversation',listener);},
  getDevice: () => ipcRenderer.invoke('device:get'),
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  saveWorkspace: (state) => ipcRenderer.invoke('workspace:save', state),
  patchWorkspace: (input) => ipcRenderer.invoke('workspace:patch', input),
  onWorkspace: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('workspace:event',listener);return()=>ipcRenderer.removeListener('workspace:event',listener);},
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
});

ipcRenderer.on('extension-page:focus-host',()=>document.querySelector('.toolbar .icon-button')?.focus());
