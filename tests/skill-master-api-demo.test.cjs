const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Ajv = require('ajv');
const { createService } = require('../examples/api-integration/service-desk/server.cjs');
const contract = require('../examples/api-integration/service-desk/docs/openapi.json');
const ajv = new Ajv({ strict: false });
const validators = new Map();
function validate(schema, data) {
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile({ ...schema, components: contract.components }));
  const check = validators.get(key); assert.equal(check(data), true, JSON.stringify(check.errors));
}
const token = 'isolated-test-credential-0001';
const input = { deviceId: 'dev-printer-01', summary: '三楼打印机持续卡纸', description: '今天上午连续三次打印均卡纸，重启后仍然出现。', priority: 'normal' };
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-master-api-'));
  const database = path.join(dir, 'demo.sqlite'); let server, base;
  const start = async () => {
    server = createService({ database, apiKey: token, enableFaults: true, ...options });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections(); });
  await start(); t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const call = async (route, { method = 'GET', body, headers = {}, template = route.split('?')[0], raw } = {}) => {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}) });
    const data = await response.json();
    const op = contract.paths[template]?.[method.toLowerCase()]; assert.ok(op, `Missing OpenAPI operation ${template}`);
    validate((op.responses[response.status] || op.responses.default).content['application/json'].schema, data);
    return { status: response.status, ...data };
  };
  const submit = (body = input, key = 'submission-normal-001', headers = {}) => call('/api/v1/tickets', { method: 'POST', body, headers: { 'Idempotency-Key': key, ...headers } });
  return { call, submit, restart: async () => { await stop(); await start(); } };
}
test('API documentation matches real query, conditional input, write, lookup and pagination', async t => {
  const { call, submit } = await fixture(t);
  assert.equal((await call('/health', { headers: { Authorization: '' } })).data.mode, 'synthetic-demo');
  assert.equal((await call('/api/v1/me')).data.id, 'demo-employee');
  const first = await call('/api/v1/devices?status=active&limit=1'); assert.equal(first.data.items.length, 1); assert.equal(first.data.nextOffset, 1);
  const rest = await call('/api/v1/devices?status=active&offset=1&limit=2'); assert.equal(rest.data.items.length, 2); assert.equal(rest.data.nextOffset, null);
  assert.equal((await call('/api/v1/devices?q=不存在')).data.total, 0);
  validate({ $ref: '#/components/schemas/TicketInput' }, input);
  const created = await submit(); assert.equal(created.status, 201); assert.equal(created.data.contactEmail, 'employee@example.test');
  const detail = await call(`/api/v1/tickets/${created.data.id}`, { template: '/api/v1/tickets/{ticketId}' }); assert.deepEqual(detail.data, created.data);
  const urgent = { ...input, priority: 'urgent', impactReason: '全部业务打印受阻，需要尽快处理。', contactEmail: 'caller@example.test' };
  validate({ $ref: '#/components/schemas/TicketInput' }, urgent);
  assert.equal((await submit(urgent, 'submission-urgent-001')).status, 201);
  const list = await call('/api/v1/tickets?limit=1'); assert.equal(list.data.total, 2); assert.equal(list.data.nextOffset, 1); assert.equal(list.data.items[0].priority, 'urgent');
});
test('errors preserve server integrity and match the published envelope', async t => {
  const { call, submit } = await fixture(t);
  assert.equal((await call('/api/v1/me', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  for (const [body, code, status] of [
    [{ ...input, priority: 'urgent' }, 'VALIDATION_ERROR', 422],
    [{ ...input, confirmed: true }, 'VALIDATION_ERROR', 422],
    [{ ...input, contactEmail: '' }, 'VALIDATION_ERROR', 422],
    [{ ...input, description: null }, 'VALIDATION_ERROR', 422],
    [{ ...input, summary: ' abcde' }, 'VALIDATION_ERROR', 422],
    [{ ...input, deviceId: 'invented-id' }, 'DEVICE_NOT_FOUND', 422],
    [{ ...input, deviceId: 'dev-retired-04' }, 'DEVICE_UNAVAILABLE', 409],
  ]) { const result = await submit(body); assert.equal(result.status, status); assert.equal(result.error.code, code); }
  assert.equal((await submit(input, 'bad')).status, 400);
  assert.equal((await call('/api/v1/devices?limit=0')).status, 400);
  assert.equal((await call('/api/v1/devices?offset=-1')).status, 400);
  assert.equal((await call('/api/v1/devices?status=made-up')).status, 400);
  assert.equal((await call('/api/v1/tickets', { method: 'POST', raw: '{invalid', headers: { 'Idempotency-Key': 'invalid-json-001' } })).error.code, 'INVALID_JSON');
  assert.equal((await submit(input, 'wrong-content-type', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await submit({ ...input, description: 'a'.repeat(17000) })).status, 413);
  assert.equal((await call('/api/v1/tickets')).data.total, 0);
});
test('unknown result recovers after restart, concurrent repeats do not duplicate, changed payload conflicts', async t => {
  const f = await fixture(t); const key = 'uncertain-submission-001';
  const result = await f.submit(input, key, { 'X-Demo-Fault': 'after-commit' }); assert.equal(result.status, 503);
  await f.restart();
  const recovered = await f.call(`/api/v1/submissions/${key}`, { template: '/api/v1/submissions/{submissionId}' });
  assert.equal(recovered.data.status, 'succeeded');
  const repeats = await Promise.all(Array.from({ length: 6 }, () => f.submit(input, key)));
  for (const replay of repeats) { assert.equal(replay.status, 200); assert.equal(replay.data.id, recovered.data.ticket.id); }
  assert.equal((await f.submit({ ...input, summary: '修改后的不同故障描述' }, key)).error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await f.call('/api/v1/tickets')).data.total, 1);
  const missing = await f.call('/api/v1/submissions/not-seen-001', { template: '/api/v1/submissions/{submissionId}' });
  assert.deepEqual(missing.data, { status: 'unknown' });
});
test('fault injection is opt-in and never writes when disabled', async t => {
  const { call, submit } = await fixture(t, { enableFaults: false });
  assert.equal((await submit(input, 'no-fault-001', { 'X-Demo-Fault': 'after-commit' })).error.code, 'FAULT_DISABLED');
  assert.equal((await call('/api/v1/tickets')).data.total, 0);
});
