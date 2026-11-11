const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');

test('test build isolates identity and feed without changing production configuration', () => {
  const file = require.resolve('../build/electron-builder.update-test.cjs');
  const previous = process.env.AMBLELOFT_UPDATE_TEST_VERSION;
  try {
    delete process.env.AMBLELOFT_UPDATE_TEST_VERSION;
    assert.throws(() => require(file), /VERSION/);
    process.env.AMBLELOFT_UPDATE_TEST_VERSION = '0.0.1';
    const config = require(file);
    const production = require('../build/electron-builder.win.cjs');
    assert.notEqual(config.appId, production.appId);
    assert.notEqual(config.extraMetadata.name, require('../package.json').name);
    assert.equal(config.publish.repo, 'Ambleloft-update-test');
    assert.equal(production.publish.repo, 'Ambleloft');
    assert.equal(config.win.signExecutable, false);
    assert.equal(config.win.verifyUpdateCodeSignature, false);
    assert.deepEqual(config.protocols, []);
    assert.equal(config.extraMetadata.ambleloftUpdateTest, true);
    assert.equal(config.extraMetadata.version, '0.0.1');
  } finally {
    delete require.cache[file];
    if (previous === undefined) delete process.env.AMBLELOFT_UPDATE_TEST_VERSION;
    else process.env.AMBLELOFT_UPDATE_TEST_VERSION = previous;
  }
});

test('diagnostics preserve byte counts and differential fallback evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amble-update-log-'));
  try {
    const updater = new EventEmitter();
    require('../electron/update-diagnostics.cjs').attachUpdateDiagnostics(updater, directory, '0.0.1');
    updater.emit('download-progress', {transferred: 128, total: 256, percent: 50, bytesPerSecond: 64});
    updater.logger.error('Cannot download differentially, fallback to full download: %s', 'missing cache');
    const entries = fs.readFileSync(path.join(directory, 'updater.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(entries[1].transferred, 128);
    assert.equal(entries[1].total, 256);
    assert.match(entries[2].message, /fallback to full download: missing cache/);
    assert.equal(entries[0].version, '0.0.1');
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
