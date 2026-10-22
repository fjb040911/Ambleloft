// Explicit live probe. Uses an isolated temporary profile and test-only confirmation callbacks.
// node tests/catalog-store-live.cjs /absolute/path/to/trusted-source.json
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {Database} = require('../electron/database.cjs');
const {createSkills} = require('../electron/skills.cjs');
const {ExtensionService} = require('../core/extensions/service.cjs');
const {CatalogStore, loadSources} = require('../core/catalog-store/service.cjs');
const {fork} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {HostManager} = require('../core/extensions/hosts.cjs');
const {OperationRouter} = require('../core/extensions/operations.cjs');
const {FormService} = require('../core/forms/service.cjs');
const {environment} = require('../electron/extensions/process-adapter.cjs');
async function exerciseBusiness({database, directory, skills, extensions, serviceUrl}) {
  const adapter = {spawn(root) {
    const child = fork(path.resolve(__dirname, '../core/extensions/bootstrap.cjs'), [], {cwd: root, env: environment(), execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    const channel = new EventEmitter(); channel.send = message => child.send(message); channel.kill = () => child.kill('SIGKILL');
    child.on('message', message => channel.emit('message', message)); child.on('exit', code => channel.emit('exit', code)); child.on('error', error => channel.emit('error', error));
    child.stdout.on('data', data => channel.emit('log', data)); child.stderr.on('data', data => channel.emit('log', data)); return channel;
  }};
  const hosts = new HostManager({service: extensions, adapter}); extensions.attachHosts(hosts);
  try {
  const id = 'labs.service-desk'; await extensions.setGrants(id, [{capability: 'configuration', resource: 'self'}]);
  async function settings(url) {
    const prior = await extensions.configuration({id});
    await extensions.configuration({id, action: 'save', generation: prior.generation, expectedRevision: prior.revision, value: {serviceUrl: url}});
  }
  let confirmations = 0, approve = false;
  const router = new OperationRouter({service: extensions, workspace: {read: async () => ({projects: []})}, confirm: async () => { confirmations++; return {cancel: !approve}; }});
  await settings('http://127.0.0.1:1');
  assert.equal((await router.invoke(id + '.health', {}, {caller: 'agent'})).ok, false);
  assert.equal((await extensions.configuration({id})).value.serviceUrl, 'http://127.0.0.1:1');
  await settings(serviceUrl);
  const health = await router.invoke(id + '.health', {}, {caller: 'agent'}); assert.equal(health.value?.connected, true, JSON.stringify(health));
  const payload = {asset: 'STORE-LIVE-TEST', problem: 'Curated Store installation and three-step form verification', priority: 'normal', contact: 'Ambleloft test team', confirmed: true};
  const denied = await router.invoke(id + '.submitTicket', payload, {caller: 'agent'}); assert.equal(denied.ok, false); assert.equal(confirmations, 0);
  const run = {id: 'store-live-form', messages: []};
  const forms = new FormService({database, skills, extensions, router, runtime: {runs: [run]}, publish: () => {}});
  const catalog = await forms.catalog(); assert.deepEqual(catalog.errors, []);
  const entry = catalog.entries.find(value => value.extensionId === id); assert.equal(entry.template.steps.length, 3);
  await forms.present(run, 'store-live-turn', entry.key);
  let [flow] = await forms.list(run.id);
  const act = (action, values) => forms.action({runId: run.id, id: flow.id, revision: flow.revision, action, ...(values ? {values} : {})}, {});
  flow = await act('save', {asset: payload.asset, problem: payload.problem}); flow = await act('next'); assert.equal(flow.step, 1);
  flow = await act('save', {priority: payload.priority, contact: payload.contact}); flow = await act('next'); assert.equal(flow.step, 2);
  const unconfirmed = await act('next'); assert.ok(unconfirmed.errors.confirmed); assert.equal(confirmations, 0);
  flow = await act('save', {confirmed: true}); flow = await act('next'); assert.equal(flow.status, 'editing'); assert.equal(flow.submission.status, 'notExecuted'); assert.equal(confirmations, 1);
  const cancelledLookup = await router.invoke(id + '.lookupTicket', {submissionId: flow.submission.id}, {caller: 'page'}); assert.equal(cancelledLookup.value.status, 'notExecuted');
  approve = true; flow = await act('next'); assert.equal(flow.status, 'completed', JSON.stringify(flow)); assert.equal(confirmations, 2);
  const result = flow.results.confirm; assert.match(result.ticketId, /^SR-/);
  await assert.rejects(act('next'), /已完成/);
  const lookup = await router.invoke(id + '.lookupTicket', {submissionId: flow.submission.id}, {caller: 'page'}); assert.deepEqual(lookup.value, {status: 'succeeded', result});
  const query = await router.invoke(id + '.getTicket', {ticketId: result.ticketId}, {caller: 'agent'}); assert.deepEqual(query.value, result);
  const retry = await router.invoke(id + '.submitTicket', payload, {caller: 'page', form: {submissionId: flow.submission.id, flowInstanceId: flow.id, stepId: 'confirm'}}); assert.deepEqual(retry.value, result);
  return {ticketId: result.ticketId, threeStepForm: true, unconfirmedCheckboxBlocked: true, cancelledUserConfirmationNotSubmitted: true, agentWriteDenied: true, idempotentRetry: true, receiptLookup: true, configurationCorrectedAfterFailure: true};
  } finally { await hosts.shutdown(); }
}
async function main() {
  const sources = await loadSources(process.argv[2]);
  assert.equal(sources.length, 1, 'Supply a trusted source configuration');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'amble-store-live-'));
  let database;
  try {
    database = new Database(directory); await database.call('ready');
    const skills = createSkills(directory, database), extensions = new ExtensionService(database, {directory}); await extensions.initialize();
    const store = new CatalogStore({directory, database, skills, extensions, sources}); await store.initialize();
    const catalog = await store.catalog({refresh: true}); assert.equal(catalog.stale, false, catalog.error); assert.ok(catalog.items.length >= 2);
    const results = [];
    for (const item of catalog.items) {
      const installed = await store.install({sourceId: catalog.source.id, listingId: item.id}, {skill: async () => true, extension: async () => true});
      assert.ok(installed.entityId); results.push({listingId: item.id, kind: item.kind, entityId: installed.entityId, version: item.release.version});
    }
    assert.equal((await store.catalog()).installed.length, results.length);
    const business = process.argv[3] ? await exerciseBusiness({database, directory, skills, extensions, serviceUrl: process.argv[3]}) : undefined;
    await extensions.shutdown();
    await store.shutdown(); await database.close();
    database = new Database(directory); await database.call('ready');
    const restoredSkills = createSkills(directory, database), restoredExtensions = new ExtensionService(database, {directory}); await restoredExtensions.initialize();
    const restored = new CatalogStore({directory, database, skills: restoredSkills, extensions: restoredExtensions, sources, fetcher: async () => { throw Error('Simulated offline after real installation'); }}); await restored.initialize();
    const offline = await restored.catalog({refresh: true}); assert.equal(offline.stale, true); assert.equal(offline.installed.length, results.length); assert.ok(offline.installed.every(item => item.locallyModified === false));
    for (const row of results) assert.ok(offline.installed.some(item => item.entityId === row.entityId));
    console.log(JSON.stringify({ok: true, sourceId: catalog.source.id, installed: results, signatureAndArchiveVerified: true, databaseReopened: true, offlineMappingRestored: true, packageCodeExecuted: !!business, ...(business ? {business} : {}), profile: 'isolated temporary profile removed'}, null, 2));
  } finally { await database?.close().catch(() => {}); await fs.rm(directory, {recursive: true, force: true}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
