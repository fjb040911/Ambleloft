const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {zipSync, strToU8} = require('fflate');
const {Database} = require('../electron/database.cjs');
const {createSkills} = require('../electron/skills.cjs');
const {ExtensionService} = require('../core/extensions/service.cjs');
const {CatalogStore, download} = require('../core/catalog-store/service.cjs');
const {validateCatalog, validateSource, verifyEnvelope, hashDirectory, parseStoreLink, checkCompatibility} = require('../core/catalog-store/catalog.cjs');
const text = {zh: '测试用途', en: 'Test use'};
const keys = crypto.generateKeyPairSync('ed25519');
const source = {id: 'curated', title: 'Curated', keyId: 'curated-v1', baseUrl: 'http://127.0.0.1:4183/', publicKey: keys.publicKey.export({type: 'spki', format: 'pem'})};
function sign(value, privateKey = keys.privateKey) { const payload = Buffer.from(JSON.stringify(value)); return {keyId: source.keyId, payload: payload.toString('base64'), signature: crypto.sign(null, payload, privateKey).toString('base64')}; }
const manifest = {specVersion: '1.0-draft', publisher: 'fixture', name: 'store', version: '1.0.0', displayName: 'Store test', engines: {api: '1'}, main: 'main.cjs'};
async function fixture(t, kind = 'skill') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-store-')), db = new Database(root);
  await db.call('ready'); const skills = createSkills(root, db), extensions = new ExtensionService(db, {directory: root}); await extensions.initialize();
  t.after(async () => { await db.close(); await fs.rm(root, {recursive: true, force: true}); });
  const files = kind === 'skill' ? {'SKILL.md': strToU8('---\nname: store-test\ndescription: A store test\n---\nRead refs/test.txt.\n'), 'refs/test.txt': strToU8('Reference')} : {'extension.json': strToU8(JSON.stringify(manifest)), 'main.cjs': strToU8('throw Error("Must not execute on install")')};
  const bundle = path.join(root, 'bundle'); await fs.mkdir(bundle);
  for (const [name, data] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(bundle, name)), {recursive: true}); await fs.writeFile(path.join(bundle, name), data); }
  const artifact = Buffer.from(zipSync(files)), sha = crypto.createHash('sha256').update(artifact).digest('hex');
  const item = {id: 'fixture.test', kind, entityName: kind === 'skill' ? 'store-test' : 'fixture.store', title: text, summary: text, description: text, publisher: 'Fixture', license: 'MIT', tags: ['test'], trialPrompt: text, runtime: text, setup: text, release: {version: '1.0.0', status: 'published', artifactPath: `artifacts/sha256/${sha}.${kind === 'skill' ? 'zip' : 'amble-extension'}`, artifactSha256: sha, artifactSize: artifact.length, packageDigest: hashDirectory(bundle), reviewedAt: new Date().toISOString(), reviewedBy: 'team', changelog: text}};
  const catalog = {schemaVersion: 1, sourceId: source.id, generatedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), items: [item]};
  const responses = {offline: false, artifact, envelope: sign(catalog)};
  const fetcher = async url => { if (responses.offline) throw Error('offline'); return new Response(String(url).endsWith('catalog.json') ? JSON.stringify(responses.envelope) : responses.artifact, {status: 200}); };
  const store = new CatalogStore({directory: root, database: db, skills, extensions, sources: [source], fetcher}); await store.initialize();
  return {root, db, skills, extensions, store, catalog, item, responses, files, bundle, input: {sourceId: source.id, listingId: item.id}, confirm: {skill: async () => true, extension: async () => true}};
}
test('signed catalog rejects forgery, artifact URLs, duplicate identities and untrusted deep links', async t => {
  const {catalog} = await fixture(t);
  assert.equal(verifyEnvelope(sign(catalog), source).catalog.items.length, 1);
  const canonical = sign(catalog);
  for (const signature of [`${canonical.signature}\n`, canonical.signature.replace(/=+$/, '')]) {
    assert.throws(() => verifyEnvelope({...canonical, signature}, source), /SIGNATURE/);
  }
  assert.throws(() => validateSource({...source, id: undefined}), /INVALID_SOURCE/);
  assert.throws(() => validateCatalog({...catalog, sourceId: undefined}), /INVALID_CATALOG/);
  const envelope = sign(catalog); envelope.payload = Buffer.from(JSON.stringify({...catalog, sourceId: 'evil'})).toString('base64');
  assert.throws(() => verifyEnvelope(envelope, source), /SIGNATURE/);
  const forged = structuredClone(catalog); forged.items[0].release.artifactPath = 'https://evil.test/a.zip'; assert.throws(() => validateCatalog(forged), /ARTIFACT_PATH/);
  const duplicated = structuredClone(catalog); duplicated.items.push({...duplicated.items[0], id: 'fixture.second'}); assert.throws(() => validateCatalog(duplicated), /DUPLICATE/);
  for (const baseUrl of ['http://example.com/', 'http://localhost/', 'https://u:p@example.com/', 'file:///tmp/']) assert.throws(() => validateSource({...source, baseUrl}));
  assert.deepEqual(parseStoreLink('ambleloft://store/item?source=curated&id=fixture.test', [source]), {sourceId: 'curated', listingId: 'fixture.test'});
  for (const link of ['ambleloft://store/item?source=evil&id=fixture.test', 'ambleloft://store/item?source=curated&id=fixture.test&install=true', 'ambleloft://store/item?source=curated&id=../x', 'ambleloft://store/item?source=curated&source=evil&id=fixture.test']) assert.equal(parseStoreLink(link, [source]), null);
  assert.throws(() => checkCompatibility({hostRequirements: {minVersion: '9.0.0'}}, {version: '0.7.0'}), /HOST_VERSION/);
  assert.throws(() => checkCompatibility({platforms: ['win32']}, {version: '0.7.0', platform: 'linux'}), /PLATFORM/);
});
test('catalog preview steps remain optional, bounded and bilingual', async t => {
  const {catalog} = await fixture(t);
  assert.doesNotThrow(() => validateCatalog(catalog));
  for (const count of [1, 6]) {
    const value = structuredClone(catalog);
    value.items[0].previewSteps = Array.from({length: count}, () => ({title: text, description: {zh: '文'.repeat(2000), en: 'Preview only'}}));
    assert.doesNotThrow(() => validateCatalog(value));
  }
  for (const steps of [[], Array(7).fill({title: text, description: text}), [{title: {zh: '缺少英文'}, description: text}], [{title: text, description: {zh: '文'.repeat(2001), en: 'Preview'}}], [{title: text, description: {zh: ' ', en: 'Preview'}}]]) {
    const value = structuredClone(catalog); value.items[0].previewSteps = steps;
    assert.throws(() => validateCatalog(value), /STORE_INVALID/);
  }
});
test('real skill install persists identity, full-package local edits are detected, offline management survives restart', async t => {
  const f = await fixture(t); const result = await f.store.install(f.input, f.confirm);
  assert.equal(result.kind, 'skill'); assert.equal((await f.skills.list()).length, 1);
  assert.equal((await f.store.catalog()).installed[0].locallyModified, false);
  const skill = await f.skills.detail(result.entityId); await fs.writeFile(path.join(path.dirname(skill.path), 'refs/test.txt'), 'User edit');
  assert.equal((await f.store.catalog()).installed[0].locallyModified, true);
  f.responses.offline = true;
  assert.deepEqual(await f.store.install(f.input, f.confirm), result); // Never silently overwrites an existing installation.
  const restarted = new CatalogStore({directory: f.root, database: f.db, skills: f.skills, extensions: f.extensions, sources: [source], fetcher: async () => { throw Error('offline'); }});
  await restarted.initialize(); const snapshot = await restarted.catalog({refresh: true});
  assert.equal(snapshot.stale, true); assert.equal(snapshot.items.length, 1); assert.equal(snapshot.installed[0].entityId, result.entityId);
  await f.skills.remove(result.entityId); assert.equal((await restarted.catalog()).installed.length, 0);
  await assert.rejects(restarted.install(f.input, f.confirm), /offline/);
});
test('real extension install uses trusted package validation, native cancellation and protects existing local package', async t => {
  const f = await fixture(t, 'extension');
  const cancelled = await f.store.install(f.input, {extension: async () => false}); assert.equal(cancelled.cancelled, true); assert.equal(f.extensions.items.length, 0);
  const result = await f.store.install(f.input, f.confirm); assert.equal(result.entityId, 'fixture.store'); assert.equal(f.extensions.items[0].enabled, true);
  await f.db.call('writeSetting', {key: 'catalog-store.installations.v1', value: []});
  await assert.rejects(f.store.install(f.input, f.confirm), /IDENTITY_CONFLICT/); assert.equal(f.extensions.items.length, 1);
});
test('expired, replayed, withdrawn and corrupted releases cannot mutate installed skills', async t => {
  const f = await fixture(t); await f.store.catalog({refresh: true});
  const original = structuredClone(f.catalog);
  f.catalog.generatedAt = new Date(Date.now() - 86400000).toISOString(); f.catalog.expiresAt = new Date(Date.now() - 10000).toISOString(); f.responses.envelope = sign(f.catalog);
  await assert.rejects(f.store.install(f.input, f.confirm), /EXPIRED/);
  f.catalog = structuredClone(original); f.catalog.generatedAt = new Date(Date.parse(original.generatedAt) - 10000).toISOString(); f.responses.envelope = sign(f.catalog);
  await assert.rejects(f.store.install(f.input, f.confirm), /ROLLBACK/);
  f.catalog = structuredClone(original); f.catalog.items[0].release.status = 'revoked'; f.responses.envelope = sign(f.catalog);
  await assert.rejects(f.store.install(f.input, f.confirm), /UNAVAILABLE/);
  f.responses.envelope = sign(original); f.responses.artifact[0] ^= 1;
  await assert.rejects(f.store.install(f.input, f.confirm), /INTEGRITY/); assert.equal((await f.skills.list()).length, 0);
});
test('signed unsafe skill archives, manifest identity mismatch and same-name local skills are refused', async t => {
  const f = await fixture(t);
  f.responses.artifact = Buffer.from(zipSync({...f.files, '../escape': strToU8('bad')}));
  const release = f.item.release; release.artifactSize = f.responses.artifact.length; release.artifactSha256 = crypto.createHash('sha256').update(f.responses.artifact).digest('hex'); release.artifactPath = `artifacts/sha256/${release.artifactSha256}.zip`; f.responses.envelope = sign(f.catalog);
  await assert.rejects(f.store.install(f.input, f.confirm), /Unsafe package path/); assert.equal((await f.skills.list()).length, 0);
  f.responses.artifact = Buffer.from(zipSync(f.files)); release.artifactSize = f.responses.artifact.length; release.artifactSha256 = crypto.createHash('sha256').update(f.responses.artifact).digest('hex'); release.artifactPath = `artifacts/sha256/${release.artifactSha256}.zip`;
  f.item.entityName = 'wrong'; f.responses.envelope = sign(f.catalog); await assert.rejects(f.store.install(f.input, f.confirm), /IDENTITY/);
  f.item.entityName = 'store-test'; f.responses.envelope = sign(f.catalog); const local = await f.skills.importFolder(f.bundle);
  await assert.rejects(f.store.install(f.input, f.confirm), /CONFLICT/); assert.equal((await f.skills.list())[0].id, local.skill.id);
});
test('duplicate install and cancellation while confirmation is open leave no installed entity', async t => {
  const f = await fixture(t); let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), decision = new Promise(resolve => { release = resolve; });
  const pending = f.store.install(f.input, {skill: async () => { enter(); return decision; }});
  await entered; await assert.rejects(f.store.install(f.input, f.confirm), /BUSY/);
  assert.equal(f.store.cancel({listingId: f.input.listingId}).cancelled, true); release(true);
  await assert.rejects(pending, /CANCELLED/); assert.equal((await f.skills.list()).length, 0); assert.equal((await f.store.catalog()).busy.length, 0);
});
test('bounded download rejects declared and streamed overflow and cancels hanging streams', async () => {
  await assert.rejects(download('https://store.test/a', 3, {fetcher: async () => new Response('four', {headers: {'content-length': '4'}})}), /TOO_LARGE/);
  await assert.rejects(download('https://store.test/a', 3, {fetcher: async () => new Response('four')}), /TOO_LARGE/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(download('https://store.test/a', 100, {signal: controller.signal, fetcher: async (_url, options) => { assert.equal(options.redirect, 'error'); if (options.signal.aborted) throw Error('cancelled'); return new Response('ok'); }}), /cancelled/);
});
for (const kind of ['skill', 'extension']) test(`${kind}: pending identity journal recovers a committed installation when final mapping persistence fails`, async t => {
  const f = await fixture(t, kind), originalCall = f.db.call.bind(f.db); let failFinal = true;
  f.db.call = (action, input) => {
    if (failFinal && action === 'writeSetting' && input.key === 'catalog-store.installations.v1' && input.value.some(row => !row.pending)) return Promise.reject(Error('Simulated mapping write failure'));
    return originalCall(action, input);
  };
  await assert.rejects(f.store.install(f.input, f.confirm), /mapping write failure/);
  const [pending] = await f.store.mappings(); assert.equal(pending.pending, true); assert.match(pending.installedDigest, /^[a-f0-9]{64}$/);
  assert.equal(kind === 'skill' ? (await f.skills.list()).length : f.extensions.items.length, 1);
  failFinal = false;
  const restored = new CatalogStore({directory: f.root, database: f.db, skills: f.skills, extensions: f.extensions, sources: [source], fetcher: async () => { throw Error('offline'); }}); await restored.initialize();
  const state = await restored.catalog({refresh: true}); assert.equal(state.installed.length, 1); assert.equal(state.installed[0].locallyModified, false);
  assert.equal((await restored.mappings())[0].pending, undefined);
  assert.equal((await restored.install(f.input, f.confirm)).entityId, state.installed[0].entityId);
});
test('failed pre-commit journal blocks installation; pending skill recovery never binds modified content', async t => {
  const f = await fixture(t), originalCall = f.db.call.bind(f.db);
  f.db.call = (action, input) => action === 'writeSetting' && input.key === 'catalog-store.installations.v1' ? Promise.reject(Error('journal unavailable')) : originalCall(action, input);
  await assert.rejects(f.store.install(f.input, f.confirm), /journal unavailable/); assert.equal((await f.skills.list()).length, 0);
  f.db.call = (action, input) => action === 'writeSetting' && input.key === 'catalog-store.installations.v1' && input.value.some(row => !row.pending) ? Promise.reject(Error('final unavailable')) : originalCall(action, input);
  await assert.rejects(f.store.install(f.input, f.confirm), /final unavailable/);
  const [skill] = await f.skills.list(); await fs.writeFile(path.join(path.dirname(skill.path), 'refs/test.txt'), 'different local content');
  f.db.call = originalCall;
  assert.equal((await f.store.installations()).length, 0); assert.equal((await f.store.mappings())[0].pending, true);
});
test('safe but untrusted deep links produce a visible error without accepting their source or echoing URL input', () => {
  const {inspectStoreLink} = require('../core/catalog-store/catalog.cjs');
  assert.deepEqual(inspectStoreLink('ambleloft://store/item?source=curated&id=examples.travel-registration', []), {code: 'STORE_UNTRUSTED_SOURCE'});
  assert.deepEqual(inspectStoreLink('ambleloft://store/item?source=unknown&id=fixture.test', [source]), {code: 'STORE_UNTRUSTED_SOURCE'});
  assert.equal(inspectStoreLink('ambleloft://store/item?source=https://evil.test&id=fixture.test', []), null);
  assert.equal(inspectStoreLink('ambleloft://store/item?source=curated&id=fixture.test&install=true', []), null);
});
