const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv/dist/2020').default;
const schema = require('../../specs/extensions/contracts/extension.schema.json');
const { compileCondition } = require('./condition.cjs');
const CONTRACT_REVISION = 'm1-a1-r1';
const MAX_JSON_BYTES = 256 * 1024;
const ajv = new Ajv({ strict: false, allErrors: true, ownProperties: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const structural = ajv.compile(schema);
const projectCapabilities = new Set(['projects.read', 'projects.path.read', 'conversations.create', 'conversations.open','agent.hooks','conversations.read','background.jobs','project.activity.read','project.usage.read','project.summaries.generate']);
const own = (object, key) => Object.hasOwn(object, key);
function jsonGuard(value, maxDepth = 32) {
  const active = new Set(); let nodes = 0;
  function walk(v, depth) {
    if (++nodes > 20000 || depth > maxDepth) throw new Error('JSON complexity limit exceeded');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (typeof v !== 'object' || active.has(v) || (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))) throw new Error('Plain JSON required');
    active.add(v);
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !own(descriptor, 'value') || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe JSON property');
      walk(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(v).length !== v.length) throw new Error('Dense JSON array required');
    active.delete(v);
  }
  walk(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_JSON_BYTES) throw new Error('JSON size limit exceeded');
}
function validateValueSchema(node, location, errors, depth = 1, configuration = false) {
  const error = message => errors.push({ path: location, message });
  if (depth > 8) { error('Value schema depth exceeds 8'); return; }
  const keywords = { properties: ['object'], required: ['object'], additionalProperties: ['object'], items: ['array'], minItems: ['array'], maxItems: ['array'], minLength: ['string'], maxLength: ['string'], minimum: ['number', 'integer'], maximum: ['number', 'integer'] };
  for (const [key, types] of Object.entries(keywords)) if (own(node, key) && !types.includes(node.type)) error(`${key} is not valid for ${node.type}`);
  for (const [min, max] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) if (node[min] !== undefined && node[max] !== undefined && node[min] > node[max]) error(`${min} exceeds ${max}`);
  if (node.enum) {
    if (['object', 'array'].includes(node.type)) error('enum only supports scalar types');
    for (const value of node.enum) {
      const matches = node.type === 'null' ? value === null : node.type === 'integer' ? Number.isInteger(value) : typeof value === node.type;
      if (!matches || value === null && node.type !== 'null') error('enum type mismatch');
      if (typeof value === 'number' && (value < (node.minimum ?? -Infinity) || value > (node.maximum ?? Infinity))) error('enum outside numeric bounds');
      if (typeof value === 'string' && ([...value].length < (node.minLength ?? 0) || [...value].length > (node.maxLength ?? Infinity))) error('enum outside string bounds');
    }
    if (new Set(node.enum.map(v => JSON.stringify(v))).size !== node.enum.length) error('Duplicate enum value');
  }
  for (const key of node.required || []) if (!own(node.properties || {}, key)) error(`required property is undeclared: ${key}`);
  for (const [key, child] of Object.entries(node.properties || {})) {
    if (configuration && /(?:password|passwd|secret|token|credential|api[_-]?key|private[_-]?key)/i.test(key)) error(`Credential configuration field is forbidden: ${key}`);
    validateValueSchema(child, `${location}/properties/${key}`, errors, depth + 1, configuration);
  }
  if (node.items) validateValueSchema(node.items, `${location}/items`, errors, depth + 1, configuration);
}
function displayFields(manifest) {
  const fields = [[manifest, 'displayName'], [manifest, 'description']];
  const collectSchema = node => { if (!node) return; fields.push([node, 'description']); for (const child of Object.values(node.properties || {})) collectSchema(child); collectSchema(node.items); };
  if (manifest.contributes?.home) fields.push([manifest.contributes.home, 'title']);
  for (const resource of manifest.authentication?.resources || []) fields.push([resource, 'title']);
  for (const app of manifest.contributes?.mcpApps || []) fields.push([app, 'title']);
  for (const command of manifest.contributes?.commands || []) fields.push([command, 'title']);
  for (const op of manifest.operations || []) { fields.push([op, 'title'], [op, 'description']); collectSchema(op.inputSchema); collectSchema(op.outputSchema); }
  collectSchema(manifest.configuration); return fields;
}
function validateDictionary(dictionary) {
  jsonGuard(dictionary);
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object' || Object.values(dictionary).some(v => typeof v !== 'string' || !v.length)) throw new Error('Localization dictionary must contain non-empty strings');
}
function validateManifest(manifest, { defaultMessages = {} } = {}) {
  const errors = [];
  try { jsonGuard(manifest); validateDictionary(defaultMessages); } catch (error) { return { ok: false, errors: [{ path: '', message: error.message }] }; }
  if (!structural(manifest)) return { ok: false, errors: structural.errors.map(e => ({ path: e.instancePath, message: e.message })) };
  const id = `${manifest.publisher}.${manifest.name}`;
  const add = (location, message) => errors.push({ path: location, message });
  const connector=manifest.contributes?.connectorSettings;
  if(connector){
    const operation=manifest.operations?.find(entry=>entry.id===connector.testOperation);
    if(manifest.configuration?.properties?.[connector.originField]?.type!=='string'||!['configuration','secrets'].every(cap=>manifest.permissions?.some(entry=>entry.capability===cap&&entry.scope==='self')))add('/contributes/connectorSettings','Requires a service origin field and self configuration/secrets permissions');
    if(!operation||operation.effect!=='read'||operation.projectScoped||!operation.exposeTo.includes('page')||operation.inputSchema?.properties?.query?.type!=='string'||operation.outputSchema?.properties?.hits?.type!=='array')add('/contributes/connectorSettings','Test must be an owned, page-exposed, unscoped read operation accepting query and returning hits');
  }
  const resourceIds=new Set();
  for(const resource of manifest.authentication?.resources||[]){
    if(resourceIds.has(resource.id))add('/authentication/resources','Duplicate resource id');resourceIds.add(resource.id);
    for(const key of ['baseUrl','audience'])try{const url=new URL(resource[key]);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||key==='baseUrl'&&!url.pathname.endsWith('/'))throw Error();}catch{add('/authentication/resources',key+' must be a clean HTTPS URL; baseUrl must end with /');}
  }
  const paths = [manifest.main, ...(typeof manifest.icon==='string'?[manifest.icon]:Object.values(manifest.icon||{})), ...(manifest.skills || []), manifest.contributes?.home?.webRoot, manifest.contributes?.home?.entry, ...(manifest.contributes?.mcpApps || []).map(app => app.entry)].filter(v => v !== undefined);
  for (const value of paths) if (value.split('/').some(part => !part || part === '.' || part === '..')) add('/paths', 'Non-canonical package path');
  const appUris = new Set();
  for (const app of manifest.contributes?.mcpApps || []) {
    if (!app.uri.startsWith(`ui://${id}/`) || appUris.has(app.uri) || app.uri.split('/').some(part => part === '..' || part === '.')) add('/contributes/mcpApps', 'Invalid or duplicate UI resource URI');
    appUris.add(app.uri);
  }
  for (const op of manifest.operations || []) if (op._meta?.ui && !appUris.has(op._meta.ui.resourceUri)) add('/operations', 'UI resource must be declared by this extension');
  const types = Object.assign(Object.create(null), { 'project.exists': 'boolean' });
  for (const context of manifest.contextKeys || []) {
    if (!context.key.startsWith(`ext.${id}.`) || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(context.key.slice(`ext.${id}.`.length))) add('/contextKeys', 'Context key must belong to this extension');
    if (own(types, context.key)) add('/contextKeys', 'Duplicate context key');
    if (typeof context.default !== context.type) add('/contextKeys', 'Context default type mismatch');
    types[context.key] = context.type;
  }
  const condition = (value, location) => { if (value !== undefined) try { compileCondition(value, types); } catch (error) { add(location, error.message); } };
  const permissions = new Set();
  for (const permission of manifest.permissions || []) {
    if (permissions.has(permission.capability)) add('/permissions', 'Duplicate capability');
    permissions.add(permission.capability);
    if (permission.scope !== (projectCapabilities.has(permission.capability) ? 'project' : 'self')) add('/permissions', 'Capability scope mismatch');
  }
  const ids = new Set(), handlers = new Set();
  const contribution = (item, location) => { if (!item.id.startsWith(`${id}.`)) add(location, 'Contribution ID must use extension prefix'); if (ids.has(item.id)) add(location, 'Duplicate contribution ID'); ids.add(item.id); };
  for (const op of manifest.operations || []) {
    const location = `/operations/${op.id}`; contribution(op, location);
    if (handlers.has(op.handler)) add(location, 'Duplicate handler'); handlers.add(op.handler);
    if (op.projectScoped && (op.inputSchema.properties?.projectId?.type !== 'string' || !op.inputSchema.required?.includes('projectId'))) add(location, 'Project operation requires required string projectId');
    for (const permission of op.requiredPermissions || []) {
      if (!permissions.has(permission)) add(location, 'Undeclared required permission');
      if (!op.projectScoped && projectCapabilities.has(permission)) add(location, 'Project capability requires projectScoped operation');
    }
    if (op.effect === 'read' && op.risk?.impacts.length) add(location, 'Read operation cannot declare write impacts');
    validateValueSchema(op.inputSchema, `${location}/inputSchema`, errors);
    validateValueSchema(op.outputSchema, `${location}/outputSchema`, errors);
    condition(op.enablement, `${location}/enablement`);
  }
  const hookEvents=new Set();
  for(const hook of manifest.hooks||[]){
    if(!permissions.has('agent.hooks'))add('/hooks','agent.hooks permission required');
    if(hookEvents.has(hook.event)||handlers.has(hook.handler))add('/hooks','Duplicate hook event or handler');
    hookEvents.add(hook.event);handlers.add(hook.handler);
  }
  for (const command of manifest.contributes?.commands || []) {
    contribution(command, '/contributes/commands');
    if (!manifest.contributes.home) add('/contributes/commands', 'openHome requires home');
    condition(command.when, '/contributes/commands/when');
  }
  condition(manifest.contributes?.home?.when, '/contributes/home/when');
  if (manifest.configuration) validateValueSchema(manifest.configuration, '/configuration', errors, 1, true);
  for (const [object, key] of displayFields(manifest)) {
    const match = /^%([^%]+)%$/.exec(object[key] || '');
    if (match && !own(defaultMessages, match[1])) add('/localization', `Missing default message: ${match[1]}`);
  }
  return { ok: !errors.length, errors, ...(errors.length ? {} : { extensionId: id, contractRevision: CONTRACT_REVISION }) };
}
function localizeManifest(manifest, dictionaries, locale) {
  for (const dictionary of Object.values(dictionaries)) validateDictionary(dictionary);
  const result = validateManifest(manifest, { defaultMessages: dictionaries.default || {} });
  if (!result.ok) throw new Error('Invalid manifest localization');
  const messages = require('../localization/index.cjs').messages(dictionaries,locale);
  const copy = structuredClone(manifest);
  for (const [object, key] of displayFields(copy)) { const match = /^%([^%]+)%$/.exec(object[key] || ''); if (match) object[key] = messages[match[1]]; }
  return copy;
}
function safePath(root, relative, kind) {
  if (typeof relative !== 'string' || !relative.length || path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':') || relative.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Unsafe package path');
  let current = root;
  for (const part of relative.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Package symlink is forbidden'); }
  const resolved = fs.realpathSync(current), rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Package path escapes root');
  const stat = fs.statSync(resolved);
  if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new Error(`Expected ${kind}`);
  return resolved;
}
function readJson(file) { if (fs.statSync(file).size > MAX_JSON_BYTES) throw new Error('JSON size limit exceeded'); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function validatePackage(directory) {
  try {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Package root symlink is forbidden');
    const root = fs.realpathSync(directory);
    const manifest = readJson(safePath(root, 'extension.json', 'file'));
    const dictionaries = require('../localization/index.cjs').load(root,'extension');
    const result = validateManifest(manifest, { defaultMessages: dictionaries.default || {} }); if (!result.ok) return result;
    const L=require('../localization/index.cjs');
    for(const [owner,key] of displayFields(manifest)){const ref=L.reference(owner[key]);if(ref&&L.params(dictionaries.default[ref]).length)throw Error('Static display text cannot require arguments: '+ref);}
    for(const locale of ['und',...Object.keys(dictionaries).filter(k=>k!=='default')]){const translated=localizeManifest(manifest,dictionaries,locale);const checked=validateManifest(translated,{defaultMessages:dictionaries.default||{}});if(!checked.ok)throw Error('Invalid translated manifest: '+locale+' '+checked.errors.map(e=>e.path+': '+e.message).join('; '));}

    let icons;
    if(manifest.icon){
      const variants=typeof manifest.icon==='string'?{light:manifest.icon,dark:manifest.icon}:manifest.icon;
      icons={};
      for(const [theme,relative] of Object.entries(variants)){
        const file=safePath(root,relative,'file');if(fs.statSync(file).size>64*1024)throw new Error('Icon exceeds 64 KiB');
        const bytes=fs.readFileSync(file);
        if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw new Error('Icon must be a PNG');
        const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
        if(width!==height||width<16||width>512)throw new Error('Icon must be square, 16–512 pixels');
        let offset=8,hasData=false,ended=false;
        while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(offset+12+length>bytes.length||type==='acTL')throw new Error('Invalid or animated PNG icon');if(type==='IDAT')hasData=true;offset+=12+length;if(type==='IEND'){ended=length===0&&offset===bytes.length;break;}}
        if(!hasData||!ended)throw new Error('Incomplete PNG icon');
        icons[theme]='data:image/png;base64,'+bytes.toString('base64');
      }
    }
    if (manifest.main) safePath(root, manifest.main, 'file');
    if (manifest.contributes?.home) {
      const home = manifest.contributes.home;
      const webRoot = safePath(root, home.webRoot, 'directory'); safePath(webRoot, home.entry, 'file');
    }
    for (const app of manifest.contributes?.mcpApps || []) {
      const file = safePath(root, app.entry, 'file');
      if (fs.statSync(file).size > 1024 * 1024) throw new Error('MCP App HTML exceeds 1 MiB');
    }
    for (const skill of manifest.skills || []) safePath(safePath(root, skill, 'directory'), 'SKILL.md', 'file');
    return { ...result, manifest, dictionaries, icons, skillsOwner: result.extensionId };
  } catch (error) { return { ok: false, errors: [{ path: '/package', message: error.code ? `Package file error: ${error.code}` : error.message }] }; }
}
function validateHandlerBindings(manifest, names) {
  const expected = [...(manifest.operations || []),...(manifest.hooks || [])].map(op => op.handler);
  return names.length === new Set(names).size && names.length === expected.length && names.every(name => expected.includes(name));
}
// Build public diagnostics from the declared contract. Never echo argument values or backend errors.
function inputIssue(schema, error) {
  const parts = error.instancePath.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (error.keyword === 'required') parts.push(error.params.missingProperty);
  if (error.keyword === 'additionalProperties') parts.push(error.params.additionalProperty);
  let path = 'input', optional = false;
  for (const key of parts) {
    const isItem = schema?.type === 'array';
    optional = !isItem && Object.hasOwn(schema?.properties || {}, key) && !schema.required?.includes(key);
    schema = isItem ? schema.items : schema?.properties?.[key];
    path += isItem ? `[${key}]` : /^[a-zA-Z_$][\w$]*$/.test(key) ? '.' + key : '[' + JSON.stringify(key.slice(0, 120)) + ']';
  }
  const {limit, type} = error.params;
  let message;
  switch (error.keyword) {
    case 'required': message = '是必填字段，请补充该字段。'; break;
    case 'additionalProperties': message = '不在工具声明的参数中，请移除该字段或核对字段名。'; break;
    case 'minLength': message = limit === 1 ? '不能为空字符串，请填写有效内容。' : `长度不足，请至少填写 ${limit} 个字符。`; break;
    case 'maxLength': message = `过长，请缩短至 ${limit} 个字符以内。`; break;
    case 'type': message = `类型有误，请使用 ${type} 类型的值。`; break;
    case 'enum': message = '取值无效，请从该字段声明的 enum 选项中选择。'; break;
    case 'minimum': message = `过小，请填写大于等于 ${limit} 的数值。`; break;
    case 'maximum': message = `过大，请填写小于等于 ${limit} 的数值。`; break;
    case 'minItems': message = `条目不足，请提供至少 ${limit} 项。`; break;
    case 'maxItems': message = `条目过多，请最多保留 ${limit} 项。`; break;
    default: message = '不符合工具声明的参数格式，请核对输入。';
  }
  return path.slice(0, 512) + ' ' + message + (optional ? '如无需指定此可选字段，请省略它。' : '');
}
function compileValueValidator(valueSchema) {
  jsonGuard(valueSchema); const errors = [];
  const checkStructure = ajv.compile({ $ref: `${schema.$id || 'urn:amble:extension-manifest'}#/$defs/valueSchema` });
  if (!checkStructure(valueSchema)) throw new Error('Invalid value schema structure');
  validateValueSchema(valueSchema, '', errors); if (errors.length) throw new Error(errors[0].message);
  const check = ajv.compile(valueSchema);
  return (value, onInvalid) => {
    try { jsonGuard(value); } catch {
      onInvalid?.('input 需要有效的 JSON，请检查输入结构并缩减过大或嵌套过深的内容。');
      return false;
    }
    const valid = check(value);
    if (!valid && onInvalid) onInvalid(check.errors.slice(0, 4).map(error => inputIssue(valueSchema, error)).join('\n'));
    return valid;
  };
}
module.exports = { validateSkillLocalization:require('../localization/skill.cjs').validateSkillLocalization, CONTRACT_REVISION, validateManifest, validatePackage, localizeManifest, validateHandlerBindings, compileValueValidator };
