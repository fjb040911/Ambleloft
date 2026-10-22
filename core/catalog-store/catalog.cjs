// Shared, bounded v1 contract for the curated catalog and publisher.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MAX_CATALOG = 2 * 1024 * 1024;
const MAX_ARTIFACT = 50 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const HEX = /^[a-f0-9]{64}$/;
const identifier = value => typeof value === 'string' && ID.test(value);
const fail = code => { throw Error(code); };
function text(value, max = 20000) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('STORE_INVALID_CATALOG'); }
function localized(value) { if (!value || typeof value !== 'object') fail('STORE_INVALID_CATALOG'); text(value.zh); text(value.en); }
function validateCatalog(value) {
  if (!value || value.schemaVersion !== 1 || !identifier(value.sourceId) || !Array.isArray(value.items) || value.items.length > 200) fail('STORE_INVALID_CATALOG');
  const start = Date.parse(value.generatedAt), end = Date.parse(value.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400000) fail('STORE_INVALID_EXPIRY');
  const ids = new Set(), identities = new Set();
  for (const item of value.items) {
    if (!item || !identifier(item.id) || !['skill', 'extension'].includes(item.kind) || ids.has(item.id)) fail('STORE_INVALID_CATALOG');
    ids.add(item.id); text(item.entityName, 120);
    const identity = item.kind + ':' + item.entityName;
    if (identities.has(identity)) fail('STORE_DUPLICATE_IDENTITY'); identities.add(identity);
    for (const field of ['title', 'summary', 'description', 'trialPrompt', 'runtime', 'setup']) localized(item[field]);
    text(item.publisher, 120); text(item.license, 120);
    if (!Array.isArray(item.tags) || item.tags.length > 20) fail('STORE_INVALID_CATALOG');
    item.tags.forEach(tag => text(tag, 80));
    if (item.previewSteps !== undefined) {
      if (!Array.isArray(item.previewSteps) || item.previewSteps.length < 1 || item.previewSteps.length > 6) fail('STORE_INVALID_PREVIEW');
      for (const step of item.previewSteps) {
        if (!step || typeof step !== 'object') fail('STORE_INVALID_PREVIEW');
        for (const field of ['title', 'description']) {
          if (!step[field] || typeof step[field] !== 'object') fail('STORE_INVALID_PREVIEW');
          text(step[field].zh, 2000); text(step[field].en, 2000);
        }
      }
    }
    const release = item.release;
    if (!release || !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(release.version) || !['published', 'yanked', 'revoked'].includes(release.status)) fail('STORE_INVALID_RELEASE');
    if (!HEX.test(release.artifactSha256) || !HEX.test(release.packageDigest) || !Number.isSafeInteger(release.artifactSize) || release.artifactSize <= 0 || release.artifactSize > MAX_ARTIFACT) fail('STORE_INVALID_ARTIFACT');
    if (release.artifactPath !== `artifacts/sha256/${release.artifactSha256}.${item.kind === 'skill' ? 'zip' : 'amble-extension'}`) fail('STORE_INVALID_ARTIFACT_PATH');
    if (!Number.isFinite(Date.parse(release.reviewedAt))) fail('STORE_INVALID_REVIEW');
    text(release.reviewedBy, 120); localized(release.changelog);
    if (release.hostRequirements !== undefined && (!release.hostRequirements || !/^\d+\.\d+\.\d+$/.test(release.hostRequirements.minVersion))) fail('STORE_INVALID_REQUIREMENTS');
    for (const [field, allowed] of [['platforms', ['darwin','linux','win32']], ['architectures', ['arm64','x64']]]) {
      if (release[field] !== undefined && (!Array.isArray(release[field]) || !release[field].length || release[field].some(value => !allowed.includes(value)))) fail('STORE_INVALID_REQUIREMENTS');
    }
  }
  return value;
}
function validateSource(source) {
  if (!source || !identifier(source.id) || !identifier(source.keyId)) fail('STORE_INVALID_SOURCE');
  text(source.title, 120); text(source.publicKey, 2000); text(source.baseUrl, 2000);
  let url; try { url = new URL(source.baseUrl); } catch { fail('STORE_INVALID_SOURCE'); }
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/') || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) fail('STORE_INVALID_SOURCE_URL');
  if (crypto.createPublicKey(source.publicKey).asymmetricKeyType !== 'ed25519') fail('STORE_INVALID_SOURCE_KEY');
  return {id: source.id, title: source.title, baseUrl: url.href, keyId: source.keyId, publicKey: source.publicKey};
}
function verifyEnvelope(envelope, source, now = Date.now()) {
  if (!envelope || envelope.keyId !== source.keyId || typeof envelope.payload !== 'string' || envelope.payload.length > MAX_CATALOG || typeof envelope.signature !== 'string') fail('STORE_INVALID_SIGNATURE');
  const bytes = Buffer.from(envelope.payload, 'base64'), sig = Buffer.from(envelope.signature, 'base64');
  if (bytes.toString('base64') !== envelope.payload || sig.toString('base64') !== envelope.signature || sig.length !== 64 || !crypto.verify(null, bytes, source.publicKey, sig)) fail('STORE_INVALID_SIGNATURE');
  const catalog = validateCatalog(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
  if (catalog.sourceId !== source.id || Date.parse(catalog.generatedAt) > now + 5 * 60000) fail('STORE_INVALID_SOURCE');
  return {catalog, stale: Date.parse(catalog.expiresAt) <= now};
}
function hashDirectory(directory, {skillImport = false} = {}) {
  const hash = crypto.createHash('sha256'); let bytes = 0, count = 0;
  function visit(dir, base = '') {
    const root = fs.lstatSync(dir); if (!root.isDirectory() || root.isSymbolicLink()) fail('STORE_UNSAFE_PACKAGE');
    for (const name of fs.readdirSync(dir).sort()) {
      if (skillImport && ['.git', 'node_modules', '.DS_Store'].includes(name)) continue;
      const file = path.join(dir, name), rel = base + name, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink > 1))) fail('STORE_UNSAFE_PACKAGE');
      if (stat.isDirectory()) visit(file, rel + '/');
      else {
        if (stat.size > MAX_ARTIFACT - bytes || count >= 1000) fail('STORE_PACKAGE_TOO_LARGE');
        let data = fs.readFileSync(file);
        if (skillImport && rel === 'SKILL.md') {
          const fields = require('../../electron/skills.cjs').parseSkill(data.toString('utf8'));
          data = Buffer.from(`---\n${fields.frontmatter}\n---\n\n${fields.body}\n`);
        }
        bytes += data.length; if (++count > 1000 || bytes > MAX_ARTIFACT) fail('STORE_PACKAGE_TOO_LARGE'); hash.update(JSON.stringify([rel, data.length])); hash.update(data);
      }
    }
  }
  visit(directory); return hash.digest('hex');
}
function checkCompatibility(release, {version, platform = process.platform, arch = process.arch}) {
  if (release.platforms && !release.platforms.includes(platform) || release.architectures && !release.architectures.includes(arch)) fail('STORE_PLATFORM_UNSUPPORTED');
  if (release.hostRequirements) {
    const actual = version.split('.').map(Number), minimum = release.hostRequirements.minVersion.split('.').map(Number);
    if (actual.length !== 3 || actual.some(value => !Number.isSafeInteger(value))) fail('STORE_HOST_VERSION_UNSUPPORTED');
    for (let i = 0; i < 3; i++) { if (actual[i] > minimum[i]) break; if (actual[i] < minimum[i]) fail('STORE_HOST_VERSION_UNSUPPORTED'); }
  }
}
function inspectStoreLink(value, sources) {
  try {
    if (typeof value !== 'string' || value.length > 1000) return null;
    const url = new URL(value);
    if (url.protocol !== 'ambleloft:' || url.hostname !== 'store' || url.pathname !== '/item' || url.username || url.password || url.port || url.hash) return null;
    if ([...url.searchParams.keys()].sort().join(',') !== 'id,source') return null;
    const sourceId = url.searchParams.get('source'), listingId = url.searchParams.get('id');
    if (!identifier(listingId) || !identifier(sourceId)) return null;
    return sources.some(source => source.id === sourceId) ? {sourceId, listingId} : {code: 'STORE_UNTRUSTED_SOURCE'};
  } catch { return null; }
}
function parseStoreLink(value, sources) { const target = inspectStoreLink(value, sources); return target && !target.code ? target : null; }
module.exports = {inspectStoreLink, checkCompatibility, validateCatalog, validateSource, verifyEnvelope, hashDirectory, parseStoreLink, MAX_CATALOG, MAX_ARTIFACT};
