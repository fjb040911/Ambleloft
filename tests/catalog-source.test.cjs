const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {loadSources} = require('../core/catalog-store/service.cjs');
const defaults = require('../core/catalog-store/sources.json');

test('normal startup uses the packaged HTTPS Store without environment or SSH configuration', () => {
  const env = {...process.env}; delete env.AMBLE_STORE_SOURCE_FILE;
  const output = execFileSync(process.execPath, ['-e', "require('./core/catalog-store/service.cjs').loadSources().then(s=>console.log(JSON.stringify(s)))"], {cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8'});
  const sources = JSON.parse(output);
  assert.deepEqual(sources, defaults);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].baseUrl, 'https://47.116.195.229/store/');
  assert.equal(sources[0].keyId, 'curated-v1');
  const build = require('../build/electron-builder.cjs');
  assert.ok(build.files.includes('core/**/*'), 'trusted source ships inside the app');
});

test('explicit trusted-source override and opt-out remain supported', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-source-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const file = path.join(dir, 'source.json');
  const override = [{...defaults[0], baseUrl:'http://127.0.0.1:18081/'}];
  await fs.writeFile(file, JSON.stringify(override));
  assert.deepEqual(await loadSources(file), override);
  await fs.writeFile(file, '[]');
  assert.deepEqual(await loadSources(file), []);
  assert.deepEqual(await loadSources(''), []);
  assert.deepEqual(await loadSources(null), []);
});

test('invalid overrides do not fall back to a different Store', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-source-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const file = path.join(dir, 'source.json');
  await assert.rejects(loadSources(file), /ENOENT/);
  await fs.writeFile(file, '{');
  await assert.rejects(loadSources(file), SyntaxError);
  await fs.writeFile(file, JSON.stringify([{...defaults[0],baseUrl:'http://47.116.195.229/store/'}]));
  await assert.rejects(loadSources(file), /STORE_INVALID_SOURCE_URL/);
});
