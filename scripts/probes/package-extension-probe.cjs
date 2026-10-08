// Produces and runs an isolated unsigned probe app, never modifies release artifacts.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
async function main() {
  if (process.platform !== 'darwin') throw new Error('Packaged probe currently supports macOS only; other platforms remain unverified');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-extension-package-'));
  try {
    for (const file of ['extension-electron.cjs', 'extension-utility.cjs', 'extension-page-preload.cjs']) await fs.copyFile(path.join(__dirname, file), path.join(root, file));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'extension-probe', version: '0.0.1', main: 'extension-electron.cjs', description: 'Isolated extension runtime probe', author: 'Ambleloft' }));
    await require('electron-builder').build({ projectDir: root, config: {
      appId: 'app.ambleloft.extension-probe', productName: 'ExtensionProbe', electronVersion: require('../../package.json').devDependencies.electron,
      electronDist: path.resolve(__dirname, '../../node_modules/electron/dist'), directories: { output: path.join(root, 'out') },
      files: ['*.cjs', 'package.json'], asar: true, npmRebuild: false, mac: { target: 'dir', identity: null },
    } });
    const executable = path.join(root, 'out', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'ExtensionProbe.app/Contents/MacOS/ExtensionProbe');
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [], { stdio: 'inherit', env: { HOME: root, TMPDIR: os.tmpdir(), PATH: '/usr/bin:/bin' } });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Packaged probe exited ${code}`)));
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
