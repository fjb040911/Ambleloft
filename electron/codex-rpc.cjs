const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const { redact, isLocalHost } = require('./provider.cjs');

const SHELL_ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy'];

const { findCodex, engineRuntime } = require('./engine.cjs');

function codexEnvironment(config, home, inherited = process.env) {
  if (!path.isAbsolute(home)) throw new Error('引擎数据目录必须是绝对路径');
  const env = {};
  for (const key of SHELL_ENV_ALLOWLIST) if (inherited[key]) env[key] = inherited[key];
  env.CODEX_HOME = home;
  env.CODEX_SQLITE_HOME = home;
  env.NO_PROXY = [env.NO_PROXY, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  const endpointHost = new URL(config.baseUrl).hostname;
  if (isLocalHost(endpointHost)) env.NO_PROXY += `,${endpointHost}`;
  env.no_proxy = [env.no_proxy, env.NO_PROXY].filter(Boolean).join(',');
  if (config.apiKey) env.ATELIER_PROVIDER_KEY = config.apiKey;
  return env;
}
function configurationArgs(config, home) {
  const runtime = engineRuntime();
  const values = {
    model: config.model, model_provider: 'atelier',
    cli_auth_credentials_store: 'ephemeral', check_for_update_on_startup: false,
    ...(home ? { sqlite_home: home, log_dir: path.join(home, 'log') } : {}),
    model_reasoning_summary: config.reasoningSummary === false ? 'none' : 'auto',
    model_supports_reasoning_summaries: config.reasoningSummary !== false,
    'model_providers.atelier.name': 'Ambleloft endpoint', 'model_providers.atelier.base_url': config.baseUrl,
    'model_providers.atelier.wire_api': 'responses', 'model_providers.atelier.requires_openai_auth': false,
    'model_providers.atelier.supports_websockets': false, 'model_providers.atelier.request_max_retries': 0,
    'model_providers.atelier.stream_max_retries': 0, 'model_providers.atelier.stream_idle_timeout_ms': 300000,
    'mcp_servers.atelier_progress.command': process.execPath,
    'mcp_servers.atelier_progress.args': [runtime.packaged ? path.join(runtime.resourcesPath, 'tools/plan-server.cjs') : path.join(__dirname, 'plan-server.cjs')],
    'mcp_servers.atelier_progress.env.ELECTRON_RUN_AS_NODE': '1',
    'features.default_mode_request_user_input': true,
    'analytics.enabled': false, web_search: config.webSearch || 'disabled', 'features.multi_agent': false,
    'shell_environment_policy.inherit': 'all', 'shell_environment_policy.include_only': SHELL_ENV_ALLOWLIST, 'shell_environment_policy.exclude': ['ATELIER_PROVIDER_KEY'],
  };
  if(config.effectiveLimits?.contextWindow)values.model_context_window=config.effectiveLimits.contextWindow;
  if(config.effectiveLimits?.autoCompactTokenLimit)values.model_auto_compact_token_limit=config.effectiveLimits.autoCompactTokenLimit;
  if (config.apiKey) values['model_providers.atelier.env_key'] = 'ATELIER_PROVIDER_KEY';
  return Object.entries(values).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}
class CodexRPC {
  constructor({ executable, config, home, cwd, notification, request, exit }) {
    this.pending = new Map(); this.sequence = 0; this.closed = false; this.tail = '';
    const env = codexEnvironment(config, home);
    this.child = spawn(executable, ['app-server', '--listen', 'stdio://', ...configurationArgs(config, home)], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdin.on('error', () => {});
    this.child.stderr.on('data', data => { this.tail = redact((this.tail + data.toString()).slice(-5000), config.apiKey); });
    this.reader = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.reader.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        if (message.id !== undefined) request(message);
        else notification(message);
      } else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(redact(message.error.message || 'Codex 请求失败', config.apiKey)));
        else pending.resolve(message.result);
      }
    });
    const failed = error => {
      if (this.closed) return;
      this.closed = true;
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear(); exit(error);
    };
    this.child.once('error', error => failed(new Error(`Codex 启动失败：${error.code || 'unknown'}`)));
    this.child.once('exit', (code, signal) => failed(new Error(`Codex 进程退出（${signal || code}）${this.tail ? '\n' + this.tail : ''}`)));
  }
  send(message) { if (this.closed) throw new Error('Codex 已断开'); this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  call(method, params, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('Codex 已断开'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('执行已停止')); }
    this.pending.clear(); this.reader.close(); this.child.kill('SIGTERM');
    const child = this.child;
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 2000); timer.unref();
  }
}
module.exports = { CodexRPC, findCodex, configurationArgs, codexEnvironment };
