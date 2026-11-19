const { spawn } = require('node:child_process');
const {ByteWriter}=require('./byte-stream.cjs');
const {RpcJsonReader}=require('./rpc-json-reader.cjs');
const {StreamRedactor}=require('./stream-redactor.cjs');
const {StringDecoder}=require('node:string_decoder');
const path = require('node:path');
const { redact, isLocalHost } = require('./provider.cjs');

const SHELL_ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy'];
// Rust-launched Windows shells need the OS/profile environment explicitly.
// Keep this scoped to Windows; never inherit arbitrary application secrets.
const shellEnvironmentKeys = platform => [...SHELL_ENV_ALLOWLIST, ...(platform === 'win32' ? ['SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432'] : [])];

const { findCodex, engineRuntime } = require('./engine.cjs');

function codexEnvironment(config, home, inherited = process.env, platform = process.platform) {
  if (!path.isAbsolute(home)) throw new Error('引擎数据目录必须是绝对路径');
  const env = {};
  for (const key of shellEnvironmentKeys(platform)) {
    const source = platform === 'win32' ? Object.keys(inherited).find(name => name.toLowerCase() === key.toLowerCase()) : key;
    if (source && inherited[source]) env[key] = inherited[source];
  }
  env.CODEX_HOME = home;
  env.CODEX_SQLITE_HOME = home;
  env.NO_PROXY = [env.NO_PROXY, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  const endpointHost = new URL(config.baseUrl).hostname;
  if (isLocalHost(endpointHost)) env.NO_PROXY += `,${endpointHost}`;
  env.no_proxy = [env.no_proxy, env.NO_PROXY].filter(Boolean).join(',');
  if (config.apiKey) env.ATELIER_PROVIDER_KEY = config.apiKey;
  return env;
}
function configurationArgs(config, home, extensionMcp, platform = process.platform) {
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
    'analytics.enabled': false, web_search: config.webSearch || 'disabled', 'features.multi_agent': true,
    'shell_environment_policy.inherit': 'all', 'shell_environment_policy.include_only': shellEnvironmentKeys(platform), 'shell_environment_policy.exclude': ['ATELIER_PROVIDER_KEY','AMBLE_EXTENSION_AUTH'],
  };
  if(config.remoteOnly){values['features.shell_tool']=false;values['features.unified_exec']=false;values['features.shell_snapshot']=false;values['features.browser_use']=false;values['features.computer_use']=false;}
  if(extensionMcp){values['features.shell_snapshot']=false;values['mcp_servers.amble_extensions.url']=extensionMcp.url;values['mcp_servers.amble_extensions.env_http_headers.Authorization']='AMBLE_EXTENSION_AUTH';values['mcp_servers.amble_extensions.tool_timeout_sec']=extensionMcp.tool_timeout_sec;for(const name of ['creation_read','creation_update','creation_prepare','remote_list','remote_search','remote_read','remote_skill_read','remote_write','remote_exec','input_capabilities','input_list','input_request','input_read_answer','input_resolve_from_message','input_cancel','input_replace','extension_list_operations','extension_invoke_operation','forms_list','forms_present','forms_capabilities','forms_read_submission','ui_capabilities','ui_list','ui_present','ui_update','ui_read_submission','skills_install','space_list_documents','space_read_document','space_search_knowledge','space_propose_document'])values['mcp_servers.amble_extensions.tools.'+name+'.approval_mode']='approve';}
  const contextLimits=require('../core/models/budget.cjs').runtimeContextLimits(config);
  if(contextLimits.contextWindow)values.model_context_window=contextLimits.contextWindow;
  if(contextLimits.autoCompactTokenLimit)values.model_auto_compact_token_limit=contextLimits.autoCompactTokenLimit;
  if (config.apiKey) values['model_providers.atelier.env_key'] = 'ATELIER_PROVIDER_KEY';
  return Object.entries(values).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}
