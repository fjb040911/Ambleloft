const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {PackageStore} = require('../extensions/packages.cjs');
const {validateSource, verifyEnvelope, checkCompatibility, hashDirectory, MAX_CATALOG, MAX_ARTIFACT} = require('./catalog.cjs');

async function loadSources(file = process.env.AMBLE_STORE_SOURCE_FILE) {
  if (!file) return [];
  const stat = await fs.stat(file); if (!stat.isFile() || stat.size > 16000) throw Error('STORE_INVALID_SOURCE_FILE');
  const values = JSON.parse(await fs.readFile(file, 'utf8'));
  // The curated MVP deliberately has one configured source, not a user-supplied URL API.
  if (!Array.isArray(values) || values.length > 1) throw Error('STORE_INVALID_SOURCE_FILE');
  return values.map(validateSource);
}
async function download(url, limit, {signal, fetcher = fetch, timeout = 30000} = {}) {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeout); let response;
  try {
    response = await fetcher(url, {redirect: 'error', signal: controller.signal, headers: {'Accept': 'application/octet-stream'}});
    if (!response.ok || !response.body) throw Error('STORE_DOWNLOAD_FAILED');
    const length = response.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw Error('STORE_DOWNLOAD_TOO_LARGE');
    const parts = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('STORE_DOWNLOAD_TOO_LARGE'); parts.push(chunk); }
    if (controller.signal.aborted) throw Error('STORE_DOWNLOAD_CANCELLED');
    return Buffer.concat(parts);
  } finally { controller.abort(); clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
class CatalogStore {
  constructor({directory, database, skills, extensions, sources = [], publish = () => {}, fetcher, now = Date.now, hostVersion = require('../../package.json').version}) {
    this.root = path.join(directory, 'catalog-store'); this.database = database; this.skills = skills; this.extensions = extensions;
    this.sources = sources.map(validateSource); this.publish = publish; this.fetcher = fetcher; this.now = now; this.hostVersion = hostVersion;
    this.skillPackages = new PackageStore(path.join(this.root, 'skills'), path.join(__dirname, 'skill-validator.cjs'));
    this.busy = new Map(); this.queue = Promise.resolve(); this.refreshing = null; this.cacheQueue = Promise.resolve(); this.mappingQueue = Promise.resolve();
  }
  async initialize() { await fs.mkdir(this.root, {recursive: true}); await this.skillPackages.initialize(); }
  get source() { return this.sources[0]; }
  async readCache() {
    try {
      const file = path.join(this.root, 'catalog.json'), stat = await fs.stat(file);
      if (stat.size > MAX_CATALOG) return null;
      const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
      return {...verifyEnvelope(envelope, this.source, this.now()), envelope};
    } catch { return null; }
  }
  async refresh(signal) {
    if (!this.source) throw Error('STORE_NOT_CONFIGURED');
    const old = await this.readCache();
    const raw = await download(new URL('catalog.json', this.source.baseUrl).href, MAX_CATALOG, {fetcher: this.fetcher, signal});
    const envelope = JSON.parse(raw.toString('utf8')), verified = verifyEnvelope(envelope, this.source, this.now());
    if (verified.stale) throw Error('STORE_CATALOG_EXPIRED');
    if (old && Date.parse(verified.catalog.generatedAt) < Date.parse(old.catalog.generatedAt)) throw Error('STORE_CATALOG_ROLLBACK');
    const save = this.cacheQueue.then(async () => {
      const latest = await this.readCache();
      if (latest && Date.parse(verified.catalog.generatedAt) < Date.parse(latest.catalog.generatedAt)) throw Error('STORE_CATALOG_ROLLBACK');
      const tmp = path.join(this.root, 'catalog-' + crypto.randomUUID() + '.tmp');
      try { await fs.writeFile(tmp, raw, {flag: 'wx'}); await fs.rename(tmp, path.join(this.root, 'catalog.json')); } finally { await fs.rm(tmp, {force: true}); }
    });
    this.cacheQueue = save.catch(() => {}); await save;
    return verified;
  }
  async mappings() { return await this.database.call('readSetting', {key: 'catalog-store.installations.v1'}) || []; }
  changeMappings(change) {
    const action = this.mappingQueue.then(async () => {
      const rows = change(await this.mappings());
      await this.database.call('writeSetting', {key: 'catalog-store.installations.v1', value: rows}); return rows;
    });
    this.mappingQueue = action.catch(() => {}); return action;
  }
  saveMapping(row) { return this.changeMappings(rows => [...rows.filter(value => value.sourceId !== row.sourceId || value.listingId !== row.listingId), row]); }
  async recoverMappings() {
    const rows = await this.mappings(); if (!rows.some(row => row.pending)) return rows;
    const skills = await this.skills.list(), recovered = [];
    for (const row of rows.filter(value => value.pending)) {
      let matches = [];
      if (row.kind === 'skill') {
        for (const skill of skills.filter(value => value.name === row.entityName)) {
          try { if (hashDirectory(path.dirname(skill.path)) === row.installedDigest) matches.push({entityId: skill.id, installedRevision: skill.revision}); } catch { /* incomplete or edited installation */ }
        }
      } else {
        const item = this.extensions.items.find(value => value.id === row.entityName && value.active === row.installedDigest);
        const revision = item?.revisions?.find(value => value.digest === item.active);
        try { if (revision && hashDirectory(path.join(this.extensions.packages.root, revision.relativePath)) === row.installedDigest) matches.push({entityId: item.id, installedRevision: item.active}); } catch { /* do not infer ownership from a display name */ }
      }
      if (matches.length === 1) { const {pending, journalId, entityName, ...complete} = row; recovered.push({journalId, row: {...complete, ...matches[0]}}); }
    }
    if (!recovered.length) return rows;
    return this.changeMappings(current => current.map(row => recovered.find(value => row.pending && value.journalId === row.journalId)?.row || row));
  }

  async installations() {
    const rows = await this.recoverMappings(), skills = await this.skills.list(), items = this.extensions.items;
    const result = [];
    for (const row of rows) {
      if (row.pending) continue;
      const entity = row.kind === 'skill' ? skills.find(item => item.id === row.entityId) : items.find(item => item.id === row.entityId);
      if (!entity) continue;
      let locallyModified = true;
      try {
        if (row.kind === 'skill') locallyModified = entity.revision !== row.installedRevision || hashDirectory(path.dirname(entity.path)) !== row.installedDigest;
        else {
          const revision = entity.revisions?.find(value => value.digest === entity.active);
          locallyModified = entity.active !== row.installedRevision || !revision || hashDirectory(path.join(this.extensions.packages.root, revision.relativePath)) !== row.installedRevision;
        }
      } catch { /* unreadable packages are never safe to overwrite */ }
      const {installedDigest, installedRevision, artifactSha256, ...display} = row;
      result.push({...display, locallyModified});
    }
    return result;
  }
  async catalog({refresh = false} = {}) {
    let value = this.source ? await this.readCache() : null, error;
    if (this.source && (refresh || !value)) {
      try { if (!this.refreshing) this.refreshing = this.refresh().finally(() => { this.refreshing = null; }); value = await this.refreshing; }
      catch (failure) { error = failure.message; }
    }
    return {source: this.source ? {id: this.source.id, title: this.source.title} : null, items: value?.catalog.items || [], stale: !value || value.stale || !!error, ...(error ? {error} : !this.source ? {error: 'STORE_NOT_CONFIGURED'} : {}), installed: await this.installations(), busy: [...this.busy.keys()]};
  }
  cancel({listingId}) { const operation = this.busy.get(listingId); if (operation && !operation.committing) operation.controller.abort(); return {cancelled: !!operation && !operation.committing}; }
  async shutdown() { this.closed = true; for (const operation of this.busy.values()) if (!operation.committing) operation.controller.abort(); await this.queue; }
  install(input, confirmations = {}) {
    if (this.closed) return Promise.reject(Error('STORE_CLOSED'));
    if (!input || input.sourceId !== this.source?.id || typeof input.listingId !== 'string') return Promise.reject(Error('STORE_INVALID_SOURCE'));
    if (this.busy.has(input.listingId)) return Promise.reject(Error('STORE_INSTALL_BUSY'));
    const operation = {controller: new AbortController(), committing: false}; this.busy.set(input.listingId, operation); this.publish();
    const action = this.queue.then(() => this.installOne(input, confirmations, operation));
    this.queue = action.catch(() => {});
    return action.finally(() => { this.busy.delete(input.listingId); this.publish(); });
  }
  async installOne(input, confirmations, operation) {
    const signal = operation.controller.signal; let expiresAt;
    const check = () => { if (signal.aborted) throw Error('STORE_INSTALL_CANCELLED'); if (expiresAt && expiresAt <= this.now()) throw Error('STORE_CATALOG_EXPIRED'); };
    check();
    const current = (await this.installations()).find(row => row.sourceId === input.sourceId && row.listingId === input.listingId);
    if (current) return {kind: current.kind, entityId: current.entityId};
    // An install always revalidates the live signed catalog, including withdrawal status.
    const {catalog} = await this.refresh(signal); expiresAt = Date.parse(catalog.expiresAt); check();
    const item = catalog.items.find(entry => entry.id === input.listingId);
    if (!item || item.release.status !== 'published') throw Error('STORE_RELEASE_UNAVAILABLE');
    const release = item.release; checkCompatibility(release, {version: this.hostVersion});
    const bytes = await download(new URL(release.artifactPath, this.source.baseUrl).href, Math.min(MAX_ARTIFACT, release.artifactSize), {signal, fetcher: this.fetcher}); check();
    if (bytes.length !== release.artifactSize || crypto.createHash('sha256').update(bytes).digest('hex') !== release.artifactSha256) throw Error('STORE_ARTIFACT_INTEGRITY');
    const journalId = crypto.randomUUID(); let journalWritten = false;
    const journal = async installedDigest => {
      await this.saveMapping({pending: true, journalId, sourceId: this.source.id, listingId: item.id, kind: item.kind, entityName: item.entityName, installedDigest, releaseVersion: release.version, artifactSha256: release.artifactSha256, installedAt: new Date(this.now()).toISOString()});
      journalWritten = true; check();
    };
    const stage = await fs.mkdtemp(path.join(this.root, 'download-'));
    try {
      const file = path.join(stage, 'package.zip'); await fs.writeFile(file, bytes, {flag: 'wx'}); check();
      let entityId, installedRevision, installedDigest;
      if (item.kind === 'extension') {
        let accepted = false;
        await this.extensions.installPackage(file, 'archive', async revision => {
          check();
          if (revision.id !== item.entityName || revision.digest !== release.packageDigest || revision.manifest.version !== release.version) throw Error('STORE_PACKAGE_IDENTITY');
          // Callback runs inside the extension service mutation queue. Never replace an unrelated install.
          if (this.extensions.items.some(existing => existing.id === revision.id)) throw Error('STORE_IDENTITY_CONFLICT');
          accepted = await confirmations.extension?.(revision, item) === true; check();
          if (accepted) { await journal(revision.digest); operation.committing = true; entityId = revision.id; installedRevision = revision.digest; }
          return accepted;
        });
        if (!accepted) return {kind: item.kind, entityId: '', cancelled: true};
      } else {
        const revision = await this.skillPackages.prepare(file, 'archive'); check();
        if (revision.digest !== release.packageDigest || revision.manifest.name !== item.entityName) throw Error('STORE_PACKAGE_IDENTITY');
        if ((await this.skills.list()).some(existing => existing.name === item.entityName)) throw Error('STORE_IDENTITY_CONFLICT');
        if (await confirmations.skill?.(item) !== true) return {kind: item.kind, entityId: '', cancelled: true}; check();
        const importedRoot = path.join(this.skillPackages.root, revision.relativePath);
        await journal(hashDirectory(importedRoot, {skillImport: true}));
        operation.committing = true;
        const result = await this.skills.importFolder(importedRoot);
        if (!result.skill) throw Error('STORE_IDENTITY_CONFLICT');
        entityId = result.skill.id; installedRevision = result.skill.revision;
        installedDigest = hashDirectory(path.dirname(result.skill.path));
      }
      const mapping = {sourceId: this.source.id, listingId: item.id, kind: item.kind, entityId, releaseVersion: release.version, artifactSha256: release.artifactSha256, installedRevision, installedDigest, installedAt: new Date(this.now()).toISOString()};
      await this.saveMapping(mapping);
      return {kind: item.kind, entityId};
    } finally {
      try { if (journalWritten && !operation.committing) await this.changeMappings(rows => rows.filter(row => row.journalId !== journalId)); }
      finally { await fs.rm(stage, {recursive: true, force: true}); }
    }
  }
}
module.exports = {CatalogStore, loadSources, download};
