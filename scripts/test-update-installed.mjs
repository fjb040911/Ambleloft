import {_electron} from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
async function main() {
const version = process.argv[2];
const mode = process.argv[3] || 'inspect';
const executablePath = path.join(process.env.LOCALAPPDATA, 'Programs', 'ambleloft-update-test', 'Ambleloft Update Test.exe');
const evidence = path.resolve('release/update-test/evidence');
await fs.mkdir(evidence, {recursive: true});
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({executablePath, env, timeout: 60000});
let installing = false;
try {
  const page = await application.firstWindow();
  await page.waitForFunction(() => !!window.desktop?.updates, {timeout: 60000});
  const identity = await application.evaluate(({app}) => ({version: app.getVersion(), name: app.getName(), profile: app.getPath('userData'), packaged: app.isPackaged}));
  assert.equal(identity.version, version);
  assert.equal(identity.name, 'Ambleloft Update Test');
  assert.equal(identity.profile, path.join(process.env.APPDATA, 'Ambleloft Update Test'));
  assert.equal(identity.packaged, true);
  await page.waitForFunction(async () => {try {return !!(await window.desktop.updates.snapshot()).currentVersion;} catch {return false;}}, {timeout:60000});
  console.log('IDENTITY', JSON.stringify(identity));
  await page.screenshot({path:path.join(evidence, `${version}-${mode}.png`)});
  if (mode === 'inspect') {
    console.log('STATE', JSON.stringify(await page.evaluate(() => window.desktop.updates.snapshot())));
    return;
  }
  let available = await page.evaluate(() => window.desktop.updates.check());
  // GitHub's public feed may briefly lag a just-published release.
  for (let attempt=0; mode !== 'current' && available.status === 'current' && attempt<12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    available = await page.evaluate(() => window.desktop.updates.check());
  }
  console.log('CHECK', JSON.stringify(available));
  if (mode === 'current') {
    assert.equal(available.status, 'current');
    return;
  }
  assert.equal(available.status, 'available');
  if (mode === 'cancel') {
    await page.locator('.update-ring-button').click();
    await page.waitForFunction(async () => (await window.desktop.updates.snapshot()).status === 'downloading');
    await page.evaluate(() => window.desktop.updates.cancel());
    await page.waitForFunction(async () => (await window.desktop.updates.snapshot()).status === 'available', {timeout:60000});
    console.log('PASS cancellation, current version unchanged');
    return;
  }
  if (mode === 'offline') {
    // Per-application proxy only; does not change Windows or other applications.
    await application.evaluate(async ({session}) => session.fromPartition('electron-updater', {cache:false}).setProxy({proxyRules:'http=127.0.0.1:9;https=127.0.0.1:9'}));
    try {
      const failed = await page.evaluate(() => window.desktop.updates.download());
      assert.equal(failed.status, 'download-failed');
      assert.equal(failed.currentVersion, version);
      console.log('PASS offline download leaves installed version unchanged');
    } finally {
      await application.evaluate(async ({session}) => {const network=session.fromPartition('electron-updater', {cache:false});await network.setProxy({mode:'system'});await network.closeAllConnections();});
    }
  }
  await page.locator('.update-ring-button').click();
  // After an offline failure the ring opens About, where Retry is explicit.
  if (mode === 'offline') await page.getByRole('button', {name:/重新下载|Retry download/}).click();
  let ready;
  const deadline = Date.now() + 600000;
  do {
    await new Promise(resolve => setTimeout(resolve, 500));
    ready = await page.evaluate(() => window.desktop.updates.snapshot());
    if (['ready','download-failed'].includes(ready.status)) break;
  } while (Date.now() < deadline);
  console.log('DOWNLOAD', JSON.stringify(ready));
  assert.equal(ready.status, 'ready');
  await fs.writeFile(path.join(evidence, `${version}-${mode}.json`), JSON.stringify({identity, available, ready}, null, 2));
  if (mode !== 'upgrade') return;
  const terminal = await page.evaluate(() => window.desktop.terminal.create({}));
  try {
    const blocked = await page.evaluate(target => window.desktop.updates.restart(target), ready.version);
    assert.equal(blocked.status, 'ready');
    assert.match(blocked.error, /终端/);
    console.log('PASS active terminal blocks installation:', blocked.error);
  } finally { await page.evaluate(id => window.desktop.terminal.close({id}), terminal.id); }
  const waiting = await page.evaluate(target => window.desktop.updates.schedule(target), ready.version);
  assert.equal(waiting.status, 'waiting');
  const revoked = await page.evaluate(() => window.desktop.updates.cancelSchedule());
  assert.equal(revoked.status, 'ready');
  console.log('PASS scheduled restart can be revoked');
  // Only accept this test app's restart confirmation; preserve the real install path.
  await application.evaluate(({dialog}) => {
    const original = dialog.showMessageBox.bind(dialog);
    dialog.showMessageBox = (...args) => args.at(-1)?.title === '重启并更新' ? Promise.resolve({response:1,checkboxChecked:false}) : original(...args);
  });
  const closed = application.waitForEvent('close', {timeout:90000});
  installing = true;
  await page.evaluate(target => {void window.desktop.updates.restart(target);}, ready.version);
  await closed;
  console.log('INSTALLER started for', ready.version);
  const healthDeadline = Date.now() + 180000;
  while (Date.now() < healthDeadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const transaction = JSON.parse(await fs.readFile(path.join(identity.profile, 'updates/transaction.json'), 'utf8'));
    if (transaction.target === ready.version && transaction.status === 'healthy') {
      console.log('PASS automatic restart healthy:', JSON.stringify(transaction));
      await fs.writeFile(path.join(evidence, `${version}-upgrade-healthy.json`), JSON.stringify(transaction, null, 2));
      return;
    }
  }
  throw Error('Installer ran but automatic restart did not report healthy within 180 seconds');
} finally {
  if (!installing) await application.close();
}
}
await main();
