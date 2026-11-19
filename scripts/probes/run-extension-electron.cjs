const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-extension-electron-'));
  try {
    const child = spawn(require('electron'), [path.join(__dirname, 'extension-electron.cjs'), directory], {
      stdio: 'inherit',
      windowsHide: true,
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => resolve(code ?? 1));
    });
  } finally {
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 8, retryDelay: 150});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
