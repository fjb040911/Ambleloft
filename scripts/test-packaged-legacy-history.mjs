import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {_electron} from '@playwright/test';

const require = createRequire(import.meta.url);
const {Database} = require('../electron/database.cjs');
const {createRunPatches} = require('../electron/run-patches.cjs');

export async function verifyLegacyActivityHistory(executablePath) {
  const profile = await mkdtemp(path.join(tmpdir(), 'amble-legacy-activity-'));
  const file = path.join(profile, 'atelier.sqlite');
  const activities = [
    {id: 'legacy/step', text: '甲中文😀\n'.repeat(6000), status: 'completed', title: 'Step A', type: 'commandExecution'},
    {id: '1', text: '乙 output 😀\n'.repeat(3000), status: 'completed', title: 'Step B', type: 'reasoning'},
  ];
  const run = {id: 'legacy-run', title: 'Legacy nested activity', status: 'completed', messages: [{id: 'u', role: 'user', text: 'Summarize local fixture'}], tools: [{id: 't', turnKey: 'u', type: 'analysis', label: 'Subagent', status: 'completed', detail: 'summary', nativeActivity: activities}], approvals: [], questions: []};

  function fields() {
    const db = new DatabaseSync(file, {readOnly: true});
    try {
      return db.prepare("SELECT field,revision FROM run_texts WHERE run_id='legacy-run' AND collection='tools' AND field LIKE '%nativeActivity%' ORDER BY field").all();
    } finally { db.close(); }
  }

  let app;
  try {
    const db = new Database(profile);
    try {
      await db.call('ready');
      // Recreate the v16 positional text keys without relying on a previous checkout.
      const batch = createRunPatches().prepare([run]);
      for (const item of batch.input.patches[0].upserts) {
        for (const text of item.texts) {
          const field = JSON.parse(text.field);
          if (field[0] !== 'nativeActivity') continue;
          const index = activities.findIndex(activity => activity.id === field[1]);
          assert.ok(index >= 0);
          field[1] = index;
          text.field = JSON.stringify(field);
        }
      }
      await db.request('saveRunPatches', batch.input);
    } finally { await db.close(); }

    const legacy = fields();
    assert.deepEqual(legacy.map(row => JSON.parse(row.field)[1]), [0, 1]);
    const old = new DatabaseSync(file);
    try { old.exec('PRAGMA user_version=16'); } finally { old.close(); }
    await mkdir(path.join(profile, 'updates'), {recursive: true});
    await writeFile(path.join(profile, 'updates/preferences.json'), JSON.stringify({autoCheck: false, autoDownload: false}));

    app = await _electron.launch({executablePath, args: [`--user-data-dir=${profile}`], env: {...process.env, ATELIER_DEV: '0'}, timeout: 60000});
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof window.desktop?.listRuns === 'function');
    assert.equal(await app.evaluate(({app}) => app.isPackaged), true);
    assert.equal((await page.evaluate(() => window.desktop.listRuns()))[0].id, run.id);
    for (const activity of activities) {
      const read = await page.evaluate(activityId => window.desktop.getToolText({id: 'legacy-run', toolId: 't', activityId, offset: 0, limit: 64000}), activity.id);
      assert.equal(read.text.length, activity.text.length, activity.id);
      assert.ok(read.text === activity.text, activity.id + ' content differs');
    }
    await app.close();
    app = undefined;

    const migrated = new Map(fields().map(row => [row.field, row.revision]));
    assert.equal(migrated.size, activities.length);
    for (const [index, activity] of activities.entries()) {
      assert.equal(migrated.get(JSON.stringify(['nativeActivity', activity.id, 'text'])), legacy[index].revision);
    }
    const check = new DatabaseSync(file, {readOnly: true});
    try {
      assert.equal(check.prepare('PRAGMA quick_check').get().quick_check, 'ok');
      assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { check.close(); }
    console.log('PASS: packaged startup migrates v16 activity text to stable IDs with revisions and full contents preserved.');
  } finally {
    await app?.close();
    await rm(profile, {recursive: true, force: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const executable = process.argv[2];
  assert.ok(executable, 'Usage: node scripts/test-packaged-legacy-history.mjs <packaged-executable>');
  await verifyLegacyActivityHistory(path.resolve(executable));
}
