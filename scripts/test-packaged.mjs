import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodexRPC } = require('../electron/codex-rpc.cjs');
const root = path.resolve(import.meta.dirname, '..');
const appPath = process.env.ATELIER_TEST_APP || path.join(root, `release/mac${process.arch === 'arm64' ? '-arm64' : ''}/Ambleloft.app`);
const executablePath = path.join(appPath, 'Contents/MacOS/Ambleloft');
const enginePath = path.join(appPath, 'Contents/Resources/engine/bin/codex');
const directory = await mkdtemp(path.join(tmpdir(), 'atelier-packaged-'));
const dataDir = path.join(directory, 'profile');
const otherHome = path.join(directory, 'other-codex');
await mkdir(dataDir); await mkdir(otherHome);
await writeFile(path.join(otherHome, 'config.toml'), '# independent installation sentinel\n');
const externalPaths = [path.join(otherHome, 'config.toml'), ...['config.toml', 'auth.json'].map(file => path.join(homedir(), '.codex', file))];
async function fingerprints() {
  return Promise.all(externalPaths.map(async file => { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }));
}
const before = await fingerprints();
let mode = 'text', issued = false, requests = [], app, other;
const errors = [];
let recoveryStep = 0, publicReads = 0;
const realNetwork = process.env.AMBLELOFT_TEST_PUBLIC_NETWORK === '1';
const networkMarker = realNetwork ? 'Example Domain' : 'APPROVED_PUBLIC_DATA';
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/public-data') { publicReads++; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('APPROVED_PUBLIC_DATA'); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const data = JSON.parse(raw); requests.push(data);
    if (mode === 'hang') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': waiting\n\n'); return; }
    if (mode === 'error') { res.writeHead(401); res.end(JSON.stringify({ error: { message: 'fixture rejection' } })); return; }
    let item = { id: `msg_${requests.length}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Packaged Ambleloft verified', annotations: [] }] };
    const tools = (data.tools || []).flatMap(tool => tool.type === 'namespace' ? tool.tools.map(t => ({ ...t, namespace: tool.name })) : [tool]);
    if (!issued && ['shell', 'plan', 'approval'].includes(mode)) {
      const tool = tools.find(t => mode === 'plan' ? /atelier_progress.*update_plan/.test(`${t.namespace || ''}${t.name}`) : ['shell_command', 'exec_command'].includes(t.name));
      assert.ok(tool, `Missing ${mode} tool; offered: ${tools.map(t => `${t.namespace || ''}/${t.name}`).join(',')}`);
      const args = mode === 'plan' ? { plan: [{ step: 'Verify packaged MCP', status: 'completed' }] } : { ...(tool.name === 'exec_command' ? { cmd: 'pwd', max_output_tokens: 100 } : { command: 'pwd', timeout_ms: 1000 }), ...(mode === 'approval' ? { sandbox_permissions: 'require_escalated', justification: 'Packaged approval fixture' } : {}) };
      item = { type: 'function_call', id: `fc_${requests.length}`, call_id: `call_${requests.length}`, name: tool.name, ...(tool.namespace ? { namespace: tool.namespace } : {}), arguments: JSON.stringify(args), status: 'completed' };
      issued = true;
    }
    if (mode === 'network-recovery' && recoveryStep < 2) {
      const tool = tools.find(t => ['shell_command', 'exec_command'].includes(t.name));
      assert.ok(tool, 'shell tool available for network recovery');
      const command = realNetwork ? '/usr/bin/curl --connect-timeout 10 --max-time 15 -fsS https://example.com/' : `/usr/bin/curl --noproxy '*' --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:${server.address().port}/public-data`;
      const args = { ...(tool.name === 'exec_command' ? { cmd: command, max_output_tokens: 1500, yield_time_ms: 10000 } : { command, timeout_ms: 20000 }), ...(recoveryStep === 1 ? { sandbox_permissions: 'require_escalated', justification: 'Allow this task to retrieve the requested public fixture data after sandbox failure.' } : {}) };
      item = { type: 'function_call', id: `fc_${requests.length}`, call_id: `call_${requests.length}`, name: tool.name, ...(tool.namespace ? { namespace: tool.namespace } : {}), arguments: JSON.stringify(args), status: 'completed' };
      recoveryStep++;
    } else if (mode === 'network-recovery') {
      assert.ok(JSON.stringify(data.input).includes(networkMarker), 'approved tool result must return to model: ' + JSON.stringify((data.input || []).filter(i => i.type === 'function_call_output').slice(-1)));
    }
    const response = { id: `resp_${requests.length}`, object: 'response', model: data.model, status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const [type, fields] of [['response.created', { response: { ...response, status: 'in_progress', output: [] } }], ['response.output_item.done', { output_index: 0, item }], ['response.completed', { response }]]) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
    res.end();
  } catch (error) { errors.push(error.message); res.writeHead(500); res.end('fixture failed'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const config = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture', apiKey: '' };
const launch = async () => {
  // A deliberately invalid inherited home/path must not select external Codex.
  const launched = await electron.launch({ executablePath, args: [`--user-data-dir=${dataDir}`], env: { ...process.env, PATH: '/usr/bin:/bin', CODEX_HOME: otherHome, CODEX_SQLITE_HOME: otherHome, ATELIER_DEV: '1' } });
  const page = await launched.firstWindow().catch(async error => { await launched.close(); throw error; });
  await page.getByRole('textbox', { name: '任务内容' }).waitFor();
  assert.ok(page.url().startsWith('file:'), 'packaged app must ignore development URL');
  return launched;
};
try {
  other = new CodexRPC({ executable: enginePath, config, home: otherHome, cwd: directory, notification() {}, request() {}, exit() {} });
  await other.call('initialize', { clientInfo: { name: 'coexistence_fixture', version: '1.0.0' } });
  other.send({ method: 'initialized', params: {} });
  app = await launch();
  let page = await app.firstWindow();
  // Exercise the bundled Office worker; source-mode tests cannot catch missing package resources.
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Packaged worksheet', 42]]), 'Sheet1');
  const spreadsheet = path.join(directory, 'fixture.xlsx');
  XLSX.writeFile(workbook, spreadsheet);
  const office = await app.evaluate(async ({ app }, { spreadsheet, directory }) => {
    const localRequire = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { createOfficePreview } = localRequire('./electron/office-preview.cjs');
    return createOfficePreview({ directory: directory + '/office-cache' }).preview(spreadsheet);
  }, { spreadsheet, directory });
  assert.equal(office.kind, 'spreadsheet');
  assert.ok(JSON.stringify(office).includes('Packaged worksheet'));
  console.log('PASS packaged: Office worker and bundled spreadsheet dependencies');
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, home: app.getPath('userData'), name: app.getName() }));
  assert.equal(info.packaged, true); assert.equal(info.name, 'Ambleloft'); assert.equal(await realpath(info.home), await realpath(dataDir));
  await page.evaluate(config => window.desktop.saveProvider({ ...config, name: 'Packaged fixture', executable: '/Applications/Codex.app/Contents/Resources/codex' }), config);
  const provider = await page.evaluate(() => window.desktop.getProvider());
  assert.equal(provider.bundledEngine, true); assert.equal(provider.engineVersion, '0.153.4'); assert.equal(provider.engineError, '');
  assert.equal(provider.detectedExecutable, enginePath);
  async function start(prompt, runId) { return page.evaluate(input => window.desktop.startRun(input), { prompt, runId }); }
  async function wait(runId, statuses = ['completed', 'failed', 'interrupted']) {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      if (errors.length) throw new Error(errors.join('\n'));
      const run = await page.evaluate(id => window.desktop.getRunPage({ id }), runId);
      if (statuses.includes(run.status)) return run;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Packaged task timed out (${mode})`);
  }
  const first = await start('Packaged first turn');
  assert.equal((await wait(first.id)).status, 'completed');
  await start('Packaged resumed turn', first.id);
  assert.equal((await wait(first.id)).status, 'completed');
  assert.ok(JSON.stringify(requests.at(-1).input).includes('Packaged first turn'));
  console.log('PASS packaged: bundled engine, isolated environment, database, two-turn history');
  for (const next of ['shell', 'plan', 'approval']) {
    mode = next; issued = false;
    const task = await start(`Verify ${mode}`);
    if (mode === 'approval') {
      const pending = await wait(task.id, ['waiting', 'failed', 'completed']);
      assert.equal(pending.status, 'waiting'); assert.equal(pending.approvals.length, 1);
      await page.evaluate(input => window.desktop.approveRun(input), { runId: task.id, approvalId: pending.approvals[0].id, decision: 'decline' });
    }
    const result = await wait(task.id); assert.equal(result.status, 'completed', result.error);
    if (mode === 'plan') assert.equal(result.plans[0].steps[0].step, 'Verify packaged MCP');
    if (mode === 'shell') assert.ok(result.tools.some(t => t.type === 'commandExecution' && t.status === 'completed' && t.detail.includes('scratch')), JSON.stringify(result.tools));
    console.log(`PASS packaged: ${mode}`);
  }
  mode = 'network-recovery';
  const recovery = await start('Retrieve the requested public data and continue after any required approval.');
  const pendingRecovery = await wait(recovery.id, ['waiting', 'failed', 'completed']);
  assert.equal(pendingRecovery.status, 'waiting', pendingRecovery.error);
  assert.equal(publicReads, 0, 'restricted attempt must not reach network fixture');
  assert.equal(pendingRecovery.messages.filter(m => m.role === 'user').length, 1);
  assert.ok(pendingRecovery.tools.length >= 1, 'first restricted attempt recorded');
  assert.ok(!pendingRecovery.tools.some(t => t.detail.includes(networkMarker)), 'restricted attempt must not return the requested data');
  await page.evaluate(input => window.desktop.approveRun(input), { runId: recovery.id, approvalId: pendingRecovery.approvals[0].id, decision: 'accept' });
  const recovered = await wait(recovery.id);
  assert.equal(recovered.status, 'completed', recovered.error);
  assert.equal(recovered.messages.filter(m => m.role === 'user').length, 1, 'no second user instruction needed');
  if (!realNetwork) assert.equal(publicReads, 1);
  assert.ok(recovered.tools.some(t => t.detail.includes(networkMarker)));
  console.log('PASS packaged: restricted network attempt → approval → retrieval → same-turn completion (scripted model)' + (realNetwork ? ' [public HTTPS verified]' : ''));
  mode = 'error'; assert.equal((await wait((await start('Fixture failure')).id)).status, 'failed');
  mode = 'hang'; const stopped = await start('Fixture stop');
  await page.evaluate(id => window.desktop.stopRun(id), stopped.id);
  assert.equal((await wait(stopped.id)).status, 'interrupted');
  const crashed = await start('Fixture engine crash');
  const ownEnginePid = async () => app.evaluate(async () => {
    const { execFile } = process.getBuiltinModule('child_process');
    const stdout = await new Promise((resolve, reject) => execFile('/bin/ps', ['-axo', 'pid,ppid,comm'], (error, stdout) => error ? reject(error) : resolve(stdout)));
    const line = stdout.split('\n').find(line => { const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return match && Number(match[2]) === process.pid && match[3] === process.resourcesPath + '/engine/bin/codex'; });
    return line ? Number(line.trim().split(/\s+/)[0]) : null;
  });
  const crashPid = await ownEnginePid(); assert.ok(crashPid);
  process.kill(crashPid, 'SIGKILL');
  assert.equal((await wait(crashed.id)).status, 'failed');
  assert.ok((await other.call('model/list', {})).data);
  const count = requests.length;
  const exiting = await start('Fixture exit during turn');
  for (let i = 0; i < 100 && requests.length === count; i++) await new Promise(resolve => setTimeout(resolve, 100));
  const exitPid = await ownEnginePid(); assert.ok(exitPid);
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/packaged-app.png') });
  await app.close(); app = null;
  for (let i = 0; i < 30; i++) { try { process.kill(exitPid, 0); } catch { break; } await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.throws(() => process.kill(exitPid, 0), { code: 'ESRCH' }, 'owned engine must exit with application');
  assert.ok((await other.call('model/list', {})).data, 'other engine still responds after Ambleloft closes');
  mode = 'text'; app = await launch(); page = await app.firstWindow();
  assert.equal((await page.evaluate(id => window.desktop.getRunPage({ id }), exiting.id)).status, 'interrupted');
  await start('Continue after application restart', first.id);
  assert.equal((await wait(first.id)).status, 'completed');
  assert.ok(JSON.stringify(requests.at(-1).input).includes('Packaged first turn'));
  await app.close(); app = null;
  assert.deepEqual(await fingerprints(), before, 'external configuration/auth must remain unchanged');
  assert.ok((await readdir(path.join(dataDir, 'codex-home'))).includes('sessions'));
  console.log('PASS packaged: errors, stop, engine crash, exit cleanup, restart, coexistence and unchanged external configuration');
  await writeFile(path.join(root, 'test-results/packaged-result.json'), JSON.stringify({ appPath, engineVersion: provider.engineVersion, publicHttpsVerified: realNetwork, checks: ['bundled-engine', 'independent-home', 'history', 'shell', 'mcp', 'approval-decline', 'network-approval-resume', 'error', 'stop', 'engine-crash', 'exit-cleanup', 'restart', 'coexistence', 'external-config-unchanged'], passed: true }, null, 2));
} finally {
  await app?.close(); other?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
