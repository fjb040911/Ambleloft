const {createHash}=require('node:crypto');
const MODES=['schema','json','prompt'],TTL=30*24*60*60*1000;
const stores=new WeakMap();
function key(config){return createHash('sha256').update(JSON.stringify([config.baseUrl,config.model,config.protocol||'auto',config.reasoningSummary!==false,config.limits||{},config.modelLimits?.[config.model]||{},config.encryptedKey||''])).digest('hex');}
function valid(profile,configKey){return profile?.key===configKey&&['chat','responses'].includes(profile.protocol)&&MODES.includes(profile.mode)&&typeof profile.streaming==='boolean'&&Number.isFinite(profile.verifiedAt)&&profile.verifiedAt<=Date.now()&&Date.now()-profile.verifiedAt<TTL;}
function bind(config,save){stores.set(config,save);return config;}
async function remember(config,profile){
 const existing=config.outputProfiles?.find(p=>p.protocol===profile.protocol&&p.streaming===profile.streaming);
 // Do not extend the lifetime of a cached downgrade on every successful call.
 if(existing&&existing.mode===profile.mode&&JSON.stringify(existing.unsupported||[])===JSON.stringify(profile.unsupported||[])&&existing.verifiedAt<=Date.now()&&Date.now()-existing.verifiedAt<TTL)return;
 const value={...profile,verifiedAt:Date.now()};
 if(!config.protocol||config.protocol==='auto')config.detectedProtocol=profile.protocol;
 config.outputProfiles=[...(config.outputProfiles||[]).filter(p=>p.protocol!==value.protocol||p.streaming!==value.streaming),value];
 try{await stores.get(config)?.(value);}catch{/* Capability persistence cannot invalidate an already validated result. */}
}
function profile(config,protocol,streaming){return (config.outputProfiles||[]).find(p=>p.protocol===protocol&&p.streaming===streaming&&p.verifiedAt<=Date.now()&&Date.now()-p.verifiedAt<TTL);}
// A portable strict subset. Do not turn optional fields into mandatory fields
// or rewrite nullability. Unsupported shapes use JSON mode plus full local AJV.
function strictSchema(schema){
 const walk=s=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||s.$ref||s.anyOf||s.oneOf||s.allOf||s.not)return null;
  const type=s.type||(s.enum?.every(v=>typeof v==='string')?'string':undefined);
  const types=Array.isArray(type)?type:[type];
  if(!types.length||types.some(t=>!['object','array','string','number','integer','boolean','null'].includes(t)))return null;
  const result={type};if(s.enum)result.enum=s.enum;
  if(types.includes('object')){
   if(s.additionalProperties!==false||!s.properties||Object.keys(s.properties).some(k=>!s.required?.includes(k)))return null;
   result.properties={};for(const [name,property] of Object.entries(s.properties)){const child=walk(property);if(!child)return null;result.properties[name]=child;}
   result.required=s.required||[];result.additionalProperties=false;
  }
  if(types.includes('array')){const child=walk(s.items);if(!child)return null;result.items=child;}
  return result;
 };
 return schema?.type==='object'?walk(schema):null;
}
function formats(schema){return [...(strictSchema(schema)?['schema']:[]),...(schema?.type==='object'?['json']:[]),'prompt'];}
function applyFormat(body,mode,schema,chat){
 if(mode==='prompt')return;
 const format=mode==='schema'?{type:'json_schema',name:'structured_result',strict:true,schema:strictSchema(schema)}:{type:'json_object'};
 if(chat)body.response_format=mode==='schema'?{type:'json_schema',json_schema:{name:format.name,strict:true,schema:format.schema}}:format;
 else body.text={format};
}
async function httpError(response){
 // Only explicit format/protocol rejection permits negotiation. An arbitrary
 // 400/404, authentication failure, rate limit or provider outage never does.
 const status=response.status;let text='';
 const reader=response.body?.getReader();
 if(reader)try{let bytes=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384)break;text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
 let data;try{data=JSON.parse(text);}catch{}
 const error=data?.error||data;const detail=[error?.code,error?.param,error?.message].filter(v=>typeof v==='string').join(' ').toLowerCase();
 const unsupported=/not supported|unsupported|unknown parameter|unrecognized|not available|unavailable|must be one of|supported values|不支持/.test(detail);
 let code='PROVIDER_REJECTED';
 if([400,422].includes(status)&&/invalid_json_schema|invalid.*schema/.test(detail))code='SCHEMA_UNSUPPORTED';
 else if([400,422].includes(status)&&unsupported&&/response_format|json_schema|json_object|text\.format/.test(detail))code=/schema.*(keyword|property|field|additionalproperties|required)/.test(detail)?'SCHEMA_UNSUPPORTED':'FORMAT_UNSUPPORTED';
 if([400,404,405].includes(status)&&(/(endpoint|route|\/responses|\/chat\/completions).*(not found|not supported|unsupported|not available)|not supported.*(\/responses|\/chat\/completions)/.test(detail)||status===405))code='PROTOCOL_UNSUPPORTED';
 if(status===401||status===403)code='PROVIDER_AUTH';else if(status===429)code='PROVIDER_RATE_LIMIT';
 else if(status===404&&/(model_not_found|model.*(not found|does not exist|unknown)|模型.*(不存在|未找到))/.test(detail))code='MODEL_UNAVAILABLE';
 return Object.assign(Error(code),{definitive:true,diagnostics:{stage:'transport',reason:code.toLowerCase(),httpStatus:status}});
}
module.exports={MODES,TTL,key,valid,bind,remember,profile,strictSchema,formats,applyFormat,httpError};
