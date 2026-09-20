// npm ci verifies the official platform tarball using the committed lockfile integrity.
// Preserve its complete native layout; never copy from /Applications or PATH.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ENGINE_VERSION, probeVersion } = require('../electron/engine.cjs');
const root = path.resolve(__dirname, '..');

async function prepare() {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw new Error('当前发布流程仅支持在对应架构的 macOS 构建');
  const platform = `${process.platform}-${process.arch}`;
  const packageName = `@openai/codex-${platform}`;
  const packageRoot = path.dirname(require.resolve(`${packageName}/package.json`));
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json')));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json')));
  const source = lock.packages[`node_modules/${packageName}`];
  if (pkg.version !== `${ENGINE_VERSION}-${platform}` || source.version !== pkg.version || !source.integrity?.startsWith('sha512-') || !source.resolved.startsWith('https://registry.npmjs.org/@openai/codex/')) throw new Error('Codex 包与固定版本锁不一致');
  const target = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  const input = path.join(packageRoot, 'vendor', target);
  const parent = path.join(root, 'vendor/engine');
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, '.prepare-'));
  try {
    await fs.cp(input, stage, { recursive: true });
    await fs.cp(path.join(root, 'build/licenses/codex'), path.join(stage, 'licenses'), { recursive: true });
    await probeVersion(path.join(stage, 'bin/codex'));
    const files = {};
    async function hashes(directory) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${file}`);
        if (entry.isDirectory()) await hashes(file);
        else files[path.relative(stage, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
      }
    }
    await hashes(stage);
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify({ version: ENGINE_VERSION, platform: process.platform, arch: process.arch, target, source: { url: source.resolved, integrity: source.integrity }, files }, null, 2) + '\n');
    const destination = path.join(parent, platform);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(stage, destination);
    console.log(`Prepared Codex ${ENGINE_VERSION} (${platform}) with ${Object.keys(files).length} resource files.`);
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
