// Synthetic business service for Skill master trials. No host/extension internals required.
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEVICES = [
  { id: 'dev-printer-01', name: '三楼共享打印机', location: '上海办公室 · 三楼', status: 'active' },
  { id: 'dev-laptop-02', name: '研发测试笔记本', location: '上海办公室 · 研发区', status: 'active' },
  { id: 'dev-router-03', name: '会议室网络设备', location: '杭州办公室 · 会议室', status: 'active' },
  { id: 'dev-retired-04', name: '已退役扫描仪', location: '仓库', status: 'retired' },
];
const USER = { id: 'demo-employee', displayName: '演示员工', email: 'employee@example.test' };
const DEMO_KEY = 'local-demo-key-not-for-production';
class ApiError extends Error {
  constructor(status, code, message, field) { super(message); Object.assign(this, { status, code, field }); }
}
function fail(status, code, message, field) { throw new ApiError(status, code, message, field); }
function validKey(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value); }
function ticketInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(422, 'VALIDATION_ERROR', '请求体必须是对象');
  const limits = { deviceId: [1, 100], summary: [5, 100], description: [10, 2000], priority: [1, 10], impactReason: [10, 500], contactEmail: [3, 254] };
  for (const key of Object.keys(body)) if (!Object.hasOwn(limits, key)) fail(422, 'VALIDATION_ERROR', '不支持的字段', key);
  for (const key of ['deviceId', 'summary', 'description', 'priority']) if (!Object.hasOwn(body, key)) fail(422, 'VALIDATION_ERROR', '缺少必填字段', key);
  for (const [key, value] of Object.entries(body)) {
    const [min, max] = limits[key];
    if (typeof value !== 'string' || value !== value.trim() || Array.from(value).length < min || Array.from(value).length > max) fail(422, 'VALIDATION_ERROR', `长度应为 ${min}–${max}，且不能有首尾空白`, key);
  }
  if (!['normal', 'urgent'].includes(body.priority)) fail(422, 'VALIDATION_ERROR', '优先级无效', 'priority');
  if (body.priority === 'urgent' && !body.impactReason) fail(422, 'VALIDATION_ERROR', '紧急工单必须说明业务影响', 'impactReason');
  if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) fail(422, 'VALIDATION_ERROR', '邮箱格式无效', 'contactEmail');
  return Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)));
}
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function json(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'CONTENT_TYPE', '使用 application/json');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) fail(413, 'BODY_TOO_LARGE', '请求体超过 16 KiB'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'INVALID_JSON', 'JSON 格式错误'); }
}
function pagination(url) {
  const parse = (name, fallback, max, min) => {
    const raw = url.searchParams.get(name); if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) fail(400, 'INVALID_QUERY', `无效的 ${name}`, name);
    return Number(raw);
  };
  return { offset: parse('offset', 0, 1000000, 0), limit: parse('limit', 20, 100, 1) };
}
function page(items, { offset, limit }) {
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
function createService({ database = ':memory:', apiKey = DEMO_KEY, enableFaults = false } = {}) {
  if (typeof apiKey !== 'string' || apiKey.length < 16 || apiKey.length > 512 || /[\s\x00-\x1f\x7f]/.test(apiKey)) throw Error('DEMO_API_KEY 需要 16–512 个非空白可打印字符');
  if (database !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(database)), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, owner TEXT NOT NULL, submission_key TEXT NOT NULL, payload_hash TEXT NOT NULL, ticket TEXT NOT NULL, UNIQUE(owner, submission_key));');
  const credential = Buffer.from(`Bearer ${apiKey}`);
  const readSubmission = key => db.prepare('SELECT * FROM tickets WHERE owner = ? AND submission_key = ?').get(USER.id, key);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { data: { status: 'ok', mode: 'synthetic-demo', version: '1.0.0' } });
      const supplied = Buffer.from(req.headers.authorization || '');
      if (supplied.length !== credential.length || !timingSafeEqual(supplied, credential)) fail(401, 'UNAUTHORIZED', '请在扩展设置中配置有效凭据');
      if (req.method === 'GET' && url.pathname === '/api/v1/me') return send(res, 200, { data: USER });
      if (req.method === 'GET' && url.pathname === '/api/v1/devices') {
        const status = url.searchParams.get('status');
        if (status && !['active', 'retired'].includes(status)) fail(400, 'INVALID_QUERY', '设备状态无效', 'status');
        const query = (url.searchParams.get('q') || '').toLowerCase();
        const devices = DEVICES.filter(d => (!status || d.status === status) && `${d.id} ${d.name} ${d.location}`.toLowerCase().includes(query));
        return send(res, 200, { data: page(devices, pagination(url)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/tickets') {
        const key = req.headers['idempotency-key'];
        if (!validKey(key)) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key 需要 8–128 个字母、数字、下划线或短横线');
        const fault = req.headers['x-demo-fault'];
        if (fault && (!enableFaults || fault !== 'after-commit')) fail(400, 'FAULT_DISABLED', '未启用该测试故障');
        const input = ticketInput(await json(req));
        const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        let ticket, replayed = false;
        db.exec('BEGIN IMMEDIATE');
        try {
          const existing = readSubmission(key);
          if (existing) {
            if (existing.payload_hash !== digest) fail(409, 'IDEMPOTENCY_CONFLICT', '同一提交标识不能用于不同内容');
            ticket = JSON.parse(existing.ticket); replayed = true;
          } else {
            const device = DEVICES.find(d => d.id === input.deviceId);
            if (!device) fail(422, 'DEVICE_NOT_FOUND', '请查询并选择真实设备 ID', 'deviceId');
            if (device.status !== 'active') fail(409, 'DEVICE_UNAVAILABLE', '设备已退役，不能报修', 'deviceId');
            ticket = { ...input, id: `TKT-${randomUUID()}`, deviceName: device.name, status: 'submitted', createdBy: USER.id, contactEmail: input.contactEmail || USER.email, createdAt: new Date().toISOString() };
            db.prepare('INSERT INTO tickets VALUES (?, ?, ?, ?, ?)').run(ticket.id, USER.id, key, digest, JSON.stringify(ticket));
          }
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        if (!replayed && fault === 'after-commit') fail(503, 'RESULT_UNKNOWN', '演示：请求结果不明确，请按提交标识查询，不要新建提交');
        return send(res, replayed ? 200 : 201, { data: ticket });
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/tickets') {
        const list = db.prepare('SELECT ticket FROM tickets WHERE owner = ? ORDER BY rowid DESC').all(USER.id).map(r => JSON.parse(r.ticket));
        return send(res, 200, { data: page(list, pagination(url)) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/v1/tickets/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/v1/tickets/'.length));
        const row = db.prepare('SELECT ticket FROM tickets WHERE owner = ? AND id = ?').get(USER.id, id);
        if (!row) fail(404, 'NOT_FOUND', '工单不存在');
        return send(res, 200, { data: JSON.parse(row.ticket) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/v1/submissions/')) {
        const key = decodeURIComponent(url.pathname.slice('/api/v1/submissions/'.length));
        if (!validKey(key)) fail(400, 'INVALID_IDEMPOTENCY_KEY', '提交标识无效');
        const row = readSubmission(key);
        // Absence does not fence a concurrent or delayed POST: never claim notExecuted.
        return send(res, 200, { data: row ? { status: 'succeeded', ticket: JSON.parse(row.ticket) } : { status: 'unknown' } });
      }
      fail(404, 'NOT_FOUND', '接口不存在');
    } catch (error) {
      const known = error instanceof ApiError;
      if (!res.destroyed && !res.headersSent) send(res, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务内部错误', ...(known && error.field ? { field: error.field } : {}) } });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close', () => db.close());
  return server;
}
if (require.main === module) {
  const host = process.env.DEMO_HOST || '127.0.0.1';
  const key = process.env.DEMO_API_KEY || DEMO_KEY;
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && key === DEMO_KEY) throw Error('非本机监听必须设置独立 DEMO_API_KEY；公网还需 TLS 和访问限制');
  const port = Number(process.env.DEMO_PORT || 47835);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('DEMO_PORT 无效');
  const server = createService({ database: process.env.DEMO_DB || path.join(__dirname, '.data/service-desk.sqlite'), apiKey: key, enableFaults: process.env.DEMO_FAULTS === '1' });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Synthetic service desk: http://${host}:${port} (health: /health). Credentials: see README; never use real business data.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
}
module.exports = { createService };
