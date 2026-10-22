const {test} = require('node:test');
const assert = require('node:assert/strict');
const {confirmationLocale, packageConfirmation, skillConfirmation} = require('../electron/install-confirmation.cjs');
const revision = {id: 'labs.service-desk', digest: 'a'.repeat(64), manifest: {version: '0.1.0', permissions: [{capability: 'configuration', scope: 'self'}]}};
const listing = {title: {zh: '差旅登记', en: 'Travel registration'}, summary: {zh: '三步登记行程', en: 'Register a trip in three steps'}, publisher: 'Ambleloft', release: {version: '0.1.0'}};
test('persisted explicit language takes priority; OS locale applies only to system preference', () => {
  assert.equal(confirmationLocale('en', 'zh-CN'), 'en');
  assert.equal(confirmationLocale('zh', 'en-US'), 'zh');
  assert.equal(confirmationLocale('system', 'zh-CN'), 'zh');
  assert.equal(confirmationLocale('system', 'en-US'), 'en');
  assert.equal(confirmationLocale(undefined, 'zh-CN'), 'en');
});
test('extension prompts localize wording while preserving identity, digest and trust semantics', () => {
  const en = packageConfirmation(revision, 'en', 'zh-CN'), zh = packageConfirmation(revision, 'zh', 'en-US');
  assert.deepEqual(en.buttons, ['Cancel', 'Trust and install']); assert.deepEqual(zh.buttons, ['取消', '信任并安装']);
  for (const dialog of [en, zh]) {
    assert.match(dialog.message, /labs\.service-desk v0\.1\.0/);
    assert.ok(dialog.detail.includes(revision.digest)); assert.match(dialog.detail, /configuration \(self\)/);
    assert.equal(dialog.defaultId, 0); assert.equal(dialog.cancelId, 0);
  }
  assert.match(en.detail, /not an operating-system sandbox/); assert.match(zh.detail, /不是系统沙箱/);
  assert.match(packageConfirmation({...revision, manifest: {version: '0.1.0'}}, 'system', 'en-US').detail, /Declared permissions: None/);
});
test('Store skill prompt chooses the matching catalog copy and leaves scripts unexecuted', () => {
  const en = skillConfirmation(listing, 'en', 'zh-CN'), zh = skillConfirmation(listing, 'system', 'zh-CN');
  assert.match(en.detail, /Travel registration/); assert.doesNotMatch(en.detail, /差旅登记/);
  assert.match(en.detail, /does not automatically execute scripts/);
  assert.match(zh.detail, /差旅登记/); assert.doesNotMatch(zh.detail, /Travel registration/);
  assert.deepEqual(en.buttons, ['Cancel', 'Install and enable']); assert.equal(en.defaultId, 0); assert.equal(zh.cancelId, 0);
});
