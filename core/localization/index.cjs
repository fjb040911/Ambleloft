const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const bad=new Set(['__proto__','constructor','prototype']);
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_ARGUMENT'});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function canonical(value){try{return Intl.getCanonicalLocales(String(value).replaceAll('_','-'))[0];}catch{fail('无效语言标签: '+value);}}
function chain(value){const tag=canonical(value||'en'),l=new Intl.Locale(tag),result=[tag];const script=l.script||(l.language==='zh'?l.maximize().script:undefined);if(script)result.push(l.language+'-'+script);if(l.language!=='zh'||!script)result.push(l.language);return [...new Set([...result,'default'])];}
function messages(dictionaries,locale){const normalized={};for(const [key,value]of Object.entries(dictionaries||{}))normalized[key==='default'?key:canonical(key)]=value;return Object.assign({},...chain(locale).reverse().map(k=>normalized[k]||{}));}
const reference=value=>typeof value==='string'?/^%([^%]+)%$/.exec(value)?.[1]:undefined;
const params=text=>[...new Set([...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m=>m[1]))].sort();
function strictJSON(text){
 const value=JSON.parse(text);const tokens=text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)||[];const stack=[];
 for(let i=0;i<tokens.length;i++){const t=tokens[i];if(t==='{')stack.push(new Set());else if(t==='[')stack.push(null);else if(t==='}'||t===']')stack.pop();else if(t[0]==='"'&&tokens[i+1]===':'){const key=JSON.parse(t),keys=stack.at(-1);if(bad.has(key)||keys?.has(key))fail('词典重复或危险 key: '+key);keys?.add(key);}}
 return value;
}
function validate(dictionaries){
 if(!object(dictionaries)||Object.keys(dictionaries).length>33||Buffer.byteLength(JSON.stringify(dictionaries))>1024*1024)fail('词典最多 32 种翻译，总大小 1 MiB');
 const locales=new Set();for(const [locale,d]of Object.entries(dictionaries)){const normalized=locale==='default'?'default':canonical(locale);if(locales.has(normalized))fail('重复语言词典: '+normalized);locales.add(normalized);if(!object(d)||Object.keys(d).length>2000)fail('词典条目无效或超过 2000 项');for(const [key,value]of Object.entries(d)){if(bad.has(key)||!key||key.length>200||typeof value!=='string'||Buffer.byteLength(value)>65536)fail('无效词典条目: '+key);if(locale!=='default'&&Object.hasOwn(dictionaries.default||{},key)&&JSON.stringify(params(value))!==JSON.stringify(params(dictionaries.default[key])))fail('翻译占位参数不一致: '+key);}}
 return dictionaries;
}
function load(root,prefix='skill'){
 const dictionaries={};const realRoot=fs.realpathSync(root);
 for(const name of fs.readdirSync(realRoot)){if(!name.startsWith(prefix+'.nls')||!name.endsWith('.json'))continue;const m=new RegExp('^'+prefix+'\\.nls(?:\\.([A-Za-z0-9_-]+))?\\.json$').exec(name);if(!m)fail('无效词典文件名: '+name);const locale=m[1]?canonical(m[1]):'default';if(Object.hasOwn(dictionaries,locale))fail('重复语言词典: '+locale);const file=path.join(realRoot,name);if(fs.lstatSync(file).isSymbolicLink())fail('词典不能是符号链接');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>256*1024)fail('词典文件超过 256 KiB 或不是文件');dictionaries[locale]=strictJSON(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}}
 return validate(dictionaries);
}
function text(dictionaries,value,locale='en',strict=false){const key=reference(value);if(!key)return value;const resolved=messages(dictionaries,locale)[key];if(resolved===undefined){if(strict)fail('默认词典缺少: '+key);return key;}return resolved;}
function format(dictionaries,key,args={},locale='en'){
 if(typeof key!=='string'||!Object.hasOwn(dictionaries.default||{},key))fail('默认词典缺少: '+key);
 if(!object(args)||Object.keys(args).length>32||Object.entries(args).some(([k,v])=>bad.has(k)||!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))fail('翻译参数无效');
 const expected=params(dictionaries.default[key]);if(expected.some(k=>!Object.hasOwn(args,k))||Object.keys(args).some(k=>!expected.includes(k)))fail('翻译参数与词典不匹配: '+key);
 return String(messages(dictionaries,locale)[key]??dictionaries.default[key]).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_,k)=>String(args[k]));
}
// Explicit display-field paths only. Never visit business values, prompts or conditions.
function slots(template){const out=[];const add=(o,keys)=>{if(o)for(const k of keys)if(typeof o[k]==='string')out.push([o,k]);};
 const field=f=>{add(f,['label','help','placeholder']);for(const option of f.options||[])add(option,['label']);};
 add(template,['title','description','displayName','displayDescription']);for(const f of template.fields||[])field(f);
 for(const s of template.steps||[]){add(s,['title','description']);for(const f of s.fields||[])field(f);add(s.next,['label']);}
 add(template.submit,['label']);for(const a of template.actions||[])add(a,['label']);for(const f of template.rows?.fields||[])field(f);
 for(const labels of Object.values(template.rows?.valueLabels||{}))add(labels,Object.keys(labels));return out;
}
function subset(dictionaries,keys){const unique=[...new Set(keys)];for(const key of unique)if(!Object.hasOwn(dictionaries.default||{},key))fail('默认词典缺少: '+key);const result={};for(const [locale,d]of Object.entries(dictionaries))result[locale]=Object.fromEntries(unique.filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));if(Buffer.byteLength(JSON.stringify(result))>256*1024)fail('翻译快照超过 256 KiB');return result;}
function project(template,dictionaries,locale){const result=structuredClone(template);for(const [o,k]of slots(result))o[k]=text(dictionaries,o[k],locale);return result;}
function prepare(template,dictionaries,normalize){validate(dictionaries);const keys=slots(template).map(([o,k])=>reference(o[k])).filter(Boolean),snapshot=subset(dictionaries,keys);for(const key of keys)if(params(snapshot.default[key]).length)fail('静态显示文案不能要求动态参数: '+key);for(const locale of ['default',...Object.keys(snapshot).filter(k=>k!=='default')])normalize(project(template,snapshot,locale==='default'?'und':locale));return snapshot;}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
module.exports={canonical,chain,messages,reference,params,strictJSON,validate,load,text,format,slots,subset,project,prepare,digest};
