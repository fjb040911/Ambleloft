// Test-only Electron entrypoint. Never handles user credentials or prints secrets.
const { app, safeStorage } = require('electron');
const path = require('node:path');
const { createProviderStore } = require('../../electron/provider.cjs');
const { configureSecureStorage, createSecureStorage } = require('../../electron/secure-storage.cjs');
configureSecureStorage(app);
app.setName('Ambleloft');
const directory = process.env.ATELIER_CREDENTIAL_TEST_DIR;
if (!directory || !path.basename(directory).startsWith('atelier-credential-')) throw new Error('Isolated test directory required');
app.setPath('userData', directory);
app.whenReady().then(async () => {
  const provider = createProviderStore(directory, createSecureStorage(app, safeStorage));
  const sample = 'isolated-restart-fixture';
  if (process.env.ATELIER_CREDENTIAL_TEST_WRITE === '1') await provider.save({baseUrl:'http://127.0.0.1:8999/v1',model:'fixture',apiKey:sample});
  if ((await provider.secret()).apiKey !== sample) throw new Error('Credential mismatch');
  console.log('CREDENTIAL_RESTART_OK');
  app.quit();
}).catch(() => { console.error('CREDENTIAL_RESTART_FAILED'); app.exit(1); });
