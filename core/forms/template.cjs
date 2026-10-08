const {parseDocument,isAlias,isMap,isSeq,isScalar}=require('yaml');
const {createHash}=require('node:crypto');const fs=require('node:fs/promises');const path=require('node:path');
const Ajv=require('ajv/dist/2020').default;
const validSchema=new Ajv({strict:false,allErrors:true}).compile(require('../../specs/extensions/contracts/form.schema.json'));
const error=(message,fields)=>Object.assign(Error(message),{code:'INVALID_ARGUMENT',fields});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function parse(source){
 if(Buffer.byteLength(source)>128*1024)throw error('表单定义超过 128 KiB');
 const doc=parseDocument(source,{uniqueKeys:true,schema:'core',strict:true});if(doc.errors.length)throw error(doc.errors[0].message);
 let count=0;function walk(node,depth){if(++count>15000||depth>12)throw error('表单结构过大');if(!node)return;if(isAlias(node)||node.anchor||node.tag)throw error('不支持 YAML 引用、锚点或标签');if(isMap(node)){for(const pair of node.items){if(!isScalar(pair.key)||typeof pair.key.value!=='string'||['__proto__','constructor','prototype','<<'].includes(pair.key.value))throw error('无效字段名称');walk(pair.value,depth+1);}}else if(isSeq(node))for(const v of node.items)walk(v,depth+1);else if(isScalar(node)&&typeof node.value==='number'&&!Number.isFinite(node.value))throw error('数值必须有限');}
 walk(doc.contents,0);return doc.toJS({maxAliasCount:0});
}
function decimal(value,scale=2){if(typeof value!=='string'||! /^-?\d+(?:\.\d+)?$/.test(value)||value.length>80)throw error('请输入有效金额');let [a,b='']=value.split('.');if(b.length>scale)throw error(`金额最多 ${scale} 位小数`);const negative=a.startsWith('-');a=a.replace(/^-/,'').replace(/^0+(?=\d)/,'');b=b.padEnd(scale,'0');const units=BigInt((negative?'-':'')+a+b);return {units,value:(units<0?'-':'')+a+(scale?'.'+b:'')};}
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function fieldValue(field,value,partial=false){
 if(value===undefined||value===''){if(field.type==='checkbox'&&!field.required)return false;if(field.required&&!partial)throw error('此项为必填');return undefined;}
 if(field.type==='checkbox'){if(typeof value!=='boolean')throw error('请选择有效选项');if(field.required&&!value&&!partial)throw error('请勾选后继续');return value;}
 if(['text','textarea'].includes(field.type)){if(typeof value!=='string')throw error('请输入文字');if(field.required&&!value.trim()&&!partial)throw error('此项为必填');if(value.length<(field.minLength||0)||value.length>(field.maxLength??(field.type==='text'?2000:20000)))throw error('文字长度不符合要求');return value;}
 if(field.type==='select'){if(!field.options.some(o=>o.value===value))throw error('请选择列表中的选项');return value;}
 if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||(field.integer&&!Number.isSafeInteger(value)))throw error('请输入有效数字');if(value<(field.minimum??-Infinity)||value>(field.maximum??Infinity))throw error('数字超出允许范围');return value;}
 if(field.type==='date'){if(!date(value))throw error('请输入有效日期');if(field.minimum&&value<field.minimum||field.maximum&&value>field.maximum)throw error('日期超出允许范围');return value;}
 if(field.type==='money'){const n=decimal(value,field.scale);if(field.minimum!==undefined&&n.units<decimal(field.minimum,field.scale).units||field.maximum!==undefined&&n.units>decimal(field.maximum,field.scale).units)throw error('金额超出允许范围');return n.value;}
}
function validateValues(step,input,{partial=false,raw=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw error('表单数据无效');for(const key of Object.keys(input))if(!step.fields.some(f=>f.name===key))throw error('表单包含未定义的字段');const values={},errors={};
 for(const field of step.fields){let v=input[field.name];if(raw&&field.type==='number'&&typeof v==='string'&&v.trim()!=='')v=Number(v);try{const value=fieldValue(field,v,partial);if(value!==undefined)values[field.name]=value;}catch(e){errors[field.name]=e.message;}}
 return {values,errors};
}
function normalize(source){
 const m=typeof source==='string'?parse(source):structuredClone(source);if(!validSchema(m))throw error(validSchema.errors.map(e=>`${e.instancePath} ${e.message}`).join('; '));
 m.steps ||= [{id:'main',title:m.title,fields:m.fields}];delete m.fields;let total=0;const ids=new Set();
 for(const [i,s]of m.steps.entries()){
  if(ids.has(s.id))throw error('重复步骤 '+s.id);ids.add(s.id);if(s.next&&i===m.steps.length-1)throw error('最后一步不能定义 next');const names=new Set();
  for(const f of s.fields){if(++total>100||names.has(f.name))throw error('字段过多或重名');names.add(f.name);
   const common=['name','type','label','required','help'],extra={text:['placeholder','minLength','maxLength'],textarea:['placeholder','minLength','maxLength'],number:['minimum','maximum','integer'],money:['minimum','maximum','currency','scale'],date:['minimum','maximum'],select:['options'],checkbox:[]}[f.type];for(const k of Object.keys(f))if(![...common,...extra].includes(k))throw error(`${s.id}.${f.name}: 不支持 ${k}`);
   if(f.type==='select'&&(!f.options||new Set(f.options.map(o=>o.value)).size!==f.options.length))throw error('选项缺失或重复');
   if(f.type==='money'){if(!f.currency)throw error('金额必须声明币种');f.scale??=2;for(const k of ['minimum','maximum'])if(f[k]!==undefined)decimal(f[k],f.scale);if(f.minimum!==undefined&&f.maximum!==undefined&&decimal(f.minimum,f.scale).units>decimal(f.maximum,f.scale).units)throw error('金额范围错误');}
   if(f.type==='date')for(const k of ['minimum','maximum'])if(f[k]!==undefined&&!date(f[k]))throw error('日期范围无效');
   if(f.type==='number')for(const k of ['minimum','maximum'])if(f[k]!==undefined&&typeof f[k]!=='number')throw error('数值范围类型错误');
   if(f.type!=='money'&&f.minimum!==undefined&&f.maximum!==undefined&&f.minimum>f.maximum||f.minLength!==undefined&&f.maxLength!==undefined&&f.minLength>f.maxLength)throw error('范围无效');
  }
 }
 for(const [i,a]of [...m.steps.map((s,i)=>[i,s.next]),[m.steps.length-1,m.submit]])if(a?.kind==='operation')for(const b of Object.values(a.input))if(b.from&&b.from!=='context.projectId'){
  const [kind,sid,key]=b.from.split('.'),j=m.steps.findIndex(s=>s.id===sid);if(j<0||j>i)throw error('引用了不存在或尚未到达的步骤');if(kind==='steps'&&!m.steps[j].fields.some(f=>f.name===key)||kind==='results'&&(j>=i||!m.steps[j].next))throw error('无效数据引用 '+b.from);
 }
 return m;
}
async function safeRead(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(v=>!v||v==='.'||v==='..'))throw error('非法表单路径');let file=root;for(const part of relative.split('/')){file=path.join(file,part);if((await fs.lstat(file)).isSymbolicLink())throw error('不允许符号链接');}const stat=await fs.stat(file);if(!stat.isFile()||stat.size>200000)throw error('表单文件过大或无效');return fs.readFile(file,'utf8');}
async function discover(body,root){const {fromMarkdown}=await import('mdast-util-from-markdown');const forms=[],errors=[];for(const node of fromMarkdown(body).children){if(node.type!=='code'||!['amble-form','amble-form-ref'].includes(node.lang))continue;try{let source=node.value;if(node.lang==='amble-form-ref'){const ref=parse(source);if(!ref||Object.keys(ref).join()!=='path')throw error('引用只允许 path');source=await safeRead(root,ref.path);}const template=normalize(source);if(forms.some(f=>f.id===template.id))throw error('重复表单 '+template.id);forms.push(template);}catch(e){errors.push({line:node.position.start.line,message:e.message});}}if(errors.length)return {forms:[],errors};return {forms,errors};}
module.exports={parse,normalize,discover,safeRead,validateValues,hash,error,decimal};
