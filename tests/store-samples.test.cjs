const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require('../core/forms/template.cjs');
const L = require('../core/localization/index.cjs');

test('published sample forms render every display slot in English and Chinese, including final confirmation', async () => {
  for (const folder of ['travel-registration', 'service-desk/skills/service-desk']) {
    const root = path.resolve(__dirname, '../examples/store', folder);
    const discovered = await T.discover(await T.safeRead(root, 'SKILL.md'), root);
    assert.deepEqual(discovered.errors, []);
    assert.equal(discovered.forms.length, 1);
    const template = discovered.forms[0];
    assert.equal(template.steps.length, 3);
    const dictionaries = L.prepare(template, L.load(root), T.normalize);
    for (const locale of ['en', 'zh-CN']) {
      const rendered = L.project(template, dictionaries, locale);
      for (const [owner, key] of L.slots(rendered)) {
        assert.doesNotMatch(owner[key], /%[A-Za-z][\w.-]*%/, `${folder}: unresolved ${key}`);
        if (locale === 'en') assert.doesNotMatch(owner[key], /\p{Script=Han}/u, `${folder}: untranslated ${key}`);
      }
      const confirmation = rendered.steps[2].fields.find(field => field.type === 'checkbox');
      assert.equal(confirmation.required, true);
      assert.match(confirmation.label, locale === 'en' ? /checked|reviewed/i : /核对/);
    }
  }
});
