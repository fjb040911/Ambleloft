const Ajv=require('ajv/dist/2020').default;
const schema=require('../../specs/extensions/contracts/user-input/tools.schema.json');
const T=require('../forms/template.cjs');
const valid=new Ajv({strict:false,allErrors:true}).compile({$schema:schema.$schema,$defs:schema.$defs,$ref:'#/$defs/request'});
const validTool=new Ajv({strict:false,allErrors:true}).compile(schema);
function validateTool(name,args){jsonData(args);if(!validTool({name,arguments:args}))throw error('补充工具参数不符合规范',(validTool.errors||[]).slice(0,12).map(e=>e.instancePath||'/'));}
const toolSchemas=schema.oneOf.map(branch=>({name:branch.properties.name.const,inputSchema:{$schema:schema.$schema,...(JSON.stringify(branch.properties.arguments).includes('#/$defs/')?{$defs:schema.$defs}:{}),...branch.properties.arguments}}));
const error=(message,paths=[])=>Object.assign(Error(message),{code:'INVALID_ARGUMENT',details:{paths}});
// Only JSON data may cross the model boundary. Reject values JSON.stringify would
// silently drop or coerce before checking byte limits and the frozen schema.
function jsonData(value,depth=0,seen=new Set()){
 if(depth>12)throw error('表单结构过深');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='string'){if(value.length>20000)throw error('文字超过长度限制');return;}
 if(typeof value==='number'){if(!Number.isFinite(value))throw error('数字必须为有限值');return;}
 if(typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw error('表单必须是 JSON 数据');
 seen.add(value);for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw error('不支持的字段名称');jsonData(value[key],depth+1,seen);}seen.delete(value);
}
function normalizeDynamic(input){
 jsonData(input);
 if(!valid(input))throw error('补充表单定义不符合规范',(valid.errors||[]).slice(0,12).map(e=>e.instancePath||'/'));
 if(input.source.kind!=='dynamic')throw Object.assign(Error('模板来源需要通过宿主目录解析'),{code:'UNSUPPORTED'});
 const definition=input.source.definition;
 if(!definition.title.trim()||!input.reason.trim()||definition.fields.some(f=>!f.label.trim()||f.options?.some(o=>!o.label.trim())))throw error('标题和说明不能仅包含空白');
 if(Buffer.byteLength(JSON.stringify(definition))>32768)throw error('表单定义超过 32 KiB');
 if(Buffer.byteLength(JSON.stringify(input.prefill||{}))>65536)throw error('预填内容超过 64 KiB');
 const template=T.normalize({version:1,id:'input-'+T.hash(definition).slice(0,24),title:definition.title,...(definition.description!==undefined?{description:definition.description}:{}),steps:[{id:'details',title:definition.title,fields:definition.fields}],submit:{kind:'chat',label:'提交补充信息'}});
 const checked=T.validateValues(template.steps[0],input.prefill||{},{partial:true});
 if(Object.keys(checked.errors).length)throw error('预填内容不符合字段定义',Object.keys(checked.errors).map(name=>'/prefill/'+name));
 return {requestKey:input.requestKey,reason:input.reason,template,prefill:checked.values};
}
module.exports={normalizeDynamic,jsonData,validateTool,toolSchemas};
