// Keep diagnostic metadata, never provider text (which may contain private data).
function outputError(reason,characters=0,stage='content'){
 return Object.assign(Error('INVALID_OUTPUT'),{definitive:true,diagnostics:{stage,reason,characters}});
}
function parseStructuredOutput(text){
 if(typeof text!=='string')throw outputError('missing-content');
 const value=text.trim();
 if(!value)throw outputError('empty-content',text.length);
 // Accept only a single complete JSON fence. Do not extract objects from prose,
 // mend quotes, or salvage truncated JSON: doing so could alter a decision.
 const fence=/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(value);
 try{return JSON.parse(fence?fence[1]:value);}
 catch{throw outputError('invalid-json',text.length);}
}
function structuredErrorMessage(error,locale='zh-CN'){
 const en=locale==='en';
 if(error.message==='DISCUSSION_STOPPED')return en?'Discussion stopped. Your submitted answers and saved content are preserved.':'讨论已停止。已提交的回答和已保存内容均保留。';
 if(error.message==='MODEL_RESPONSE_TIMEOUT')return en?'The model service did not send new content within the response window. Your submitted answers are preserved. Retry this round or switch models.':'模型服务长时间没有返回新内容，本轮等待已结束。已提交的回答保留，可重试本轮或切换模型。';
 if(error.message==='MODEL_TIMEOUT')return en?'The model response exceeded the time limit. Your submitted answers are preserved. Retry this round, narrow its scope, or switch models.':'模型响应超过本轮时间上限。已提交的回答保留，可重试本轮、缩小范围或切换模型。';
 if(error.message==='PROVIDER_AUTH')return en?'The model service rejected authentication. Check its API key and access permissions.':'模型服务拒绝了身份验证，请检查 API Key 和访问权限。';
 if(error.message==='PROVIDER_RATE_LIMIT')return en?'The model service is rate-limited or out of quota. Check your quota and retry later.':'模型服务触发限流或额度不足，请检查额度后稍后重试。';
 if(error.message==='MODEL_REFUSAL')return en?'The model declined this request. Review the request or choose another model. Saved content is preserved.':'模型拒绝了本次请求。请调整请求或选择其他模型，已保存内容保留。';
 if(error.message==='MODEL_UNAVAILABLE')return en?'The configured model is unavailable. Check the model ID and service access.':'配置的模型不可用，请检查模型 ID 和服务访问权限。';
 if(['FORMAT_UNSUPPORTED','SCHEMA_UNSUPPORTED','PROTOCOL_UNSUPPORTED'].includes(error.message))return en?'The service does not support the requested protocol or output format. Test the saved endpoint or choose another model.':'服务不支持当前协议或输出格式，请测试已保存端点或选择其他模型。';
 if(error.message==='INVALID_OUTPUT'){
  if(error.diagnostics?.stage==='schema'){
   if(error.diagnostics.issues?.some(issue=>issue.schemaPath?.includes('/sourceIds/')))return en?'The model cited invalid discussion sources, even after automatic correction. Your submitted answers and saved plans are preserved. Please retry this round.':'模型引用的讨论来源仍未通过校验，自动修正未成功。已提交的回答和已保存计划均保留，请重试本轮。';
   return en?'The model response did not match the required structure. Your submitted choices and saved tasks are preserved. Please retry this round.':'模型返回内容未通过结构校验。已提交的选择和已保存任务均保留，请重试本轮。';
  }
  return en?'The model returned an unreadable response. Your submitted choices and saved tasks are preserved. Please retry.':'模型返回内容无法解析。已提交的选择和已保存任务均保留，请重试本轮。';
 }
 if(error.message==='OUTPUT_LIMIT')return en?'The model response reached its output limit. Saved content is preserved. Reduce the scope or raise the output limit, then retry.':'模型输出达到上限，已保存内容保留。请缩小本轮范围或提高输出限制后重试。';
 if(error.message==='INCOMPLETE_STREAM')return en?'The model response was interrupted before completion. Saved content is preserved. Please retry.':'模型响应在完成前中断，已保存内容保留，请重试本轮。';
 return error.message;
}
function localizeStructuredError(error,locale){
 const message=structuredErrorMessage(error,locale);
 if(message!==error.message){error.code ||= error.message;error.message=message;}
 return error;
}
module.exports={outputError,parseStructuredOutput,structuredErrorMessage,localizeStructuredError};
