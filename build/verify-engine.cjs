const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ENGINE_VERSION } = require('../electron/engine.cjs');
module.exports = async context => {
  const arch = { 0: 'ia32', 1: 'x64', 3: 'arm64' }[context.arch];
  if (context.electronPlatformName !== 'darwin' || arch !== process.arch) throw new Error('必须在目标架构 macOS 上构建并验证');
  const root = path.join(context.packager.projectDir, 'vendor/engine', `darwin-${arch}`);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
  if (manifest.version !== ENGINE_VERSION || manifest.arch !== arch || manifest.platform !== 'darwin') throw new Error('Engine manifest mismatch');
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex') !== expected) throw new Error(`Engine resource changed: ${file}`);
  }
  // Signing may change Mach-O bytes later. These hashes verify the staged inputs.
  if (process.env.ATELIER_RELEASE === '1' && !(process.env.APPLE_API_KEY || process.env.APPLE_ID || process.env.APPLE_KEYCHAIN_PROFILE)) throw new Error('正式发布必须配置 Apple 公证凭据');
};
