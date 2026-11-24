const { contextBridge, ipcRenderer, webUtils } = require('electron');

// The main process waits for each 64 KiB frame; slow rendering cannot queue
// repeated snapshots. Only one serialized event is assembled at a time.
if(process.isMainFrame){
 let incoming;
 ipcRenderer.on('agent:frame',(event,frame)=>{
  if(frame.seq===0)incoming={id:frame.id,seq:0,decoder:new TextDecoder(),parts:[]};
  if(!incoming||incoming.id!==frame.id||incoming.seq!==frame.seq)return;
  const state=incoming;state.parts.push(state.decoder.decode(frame.data,{stream:!frame.done}));state.seq++;
  if(frame.done){incoming=undefined;let value;try{value=JSON.parse(state.parts.join(''));}catch(error){console.error('Run delivery failed',error);ipcRenderer.send('agent:ready');return;}finally{state.parts.length=0;}try{ipcRenderer.emit('agent:event',event,value);}catch(error){console.error('Run subscriber failed',error);}}
  ipcRenderer.send('agent:ack',{id:frame.id,seq:frame.seq});
 });
 ipcRenderer.send?.('agent:ready');
}

// Keep the existing snapshot API for integrations. The app consumes raw deltas
// through onRunEvent, avoiding full contextBridge copies on its hot path.
const legacyRunListeners=new Set(),legacyVersions=new Map();
let legacyGeneration=0;
const legacyRunEvent=(_event,value)=>{
 if(!value.kind?.startsWith('run-')){for(const listener of legacyRunListeners)listener(value);return;}
 const generation=legacyGeneration;
 const deliver=snapshot=>{if(generation!==legacyGeneration)return;const id=snapshot.run.id,previous=legacyVersions.get(id);if(previous?.epoch===snapshot.epoch&&previous.revision>=snapshot.revision)return;legacyVersions.set(id,{epoch:snapshot.epoch,revision:snapshot.revision});for(const listener of legacyRunListeners)listener(snapshot.run);};
 if(value.kind==='run-snapshot')deliver(value);
 else void ipcRenderer.invoke('agent:snapshot',{id:value.id}).then(deliver).catch(error=>console.error('Run snapshot unavailable',error));
};

