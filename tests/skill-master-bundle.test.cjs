const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../electron/database.cjs');
const { createSkills } = require('../electron/skills.cjs');

test('updated creation guide ships localized resources and preserves disabled choice and frozen task bundles', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-master-bundle-'));
  const source = path.join(dir, 'source');
  await fs.cp(path.join(__dirname, '../resources/skills'), source, { recursive: true });
  const db = new Database(path.join(dir, 'data')); await db.call('ready');
  t.after(async () => { await db.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const skills = createSkills(path.join(dir, 'data'), db);
  // Simulate an older packaged revision, then replace resources using the real startup path.
  const reference = path.join(source, 'skill-master/references/api-integration.md');
  const current = await fs.readFile(reference, 'utf8'); await fs.writeFile(reference, 'Earlier integration guidance.\n');
  await skills.initializeBuiltins({ root: source });
  const before = (await skills.prepare(['builtin-skill-master'])).snapshots[0];
  const frozen = await fs.readFile(path.join(path.dirname(before.path), 'references/api-integration.md'), 'utf8');
  await skills.update({ id: before.id, enabled: false });
  await fs.writeFile(reference, current); await skills.initializeBuiltins({ root: source });
  const after = (await skills.list()).find(s => s.id === before.id);
  assert.equal(after.enabled, false); assert.equal(after.version, before.version + 1);
  assert.equal(await fs.readFile(path.join(path.dirname(before.path), 'references/api-integration.md'), 'utf8'), frozen);
  assert.equal((await skills.readFile({ id: before.id, file: 'references/api-integration.md' })).text, current);
  assert.equal(after.files.includes('references/api-integration.md'), true);
  for (const locale of ['en', 'zh-CN']) {
    skills.locale = locale;
    const localized = (await skills.list()).find(s => s.id === before.id);
    const strings = JSON.parse(await fs.readFile(path.join(source, 'skill-master', locale === 'en' ? 'skill.nls.json' : 'skill.nls.zh-CN.json'), 'utf8'));
    assert.equal(localized.displayName, strings.name); assert.equal(localized.displayDescription, strings.description);
  }
  await skills.update({ id: before.id, enabled: true });
  const selected = await skills.prepare([before.id]);
  assert.equal(selected.snapshots.length, 1); assert.equal(selected.snapshots[0].version, after.version);
  assert.notEqual(selected.snapshots[0].path, before.path);
});
