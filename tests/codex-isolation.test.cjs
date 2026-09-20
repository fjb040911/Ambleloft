const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { findCodex, codexEnvironment } = require('../electron/codex-rpc.cjs');
const { prepareEngineHome } = require('../electron/engine.cjs');

test('packaged application never falls back to an external executable', async t => {
  const resourcesPath = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-isolation-'));
  t.after(() => fs.rm(resourcesPath, { recursive: true, force: true }));
  const runtime = { packaged: true, resourcesPath };
  await assert.rejects(findCodex(process.execPath, runtime), /不会使用系统 Codex/);
  const engine = path.join(resourcesPath, 'engine');
  await fs.mkdir(path.join(engine, 'bin'), { recursive: true });
  await fs.writeFile(path.join(engine, 'manifest.json'), JSON.stringify({ version: '0.153.4', platform: process.platform, arch: process.arch }));
  const executable = path.join(engine, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  await fs.writeFile(executable, 'fixture', { mode: 0o755 });
  assert.equal(await findCodex(process.execPath, runtime), await fs.realpath(executable));
  await fs.writeFile(path.join(engine, 'manifest.json'), JSON.stringify({ version: 'wrong', platform: process.platform, arch: process.arch }));
  await assert.rejects(findCodex(process.execPath, runtime), /不会使用系统 Codex/);
  await fs.writeFile(path.join(engine, 'manifest.json'), JSON.stringify({ version: '0.153.4', platform: process.platform, arch: process.arch }));
  await fs.unlink(executable);
  await fs.symlink(process.execPath, executable);
  await assert.rejects(findCodex('', runtime), /不会使用系统 Codex/);
});

test('Codex home cannot redirect writes to another installation through a symlink', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-home-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const external = path.join(directory, 'external');
  const own = path.join(directory, 'atelier');
  await fs.mkdir(external); await fs.mkdir(own);
  await fs.writeFile(path.join(external, 'config.toml'), 'external-sentinel');
  await fs.symlink(external, path.join(own, 'codex-home'));
  await assert.rejects(prepareEngineHome(own), /不能链接/);
  assert.equal(await fs.readFile(path.join(external, 'config.toml'), 'utf8'), 'external-sentinel');
  await fs.unlink(path.join(own, 'codex-home'));
  assert.equal(await prepareEngineHome(own), path.join(await fs.realpath(own), 'codex-home'));
});

test('engine environment replaces inherited Codex home and excludes external credentials', () => {
  const home = path.join(os.tmpdir(), 'atelier-test', 'codex-home');
  const inherited = { HOME: os.homedir(), PATH: '/fixture/bin', CODEX_HOME: '/external/codex', OPENAI_API_KEY: 'external', CODEX_API_KEY: 'external', ATELIER_PROVIDER_KEY: 'stale', CODEX_THREAD_ID: 'external' };
  const before = { ...inherited };
  const env = codexEnvironment({ baseUrl: 'http://localhost:1234/v1', apiKey: 'atelier' }, home, inherited);
  assert.equal(env.CODEX_HOME, home);
  assert.equal(env.ATELIER_PROVIDER_KEY, 'atelier');
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_THREAD_ID']) assert.equal(env[key], undefined);
  assert.deepEqual(inherited, before);
  assert.equal(codexEnvironment({ baseUrl: 'http://localhost/v1' }, home, inherited).ATELIER_PROVIDER_KEY, undefined);
  assert.throws(() => codexEnvironment({ baseUrl: 'http://localhost/v1' }, 'relative'), /绝对路径/);
});
