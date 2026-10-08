const path = require('node:path');
const release = process.env.ATELIER_RELEASE === '1';
module.exports = {
  appId: 'app.atelier.agent',
  productName: 'Ambleloft',
  icon: 'public/brand/icon-512.png',
  win: { icon: 'build/icons/ambleloft.ico' },
  linux: { icon: 'public/brand/icon-512.png' },
  directories: { output: 'release', buildResources: 'build' },
  asar: true,
  files: ['dist/**/*', 'electron/**/*', 'core/**/*', 'package.json', '!node_modules/**/*', '!specs{,/**/*}', '!**/tooling-report{,/**/*}', '!**/outputs{,/**/*}', '!**/output{,/**/*}', '!**/test-results{,/**/*}', '!**/playwright-report{,/**/*}', '!**/coverage{,/**/*}', '!**/.cache{,/**/*}', '!docs{,/**/*}', '!tests{,/**/*}', '!scripts{,/**/*}', '!electron/office-worker.cjs', ...['openid-client','oauth4webapi','jose'].map(name=>({from:'node_modules/'+name,to:'node_modules/'+name,filter:['**/*']})), { from: 'node_modules/diff', to: 'node_modules/diff', filter: ['**/*'] }],
  extraResources: [
    { from: 'build/form-template.cjs', to: 'tools/form-template.cjs' },
    { from: 'build/extension-manifest.cjs', to: 'tools/extension-manifest.cjs' },
    { from: 'build/office-worker.cjs', to: 'tools/office-worker.cjs' },
    { from: 'build/office-LICENSES.txt', to: 'tools/office-LICENSES.txt' },
    { from: 'vendor/engine/darwin-${arch}', to: 'engine' },
    { from: 'electron/plan-server.cjs', to: 'tools/plan-server.cjs' },
  ],
  // Electron is already installed and locked; avoid a second runtime download.
  electronDist: path.resolve(__dirname, '../node_modules/electron/dist'),
  npmRebuild: false,
  beforePack: './build/verify-engine.cjs',
  forceCodeSigning: release,
  mac: {
    icon: 'build/icons/ambleloft.icns',
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
    artifactName: 'Ambleloft-${version}-mac-${arch}.${ext}',
    hardenedRuntime: true,
    notarize: release,
    ...(release ? {} : { identity: '-' }),
  },
  dmg: { sign: release },
  publish: null,
};
