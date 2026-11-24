const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {readAttachmentPdf} = require('../electron/attachment-pdf.cjs');

test('PDF attachments return local file bytes and report unavailable or unsupported files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-pdf-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const file = path.join(dir, 'old.PDF');
  const data = Buffer.from('%PDF-1.7\nbytes\n%%EOF');
  await fs.writeFile(file, data);
  assert.deepEqual((await readAttachmentPdf({path:file})).data, data);
  assert.match((await readAttachmentPdf({path:'relative.pdf'})).error, /路径无效/);
  await fs.writeFile(file, 'plain text');
  assert.match((await readAttachmentPdf({path:file})).error, /无法预览/);
  await fs.truncate(file, 32 * 1024 * 1024 + 1);
  assert.match((await readAttachmentPdf({path:file})).error, /32 MiB/);
  await fs.unlink(file);
  assert.match((await readAttachmentPdf({path:file})).error, /不可访问/);
});
