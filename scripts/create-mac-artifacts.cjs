const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const run = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});
(async () => {
  if (process.platform !== 'darwin') throw new Error('Mac artifacts require macOS');
  const app = path.join(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Ambleloft.app');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const stem = path.join(root, 'release', `Ambleloft-${version}-mac-${process.arch}`);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-dmg-'));
  try {
    await run('/usr/bin/ditto', [app, path.join(stage, 'Ambleloft.app')]);
    await fs.symlink('/Applications', path.join(stage, 'Applications'));
    await run('/usr/bin/hdiutil', ['create', '-fs', 'HFS+', '-volname', 'Ambleloft', '-srcfolder', stage, '-ov', '-format', 'UDZO', `${stem}.dmg`]);
    await run('/usr/bin/hdiutil', ['verify', `${stem}.dmg`]);
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, `${stem}.zip`]);
    if (process.env.ATELIER_RELEASE === '1') {
      // The app was signed and notarized by electron-builder before this script.
      // A copied notarization ticket is verified; no credentials are handled here.
      await run('/usr/bin/xcrun', ['stapler', 'validate', app]);
      await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose', app]);
    }
    const { createHash } = require('node:crypto');
    const lines = [];
    for (const ext of ['dmg', 'zip']) {
      const file = `${stem}.${ext}`;
      lines.push(`${createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ${path.basename(file)}`);
    }
    await fs.writeFile(`${stem}.sha256`, lines.join('\n') + '\n');
    console.log(`Created ${stem}.{dmg,zip,sha256}`);
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
