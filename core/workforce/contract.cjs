const crypto = require('node:crypto');
const {validateSource} = require('../catalog-store/catalog.cjs');
const MAX = 1024 * 1024;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value);
function text(value, name, max = 6000, optional = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw Error('请填写有效的' + name);
  return value.trim();
}
function definition(value) {
  if (!value || !Array.isArray(value.skills) || value.skills.length > 20) throw Error('角色最多声明 20 项技能');
  const skills = value.skills.map(entry => {
    const name = text(entry.name, '技能名称', 120), label = text(entry.label || name, '技能标题', 120);
    const purpose = text(entry.purpose || '', '技能用途', 1000, true), source = entry.source;
    if (!source) throw Error('技能来源不完整');
    let normalized;
    if (source.kind === 'installed' && id(source.skillId)) normalized = {kind:'installed', skillId:source.skillId,...(source.revision&&id(source.revision)?{revision:source.revision}:{}),...(Number.isInteger(source.version)&&source.version>0?{version:source.version}:{})};
    else if (source.kind === 'store' && id(source.sourceId) && id(source.listingId) && typeof source.version === 'string' && /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(source.version)) normalized = {kind:'store', sourceId:source.sourceId, listingId:source.listingId, version:source.version};
    else if (source.kind === 'import' && id(source.importId)) normalized = {kind:'import', importId:source.importId};
    else throw Error('技能来源无效，请重新选择');
    for(const field of ['packageDigest','artifactSha256'])if(source[field]!==undefined){if(!/^[a-f0-9]{64}$/.test(source[field]))throw Error('技能摘要无效');normalized[field]=source[field];}
    if(source.snapshotId!==undefined){if(!/^[a-f0-9]{64}$/.test(source.snapshotId))throw Error('快照标识无效');normalized.snapshotId=source.snapshotId;}
    const usage=entry.usage?{mode:'when-relevant',when:text(entry.usage.when,'使用场景',2000,true),whenNot:text(entry.usage.whenNot||'','使用边界',2000,true)}:undefined;
    const selectionOrigin=entry.selectionOrigin&&['template-default','user-selected','imported','legacy'].includes(entry.selectionOrigin.kind)?Object.fromEntries(Object.entries(entry.selectionOrigin).filter(([key,val])=>['kind','templateBindingId','recommendationId','roleVersion'].includes(key)&&typeof val==='string'&&val.length<150)):undefined;
    return {key:crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0,24),name,label,purpose,source:normalized,...(usage?{usage}:{}),...(selectionOrigin?{selectionOrigin}:{})};
  });
  if (new Set(skills.map(s=>s.name)).size !== skills.length) throw Error('同一角色不能重复声明同名技能');
  const metadata={};
  if(value.modelChoice!=null){
    const choice=value.modelChoice;
    if(!choice||typeof choice!=='object'||Array.isArray(choice)||!id(choice.providerId))throw Error('专家模型服务无效');
    metadata.modelChoice={providerId:choice.providerId,model:text(choice.model,'专家模型',200)};
  }
  if(value.templateRef){if(!id(value.templateRef.id)||!/^\d+\.\d+\.\d+$/.test(value.templateRef.version))throw Error('角色模板标识无效');metadata.templateRef={id:value.templateRef.id,version:value.templateRef.version};}if(value.definitionLocale){if(!['zh-CN','en'].includes(value.definitionLocale))throw Error('角色语言无效');metadata.definitionLocale=value.definitionLocale;}
  return {...metadata,name:text(value.name,'角色名称',80),domain:text(value.domain || '', '专业方向',300,true),responsibilities:text(value.responsibilities,'职责'),deliverables:text(value.deliverables || '', '交付要求',3000,true),methods:text(value.methods || '', '工作方式',6000,true),skills};
}
function roleCatalog(value) {
  if (!value || value.schemaVersion !== 1 || value.kind !== 'roles' || !id(value.sourceId) || !Array.isArray(value.items) || value.items.length > 100) throw Error('ROLE_CATALOG_INVALID');
  const start = Date.parse(value.generatedAt), end = Date.parse(value.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 31*86400000) throw Error('ROLE_CATALOG_EXPIRY');
  const seen = new Set();
  for (const item of value.items) {
    if (!id(item.id) || seen.has(item.id) || !/^\d+\.\d+\.\d+$/.test(item.version)) throw Error('ROLE_CATALOG_ID');
    seen.add(item.id);text(item.publisher,'发布者',120);
    for (const locale of ['zh','en']) definition({...item[locale],skills:item.skills});
    if (item.skills.some(s=>s.source.kind !== 'store' || s.source.sourceId !== value.sourceId)) throw Error('ROLE_CATALOG_SKILL_SOURCE');
  }
  return value;
}
function verifyRoles(envelope, source, now=Date.now()) {
  validateSource(source);
  if (!envelope || envelope.keyId !== source.keyId || typeof envelope.payload !== 'string' || envelope.payload.length > MAX || typeof envelope.signature !== 'string') throw Error('ROLE_CATALOG_SIGNATURE');
  const data=Buffer.from(envelope.payload,'base64'), signature=Buffer.from(envelope.signature,'base64');
  if (data.toString('base64')!==envelope.payload || signature.toString('base64')!==envelope.signature || signature.length!==64 || !crypto.verify(null,data,source.publicKey,signature)) throw Error('ROLE_CATALOG_SIGNATURE');
  const catalog=roleCatalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));
  if (catalog.sourceId!==source.id || Date.parse(catalog.generatedAt)>now+300000) throw Error('ROLE_CATALOG_SOURCE');
  return {catalog,stale:Date.parse(catalog.expiresAt)<=now};
}
function semantic(value){const v=definition(value);return JSON.stringify({...v,skills:v.skills.map(({key,selectionOrigin,source,...s})=>{const {snapshotId,...identity}=source;return {...s,source:identity,usage:s.usage||{mode:'when-relevant',when:s.purpose,whenNot:''}};}).sort((a,b)=>a.name.localeCompare(b.name))});}
module.exports={id,text,definition,semantic,roleCatalog,verifyRoles,MAX};
