const {normalizeLimits,resolveLimits}=require('./model-limits.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(tmp, file); }
  finally { await fs.rm(tmp, { force: true }); }
}
function isLocalHost(host) {
  if (['localhost', '127.0.0.1', '[::1]'].includes(host)) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
}
function normalizeProvider(input) {
  if (!input || typeof input.baseUrl !== 'string' || typeof input.model !== 'string') throw new Error('请填写服务 Base URL 与模型 ID');
  let url;
  try { url = new URL(input.baseUrl.trim()); } catch { throw new Error('Base URL 格式不正确'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('端点只支持 HTTP(S)，不要在地址中填写密钥、参数或用户信息');
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) throw new Error('公网端点必须使用 HTTPS；HTTP 仅支持本机或局域网 IP');
  const baseUrl = url.href.replace(/\/+$/, '');
  if (/\/(responses|chat\/completions)$/.test(baseUrl)) throw new Error('请填写 API 根地址（例如 https://服务地址/v1），不要包含 /responses');
  const model = input.model.trim();
  if (!model || model.length > 200 || /[\r\n\x00]/.test(model)) throw new Error('模型 ID 不正确');
  const executable = (input.executable || '').trim();
  if (executable && (!path.isAbsolute(executable) || executable.length > 1000)) throw new Error('Codex 路径必须是可执行文件的绝对路径');
  if(input.protocol!==undefined&&!['auto','responses','chat'].includes(input.protocol))throw new Error('服务协议无效');
  const webSearch = input.webSearch ?? 'disabled';
  if (!['disabled', 'live'].includes(webSearch)) throw new Error('网页搜索设置无效');
  if (webSearch === 'live' && require('./chat-bridge.cjs').usesChat({ baseUrl, model, protocol: input.protocol || 'auto' })) throw new Error('原生网页搜索需要支持搜索工具的 Responses 服务，Chat Completions 不支持此选项');
  const limits=normalizeLimits(input.limits);
  const modelLimits={};
  if(input.modelLimits!==undefined && (!input.modelLimits || typeof input.modelLimits!=='object' || Array.isArray(input.modelLimits) || Object.keys(input.modelLimits).length>100))throw new Error('模型覆盖设置无效');
  for(const [id,value] of Object.entries(input.modelLimits||{})){Object.defineProperty(modelLimits,id,{value:normalizeLimits(value),enumerable:true});resolveLimits(limits,modelLimits[id]);}
  resolveLimits(limits);
  return { webSearch, limits, modelLimits, baseUrl, model, executable, protocol:input.protocol||'auto', reasoningSummary: input.reasoningSummary !== false };
}
const fingerprint = config => createHash('sha256').update(JSON.stringify([config.baseUrl, config.model])).digest('hex');

function createProviderStore(directory, encryption, database) {
  const file = path.join(directory, 'provider.json');
  let queue = Promise.resolve();
  const read = async () => {
    let raw;
    try { raw = database ? await database.call('readSetting', {key:'providers'}) : JSON.parse(await fs.readFile(file, 'utf8')); if (!raw) return {version:2,defaultId:null,providers:[]}; }
    catch (error) { if (error.code === 'ENOENT') return { version: 2, defaultId: null, providers: [] }; throw new Error('模型配置无法读取，请保留文件并检查后重试'); }
    if (raw.version === 2) {
      if (!Array.isArray(raw.providers) || raw.providers.some(p => typeof p.id !== 'string') || new Set(raw.providers.map(p=>p.id)).size !== raw.providers.length || (raw.defaultId !== null && !raw.providers.some(p=>p.id===raw.defaultId))) throw new Error('模型配置格式不正确');
      raw.providers.forEach(normalizeProvider); return raw;
    }
    normalizeProvider(raw);
    // Keep legacy ciphertext intact; migration never decrypts or changes its keychain backend.
    return { version: 2, defaultId: 'legacy', providers: [{ ...raw, id: 'legacy', name: '原有模型服务', models: [raw.model] }] };
  };
  const publicConfig = p => p ? { ...normalizeProvider(p), id:p.id, name:p.name || p.model, models:p.models || [p.model], hasKey:!!p.encryptedKey, configured:true } : {baseUrl:'',model:'',executable:'',hasKey:false,configured:false};
  const mutate = operation => { const work=queue.then(async()=>{const state=await read();const result=await operation(state);await (database ? database.call('writeSetting',{key:'providers',value:state}) : writeJSON(file,state));return result;});queue=work.catch(()=>{});return work; };
  return {
    async list() { await queue;const state=await read();return {defaultId:state.defaultId,providers:state.providers.map(publicConfig)}; },
    async public(id) { await queue;const state=await read();return publicConfig(state.providers.find(p=>p.id===(id||state.defaultId))); },
    save(input) { return mutate(async state=>{
      const config=normalizeProvider(input);
      const id=input.id || (input.create ? randomUUID() : state.defaultId || randomUUID());
      const old=state.providers.find(p=>p.id===id);
      if(input.id&&!old)throw new Error('模型服务不存在');
      if(input.name!==undefined&&(typeof input.name!=='string'||!input.name.trim()||input.name.length>120))throw new Error('请填写 1–120 字的服务名称');
      const models=input.models || [config.model];
      if(!Array.isArray(models)||!models.length||models.length>100||models.some(m=>typeof m!=='string'||!m.trim()||m.length>200||/[\r\n\x00]/.test(m)))throw new Error('模型列表不正确');
      const unique=[...new Set(models.map(m=>m.trim()))];if(!unique.includes(config.model))throw new Error('默认模型必须在模型列表中');
      if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>10000||/[\r\n\x00]/.test(input.apiKey)))throw new Error('API Key 格式不正确');
      let encryptedKey='';
      if(input.apiKey){if(!encryption.isEncryptionAvailable())throw new Error('系统加密存储不可用，未保存 API Key');encryptedKey=encryption.encryptString(input.apiKey).toString('base64');}
      else if(!input.clearKey&&old?.encryptedKey){if(old.baseUrl!==config.baseUrl)throw new Error('端点已更换，请重新填写 API Key 或明确移除密钥，避免将旧密钥发送到新服务');encryptedKey=old.encryptedKey;}
      const saved={...config,id,name:input.name?.trim()||old?.name||config.model,models:unique,encryptedKey};
      state.providers=old?state.providers.map(p=>p.id===id?saved:p):[...state.providers,saved];state.defaultId ||= id;
      return publicConfig(saved);
    }); },
    setDefault(id) { return mutate(state=>{if(!state.providers.some(p=>p.id===id))throw new Error('模型服务不存在');state.defaultId=id;}); },
    remove(id) { return mutate(state=>{if(!state.providers.some(p=>p.id===id))throw new Error('模型服务不存在');state.providers=state.providers.filter(p=>p.id!==id);if(state.defaultId===id)state.defaultId=state.providers[0]?.id||null;}); },
    async secret(id, model) {
      await queue;const state=await read();const stored=state.providers.find(p=>p.id===(id||state.defaultId));
      if(!stored)throw new Error('请先在设置中配置对应的模型服务');
      const config=normalizeProvider({...stored,model:model||stored.model});
      if(model&&!(stored.models||[stored.model]).includes(model))throw new Error('模型已从服务配置中移除，请恢复配置后再继续会话');
      let apiKey='';
      if(stored.encryptedKey){if(!encryption.isEncryptionAvailable())throw new Error('系统加密存储不可用，无法读取 API Key');try{apiKey=encryption.decryptString(Buffer.from(stored.encryptedKey,'base64'));}catch{throw new Error('API Key 无法解密，请在设置中重新填写');}}
      return {...config, effectiveLimits:resolveLimits(config.limits,config.modelLimits[config.model]),id:stored.id,apiKey};
    },
  };
}
function redact(message, key) { return key ? String(message).split(key).join('[REDACTED]') : String(message); }
async function probeProvider(config) {
  const chat=require('./chat-bridge.cjs').usesChat(config);
  let response;
  try {
    response = await fetch(`${config.baseUrl}/${chat?'chat/completions':'responses'}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(chat?{model:config.model,messages:[{role:'user',content:'Reply exactly OK.'}],stream:false}:{ model: config.model, input: 'Reply exactly OK.', stream: false, store: false }) });
  } catch { throw new Error('端点连接失败或超时，请检查地址、网络和证书'); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`端点返回 HTTP ${response.status}。请检查 API Key、模型 ID 与所选服务协议支持。`); }
  const data = await response.json();
  if(chat){if(!Array.isArray(data.choices)||!data.choices[0]?.message||data.error)throw new Error('端点未返回有效的 Chat Completions 结果');return {message:'Chat Completions 端点测试成功。思考与工具调用仍取决于服务兼容性。'};}
  if (data.object !== 'response' || !Array.isArray(data.output) || data.error || data.status === 'failed') throw new Error('端点未返回有效的 Responses API 结果；仅 Chat Completions 接口无法直接使用');
  return { message: 'Responses 端点测试成功。流式与工具调用仍取决于该服务的兼容性。' };
}
module.exports = { writeJSON, normalizeProvider, createProviderStore, fingerprint, redact, probeProvider, isLocalHost };
