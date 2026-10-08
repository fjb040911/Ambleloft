const { app, BrowserWindow, WebContentsView, ipcMain, utilityProcess } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
let directory, win, view, child, exitCode = 0;
app.on('window-all-closed', () => {});
const watchdog = setTimeout(() => { console.error('Electron probe timed out'); app.exit(1); }, 20000);
(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-extension-electron-'));
  app.setPath('userData', path.join(directory, 'profile'));
  await app.whenReady();
  const utility = await new Promise((resolve, reject) => {
    child = utilityProcess.fork(path.join(__dirname, 'extension-utility.cjs'), [], { env: {}, cwd: directory, stdio: 'pipe' });
    child.once('message', resolve); child.once('exit', code => reject(new Error(`utility exited: ${code}`)));
  });
  assert.equal(utility.versions.modules, process.versions.modules);
  await fs.writeFile(path.join(directory, 'page.html'), '<html><body style="margin:0;background:rgb(255,0,0)">extension<iframe src="child.html"></iframe></body></html>');
  await fs.writeFile(path.join(directory, 'child.html'), '<html>child</html>');
  const url = pathToFileURL(path.join(directory, 'page.html')).href;
  win = new BrowserWindow({ width: 500, height: 400, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadURL('data:text/html,<html><body style="margin:0;background:rgb(0,255,0)">host modal</body></html>');
  view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'extension-page-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'extension-probe' } });
  win.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 300, height: 250 });
  const accepts = event => event.sender === view.webContents && event.senderFrame === view.webContents.mainFrame && event.senderFrame.url === url;
  ipcMain.handle('extension-probe:ping', event => { if (!accepts(event)) throw new Error('FORBIDDEN'); return 'bound-page'; });
  await view.webContents.loadURL(url);
  assert.equal(await view.webContents.executeJavaScript('extensionProbe.ping()'), 'bound-page');
  assert.deepEqual(await view.webContents.executeJavaScript('[typeof require, typeof process, typeof atelier]'), ['undefined', 'undefined', 'undefined']);
  const frame = view.webContents.mainFrame.frames[0];
  assert.equal(accepts({ sender: view.webContents, senderFrame: frame }), false);
  assert.equal(await frame.executeJavaScript('typeof extensionProbe'), 'undefined');
  assert.equal(accepts({ sender: win.webContents, senderFrame: win.webContents.mainFrame }), false);
  await assert.rejects(win.webContents.executeJavaScript('extensionProbe.ping()'));
  // Actual native compositing: hide view before displaying host confirmation.
  win.showInactive();
  const pixel = async () => {
    await new Promise(r => setTimeout(r, 150));
    const bitmap = (await win.capturePage({ x: 20, y: 20, width: 1, height: 1 })).toBitmap();
    return [...bitmap.slice(0, 3)]; // BGRA
  };
  const visiblePixel = await pixel();
  const compositorCaptureIncludesView = visiblePixel[2] > visiblePixel[1] * 1.5;
  view.setVisible(false); const modalPixel = await pixel();
  assert.ok(modalPixel[1] > 200 && modalPixel[1] > modalPixel[2] * 1.5, `host modal pixel: ${modalPixel}`);
  view.setVisible(true);
  view.setBounds({ x: 10, y: 10, width: 320, height: 260 }); view.webContents.setZoomFactor(1.25); view.webContents.focus();
  assert.equal(view.getBounds().width, 320); assert.equal(view.webContents.getZoomFactor(), 1.25);
  await view.webContents.loadURL('data:text/html,other-origin');
  await assert.rejects(view.webContents.executeJavaScript('extensionProbe.ping()'), /FORBIDDEN/);
  console.log(JSON.stringify({ platform: process.platform, arch: process.arch, packaged: app.isPackaged, versions: process.versions, utility, checks: { isolatedPreload: true, childFrameRejected: true, hostRejected: true, navigationRejected: true, modalHiddenPixel: modalPixel, visiblePixel, compositorCaptureIncludesView, modalVisualStatus: compositorCaptureIncludesView ? "verified" : "requires-screen-capture", boundsAndZoom: true } }, null, 2));
})().catch(error => { console.error(error); exitCode = 1; }).finally(async () => {
  clearTimeout(watchdog); child?.kill(); view?.webContents.close(); win?.destroy();
  try { if (directory) await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) { console.error('Temporary profile cleanup failed:', error.code); exitCode = 1; }
  finally { app.exit(exitCode); }
});
