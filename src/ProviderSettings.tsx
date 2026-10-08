import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './components/ui/collapsible';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {NativeSelect,NativeSelectOption} from './components/ui/native-select';
import {Checkbox} from './components/ui/checkbox';
import {Field,FieldLabel,FieldGroup,FieldSet,FieldDescription} from './components/ui/field';
import {Badge} from './components/ui/badge';
import {Alert,AlertDescription} from './components/ui/alert';
import {SettingsCard,SettingsEmpty} from './SettingsPrimitives';
import { t } from './i18n';
import { useEffect, useState } from 'react';
import { Check, PlugZap } from 'lucide-react';
import ModelLimitSettings from './ModelLimitSettings';
import type { ImageInputCapability, ModelLimits, ProviderConfig } from './types';

export default function ProviderSettings({ config, onSaved, onStateChange }: { config: ProviderConfig | null; onSaved(config: ProviderConfig): void; onStateChange?(dirty:boolean,busy:boolean):void }) {
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
  useEffect(()=>{onStateChange?.(dirty,busy);},[dirty,busy,onStateChange]);
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
  return <form className="max-w-2xl" onSubmit={event=>{event.preventDefault();void save();}}><SettingsCard title={t("模型服务")}><p>{t("支持 Responses 与 Chat Completions 服务。任务及工具读取的上下文会发送到此端点。")}</p>
    {!window.desktop && <div className="info-box">{t("请在桌面版中配置和运行任务。浏览器预览不会保存 API Key。")}</div>}
    <p role="status" className="text-sm text-muted-foreground">{t(dirty?'有未保存的修改':'已保存')}</p><FieldSet disabled={!window.desktop || busy}>
      <Field><FieldLabel className="flex-col items-start w-full">{t("服务名称")}<Input required aria-label={t("服务名称")} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></FieldLabel></Field>
      <Field><FieldLabel className="flex-col items-start w-full">Base URL<Input required aria-label="Base URL" type="url" placeholder="https://api.example.com/v1" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} autoComplete="off" spellCheck={false} /></FieldLabel></Field>
      <Field><FieldLabel className="flex-col items-start w-full">{t("模型 ID")}<Input required aria-label={t("模型 ID")} placeholder={t("填写服务提供的准确模型名称")} value={model} onChange={event => setModel(event.target.value)} autoComplete="off" spellCheck={false} /></FieldLabel></Field>
      <Collapsible><CollapsibleTrigger render={<Button type="button" variant="outline"/>}>{t('模型能力与协议')}</CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4 pt-4"><Field><FieldLabel className="flex-col items-start w-full">{t("可选模型（每行一个 ID）")}<Textarea aria-label={t("可选模型")} value={modelList} onChange={e=>setModelList(e.target.value)}/></FieldLabel></Field>
      <p className="fine-print">{t('图片输入能力按模型保存。未配置或不支持时，不发送图片；生成文件不代表已完成视觉检查。')}</p>
      {[...new Set([model,...modelList.split('\n')].map(m=>m.trim()).filter(Boolean))].map(id=><Field key={id}><FieldLabel className="flex-col items-start w-full">{id} · {t('图片输入能力')}<NativeSelect aria-label={`${id} · ${t('图片输入能力')}`} value={modelImageInputs[id]||'unknown'} onChange={e=>setModelImageInputs(previous=>({...previous,[id]:e.target.value as ImageInputCapability}))}><NativeSelectOption value="unknown">{t('未配置（不发送图片）')}</NativeSelectOption><NativeSelectOption value="unsupported">{t('不支持图片')}</NativeSelectOption><NativeSelectOption value="supported">{t('支持图片')}</NativeSelectOption></NativeSelect></FieldLabel></Field>)}
      <Field><FieldLabel className="flex-col items-start w-full">{t("服务协议")}<NativeSelect aria-label={t("服务协议")} value={protocol} onChange={e=>setProtocol(e.target.value as typeof protocol)}><NativeSelectOption value="auto">{t("自动（DeepSeek 使用 Chat Completions）")}</NativeSelectOption><NativeSelectOption value="responses">Responses</NativeSelectOption><NativeSelectOption value="chat">Chat Completions</NativeSelectOption></NativeSelect></FieldLabel></Field>
      <Field><FieldLabel className="flex-col items-start w-full">{t('网页搜索')}<NativeSelect aria-label={t('网页搜索')} value={webSearch} onChange={e=>setWebSearch(e.target.value as 'disabled'|'live')}><NativeSelectOption value="disabled">{t('关闭原生搜索')}</NativeSelectOption><NativeSelectOption value="live">{t('启用实时搜索')}</NativeSelectOption></NativeSelect></FieldLabel></Field><p className="fine-print">{t('仅适用于支持原生搜索工具的 Responses 服务，可能产生额外费用。关闭时仍可通过命令工具申请联网。')}</p>
      </CollapsibleContent></Collapsible><Field><FieldLabel className="flex-col items-start w-full">API Key<Input aria-label="API Key" type="password" placeholder={config?.hasKey ? t("填写新密钥可替换") : t("使用系统能力加密后保存在本机")} value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" /></FieldLabel><FieldDescription>{config?.hasKey ? t("已加密保存 · 留空保持不变") : t("本机无鉴权服务可留空")}</FieldDescription></Field>
      {config?.hasKey && <Field orientation="horizontal"><Checkbox id="provider-clear-key" checked={clearKey} onCheckedChange={setClearKey}/><FieldLabel htmlFor="provider-clear-key">{t("移除已保存密钥")}</FieldLabel></Field>}
      <Collapsible><CollapsibleTrigger render={<Button type="button" variant="outline"/>}>{t('高级设置')}</CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4 pt-4">
        <p className="fine-print">{t('端点默认容量。留空使用内核／服务端默认值；设置窗口后，未指定的压缩阈值按 80% 计算。保存后下一轮生效。')}</p>
        <ModelLimitSettings value={limits} onChange={setLimits}/>
        <Field><FieldLabel className="flex-col items-start w-full">{t('模型单独覆盖')}<NativeSelect value={overrideModel} onChange={e=>setOverrideModel(e.target.value)}><NativeSelectOption value="">{t('选择模型')}</NativeSelectOption>{[...new Set([model,...modelList.split('\n')].map(m=>m.trim()).filter(Boolean))].map(m=><NativeSelectOption key={m} value={m}>{m}</NativeSelectOption>)}</NativeSelect></FieldLabel></Field>
        {overrideModel&&<><p className="fine-print">{t('留空继承端点默认值。')}</p><ModelLimitSettings value={modelLimits[overrideModel]||{}} inherited={limits} onChange={value=>setModelLimits(previous=>{const next={...previous};if(Object.keys(value).length)next[overrideModel]=value;else delete next[overrideModel];return next;})}/></>}
      </CollapsibleContent></Collapsible>
      <Field orientation="horizontal"><Checkbox id="provider-reasoning" checked={reasoningSummary} onCheckedChange={setReasoningSummary}/><FieldLabel htmlFor="provider-reasoning">{t("请求思考内容")}</FieldLabel></Field><p className="fine-print">{t("Responses 请求思考摘要；DeepSeek 的 Chat Completions 开启思考模式。仅展示服务实际返回的内容，其他模型需在服务端开启思考。")}</p>
      <Collapsible><CollapsibleTrigger render={<Button type="button" variant="outline"/>}>{t("高级诊断：运行环境")}</CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4 pt-4"><p>{config?.engineVersion ? `Ambleloft 引擎 ${config.engineVersion}` : t('使用 Ambleloft 独立引擎，无需安装 Codex。')}</p>{config?.engineError && <p role="alert">{config.engineError}</p>}{config?.bundledEngine === false && <Field><FieldLabel className="flex-col items-start w-full">{t('开发引擎路径（可选）')}<Input aria-label={t("Codex 路径")} placeholder={t('默认使用项目固定版本')} value={executable} onChange={event => setExecutable(event.target.value)} /></FieldLabel></Field>}<p>{t('配置与任务保存在 Ambleloft 自己的目录中，不复用官方 Codex 的登录与配置。')}</p></CollapsibleContent></Collapsible>
      <div className="settings-actions"><Button type="submit" variant="default" disabled={!name.trim() || !baseUrl.trim() || !model.trim() || busy || !dirty}>{t(busy?"正在保存…":"保存配置")}</Button><Button type="button" variant="outline" onClick={() => void test()} disabled={!config?.configured || dirty || busy}>{t("测试已保存端点")}</Button></div>
    </FieldSet><p className="fine-print">{t("测试会向已保存端点发送一条固定的 “Reply exactly OK.” 请求，可能产生少量模型费用，不包含项目资料。")}</p>
    {busy && <p role="status">{t("正在处理…")}</p>}{message && <p className="success-message" role="status"><Check size={14} />{message}</p>}{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </SettingsCard></form>;
}
