const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const version = process.argv[2];
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Build on Windows x64');
if (!/^0\.0\.[1-9]\d*$/.test(version || '')) throw Error('Usage: node scripts/build-update-test.cjs 0.0.1');
if (process.env.ATELIER_RELEASE === '1') throw Error('Do not use the production release environment');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const output = path.join(root, 'release/update-test', version);
if (fs.existsSync(path.join(output, 'latest.yml'))) throw Error('Version already built; use a new version rather than replacing released artifacts');
const manifestFile = path.join(root, 'vendor/engine/win32-x64/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile));
const engineRoot = path.dirname(manifestFile);
for (const [file, expected] of Object.entries(manifest.files)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(engineRoot, file))).digest('hex') !== expected) throw Error('Engine hash mismatch: ' + file);
}
const env = {...process.env, AMBLELOFT_UPDATE_TEST_VERSION: version, CSC_IDENTITY_AUTO_DISCOVERY: 'false'};
for (const name of ['CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD']) delete env[name];
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], {cwd: root, env, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Use the existing verified engine unchanged across A/B/C.
const npm = process.env.npm_execpath || path.join(root, '.cache/npm-bootstrap/package/bin/npm-cli.js');
if (!fs.existsSync(npm)) throw Error('Run through npm, or provide npm_execpath pointing to npm-cli.js');
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
const inheritedPath = env[pathKey] || '';
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.Path = [path.dirname(process.execPath), path.join(root, '.cache/npm-bootstrap'), path.dirname(npm), inheritedPath].join(path.delimiter);
run(npm, ['run', 'build']);
run(require.resolve('electron-builder/cli.js'), ['--config', 'build/electron-builder.update-test.cjs', '--win', 'nsis', '--x64', '--publish', 'never']);
run(path.join(__dirname, 'verify-update-assets.cjs'), [output, version]);
fs.writeFileSync(path.join(output, 'engine-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Verified update-test artifacts: ' + output);
