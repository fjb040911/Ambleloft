const {summary,pageRun}=require('./history-pages.cjs');
const { app, BrowserWindow, ipcMain, Menu, dialog, session, safeStorage, shell, clipboard, protocol, nativeTheme } = require('electron');
const {accessArtifact} = require('./artifacts.cjs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Database } = require('./database.cjs');
const { createStore } = require('./store.cjs');
const { createProviderStore, probeProvider } = require('./provider.cjs');
const { AgentRuntime } = require('./agent-runtime.cjs');
const { inspectEngine } = require('./engine.cjs');
const { configureSecureStorage, createSecureStorage } = require('./secure-storage.cjs');

protocol.registerSchemesAsPrivileged([{scheme:'atelier-preview',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
configureSecureStorage(app);
app.setName('Ambleloft');
// Keep the legacy profile path so renaming the product preserves sessions and encrypted credentials.
// Keep Electron's explicit test/profile switch usable.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'Atelier'));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let window;
let store;
let database;
let runtime;
let quitting = false;
let configBusy = false;
const devURL = !app.isPackaged && process.env.ATELIER_DEV === '1' ? 'http://127.0.0.1:5173' : null;
const entry = path.join(__dirname, '../dist/index.html');
const trustedURL = devURL || pathToFileURL(entry).href;

function authorize(event) {
  const frame = event.senderFrame;
  if (!window || event.sender !== window.webContents || frame !== window.webContents.mainFrame ||
      (devURL ? new URL(frame.url).origin !== devURL : frame.url.split('#')[0] !== trustedURL)) {
    throw new Error('不受信任的窗口');
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1240, height: 840, minWidth: 760, minHeight: 560,
    title: 'Ambleloft', backgroundColor: '#f8f9fb',
    icon: path.join(__dirname, '../dist/brand/icon-512.png'),
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 23 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', event => {
    if (!event.isMainFrame && !event.url.startsWith('atelier-preview://')) event.preventDefault();
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== trustedURL && url !== `${trustedURL}/`) event.preventDefault();
  });
  if (devURL) window.loadURL(devURL); else window.loadFile(entry);
  window.on('closed', () => { window = null; });
}

app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, '../public/brand/icon-512.png'));
  if (!primaryInstance) return;
  database = new Database(app.getPath('userData'));
  try { await database.call('ready'); } catch (error) {
    dialog.showErrorBox('无法打开数据库', error.message);
    await database.close().catch(() => {}); app.quit(); return;
  }
  store = createStore(app.getPath('userData'), database);
  const skills = require('./skills.cjs').createSkills(app.getPath('userData'), database);
  for (const action of ['list','detail','update','remove']) ipcMain.handle('skills:'+action,(event,input)=>{authorize(event);return skills[action](input);});
  const skillImports=new Map();
  ipcMain.handle('skills:import',async(event,options={})=>{
    authorize(event);let source;
    if(options.token){source=skillImports.get(options.token);if(!source)throw new Error('导入已过期，请重新选择文件夹');}
    else {const result=await dialog.showOpenDialog(window,{title:'导入 Skill 文件夹',properties:['openDirectory']});if(result.canceled)return null;source=result.filePaths[0];}
    const result=await skills.importFolder(source,options);
    if(result.duplicate){const token=require('node:crypto').randomUUID();if(skillImports.size>=20)skillImports.delete(skillImports.keys().next().value);skillImports.set(token,source);return {...result,token};}
    if(options.token)skillImports.delete(options.token);return result;
  });
  const provider = createProviderStore(app.getPath('userData'), createSecureStorage(app, safeStorage), database);
  runtime = new AgentRuntime({ directory: app.getPath('userData'), provider, workspace: store, database, skills,
    publish: run => { if (window && !window.isDestroyed()) window.webContents.send('agent:event', pageRun(run)); } });
  const files = require('./project-files.cjs').createProjectFiles({getWorkspace:()=>store.read(),getRuns:()=>runtime.runs,getApprovedApps:async()=>await database.call('readSetting',{key:'fileApplications'})||[],setApprovedApps:value=>database.call('writeSetting',{key:'fileApplications',value})});
  protocol.handle('atelier-preview', request=>files.resource(request));
  for (const action of ['context','list','search','read','apps']) ipcMain.handle('files:'+action,(event,input)=>{authorize(event);return files[action](input);});
  ipcMain.handle('files:open',(event,input)=>{authorize(event);return files.open(input,{shell,dialog,window});});
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
    try {const config=await provider.public(id);if(runtime.runs.some(run=>run.providerId===id||(!run.providerId&&run.baseUrl===config.baseUrl)))throw new Error('此服务仍被会话引用（包括归档会话），请先永久删除相关会话');await provider.remove(id);return await provider.list();}finally{configBusy=false;}
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
  ipcMain.handle('agent:list', event => { authorize(event); checkRuntime(); return runtime.runs.map(summary); });
  ipcMain.handle('agent:start', (event, input) => { authorize(event); checkRuntime(); if (configBusy) throw new Error('正在更新或测试模型配置'); return runtime.start(input).then(run=>pageRun(run)); });
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
  ipcMain.handle('workspace:save', async (event, state) => { authorize(event); const result=await store.write(state); nativeTheme.themeSource=state.theme; return result; });
  ipcMain.handle('attachments:select', async event => {
    authorize(event);
    const result = await dialog.showOpenDialog(window, { title: '添加文件和文件夹', properties: ['openFile', 'openDirectory', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths.map(file => ({path:file,name:path.basename(file)}));
  });
  ipcMain.handle('folder:select', async (event) => {
    authorize(event);
    const result = await dialog.showOpenDialog(window, { title: '选择项目文件夹', properties: ['openDirectory'] });
    return result.canceled ? null : { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  const command = (name) => window?.webContents.send('menu:command', name);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Ambleloft', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => command('settings') }, { type: 'separator' }, { role: 'hide' }, { role: 'unhide' }, { role: 'quit' }] },
    { label: '文件', submenu: [{ label: '新建任务', accelerator: 'CmdOrCtrl+N', click: () => command('new-task') }, { label: '添加项目…', accelerator: 'CmdOrCtrl+O', click: () => command('add-project') }, { role: 'close' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '显示', submenu: [{ label: '搜索', accelerator: 'CmdOrCtrl+F', click: () => command('search') }, { label: '显示 / 隐藏侧栏', accelerator: 'CmdOrCtrl+\\', click: () => command('sidebar') }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, { type: 'separator' }, { label: '开发者工具', role: 'toggleDevTools', accelerator: 'Alt+CommandOrControl+I' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (!runtime || quitting) return;
  event.preventDefault(); quitting = true;
  runtime.shutdown().catch(error => dialog.showErrorBox('保存失败', error.message))
    .finally(async () => { await database?.close().catch(error => dialog.showErrorBox('关闭数据库失败', error.message)); app.quit(); });
});
