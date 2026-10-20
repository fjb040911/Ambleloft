const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {ENGINE_VERSION, probeVersion} = require('../electron/engine.cjs');

module.exports = async context => {
  await require('./verify-terminal.cjs')(context);
  if (process.platform !== 'win32' || context.electronPlatformName !== 'win32' || context.arch !== 1 || process.arch !== 'x64') {
    throw new Error('Windows package must be built and verified on Windows x64');
  }
  const root = path.join(context.packager.projectDir, 'vendor/engine/win32-x64');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== ENGINE_VERSION || manifest.platform !== 'win32' || manifest.arch !== 'x64') throw new Error('Engine manifest mismatch');
  for (const [file, expected] of Object.entries(manifest.files)) {
    const full = path.resolve(root, file);
    const relative = path.relative(root, full);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Engine resource outside bundle');
    if (createHash('sha256').update(await fs.readFile(full)).digest('hex') !== expected) throw new Error(`Engine resource changed: ${file}`);
  }
  await probeVersion(path.join(root, 'bin/codex.exe'));
};