class CodexRPC {
  constructor({ executable, config, home, cwd, notification, request, exit, extensionMcp }) {
    this.pending = new Map(); this.incoming=new Map();this.results=new WeakMap(); this.sequence = 0; this.closed = false; this.tail = '';
    this.options={executable,config,home,cwd,notification,request,exit,extensionMcp};
    this.stopped=new Promise(resolve=>{this.resolveStopped=resolve;});
  }
  start() {
    const {executable,config,home,cwd,notification,request,exit,extensionMcp}=this.options;
    const env = codexEnvironment(config, home);
    if(extensionMcp)env.AMBLE_EXTENSION_AUTH=extensionMcp.http_headers.Authorization;
    this.child = require('./owned-process.cjs').spawnOwnedProcess(spawn,executable, ['app-server', '--listen', 'stdio://', ...configurationArgs(config, home, extensionMcp)], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const failed = error => {
      if (this.closed) return;
      this.closed = true;this.incoming.clear();this.reader?.close();this.writer?.close();this.terminate();
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();const timer=setTimeout(()=>{if(process.platform!=='win32'&&this.child.exitCode===null&&this.child.signalCode===null)this.child.kill('SIGKILL');},2000);timer.unref();exit(error);
    };
    this.child.stdin.on('error',failed);
    const decoder=new StringDecoder('utf8'),redactor=new StreamRedactor(config.apiKey);
    this.child.stderr.on('data',data=>{this.tail=(this.tail+redactor.write(decoder.write(data))).slice(-5000);});
    this.child.stderr.on('end',()=>{this.tail=(this.tail+redactor.write(decoder.end())+redactor.end(true)).slice(-5000);});
    this.writer=new ByteWriter(this.child.stdin,failed);
    this.reader=new RpcJsonReader(this.child.stdout,(message,frame)=>{
      if(!message||typeof message!=='object'||Array.isArray(message))throw Error('INVALID_RPC_MESSAGE');
      if (message.method) {
        if (message.id !== undefined) {if(frame.encodedBytes>8*1024*1024)throw Object.assign(Error('引擎交互请求超过内存预算'),{code:'STREAM_BUFFER_LIMIT'});this.incoming.set(message.id,frame);request(message);return this.incoming.has(message.id);}
        else notification(message);
      } else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        try{
          if (message.error) pending.reject(Object.assign(new Error(require('./rpc-text.cjs').preview({config},message.error,'message',16000) || 'Codex 请求失败'),{code:message.error.code,rpcRejected:true}));
          else {if(require('./text-spool.cjs').reference(message,'result'))throw Error('INVALID_RPC_RESULT');const result=message.result;if(frame.store&&result&&typeof result==='object')this.results.set(result,frame);pending.resolve(result);return true;}
        }catch(error){pending.reject(error);throw error;}
        finally{this.pending.delete(message.id);clearTimeout(pending.timer);}
      }

    },failed,{root:home});
    this.reader.setBackpressure(!!this.pressure);
    this.child.once('error', error => {this.resolveStopped();failed(new Error(`Codex 启动失败：${error.code || 'unknown'}`));});
    this.child.once('exit',(code)=>{
      this.resolveStopped(code);
      if(this.closed){this.destroyPipes();return;}
      // Inherited handles may keep close/EOF pending after the engine exited.
      // Drain available notifications, but never wait indefinitely for an heir.
      this.reader.setBackpressure(false);
      const timer=setTimeout(()=>{this.reader.end();void this.reader.finished.then(()=>{this.destroyPipes();failed(new Error(`Codex 进程退出（${code}）${this.tail?'\n'+this.tail:''}`));});},2000);timer.unref();
      this.child.once('close',()=>clearTimeout(timer));
    });
    this.child.once('close', async(code,signal)=>{await this.reader.finished;failed(new Error(`Codex 进程退出（${signal || code}）${this.tail ? '\n' + this.tail : ''}`));});
  }
  send(message) { if (this.closed) throw new Error('Codex 已断开'); const ticket=this.writer.send(`${JSON.stringify(message)}\n`,message.id!==undefined&&!message.method||['turn/interrupt','thread/archive'].includes(message.method));if(message.id!==undefined&&!message.method){this.reader?.release(this.incoming.get(message.id));this.incoming.delete(message.id);}return ticket; }
  setBackpressure(value){this.pressure=!!value;this.reader?.setBackpressure(value);}
  releaseResult(value){const frame=value&&typeof value==='object'&&this.results.get(value);if(frame){this.reader?.release(frame);this.results.delete(value);}}
  call(method, params, timeout = 30000) {
    if(method==='initialize'){
      if(this.initializing)return this.initializing;
      if(this.closed)return Promise.reject(new Error('Codex 已断开'));
      const controller=new AbortController(),deadline=Date.now()+timeout;this.initializationController=controller;
      const timer=setTimeout(()=>controller.abort(new Error('Codex 请求超时：initialize')),timeout);
      controller.signal.addEventListener('abort',()=>{void this.close().catch(()=>{});},{once:true});
      const work=require('./engine-initialization.cjs').initializeInOrder(this.options.home,async()=>{
        controller.signal.throwIfAborted();if(this.closed)throw Error('执行已停止');
        try{this.start();return await this.callRaw(method,params,Math.max(1,deadline-Date.now()));}
        catch(error){await this.close();throw error;}
      });
      this.initializing=require('../core/automation/inference-deadline.cjs').abortable(work,controller.signal).finally(()=>clearTimeout(timer));
      return this.initializing;
    }
    return this.callRaw(method,params,timeout);
  }
  callRaw(method,params,timeout){
    if (this.closed) return Promise.reject(new Error('Codex 已断开'));
    if(!this.child)return Promise.reject(new Error('Codex 尚未初始化'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.writer.cancel(this.pending.get(id)?.ticket);this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { const ticket=this.send({ id, method, params });if(this.pending.has(id))this.pending.get(id).ticket=ticket; } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  close() {
    if (this.closed) return Promise.all([this.stopped,this.termination]).then(()=>{});
    this.closed = true;this.incoming.clear();
    if(!this.child){this.initializationController?.abort(new Error('执行已停止'));this.resolveStopped();return this.stopped;}
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('执行已停止')); }
    this.pending.clear(); this.reader.close();this.writer.close(); this.terminate();
    const child = this.child;
    const timer = setTimeout(() => { if (process.platform!=='win32'&&child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 2000); timer.unref();
    return Promise.all([this.stopped,this.termination]).then(value=>{clearTimeout(timer);this.destroyPipes();return value[0];});
  }
  terminate(){this.termination ||= require('./owned-process.cjs').stopOwnedProcess(this.child);this.termination.catch(error=>{this.terminationError=error;});return this.termination;}
  destroyPipes(){this.child?.stdin.destroy();this.child?.stdout.destroy();this.child?.stderr.destroy();}
}
module.exports = { CodexRPC, findCodex, configurationArgs, codexEnvironment };
