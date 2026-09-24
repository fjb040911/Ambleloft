import { t } from './i18n';
import { useState } from 'react';
import { Check, PlugZap } from 'lucide-react';
import ModelLimitSettings from './ModelLimitSettings';
import type { ImageInputCapability, ModelLimits, ProviderConfig } from './types';

export default function ProviderSettings({ config, onSaved }: { config: ProviderConfig | null; onSaved(config: ProviderConfig): void }) {
  const [modelImageInputs,setModelImageInputs]=useState<Record<string,ImageInputCapability>>(config?.modelImageInputs||{});
  const [limits,setLimits]=useState<ModelLimits>(config?.limits||{});
  const [modelLimits,setModelLimits]=useState<Record<string,ModelLimits>>(config?.modelLimits||{});
  const [overrideModel,setOverrideModel]=useState('');
  const [name,setName]=useState(config?.name || '');
  const [modelList,setModelList]=useState((config?.models||[config?.model||'']).join('\n'));
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || '');
  const [model, setModel] = useState(config?.model || '');
  const [executable, setExecutable] = useState(config?.executable || '');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [reasoningSummary, setReasoningSummary] = useState(config?.reasoningSummary !== false);
  const [protocol,setProtocol]=useState<'auto'|'responses'|'chat'>(config?.protocol||'auto');
  const [webSearch,setWebSearch]=useState<'disabled'|'live'>(config?.webSearch||'disabled');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = JSON.stringify(modelImageInputs)!==JSON.stringify(config?.modelImageInputs||{}) || webSearch !== (config?.webSearch||'disabled') || JSON.stringify(limits)!==JSON.stringify(config?.limits||{}) || JSON.stringify(modelLimits)!==JSON.stringify(config?.modelLimits||{}) || protocol !== (config?.protocol||'auto') || name !== (config?.name||'') || modelList !== (config?.models||[config?.model||'']).join('\n') || baseUrl !== (config?.baseUrl || '') || model !== (config?.model || '') || executable !== (config?.executable || '') || reasoningSummary !== (config?.reasoningSummary !== false) || !!apiKey || clearKey;
  const save = async () => {
    if (!window.desktop) return;
    setBusy(true); setError(''); setMessage('');
    try { const next = await window.desktop.saveProvider({ id:config?.id, create:!config?.id, name, limits, modelLimits, modelImageInputs, models:[...new Set([...modelList.split('\n').map(m=>m.trim()).filter(Boolean),model.trim()])], baseUrl, model, executable, reasoningSummary, protocol, webSearch, ...(apiKey ? { apiKey } : {}), clearKey });
      const refreshed = await window.desktop.getProvider(next.id); onSaved(refreshed); setBaseUrl(next.baseUrl); setModel(next.model); setApiKey(''); setClearKey(false); setMessage('配置已保存，可以返回工作台开始对话。');
    } catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
  };
  const test = async () => {
    if (!window.desktop) return;
    setBusy(true); setError(''); setMessage('');
    try { setMessage((await window.desktop.testProvider(config?.id)).message); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <section className="settings-group provider-settings"><h2><PlugZap size={17} />{t("模型服务")}</h2><p>{t("支持 Responses 与 Chat Completions 服务。任务及工具读取的上下文会发送到此端点。")}</p>
    {!window.desktop && <div className="info-box">{t("请在桌面版中配置和运行任务。浏览器预览不会保存 API Key。")}</div>}
    <fieldset disabled={!window.desktop || busy}>
      <label>{t("服务名称")}<input aria-label={t("服务名称")} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Base URL<input aria-label="Base URL" type="url" placeholder="https://api.example.com/v1" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      <label>{t("模型 ID")}<input aria-label={t("模型 ID")} placeholder={t("填写服务提供的准确模型名称")} value={model} onChange={event => setModel(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      <label>{t("可选模型（每行一个 ID）")}<textarea aria-label={t("可选模型")} value={modelList} onChange={e=>setModelList(e.target.value)}/></label>
      <p className="fine-print">{t('图片输入能力按模型保存。未配置或不支持时，不发送图片；生成文件不代表已完成视觉检查。')}</p>
      {[...new Set([model,...modelList.split('\n')].map(m=>m.trim()).filter(Boolean))].map(id=><label key={id}>{id} · {t('图片输入能力')}<select aria-label={`${id} · ${t('图片输入能力')}`} value={modelImageInputs[id]||'unknown'} onChange={e=>setModelImageInputs(previous=>({...previous,[id]:e.target.value as ImageInputCapability}))}><option value="unknown">{t('未配置（不发送图片）')}</option><option value="unsupported">{t('不支持图片')}</option><option value="supported">{t('支持图片')}</option></select></label>)}
      <label>{t("服务协议")}<select aria-label={t("服务协议")} value={protocol} onChange={e=>setProtocol(e.target.value as typeof protocol)}><option value="auto">{t("自动（DeepSeek 使用 Chat Completions）")}</option><option value="responses">Responses</option><option value="chat">Chat Completions</option></select></label>
      <label>{t('网页搜索')}<select aria-label={t('网页搜索')} value={webSearch} onChange={e=>setWebSearch(e.target.value as 'disabled'|'live')}><option value="disabled">{t('关闭原生搜索')}</option><option value="live">{t('启用实时搜索')}</option></select></label><p className="fine-print">{t('仅适用于支持原生搜索工具的 Responses 服务，可能产生额外费用。关闭时仍可通过命令工具申请联网。')}</p>
      <label>API Key <span>{config?.hasKey ? t("已加密保存 · 留空保持不变") : t("本机无鉴权服务可留空")}</span><input aria-label="API Key" type="password" placeholder={config?.hasKey ? t("填写新密钥可替换") : t("使用系统能力加密后保存在本机")} value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" /></label>
      {config?.hasKey && <label className="checkbox-label"><input type="checkbox" checked={clearKey} onChange={event => setClearKey(event.target.checked)} />{t("移除已保存密钥")}</label>}
      <details><summary>高级设置</summary>
        <p className="fine-print">端点默认容量。留空使用内核／服务端默认值；设置窗口后，未指定的压缩阈值按 80% 计算。保存后下一轮生效。</p>
        <ModelLimitSettings value={limits} onChange={setLimits}/>
        <label>模型单独覆盖<select value={overrideModel} onChange={e=>setOverrideModel(e.target.value)}><option value="">选择模型</option>{[...new Set([model,...modelList.split('\n')].map(m=>m.trim()).filter(Boolean))].map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        {overrideModel&&<><p className="fine-print">留空继承端点默认值。</p><ModelLimitSettings value={modelLimits[overrideModel]||{}} inherited={limits} onChange={value=>setModelLimits(previous=>{const next={...previous};if(Object.keys(value).length)next[overrideModel]=value;else delete next[overrideModel];return next;})}/></>}
      </details>
      <label className="checkbox-label"><input type="checkbox" checked={reasoningSummary} onChange={event => setReasoningSummary(event.target.checked)} />{t("请求思考内容")}</label><p className="fine-print">{t("Responses 请求思考摘要；DeepSeek 的 Chat Completions 开启思考模式。仅展示服务实际返回的内容，其他模型需在服务端开启思考。")}</p>
      <details><summary>{t("高级诊断：运行环境")}</summary><p>{config?.engineVersion ? `Ambleloft 引擎 ${config.engineVersion}` : '使用 Ambleloft 独立引擎，无需安装 Codex。'}</p>{config?.engineError && <p role="alert">{config.engineError}</p>}{config?.bundledEngine === false && <label>开发引擎路径（可选）<input aria-label={t("Codex 路径")} placeholder="默认使用项目固定版本" value={executable} onChange={event => setExecutable(event.target.value)} /></label>}<p>配置与会话保存在 Ambleloft 自己的目录中，不复用官方 Codex 的登录与配置。</p></details>
      <div className="settings-actions"><button className="primary-button" onClick={() => void save()} disabled={!name.trim() || !baseUrl.trim() || !model.trim() || busy}>{t("保存配置")}</button><button className="secondary-button" onClick={() => void test()} disabled={!config?.configured || dirty || busy}>{t("测试已保存端点")}</button></div>
    </fieldset><p className="fine-print">{t("测试会向已保存端点发送一条固定的 “Reply exactly OK.” 请求，可能产生少量模型费用，不包含项目资料。")}</p>
    {busy && <p role="status">{t("正在处理…")}</p>}{message && <p className="success-message" role="status"><Check size={14} />{message}</p>}{error && <div className="error-banner" role="alert">{error}</div>}
  </section>;
}
