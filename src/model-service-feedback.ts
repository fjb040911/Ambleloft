import {t} from './i18n';
import type {ProviderConfig} from './types';

export function composerError(error:unknown){
 const message=(error instanceof Error?error.message:String(error)).replace(/^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/,'');
 if(message==='切换服务需要确认将会话历史发送到新的端点')return t('模型服务已变更。请重新选择模型并确认接收会话历史的服务。');
 return t(message);
}

export function modelServiceConfirmation(provider:ProviderConfig){
 return {
  title:t('切换模型服务'),
  description:t('切换服务后，当前任务历史将发送到新的模型服务。是否继续？')+'\n'+[provider.name,provider.baseUrl].filter(Boolean).join(' · '),
  action:t('切换模型服务'),
 };
}
