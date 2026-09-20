const test = require('node:test');
const assert = require('node:assert/strict');
const { configurationArgs, codexEnvironment } = require('../electron/codex-rpc.cjs');
const { normalizeProvider, createProviderStore } = require('../electron/provider.cjs');
const { AgentRuntime } = require('../electron/agent-runtime.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('shell can inherit proxy/certificate settings but not model credentials or unrelated variables', () => {
  const config = { baseUrl: 'http://localhost/v1', model: 'fixture', apiKey: 'provider-secret' };
  const env = codexEnvironment(config, os.tmpdir(), { HTTPS_PROXY: 'http://localhost:1234', https_proxy: 'http://localhost:1234', ALL_PROXY: 'socks5://localhost:1234', no_proxy: 'internal', OPENAI_API_KEY: 'external', UNRELATED_SECRET: 'secret' });
  const args = configurationArgs(config);
  const values = Object.fromEntries(args.filter((_, i) => i % 2).map(value => { const i = value.indexOf('='); return [value.slice(0, i), JSON.parse(value.slice(i + 1))]; }));
  const allowed = values['shell_environment_policy.include_only'];
  assert.equal(values['shell_environment_policy.inherit'], 'all');
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'SSL_CERT_FILE']) assert.ok(allowed.includes(key));
  for (const key of ['ATELIER_PROVIDER_KEY', 'OPENAI_API_KEY', 'UNRELATED_SECRET', 'CODEX_HOME']) assert.ok(!allowed.includes(key));
  assert.equal(env.https_proxy, env.HTTPS_PROXY);
  assert.ok(env.no_proxy.includes('localhost')); assert.ok(env.no_proxy.includes('internal'));
  assert.equal(env.OPENAI_API_KEY, undefined); assert.equal(env.UNRELATED_SECRET, undefined);
  assert.ok(!args.join(' ').includes('provider-secret'));
});

test('native search is opt-in, persists per provider and is rejected for Chat Completions', async t => {
  const base = { baseUrl: 'https://example.com/v1', model: 'fixture' };
  assert.equal(normalizeProvider(base).webSearch, 'disabled');
  assert.throws(() => normalizeProvider({ ...base, webSearch: 'unknown' }));
  for (const config of [{ protocol: 'chat' }, { protocol: 'auto', model: 'deepseek-test' }]) assert.throws(() => normalizeProvider({ ...base, ...config, webSearch: 'live' }), /Responses/);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ambleloft-search-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createProviderStore(directory, {});
  await store.save({ ...base, protocol: 'responses', webSearch: 'live' });
  const saved = await createProviderStore(directory, {}).secret();
  assert.equal(saved.webSearch, 'live');
  assert.ok(configurationArgs(saved).includes('web_search="live"'));
});

test('new and resumed threads receive execution policy without relaxing sandbox or auto-approving', async () => {
  for (const threadId of [null, 'existing']) {
    const calls = [];
    const runtime = new AgentRuntime({ directory: '/unused', publish() {} }); runtime.changed = () => {};
    const run = { threadId, cwd: '/tmp', messages: [{ text: '查明天的潮汐' }] };
    const rpc = { send() {}, async call(method, params) { calls.push({ method, params }); return method.startsWith('thread/') ? { thread: { id: 'existing' } } : method === 'turn/start' ? { turn: { id: 'turn' } } : {}; } };
    await runtime.execute({ rpc, run, config: { model: 'fixture' } });
    const thread = calls.find(c => c.method.startsWith('thread/'));
    assert.equal(thread.method, threadId ? 'thread/resume' : 'thread/start');
    assert.equal(thread.params.approvalPolicy, 'on-request'); assert.equal(thread.params.sandbox, 'read-only');
    assert.match(thread.params.developerInstructions, /supported approval mechanism/);
    assert.match(thread.params.developerInstructions, /After approval, continue the original task/);
    assert.match(thread.params.developerInstructions, /After denial, respect the decision/);
    assert.equal(calls.filter(c => c.method === 'turn/start').length, 1);
  }
});
