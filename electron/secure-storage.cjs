// Playwright's Electron loader injects these switches before the app entrypoint.
// Never let a test launcher change how this app encrypts persisted credentials.
function configureSecureStorage(app) {
  app.commandLine.removeSwitch('use-mock-keychain');
  if (app.commandLine.getSwitchValue('password-store') === 'basic') app.commandLine.removeSwitch('password-store');
}

function createSecureStorage(app, safeStorage) {
  const check = () => {
    if (app.commandLine.hasSwitch('use-mock-keychain') ||
        app.commandLine.getSwitchValue('password-store') === 'basic' ||
        (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('拒绝使用测试或明文加密后端保存密钥');
    }
  };
  return {
    isEncryptionAvailable() { check(); return safeStorage.isEncryptionAvailable(); },
    encryptString(value) { check(); return safeStorage.encryptString(value); },
    decryptString(value) { check(); return safeStorage.decryptString(value); },
  };
}
module.exports = { configureSecureStorage, createSecureStorage };
