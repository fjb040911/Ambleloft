const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const LIMITS = {refs: 256, fileBytes: 8 * 1024 * 1024, totalBytes: 64 * 1024 * 1024};
const failure = (code, message) => Object.assign(Error(message), {code});
const conflict = () => failure('MANAGED_REPAIR_CONFLICT', '报告、规则或源码基线已变化，请重新审查后再发起修复。');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
function normalizeBaseline(value) {
  if (!only(value, ['version', 'scope', 'refs', 'reviewOf']) || value.version !== 1 || value.scope !== 'enumerated-files' || !Array.isArray(value.refs) || value.refs.length > LIMITS.refs || value.refs.length < 3) throw failure('INVALID_ARGUMENT', '受管修复需要明确的报告、规则与源码文件基线。');
  if (value.reviewOf !== undefined && (typeof value.reviewOf !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(value.reviewOf))) throw failure('INVALID_ARGUMENT', '复查关联无效。');
  const seen = new Set(), kinds = new Set();
  for (const ref of value.refs) {
    if (!only(ref, ['kind', 'path', 'sha256']) || !['report', 'rules', 'source'].includes(ref.kind) || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256) || typeof ref.path !== 'string' || !ref.path || ref.path.length > 512 || ref.path.includes('\\') || ref.path.includes(':') || /[\x00-\x1f]/.test(ref.path) || ref.path.split('/').some(part => !part || part === '.' || part === '..')) throw failure('INVALID_ARGUMENT', '基线必须引用安全的项目相对文件路径与完整 SHA256。');
    const key = ref.path.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw failure('INVALID_ARGUMENT', '基线文件不能重复。');
    seen.add(key); kinds.add(ref.kind);
  }
  if (kinds.size !== 3) throw failure('INVALID_ARGUMENT', '基线必须同时包含报告、规则和源码。');
  return structuredClone(value);
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function projectBinding(runtime, run) {
  if (!run?.projectId || !runtime.workspace?.read) throw failure('UNSUPPORTED', '受管修复需要本地项目。');
  const project = (await runtime.workspace.read()).projects.find(item => item.id === run.projectId);
  if (!project || project.type === 'ssh' || run.remote || typeof project.path !== 'string') throw failure('UNSUPPORTED', '受管修复当前仅支持本地项目；远端项目请使用普通审查流程。');
  let root;
  try { root = await fs.realpath(project.path); if (!(await fs.stat(root)).isDirectory()) throw conflict(); }
  catch { throw conflict(); }
  return {projectId: project.id, projectPath: project.path, root, projectKey: digest(root)};
}
async function verifyFiles(root, baseline) {
  const withinRoot = real => { const relative = path.relative(root, real); return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  let total = 0;
  for (const ref of baseline.refs) {
    let target = root;
    for (const part of ref.path.split('/')) { target = path.join(target, part); if ((await fs.lstat(target)).isSymbolicLink()) throw conflict(); }
    const real = await fs.realpath(target);
    if (!withinRoot(real)) throw conflict();
    const file = await fs.open(real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const before = await file.stat(), currentReal = await fs.realpath(target), current = await fs.stat(target);
      if (!before.isFile() || before.nlink > 1 || before.size > LIMITS.fileBytes || currentReal !== real || !withinRoot(currentReal) || current.ino !== before.ino || current.dev !== before.dev) throw conflict();
      const hash = createHash('sha256'), buffer = Buffer.alloc(65536); let bytes = 0;
      while (true) { const {bytesRead} = await file.read(buffer, 0, buffer.length, null); if (!bytesRead) break; bytes += bytesRead; total += bytesRead; if (bytes > LIMITS.fileBytes || total > LIMITS.totalBytes) throw failure('QUOTA_EXCEEDED', '修复基线文件超过读取上限。'); hash.update(buffer.subarray(0, bytesRead)); }
      const after = await file.stat();
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || hash.digest('hex') !== ref.sha256) throw conflict();
    } finally { await file.close(); }
  }
}
async function capture(runtime, run, value) {
  const baseline = normalizeBaseline(value), binding = await projectBinding(runtime, run);
  try { await verifyFiles(binding.root, baseline); } catch (error) { if (error.code === 'QUOTA_EXCEEDED') throw error; throw conflict(); }
  return {...binding, runId: run.id, baseline, baselineDigest: digest(baseline), capturedAt: new Date().toISOString()};
}
async function verify(runtime, run, saved) {
  const current = await projectBinding(runtime, run);
  if (!saved || saved.runId !== run.id || current.projectId !== saved.projectId || current.projectPath !== saved.projectPath || current.root !== saved.root || current.projectKey !== saved.projectKey || digest(normalizeBaseline(saved.baseline)) !== saved.baselineDigest) throw conflict();
  try { await verifyFiles(current.root, saved.baseline); } catch (error) { if (error.code === 'QUOTA_EXCEEDED') throw error; throw conflict(); }
}
function canReplaceUnknown(current, previous) {
  if (current.baseline.reviewOf !== previous.id) return false;
  const before = previous.managedRepair.baseline.refs.filter(ref => ref.kind === 'report').map(ref => ref.sha256).sort();
  const after = current.baseline.refs.filter(ref => ref.kind === 'report').map(ref => ref.sha256).sort();
  return digest(before) !== digest(after);
}
module.exports = {LIMITS, normalizeBaseline, capture, verify, canReplaceUnknown};