if(process.isMainFrame)contextBridge.exposeInMainWorld('desktop', {
  // Immutable local metadata must be available before the first renderer layout.
  platform: process.platform,
  storage:{
    reasoningPreview:()=>ipcRenderer.invoke('storage:reasoning-preview'),
    cleanReasoning:tokens=>ipcRenderer.invoke('storage:reasoning-clean',tokens),
    snapshot:()=>ipcRenderer.invoke('storage:snapshot'),
    clean:input=>ipcRenderer.invoke('storage:clean',input),
    open:()=>ipcRenderer.invoke('storage:open'),
  },
  retrySave:id=>ipcRenderer.invoke('agent:retry-save',id),
  updates:{...Object.fromEntries(['snapshot','check','download','update','cancel','preferences','restart','schedule','cancelSchedule'].map(action=>[action,input=>ipcRenderer.invoke('update:'+action,input)])),onChanged:listener=>{const h=(_,value)=>listener(value);ipcRenderer.on('update:event',h);return()=>ipcRenderer.removeListener('update:event',h);}},
  growth:Object.fromEntries(['status','jobs','policy','dismiss'].map(action=>[action,input=>ipcRenderer.invoke('growth:'+action,input)])),
  investigation:Object.fromEntries(['start','read','list','cancel','revokeWrite','resume','revokeResume','open'].map(action=>[action,input=>ipcRenderer.invoke('investigation:'+action,input)])),
  expertChat:{...Object.fromEntries(['directory','read','submit','retry','cancel','exclude','revokeTaskContext','source','export'].map(action=>[action,input=>ipcRenderer.invoke('expert-chat:'+action,input)])),onChanged:listener=>{const h=(_,value)=>listener(value);ipcRenderer.on('expert-chat:event',h);return()=>ipcRenderer.removeListener('expert-chat:event',h);}},
  spaces:Object.fromEntries(['changeDiscussionModel','changeDiscussionPermission','followupDiscussion','coordinateDiscussion','retryDiscussionHost','stopDiscussionHost','exportDocument','snapshot','outputs','save','lifecycle','discussionLifecycle','submitDocumentReview','saveDocument','adoptDocument','withdrawDocument','restoreDocument','document','savePlan','suggestPlan','createTaskDraft','discardTaskDraft','saveTaskDraft','checkTaskDraft','answerTaskRelations','saveProjectContext','guideTask','cancelTaskGuide','createGuidedPlan','reviewPlan','controlPlan','knowledge','start'].map(action=>[action,input=>ipcRenderer.invoke('spaces:'+action,input)])),
  workforce:{...Object.fromEntries(['snapshot','save','submit','controlPreparation','remove','activate','roles','createDraft','saveDraft','discardDraft','suggestRole','guideRole','cancelRoleSuggestion','suggestExpertSkills','cancelExpertSkillSuggestion','resolveExpertSkillSuggestion','importLocal','importRepository'].map(action=>[action,input=>ipcRenderer.invoke('workforce:'+action,input)])),onChanged:listener=>{const h=()=>listener();ipcRenderer.on('workforce:event',h);return()=>ipcRenderer.removeListener('workforce:event',h);}},
  creation:{...Object.fromEntries(['read','install','trial'].map(action=>[action,input=>ipcRenderer.invoke('creation:'+action,input)])),onChanged:listener=>{const h=(_,value)=>listener(value);ipcRenderer.on('creation:event',h);return()=>ipcRenderer.removeListener('creation:event',h);}},
  ssh:{...Object.fromEntries(['list','save','connect','disconnect','browse','validate','key','dockerList','dockerEnter','dockerStart'].map(action=>[action,input=>ipcRenderer.invoke('ssh:'+action,input)])),onChanged:listener=>{const h=()=>listener();ipcRenderer.on('ssh:event',h);return()=>ipcRenderer.removeListener('ssh:event',h);}},
  terminal:{...Object.fromEntries(['focus','profiles','list','create','attach','detach','read','write','resize','clear','close'].map(action=>[action,input=>ipcRenderer.invoke('terminal:'+action,input)])),
    onExit:listener=>{const h=(_,session)=>listener(session);ipcRenderer.on('terminal:exit',h);return()=>ipcRenderer.removeListener('terminal:exit',h);}},
  inputs:{list:input=>ipcRenderer.invoke('input:list',input),append:input=>ipcRenderer.invoke('input:append',input),action:input=>ipcRenderer.invoke('input:action',input),onChanged:listener=>{const h=(_event,value)=>listener(value);ipcRenderer.on('input:event',h);return()=>ipcRenderer.removeListener('input:event',h);}},
  forms:{list:input=>ipcRenderer.invoke('forms:list',input),action:async input=>{const value=await ipcRenderer.invoke('forms:action',input);if(value?.uiValidationError)throw Object.assign(new Error(value.uiValidationError.message),{fields:value.uiValidationError.fields});return value;},onChanged:listener=>{const h=()=>listener();ipcRenderer.on('forms:event',h);return()=>ipcRenderer.removeListener('forms:event',h);}},
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
  extensions: {onChanged:listener=>{const handler=()=>listener();ipcRenderer.on('extensions:event',handler);return()=>ipcRenderer.removeListener('extensions:event',handler);},...Object.fromEntries(['automation','details','configuration','list','install','enable','remove','command','rollback','grants','resetConfirmations','activate','development'].map(action=>[action,input=>ipcRenderer.invoke('extensions:'+action,input)]))},
  store: {onOpenError:listener=>{const h=(_event,error)=>listener(error);ipcRenderer.on('catalog-store:open-error',h);return()=>ipcRenderer.removeListener('catalog-store:open-error',h);},...Object.fromEntries(['catalog','install','cancel','pendingOpen','pendingOpenError'].map(action=>[action,input=>ipcRenderer.invoke('catalog-store:'+action,input)])),onChanged:listener=>{const h=()=>listener();ipcRenderer.on('catalog-store:event',h);return()=>ipcRenderer.removeListener('catalog-store:event',h);},onOpen:listener=>{const h=(_event,target)=>listener(target);ipcRenderer.on('catalog-store:open',h);return()=>ipcRenderer.removeListener('catalog-store:open',h);}},
  skills: {onChanged:listener=>{const handler=()=>listener();ipcRenderer.on('skills:event',handler);return()=>ipcRenderer.removeListener('skills:event',handler);},...Object.fromEntries(['list','listSystem','detail','readFile','update','remove','import'].map(action=>[action,input=>ipcRenderer.invoke('skills:'+action,input)]))},
  projectFiles: Object.fromEntries(['context','list','search','read','office','apps','open'].map(action=>[action,input=>ipcRenderer.invoke('files:'+action,input)])),
  selectAttachments: () => ipcRenderer.invoke('attachments:select'),
  readAttachmentImage: input => ipcRenderer.invoke('attachments:image',input),
  readAttachmentSpreadsheet: input => ipcRenderer.invoke('attachments:spreadsheet',input),
  readAttachmentPdf: input => ipcRenderer.invoke('attachments:pdf',input),
  importAttachments: async files => {
    if(!Array.isArray(files)||!files.length||files.length>50)throw Error('最多添加 50 个文件或文件夹');
    let total=0;const items=[];
    for(const file of files){
      const path=webUtils.getPathForFile(file);
      if(path){items.push({path});continue;}
      if((total+=file.size)>25*1024*1024)throw Error('单次粘贴内容不能超过 25 MB');
      items.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});
    }
    return ipcRenderer.invoke('attachments:import',items);
  },
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  copyText: text => ipcRenderer.invoke('clipboard:write-text', text),
  openLink: url => ipcRenderer.invoke('link:open', url),
  getProvider: id => ipcRenderer.invoke('provider:get', id),
  listProviders: () => ipcRenderer.invoke('provider:list'),
  setDefaultProvider: id => ipcRenderer.invoke('provider:default', id),
  removeProvider: id => ipcRenderer.invoke('provider:remove', id),
  saveProvider: input => ipcRenderer.invoke('provider:save', input),
  testProvider: id => ipcRenderer.invoke('provider:test', id),
  editRun: input => ipcRenderer.invoke('agent:edit', input),
  exportRunDiagnostics: input => ipcRenderer.invoke('agent:export-diagnostics', input),
  openProject: id => ipcRenderer.invoke('project:open', id),
  getRunRequestState: input => ipcRenderer.invoke('agent:request-state',input),
  getMessageText: input => ipcRenderer.invoke('agent:message-text',input),
  copyRunMessages: input => ipcRenderer.invoke('agent:copy-messages',input),
  getToolText: input => ipcRenderer.invoke('agent:tool-text',input),
  setRunDetails: ids => ipcRenderer.send('agent:subscribe',ids),
  getRunSnapshot: input => ipcRenderer.invoke('agent:snapshot',input),
  getRunPage: input => ipcRenderer.invoke('agent:history',input),
  touchSearchItem: input => ipcRenderer.invoke('workspace:search-touch',input),
  searchWorkspace: input => ipcRenderer.invoke('workspace:search',input),
  listRuns: () => ipcRenderer.invoke('agent:list'),
  startRun: input => ipcRenderer.invoke('agent:start', input),
  composerSendStatus: input => ipcRenderer.invoke('agent:composer-status', input),
  downloadArtifact: input => ipcRenderer.invoke('artifact:download', input),
  accessArtifact: input => ipcRenderer.invoke('artifact:access', input),
  artifactAvailability: input => ipcRenderer.invoke('artifact:availability',input),
  switchRunModel: input => ipcRenderer.invoke('agent:model',input),
  switchRunPermission: input => ipcRenderer.invoke('agent:permission',input),
  stopRun: id => ipcRenderer.invoke('agent:stop', id),
  answerRun: input => ipcRenderer.invoke('agent:answer',input),
  approveRun: input => ipcRenderer.invoke('agent:approve', input),
  onRunEvent: callback => {
    const listener=(_event,value)=>callback(value);ipcRenderer.on('agent:event',listener);
    return()=>ipcRenderer.removeListener('agent:event',listener);
  },
  onRun: callback => {
    if(!legacyRunListeners.size)ipcRenderer.on('agent:event',legacyRunEvent);
    legacyRunListeners.add(callback);
    return()=>{legacyRunListeners.delete(callback);if(!legacyRunListeners.size){ipcRenderer.removeListener('agent:event',legacyRunEvent);legacyGeneration++;legacyVersions.clear();}};
  },
  onOpenConversation:callback=>{const listener=(_event,ref)=>callback(ref);ipcRenderer.on('extension:open-conversation',listener);return()=>ipcRenderer.removeListener('extension:open-conversation',listener);},
  openWindowMenu: () => ipcRenderer.invoke('window:menu'),
  setWindowChrome: input => ipcRenderer.invoke('window:chrome',input),
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

ipcRenderer.on('extension-page:focus-host',()=>{
  const target = document.querySelector('[data-extension-host-focus]') || document.querySelector('.toolbar .icon-button');
  target?.focus();
});
