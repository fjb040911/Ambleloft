import {_electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {CodexRPC} = require('../electron/codex-rpc.cjs');
const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(process.env.AMBLELOFT_TEST_WINDOWS_DIR || path.join(root, 'release/win-unpacked'));
const engineDirectory = path.join(directory, 'resources/engine');
const profile = await mkdtemp(path.join(tmpdir(), 'amble-packaged-windows-'));
const engineHome = await mkdtemp(path.join(tmpdir(), 'amble-packaged-engine-'));
const manifest = JSON.parse(await readFile(path.join(engineDirectory, 'manifest.json'), 'utf8'));
assert.equal(manifest.platform, 'win32');
assert.equal(manifest.arch, 'x64');
for (const [file, hash] of Object.entries(manifest.files)) {
  assert.equal(createHash('sha256').update(await readFile(path.join(engineDirectory, file))).digest('hex'), hash, file);
}
let application, rpc;
try {
  // Use only the bundled executable, with an isolated home and no system Node/Codex on PATH.
  rpc = new CodexRPC({executable: path.join(engineDirectory, 'bin/codex.exe'),
    config:{baseUrl:'http://127.0.0.1:1/v1',model:'packaging-test',apiKey:''},
    home:engineHome,cwd:profile,notification(){},request(){},exit(){}});
  const initialized = await rpc.call('initialize', {clientInfo:{name:'ambleloft_package_test',version:'1.0.0'}});
  assert.ok(initialized);
  rpc.send({method:'initialized',params:{}});
  application = await _electron.launch({executablePath:path.join(directory,'Ambleloft.exe'),
    args:[`--user-data-dir=${profile}`],env:{...process.env,PATH:process.env.SystemRoot || 'C:\\Windows',ATELIER_DEV:'1'},timeout:30000});
  const page = await application.firstWindow();
  await page.getByRole('textbox',{name:'任务内容'}).waitFor();
  assert.ok(page.url().startsWith('file:'), 'Packaged app must not load the development server');
  assert.equal(await application.evaluate(({app})=>app.isPackaged), true);
  await page.locator('.windows-chrome').waitFor();
  await page.screenshot({path:path.join(root,'.cache/dev/windows-packaged.png')});
  console.log(`PASS: packaged Windows UI, local assets, native engine ${manifest.version} handshake and all engine hashes.`);
} finally {
  rpc?.close();
  await application?.close();
}
