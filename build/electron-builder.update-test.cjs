const base = require('./electron-builder.win.cjs');
const version = process.env.AMBLELOFT_UPDATE_TEST_VERSION;
if (!/^0\.0\.[1-9]\d*$/.test(version || '')) throw Error('Set AMBLELOFT_UPDATE_TEST_VERSION to 0.0.1, 0.0.2, ...');
if (process.env.ATELIER_RELEASE === '1') throw Error('Unsigned update tests cannot use the production release environment');
module.exports = {
  ...base,
  appId: 'app.ambleloft.update-test',
  productName: 'Ambleloft Update Test',
  protocols: [],
  extraMetadata: {name: 'ambleloft-update-test', version, ambleloftUpdateTest: true},
  directories: {...base.directories, output: `release/update-test/${version}`},
  forceCodeSigning: false,
  win: {...base.win, target: [{target: 'nsis', arch: ['x64']}],
    executableName: 'Ambleloft Update Test',
    signAndEditExecutable: true, signExecutable: false, verifyUpdateCodeSignature: false,
    artifactName: 'Ambleloft-Update-Test-${version}-${arch}.${ext}'},
  nsis: {oneClick: true, perMachine: false, differentialPackage: true,
    shortcutName: 'Ambleloft Update Test', uninstallDisplayName: 'Ambleloft Update Test'},
  publish: {provider: 'github', owner: 'fjb040911', repo: 'Ambleloft-update-test', releaseType: 'release'},
};
