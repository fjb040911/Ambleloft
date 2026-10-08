const {summary,pageRun}=require('./history-pages.cjs');
const { app, BrowserWindow, ipcMain, Menu, dialog, session, safeStorage, shell, clipboard, protocol, nativeTheme, Notification, powerMonitor } = require('electron');
const {accessArtifact} = require('./artifacts.cjs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Database } = require('./database.cjs');
const { probeProvider } = require('./provider.cjs');
const { inspectEngine } = require('./engine.cjs');
const { configureSecureStorage, createSecureStorage } = require('./secure-storage.cjs');

protocol.registerSchemesAsPrivileged([{scheme:'amble-app',privileges:{standard:true,secure:true}}, {scheme:'amble-extension',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}, {scheme:'atelier-preview',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
configureSecureStorage(app);
app.setName('Ambleloft');
// Keep the legacy profile path so renaming the product preserves sessions and encrypted credentials.
// Keep Electron's explicit test/profile switch usable.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'Atelier'));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let pageHost;let taskApps;let profileId;
let store;
let database;
let runtime;
let extensionServiceForShutdown;
let messageServiceForShutdown;
let authenticationForShutdown;
let quitting = false;
let configBusy = false;
const devURL = !app.isPackaged && process.env.ATELIER_DEV === '1' ? 'http://127.0.0.1:5173' : null;
const entry = path.join(__dirname, '../dist/index.html');
const trustedURL = devURL || pathToFileURL(entry).href;

const {WindowRegistry}=require('./window-registry.cjs');
const windows=new WindowRegistry(trustedURL);
function authorize(event){return windows.authorize(event);}
async function hostDialog(method,owner,options){const resume=pageHost?.suspend(owner);try{return await dialog[method](owner,options);}finally{resume?.();}}

function createWindow() {
  const window = new BrowserWindow({
    width: 1240, height: 840, minWidth: 760, minHeight: 560,
    title: 'Ambleloft', backgroundColor: '#f8f9fb',
    icon: path.join(__dirname, '../dist/brand/icon-512.png'),
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 23 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const record=windows.add(window,profileId);
  window.webContents.on('did-start-navigation',(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame&&!inPlace){pageHost?.resetOwner(record);taskApps?.closeOwner(record);}});
  window.once('closed',()=>{pageHost?.resetOwner(record);taskApps?.closeOwner(record);});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', event => {
    if (!event.isMainFrame) {
      // App documents cannot navigate into another privileged document or remote site.
      if (event.frame?.url?.startsWith('amble-app:') || (!event.url.startsWith('atelier-preview://') && !event.url.startsWith('amble-app://'))) event.preventDefault();
    }
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== trustedURL && url !== `${trustedURL}/`) event.preventDefault();
  });
  if (devURL) window.loadURL(devURL); else window.loadFile(entry);
  return window;
}

app.on('second-instance', () => { const window=windows.focused();if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, '../public/brand/icon-512.png'));
  if (!primaryInstance) return;
  database = new Database(app.getPath('userData'));
  try { await database.call('ready'); } catch (error) {
    dialog.showErrorBox('无法打开数据库', error.message);
    await database.close().catch(() => {}); app.quit(); return;
  }
  const services=require('../core/services.cjs').createCoreServices({
    directory:app.getPath('userData'),database,encryption:createSecureStorage(app,safeStorage),
    publish:run=>windows.broadcast(profileId,'agent:event',pageRun(run))
  });
  store=services.workspace;runtime=services.tasks;
  const skills=services.skills;
  let extensionError='';
  try{await services.extensions.initialize();}catch(error){extensionError=error.message;}
  profileId=await database.call('readSetting',{key:'extensions.profile'});
  services.messages.locale=app.getLocale();
  services.extensions.options.locale=(await store.read()).language==='system'?app.getLocale():(await store.read()).language||app.getLocale();
  services.messages.publish=()=>windows.broadcast(profileId,'messages:event');
  services.messages.notify=message=>{
    if(!Notification.isSupported())return;
    const notification=new Notification({title:message.title,body:message.body});
    notification.on('click',()=>{const target=windows.focused();if(!target)return;if(target.isMinimized())target.restore();target.show();target.focus();target.webContents.send('menu:command','messages');});
    notification.on('failed',()=>{});
    notification.show();
  };
  services.messages.start();messageServiceForShutdown=services.messages;
  const authentication=new (require('../core/auth/extension-auth.cjs').ExtensionAuthentication)({database,extensions:services.extensions,encryption:services.extensions.options.encryption,openBrowser:url=>shell.openExternal(url),publish:()=>{windows.broadcast(profileId,'auth:event');services.extensions.hosts?.authenticationChanged();},chooseConnection:async(owner,{extensionName,resource,connections,defaultId})=>{
    if(!connections.length){await hostDialog('showMessageBox',owner.window,{type:'info',message:'请先添加企业连接',detail:'打开设置 > 账号，填写企业管理员提供的身份服务地址和应用标识。'});return null;}
    const sorted=[...connections].sort((a,b)=>Number(b.id===defaultId)-Number(a.id===defaultId));
    const answer=await hostDialog('showMessageBox',owner.window,{type:'question',message:extensionName+' 希望连接你的业务账号',detail:'服务：'+resource.title+'\n地址：'+resource.baseUrl+'\n申请权限：'+(resource.scopes.join('、')||'基本身份信息')+'\n请选择企业连接。登录凭据由 Amblelost 保管。',buttons:['取消',...sorted.map(c=>c.name+' · '+c.issuer)],defaultId:0,cancelId:0});return sorted[answer.response-1]?.id||null;
  }});services.extensions.authentication=authentication;authenticationForShutdown=authentication;
  ipcMain.handle('auth:sessions',(event)=>{authorize(event);return authentication.list();});
  ipcMain.handle('auth:disconnect',(event,input)=>{authorize(event);return authentication.remove(input.id);});
  ipcMain.handle('auth:connections',async(event,input)=>{authorize(event);const result=await database.call('authConnections',input);if(input?.action&&input.action!=='list'){await authentication.connectionsChanged();windows.broadcast(profileId,'auth:event');}return result;});
  for(const method of ['list','sources','markRead','dismiss','bulk','setPreferences'])ipcMain.handle('messages:'+method,(event,input)=>{authorize(event);return services.messages[method](input);});
  const extensionService=()=>{if(extensionError)throw new Error('扩展数据无法读取：'+extensionError);return services.extensions;};
  const {HostManager}=require('../core/extensions/hosts.cjs');
  const {createProcessAdapter}=require('./extensions/process-adapter.cjs');
  const extensionHosts=new HostManager({service:services.extensions,adapter:createProcessAdapter(require('electron').utilityProcess,app.getLocale()),publish:()=>windows.broadcast(profileId,'extensions:event')});
  powerMonitor.on('suspend',()=>extensionHosts.suspend());
  powerMonitor.on('resume',()=>extensionHosts.resume());
  services.extensions.attachHosts(extensionHosts);extensionServiceForShutdown=services.extensions;
  const {PageHost}=require('./extensions/page-host.cjs');
  pageHost=new PageHost({electron:require('electron'),registry:windows,service:services.extensions,workspace:store,locale:app.getLocale(),external:async(owner,url)=>{try{const target=new URL(url);if(!['https:','http:'].includes(target.protocol)||target.username||target.password)return;const answer=await hostDialog('showMessageBox',owner,{type:'question',message:'在系统浏览器打开链接？',detail:target.href,buttons:['取消','打开'],defaultId:0,cancelId:0});if(answer.response===1)await shell.openExternal(target.href);}catch{}}});
  const {OperationRouter}=require('../core/extensions/operations.cjs');
  const operationRouter=new OperationRouter({service:services.extensions,workspace:store,
   confirm:(binding,payload)=>{const owner=binding.context.owner;if(!owner||owner.window.isDestroyed())throw Object.assign(Error('INTERACTION_REQUIRED'),{code:'INTERACTION_REQUIRED'});return pageHost.interactions.request(owner,payload,binding.abort.signal);},
   publishWorkspace:state=>windows.broadcast(profileId,'workspace:event',state),
   openConversation:async(context,ref)=>{const owner=context.owner;if(!owner||owner.window.isDestroyed())throw Object.assign(Error('INTERACTION_REQUIRED'),{code:'INTERACTION_REQUIRED'});owner.window.webContents.send('extension:open-conversation',ref);owner.window.focus();}
  });
  services.messages.router=operationRouter;
  ipcMain.handle('messages:execute',(event,input)=>services.messages.execute(input,authorize(event)));
  pageHost.router=operationRouter;runtime.extensionRouter=operationRouter;
  const forms=new (require('../core/forms/service.cjs').FormService)({database,skills:services.skills,extensions:services.extensions,runtime,router:operationRouter,publish:()=>windows.broadcast(profileId,'forms:event'),confirm:async(owner,title,text)=>(await hostDialog('showMessageBox',owner.window,{type:'question',message:'发送填写的表单？',detail:title+'\n\n'+text,buttons:['取消','发送到当前聊天'],defaultId:0,cancelId:0})).response===1});runtime.forms=forms;
  ipcMain.handle('forms:list',(event,input)=>{authorize(event);return forms.list(input.runId);});
  ipcMain.handle('forms:action',(event,input)=>forms.action(input,authorize(event)));

  const {McpApps}=require('../core/extensions/mcp-apps.cjs');
  taskApps=new McpApps({service:services.extensions,router:operationRouter,runtime,locale:()=>services.extensions.options.locale,theme:()=>nativeTheme.shouldUseDarkColors?'dark':'light'});runtime.mcpApps=taskApps;
  protocol.handle('amble-app',request=>taskApps.document(request.url));
  ipcMain.handle('task-app:open',(event,input)=>taskApps.open(authorize(event),input));
  ipcMain.handle('task-app:close',(event,input)=>taskApps.close(authorize(event),input.sessionId));
  ipcMain.handle('task-app:rpc',(event,input)=>taskApps.rpc(authorize(event),input.sessionId,input.message));
  services.extensions.options.invalidatePages=id=>{operationRouter.invalidate(id);pageHost.invalidate(id);taskApps.invalidate(id);};
  services.extensions.options.pageChanged=(id,action)=>{operationRouter.invalidate(id);pageHost.changed(id,action);taskApps.invalidate(id);};
  services.extensions.options.publish=()=>windows.broadcast(profileId,'extensions:event');
  ipcMain.handle('window:new',event=>{authorize(event);createWindow();return true;});
  ipcMain.handle('extensions:development',(event,input)=>pageHost.configureDevelopment(event,input,async(owner,origin)=>(await hostDialog('showMessageBox',owner,{type:'warning',message:'允许本地开发页面访问此扩展的页面桥？',detail:origin+'\n只在本次应用会话中启用，请确保该端口由你控制。',buttons:['取消','允许'],defaultId:0,cancelId:0})).response===1));
  ipcMain.handle('extension-page:open',(event,input)=>pageHost.open(event,input));
  ipcMain.handle('extension-page:layout',(event,input)=>pageHost.setLayout(event,input));
  ipcMain.handle('extension-page:close',(event,input)=>{const owner=authorize(event);pageHost.closeOwner(owner.id,input?.slotId);});
  ipcMain.on('extension-page:overlay',(event,input)=>{try{const owner=authorize(event);if(typeof input?.key!=='string'||input.key.length>100)throw Error('INVALID_ARGUMENT');pageHost.overlay(owner.window,input.key,input.enabled===true);event.returnValue=true;}catch{event.returnValue=false;}});
  ipcMain.handle('extension-page:context',(event,input)=>pageHost.updateContext(event,input));
  ipcMain.handle('extension-page:rpc',(event,input)=>pageHost.rpc(event,input));
  ipcMain.on('extension-page:cancel',(event,input)=>{try{pageHost.cancel(event,input);}catch{}});
  ipcMain.handle('extension:interaction-response',(event,input)=>pageHost.interactions.respond(event,input));
  nativeTheme.on('updated',()=>{taskApps.contextChanged();for(const p of pageHost.owners.values())p.view?.webContents.send('extension-page:context',pageHost.context(p));});
  ipcMain.handle('extensions:activate',async(event,id)=>{authorize(event);return extensionService().startHost(id);});
  ipcMain.handle('extensions:configuration',(event,input)=>{authorize(event);return extensionService().configuration(input);});
  ipcMain.handle('extensions:details',(event,id)=>{authorize(event);return require('../core/extensions/details.cjs').extensionDetails(extensionService(),id);});
  ipcMain.handle('extensions:list',event=>{const owner=authorize(event);return extensionService().snapshot(pageHost.contexts.get(owner.id)?.projectId);});
  const confirmPackage=async (window,revision)=>{
    const answer=await hostDialog('showMessageBox',window,{type:'warning',title:'信任扩展代码',message:`信任 ${revision.id} v${revision.manifest.version}？`,detail:`摘要：${revision.digest}\n此扩展包含开发者提供的代码。Node 扩展可使用当前用户的系统权限，资源授权只限制宿主核心 API，不是系统沙箱。\n声明权限：${(revision.manifest.permissions||[]).map(p=>p.capability+' ('+p.scope+')').join(', ')||'无'}\n更新和恢复旧版都会清除已有资源授权。启用后可按声明启动独立 Node 后台；静态扩展页面可打开，Agent 操作入口尚未开放。`,buttons:['取消','信任并安装'],defaultId:0,cancelId:0});return answer.response===1;
  };
  ipcMain.handle('extensions:install',async (event,input)=>{
    const window=authorize(event).window;const development=input?.development===true;
    const selection=await hostDialog('showOpenDialog',window,{title:development?'选择扩展开发目录':'安装或更新扩展',properties:[development?'openDirectory':'openFile'],...(!development?{filters:[{name:'Extension',extensions:['amble-extension','zip','json']}]}:{})});
    if(selection.canceled||!selection.filePaths[0])return extensionService().snapshot();const source=selection.filePaths[0];
    if(development||!source.toLowerCase().endsWith('.json'))return extensionService().installPackage(source,development?'directory':'archive',revision=>confirmPackage(window,revision));
    const fs=require('node:fs/promises');const file=await fs.open(source,'r');let manifest;
    try{const stat=await file.stat();if(!stat.isFile()||stat.size>256*1024)throw new Error('扩展清单不能超过 256 KB');manifest=JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
    require('../core/extensions/registry.cjs').validate(manifest);
    const confirmation=await hostDialog('showMessageBox',window,{type:'question',title:'安装扩展',message:`安装 ${manifest.name}？`,detail:'此旧版声明式扩展只能添加文本页面和导航命令，不执行代码。',buttons:['取消','安装'],defaultId:0,cancelId:0});
    return confirmation.response===1?extensionService().install(manifest):extensionService().snapshot();
  });
  ipcMain.handle('extensions:enable',(event,input)=>{authorize(event);return extensionService().setEnabled(input?.id,input?.enabled);});
  ipcMain.handle('extensions:remove',async(event,id)=>{const window=authorize(event).window;
    const answer=await hostDialog('showMessageBox',window,{type:'question',title:'卸载扩展',message:'是否保留扩展私有数据？',detail:'项目和任务不会删除。重新安装需要重新信任和授权。',buttons:['取消','卸载并保留数据','卸载并删除数据'],defaultId:0,cancelId:0});
    return answer.response===0?extensionService().snapshot():extensionService().remove(id,answer.response===2);
  });
  ipcMain.handle('extensions:rollback',(event,input)=>{const window=authorize(event).window;return extensionService().rollback(input?.id,input?.digest,revision=>confirmPackage(window,revision));});
  ipcMain.handle('extensions:resetConfirmations',async(event,input)=>{authorize(event);const item=extensionService().items.find(i=>i.id===input?.id);if(!item||item.kind!=='package')throw Error('NOT_FOUND');return extensionService().setGrants(item.id,item.grants||[],item.generation);});
  ipcMain.handle('extensions:grants',async(event,input)=>{const window=authorize(event).window;
    const item=extensionService().items.find(i=>i.id===input?.id);if(!item||item.kind!=='package')throw Error('扩展不存在');
    if(input.revoke)return extensionService().setGrants(item.id,[]);
    const generation=item.generation;const permissions=require('../core/extensions/grant-selection.cjs').selectGrantPermissions(item.manifest.permissions||[],input.capabilities);let projectId;
    if(permissions.some(p=>p.scope==='project')){
      const projects=(await store.read()).projects;if(!projects.length)throw Error('请先创建项目');
      if(typeof input.projectId!=='string'||!projects.some(p=>p.id===input.projectId))throw Error('请选择有效项目');projectId=input.projectId;
    }
    const answer=await hostDialog('showMessageBox',window,{type:'question',title:'扩展资源授权',message:`允许 ${item.id} 使用以下宿主资源权限？`,detail:(projectId?'项目：'+(await store.read()).projects.find(p=>p.id===projectId)?.name+'\n':'')+permissions.map(p=>p.capability+' · '+(p.scope==='self'?'扩展私有资源':'所选项目')).join('\n')||'未声明资源权限',buttons:['取消','授权'],defaultId:0,cancelId:0});
    if(answer.response!==1)return extensionService().snapshot();if(extensionService().items.find(i=>i.id===item.id)?.generation!==generation)throw Error('扩展已更新，请重新授权');
    return extensionService().setGrants(item.id,[...(item.grants||[]),...permissions.map(p=>({capability:p.capability,resource:p.scope==='self'?'self':'project:'+projectId}))],generation);
  });
  ipcMain.handle('extensions:command',(event,id)=>{const owner=authorize(event);return extensionService().execute(id,pageHost.contexts.get(owner.id)?.projectId);});

  for (const action of ['list','detail','readFile','update','remove']) ipcMain.handle('skills:'+action,(event,input)=>{authorize(event);return skills[action](input);});
  const skillImports=new Map();
  ipcMain.handle('skills:import',async(event,options={})=>{
    const window=authorize(event).window;let source;
    if(options.token){source=skillImports.get(options.token);if(!source)throw new Error('导入已过期，请重新选择文件夹');}
    else {const result=await hostDialog('showOpenDialog',window,{title:'导入 Skill 文件夹',properties:['openDirectory']});if(result.canceled)return null;source=result.filePaths[0];}
    const result=await skills.importFolder(source,options);
    if(result.duplicate){const token=require('node:crypto').randomUUID();if(skillImports.size>=20)skillImports.delete(skillImports.keys().next().value);skillImports.set(token,source);return {...result,token};}
    if(options.token)skillImports.delete(options.token);return result;
  });
  const provider=services.providers;
  const files=services.files;
  protocol.handle('atelier-preview', request=>files.resource(request));
  for (const action of ['context','list','search','read','office','apps']) ipcMain.handle('files:'+action,(event,input)=>{authorize(event);return files[action](input);});
  ipcMain.handle('files:open',(event,input)=>{const window=authorize(event).window;return files.open(input,{shell,dialog:{showOpenDialog:(owner,options)=>hostDialog('showOpenDialog',owner,options)},window});});
  let runtimeError = '';
  try { await runtime.init(); } catch (error) { runtimeError = error.message; }
  const checkRuntime = () => { if (runtimeError) throw new Error(runtimeError); };
  ipcMain.handle('clipboard:write-text', (event, value) => {
    authorize(event);
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) throw new Error('复制内容无效或超过 2 MB');
    clipboard.writeText(value);
  });
  ipcMain.handle('link:open', async (event, value) => {
    authorize(event);
    if (typeof value !== 'string' || value.length > 8000) throw new Error('链接无效');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持网页链接');
    await shell.openExternal(url.href);
  });
  ipcMain.handle('provider:list', event => { authorize(event); return provider.list(); });
  ipcMain.handle('provider:default', async (event, id) => { authorize(event); if(configBusy)throw new Error('请等待配置保存');configBusy=true;try{await provider.setDefault(id);return await provider.list();}finally{configBusy=false;} });
  ipcMain.handle('provider:remove', async (event, id) => {
    authorize(event);checkRuntime();if(runtime.active||configBusy)throw new Error('请等待当前操作结束');configBusy=true;
    try {const config=await provider.public(id);if(runtime.runs.some(run=>run.providerId===id||(!run.providerId&&run.baseUrl===config.baseUrl)))throw new Error('此服务仍被任务引用（包括归档任务），请先永久删除相关任务');await provider.remove(id);return await provider.list();}finally{configBusy=false;}
  });
  ipcMain.handle('provider:get', async (event, id) => {
    authorize(event); const config = await provider.public(id);
    let engine = null, engineError = '';
    try { engine = await inspectEngine(app.isPackaged ? '' : config.executable); } catch (error) { engineError = error.message; }
    return { ...config, detectedExecutable: engine?.executable || '', engineVersion: engine?.version, engineError, bundledEngine: app.isPackaged };
  });
  ipcMain.handle('provider:save', async (event, input) => {
    authorize(event);
    if (configBusy) throw new Error('请等待配置保存完成');
    configBusy = true;
    try { return await provider.save(input); } finally { configBusy = false; }
  });
  ipcMain.handle('provider:test', async (event, id) => {
    authorize(event); if (runtime.active || configBusy) throw new Error('请等待当前操作结束');
    configBusy = true;
    try { return await probeProvider(await provider.secret(id)); } finally { configBusy = false; }
  });
  ipcMain.handle('agent:edit', (event, input) => { authorize(event); checkRuntime(); return runtime.edit(input).then(list=>list.map(summary)); });
  ipcMain.handle('project:open', async (event, id) => { authorize(event); const project = (await store.read()).projects.find(item => item.id === id); if (!project) throw new Error('项目不存在'); const error = await shell.openPath(project.path); if (error) throw new Error(error); });
  ipcMain.handle('agent:history', (event,input)=>{authorize(event);checkRuntime();return pageRun(runtime.runs.find(r=>r.id===input?.id),input.before,input.limit);});
  const searchSnapshots=new Map();
  const recentSearchUse=await database.call('readSetting',{key:'workspace.searchRecent'})||{};
  ipcMain.handle('workspace:search-touch',async(event,input)=>{
    authorize(event);
    if(!input||!['task','project','extension'].includes(input.kind)||typeof input.id!=='string'||input.id.length>200)throw Error('无效搜索记录');
    recentSearchUse[input.kind+':'+input.id]=new Date().toISOString();
    const entries=Object.entries(recentSearchUse).sort((a,b)=>b[1].localeCompare(a[1]));
    for(const [key] of entries.slice(2000))delete recentSearchUse[key];
    await database.call('writeSetting',{key:'workspace.searchRecent',value:recentSearchUse});
  });
  ipcMain.handle('workspace:search',async(event,input={})=>{
    authorize(event);checkRuntime();
    const {query='',kind='all',cursor}=input;
    if(typeof query!=='string'||query.length>500||!['all','task','project','extension','skill'].includes(kind))throw Error('搜索条件无效');
    let snapshot=searchSnapshots.get(event.sender.id),offset=0;
    if(cursor){
      if(typeof cursor!=='string')throw Error('搜索分页已失效');
      const [token,index]=cursor.split(':');offset=Number(index);
      if(!snapshot||snapshot.token!==token||snapshot.query!==query||snapshot.kind!==kind||!Number.isInteger(offset)||offset<0)throw Error('搜索分页已失效，请重新搜索');
    }else{
      const {searchWorkspace}=require('./workspace-search.cjs');
      snapshot={token:require('node:crypto').randomUUID(),query,kind,items:searchWorkspace({runs:runtime.runs,workspace:await store.read(),extensions:extensionService().snapshot(),skills:await skills.list(),recent:recentSearchUse},query,kind)};
      if(!searchSnapshots.has(event.sender.id))event.sender.once('destroyed',()=>searchSnapshots.delete(event.sender.id));
      searchSnapshots.set(event.sender.id,snapshot);
    }
    return {items:snapshot.items.slice(offset,offset+20),total:snapshot.items.length,next:offset+20<snapshot.items.length?snapshot.token+':'+(offset+20):null};
  });
  ipcMain.handle('agent:list', event => { authorize(event); checkRuntime(); return runtime.runs.map(summary); });
  ipcMain.handle('agent:start', (event, input) => { authorize(event); checkRuntime(); if (configBusy) throw new Error('正在更新或测试模型配置'); return runtime.start(input,{owner:authorize(event)}).then(async run=>{if(input?.draftId){const state=await store.read();windows.broadcast(profileId,'workspace:event',state);}return pageRun(run);}); });
  ipcMain.handle('artifact:access', async(event,input)=>{
    authorize(event);checkRuntime();
    const file=await accessArtifact(runtime.runs.find(run=>run.id===input?.runId),input?.id,input?.preview===true);
    if(input.preview)return file;
    shell.showItemInFolder(file.path);return null;
  });
  ipcMain.handle('agent:stop', (event, id) => { authorize(event); checkRuntime(); return runtime.stop(id); });
  ipcMain.handle('agent:answer', (event,input)=>{authorize(event);checkRuntime();return runtime.answer(input);});
  ipcMain.handle('agent:approve', (event, input) => { authorize(event); checkRuntime(); return runtime.approve(input); });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle('device:get', (event) => {
    authorize(event);
    return { name: os.hostname().replace(/\.local$/, ''), chip: os.cpus()[0]?.model || os.arch(),
      memoryGB: Math.round(os.totalmem() / 1024 ** 3), freeMemoryGB: Math.round(os.freemem() / 1024 ** 3),
      platform: process.platform, arch: process.arch, mode: 'desktop' };
  });
  ipcMain.handle('workspace:read', async (event) => { authorize(event); const state=await store.read(); nativeTheme.themeSource=state.theme; return state; });
  const publishWorkspace=state=>{nativeTheme.themeSource=state.theme;services.extensions.options.locale=state.language&&state.language!=='system'?state.language:app.getLocale();windows.broadcast(profileId,'extensions:event');windows.broadcast(profileId,'messages:event');windows.broadcast(profileId,'workspace:event',state);taskApps.contextChanged();return state;};
  ipcMain.handle('workspace:save',()=>{throw new Error('UNSUPPORTED: 请刷新应用，工作台已改用资源级保存');});
  ipcMain.handle('workspace:patch',async(event,input)=>{
    authorize(event);
    return publishWorkspace(await runtime.patchWorkspace(input));
  });
  ipcMain.handle('attachments:select', async event => {
    const window=authorize(event).window;
    const result = await hostDialog('showOpenDialog',window, { title: '添加文件和文件夹', properties: ['openFile', 'openDirectory', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths.map(file => ({path:file,name:path.basename(file)}));
  });
  ipcMain.handle('folder:select', async (event) => {
    const window=authorize(event).window;
    const result = await hostDialog('showOpenDialog',window, { title: '选择项目文件夹', properties: ['openDirectory'] });
    return result.canceled ? null : { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  const command = (name) => windows.focused()?.webContents.send('menu:command', name);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Ambleloft', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => command('settings') }, { type: 'separator' }, { role: 'hide' }, { role: 'unhide' }, { role: 'quit' }] },
    { label: '文件', submenu: [{ label:'新建窗口',accelerator:'CmdOrCtrl+Shift+N',click:()=>createWindow()},{ label: '新建任务', accelerator: 'CmdOrCtrl+N', click: () => command('new-task') }, { label: '添加项目…', accelerator: 'CmdOrCtrl+O', click: () => command('add-project') }, { role: 'close' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '显示', submenu: [{ label: '搜索', accelerator: 'CmdOrCtrl+F', click: () => command('search') }, { label: '显示 / 隐藏侧栏', accelerator: 'CmdOrCtrl+\\', click: () => command('sidebar') }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, { type: 'separator' }, { label: '开发者工具', accelerator: 'Alt+CommandOrControl+I', click: () => { const contents=windows.focused()?.webContents; if(!contents||contents.isDestroyed())return; if(contents.isDevToolsOpened())contents.closeDevTools();else contents.openDevTools({mode:'detach'}); } }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  if(!extensionError)for(const item of services.extensions.items)extensionHosts.reconcile(item.id);
  app.on('activate', () => { if (!windows.records.size) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (!runtime || quitting) return;
  event.preventDefault(); quitting = true;
  messageServiceForShutdown?.close();
  authenticationForShutdown?.close();
  Promise.resolve().then(()=>pageHost?.shutdown()).then(()=>extensionServiceForShutdown?.shutdown()).then(()=>runtime.shutdown()).catch(error => dialog.showErrorBox('保存失败', error.message))
    .finally(async () => { await database?.close().catch(error => dialog.showErrorBox('关闭数据库失败', error.message)); app.quit(); });
});
