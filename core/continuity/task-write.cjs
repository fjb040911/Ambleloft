const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {readFile} = require('./task-files.cjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// The intent must already be committed. Never retry or roll back an uncertain write.
function applyWrite(intent, {hook = () => {}} = {}) {
 const before = readFile(intent.root, intent.path);
 if (before.contentHash !== intent.beforeHash || digest(Buffer.from(intent.after)) !== intent.afterHash) throw Error('BASELINE_DRIFT');
 const target = path.join(intent.root, intent.path);
 const initial = fs.lstatSync(target, {bigint: true});
 let fd;
 try {
  hook('beforeOpen');
  fd = fs.openSync(target, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const stat = fs.fstatSync(fd, {bigint: true});
  if (!stat.isFile() || stat.nlink !== 1n || stat.ino !== initial.ino || stat.dev !== initial.dev || (stat.mode & 0o222n) === 0n) throw Error('WRITE_TARGET_CHANGED');
  const verify = () => {
   const current = readFile(intent.root, intent.path);
   const named = fs.lstatSync(target, {bigint: true});
   if (named.ino !== stat.ino || named.dev !== stat.dev || current.rootIdentity !== before.rootIdentity || current.contentHash !== intent.beforeHash) throw Error('BASELINE_DRIFT');
   const bytes = Buffer.alloc(Number(stat.size) + 1);
   const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
   if (digest(bytes.subarray(0, count)) !== intent.beforeHash) throw Error('BASELINE_DRIFT');
  };
  hook('beforeWrite'); verify();
  const bytes = Buffer.from(intent.after); let offset = 0;
  while (offset < bytes.length) { const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw Error('SHORT_WRITE'); offset += n; }
  fs.ftruncateSync(fd, bytes.length); fs.fsyncSync(fd);
  hook('afterWrite');
  if (readFile(intent.root, intent.path).contentHash !== intent.afterHash) throw Error('WRITE_RESULT_UNKNOWN');
 } finally { if (fd !== undefined) fs.closeSync(fd); }
}
module.exports = {applyWrite};
