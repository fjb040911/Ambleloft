const base = require('./electron-builder.cjs');
module.exports = {
  ...base,
  beforePack: './build/verify-engine.win.cjs',
  files: [...base.files, 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
  extraResources: base.extraResources.map(resource => resource.to === 'engine'
    ? {from: 'vendor/engine/win32-${arch}', to: 'engine'} : resource),
  win: {
    ...base.win,
    target: [{target: 'zip', arch: ['x64']}],
    artifactName: 'Ambleloft-${version}-windows-${arch}.${ext}',
  },
};
