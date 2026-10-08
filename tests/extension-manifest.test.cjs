const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateManifest, validatePackage, localizeManifest, validateHandlerBindings, compileValueValidator } = require('../core/extensions/manifest.cjs');
const { compileCondition } = require('../core/extensions/condition.cjs');
const fixture = require('../specs/extensions/examples/extension.json');
const fresh = () => structuredClone(fixture);
test('draft contract accepts example and isolated skills-only manifest, rejects legacy', () => {
  assert.equal(validateManifest(fresh()).ok, true);
  const manifest = fresh(); delete manifest.operations; delete manifest.main; delete manifest.contributes; manifest.skills = ['skills/demo'];
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(validateManifest({ apiVersion: 1, id: 'legacy' }).ok, false);
});
const invalid = {
  'unknown root': m => m.hooks = [],
  'missing main': m => delete m.main,
  'M2 permission': m => m.permissions.push({ capability: 'hooks', scope: 'self' }),
  'wrong prefix': m => m.operations[0].id = 'foreign.plugin.operation',
  'cross-contribution duplicate': m => m.contributes.commands[0].id = m.operations[0].id,
  'duplicate handler': m => m.operations.push({ ...m.operations[0], id: 'example.project-card.second' }),
  'missing project binding': m => m.operations[0].inputSchema.required = [],
  'wrong project type': m => m.operations[0].inputSchema.properties.projectId = { type: 'integer' },
  'wrong permission scope': m => m.permissions[0].scope = 'self',
  'undeclared permission': m => m.operations[0].requiredPermissions.push('storage'),
  'project capability on self operation': m => m.operations[0].projectScoped = false,
  'wrong schema keyword': m => m.operations[0].inputSchema.maxLength = 5,
  'undeclared required': m => m.operations[0].outputSchema.required.push('missing'),
  'inverted bounds': m => m.operations[0].inputSchema.properties.projectId.minLength = 200,
  'wrong enum type': m => m.operations[0].inputSchema.properties.projectId.enum = [1],
  'enum outside bounds': m => m.operations[0].inputSchema.properties.projectId.enum = [''],
  'remote ref': m => m.operations[0].inputSchema.$ref = 'https://invalid.test/schema',
  'regex schema': m => m.operations[0].inputSchema.properties.projectId.pattern = '.*',
  'credential configuration': m => m.configuration = { type: 'object', properties: { apiKey: { type: 'string' } }, additionalProperties: false },
  'home command without home': m => delete m.contributes.home,
  'missing translation': m => m.displayName = '%title%',
  'foreign context': m => m.contextKeys = [{ key: 'ext.other.plugin.ready', type: 'boolean', default: true }],
  'context default type': m => m.contextKeys = [{ key: 'ext.example.project-card.ready', type: 'boolean', default: 'true' }],
  'unknown condition key': m => m.operations[0].enablement = 'project.secret',
  'condition coercion': m => m.operations[0].enablement = 'project.exists == "true"',
  'eval injection': m => m.operations[0].enablement = 'project.exists || process.exit()',
  'read write impact': m => m.operations[0].risk = { reversible: true, impacts: ['external'] },
  'absolute path': m => m.main = '/tmp/extension.js',
  'traversal': m => m.main = 'dist/../extension.js',
  'dot path': m => m.main = './extension.js',
  'empty component': m => m.main = 'dist//extension.js',
  'depth overflow': m => { let schema = { type: 'string' }; for (let i = 0; i < 8; i++) schema = { type: 'array', maxItems: 1, items: schema }; m.operations[0].inputSchema.properties.deep = schema; },
};
for (const [name, mutate] of Object.entries(invalid)) test(`rejects ${name}`, () => { const m = fresh(); mutate(m); assert.equal(validateManifest(m).ok, false); });
test('no accessor execution, prototype objects, cycles, nonfinite numbers or large payloads', () => {
  let invoked = false; const m = fresh(); Object.defineProperty(m, 'x', { enumerable: true, get() { invoked = true; throw new Error(); } });
  assert.equal(validateManifest(m).ok, false); assert.equal(invoked, false);
  assert.equal(validateManifest(new Date()).ok, false);
  const circular = fresh(); circular.x = circular; assert.equal(validateManifest(circular).ok, false);
  const large = fresh(); large.description = 'x'.repeat(300000); assert.equal(validateManifest(large).ok, false);
});
test('typed condition precedence, parentheses, context scoping, strict values', () => {
  const types = { 'project.exists': 'boolean', 'ext.example.project-card.count': 'number', 'ext.example.project-card.mode': 'string' };
  const condition = compileCondition('!project.exists || (ext.example.project-card.count >= 2 && ext.example.project-card.mode == "ready")', types);
  assert.equal(condition({ 'project.exists': false }), true);
  assert.equal(condition({ 'project.exists': true, 'ext.example.project-card.count': 2, 'ext.example.project-card.mode': 'ready' }), true);
  assert.equal(condition({ 'project.exists': true, 'ext.example.project-card.count': 1, 'ext.example.project-card.mode': 'ready' }), false);
  assert.throws(() => condition({ 'project.exists': 'false' }));
  for (const source of ['project.exists;', 'true false', '(true', '1', 'true == 1', '"a" < "b"', 'true || missing']) assert.throws(() => compileCondition(source, types));
});
test('localization exact locale then base language then default, no identity translation', () => {
  const m = fresh(); m.displayName = '%title%'; m.description = '%description%'; m.operations[0].title = '%operation%';
  const dictionaries = { default: { title: 'Default', description: 'Description', operation: 'Read' }, zh: { title: '中文', operation: '读取' }, 'zh-cn': { title: '简体' } };
  assert.equal(validateManifest(m, { defaultMessages: dictionaries.default }).ok, true);
  const localized = localizeManifest(m, dictionaries, 'zh-CN');
  assert.equal(localized.displayName, '简体'); assert.equal(localized.description, 'Description'); assert.equal(localized.operations[0].title, '读取'); assert.equal(localized.operations[0].id, m.operations[0].id);
  assert.equal(m.displayName, '%title%');
});
test('value validation does not coerce, mutate or accept extra fields', () => {
  const check = compileValueValidator(fresh().operations[0].inputSchema);
  assert.equal(check({ projectId: 'p' }), true);
  for (const value of [{}, { projectId: 2 }, { projectId: 'p', extra: 1 }, null]) assert.equal(check(value), false);
  assert.throws(() => compileValueValidator({ type: 'string', pattern: '.*' }));
  assert.throws(() => compileValueValidator({ type: 'string', minimum: 2 }));
});
test('handler bindings must match exactly, including empty exposure', () => {
  const m = fresh(); m.operations[0].exposeTo = [];
  assert.equal(validateManifest(m).ok, true);
  assert.equal(validateHandlerBindings(m, ['describeProject']), true);
  for (const names of [[], ['other'], ['describeProject', 'describeProject']]) assert.equal(validateHandlerBindings(m, names), false);
});
test('package checks real files, symlink components, home entry, skills and locale files without executing code', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amble-manifest-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const m = fresh(); m.displayName = '%title%'; m.skills = ['skills/demo'];
  fs.mkdirSync(path.join(root, 'dist')); fs.mkdirSync(path.join(root, 'web')); fs.mkdirSync(path.join(root, 'skills/demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'extension.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(root, 'extension.nls.json'), '{"title":"default"}');
  fs.writeFileSync(path.join(root, 'extension.nls.zh-CN.json'), '{"title":"中文"}');
  fs.writeFileSync(path.join(root, 'dist/extension.mjs'), 'throw new Error("must never execute")');
  fs.writeFileSync(path.join(root, 'web/index.html'), '<html></html>'); fs.writeFileSync(path.join(root, 'skills/demo/SKILL.md'), '# Demo');
  assert.equal(validatePackage(root).ok, true); assert.equal(validatePackage(root).dictionaries['zh-cn'].title, '中文');
  fs.rmSync(path.join(root, 'skills/demo/SKILL.md')); assert.equal(validatePackage(root).ok, false);
  fs.writeFileSync(path.join(root, 'skills/demo/SKILL.md'), '# Demo');
  fs.rmSync(path.join(root, 'dist/extension.mjs')); fs.symlinkSync(path.join(root, 'web/index.html'), path.join(root, 'dist/extension.mjs')); assert.equal(validatePackage(root).ok, false);
  fs.rmSync(path.join(root, 'dist/extension.mjs')); fs.writeFileSync(path.join(root, 'dist/extension.mjs'), '');
  fs.rmSync(path.join(root, 'web'), { recursive: true }); fs.symlinkSync(path.join(root, 'dist'), path.join(root, 'web')); assert.equal(validatePackage(root).ok, false);
});
test('checked-in valid and invalid package fixtures', () => {
  assert.equal(validatePackage(path.join(__dirname, 'fixtures/extensions/valid')).ok, true);
  assert.equal(validatePackage(path.join(__dirname, 'fixtures/extensions/invalid')).ok, false);
});
test('authentication resources validate HTTPS, path boundaries, duplicate ids and localized title',()=>{
 const manifest=JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../examples/extensions/notification-auth/extension.json'),'utf8'));
 const {validateManifest}=require('../core/extensions/manifest.cjs');assert.equal(validateManifest(manifest).ok,true);
 for(const patch of [{baseUrl:'http://unsafe/'},{baseUrl:'https://service.test/api'},{baseUrl:'https://user:pass@service.test/'},{audience:'https://service.test/#fragment'}]){const m=structuredClone(manifest);Object.assign(m.authentication.resources[0],patch);assert.equal(validateManifest(m).ok,false);}
 const duplicate=structuredClone(manifest);duplicate.authentication.resources.push(duplicate.authentication.resources[0]);assert.equal(validateManifest(duplicate).ok,false);
 manifest.authentication.resources[0].title='%resource%';assert.equal(validateManifest(manifest).ok,false);assert.equal(validateManifest(manifest,{defaultMessages:{resource:'Business'}}).ok,true);
});
