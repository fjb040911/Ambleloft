const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore, initialState } = require('../electron/store.cjs');

test('workspace writes persist in order and leave no temporary files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-store-'));
  try {
    const store = createStore(directory);
    assert.deepEqual(await store.read(), initialState());
    await Promise.all([store.write({ ...initialState(), theme: 'dark' }), store.write({ ...initialState(), theme: 'light' })]);
    assert.equal((await createStore(directory).read()).theme, 'light');
    assert.deepEqual(await fs.readdir(directory), ['workspace.json']);
    assert.throws(() => store.write({ ...initialState(), tasks: [{ prompt: '' }] }));
    assert.equal((await store.read()).theme, 'light');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('corrupted data is surfaced instead of replaced with an empty workspace', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-store-'));
  try {
    await fs.writeFile(path.join(directory, 'workspace.json'), 'broken');
    await assert.rejects(createStore(directory).read());
    assert.equal(await fs.readFile(path.join(directory, 'workspace.json'), 'utf8'), 'broken');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
