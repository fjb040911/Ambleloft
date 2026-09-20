const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const os = require('node:os');
const run = promisify(execFile);
const ENGINE_VERSION = '0.153.4';

function engineRuntime() {
  const app = process.versions.electron && require('electron').app;
  return { packaged: !!app?.isPackaged, resourcesPath: process.resourcesPath };
}
async function findCodex(explicit = '', runtime = engineRuntime()) {
  // Overrides are a development facility only. Never discover another application's engine.
  if (!runtime.packaged && explicit) {
    if (!path.isAbsolute(explicit)) throw new Error('开发引擎路径必须为绝对路径');
    await fs.access(explicit, fs.constants.X_OK);
    return explicit;
  }
  const root = runtime.packaged ? path.join(runtime.resourcesPath, 'engine') : path.join(__dirname, '../vendor/engine', `${process.platform}-${process.arch}`);
  try {
    if (!(await fs.lstat(root)).isDirectory()) throw new Error('Invalid engine directory');
    const executable = path.join(root, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
    const resolved = await fs.realpath(executable);
    const relative = path.relative(await fs.realpath(root), resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !(await fs.stat(resolved)).isFile()) throw new Error('Invalid engine');
    await fs.access(resolved, fs.constants.X_OK);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
    if (manifest.version !== ENGINE_VERSION || manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('Engine version/architecture mismatch');
    return resolved;
  } catch {
    throw new Error(runtime.packaged ? '应用内置引擎缺失、版本不匹配或不可执行，请重新安装 Ambleloft；不会使用系统 Codex' : '项目引擎尚未准备，请运行 npm run engine:prepare；不会使用系统 Codex');
  }
}
async function probeVersion(executable) {
  // Even --version can create aliases: never let a diagnostic inherit CODEX_HOME.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-engine-probe-'));
  try {
    const { stdout } = await run(executable, ['--version'], { timeout: 10000, maxBuffer: 4096,
      env: { PATH: '/usr/bin:/bin', HOME: home, CODEX_HOME: home, CODEX_SQLITE_HOME: home } });
    const version = stdout.trim().replace(/^codex-cli\s+/, '');
    if (version !== ENGINE_VERSION) throw new Error(`引擎版本不匹配：需要 ${ENGINE_VERSION}，实际 ${version}`);
    return version;
  } finally { await fs.rm(home, { recursive: true, force: true }); }
}
async function inspectEngine(explicit = '') {
  const executable = await findCodex(explicit);
  return { executable, version: await probeVersion(executable) };
}
async function prepareEngineHome(directory) {
  const root = await fs.realpath(directory);
  const home = path.join(root, 'codex-home');
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(home)).isDirectory() || await fs.realpath(home) !== home) throw new Error('引擎数据目录不能链接到外部位置');
  return home;
}
module.exports = { ENGINE_VERSION, engineRuntime, findCodex, inspectEngine, prepareEngineHome, probeVersion };
