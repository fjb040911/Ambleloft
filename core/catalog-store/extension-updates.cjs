const path = require('node:path');
const {signedPayload, verifyEnvelope, checkCompatibility, hashDirectory, MAX_CATALOG} = require('./catalog.cjs');

const DAY = 86400000;
const ID = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const stable = /^\d+\.\d+\.\d+$/;
function newer(remote, local) {
  if (!stable.test(remote)) return false;
  const [core, prerelease] = local.split('-');
  if (!stable.test(core)) return false;
  const before = core.split('.').map(BigInt), after = remote.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (before[i] !== after[i]) return after[i] > before[i];
  return !!prerelease;
}
function classify(extension, item, store) {
  const release = item.release;
  if (release.status !== 'published') return release.status;
  if (extension.active === release.packageDigest) return 'current';
  if (extension.manifest.version === release.version) return 'integrity';
  if (!newer(release.version, extension.manifest.version)) return 'not-newer';
  if (!item.upgradeFromDigests?.includes(extension.active)) return 'unmanaged';
  try { checkCompatibility(release, {version:store.hostVersion}); } catch (error) { return error.message; }
  const revision = extension.revisions.find(r => r.digest === extension.active);
  try {
    if (hashDirectory(path.join(store.extensions.packages.root, revision.relativePath)) !== extension.active) return 'modified';
  } catch { return 'modified'; }
  return 'update';
}
class ExtensionUpdates {
  constructor(store, download, changed) {
    this.store = store; this.download = download; this.changed = changed;
    this.abort = new AbortController();
  }
  setting(name, value) {
    const key = 'catalog-store.extension-updates.' + this.store.source?.id + '.' + name;
    return value === undefined ? this.store.database.call('readSetting',{key}) : this.store.database.call('writeSetting',{key,value});
  }
  async status() {
    const [scan,auto] = await Promise.all([this.setting('scan'),this.setting('auto')]);
    return {...(scan || {}), auto:auto !== false};
  }
  packages() { return this.store.extensions.items.filter(e => e.kind === 'package' && e.sourceMode === 'archive' && e.trusted); }
  async candidates(requested, previous) {
    const packages = this.packages(), mappings = await this.store.mappings();
    const cache = await this.store.readCache();
    return packages.filter(e => {
      if (requested) return e.id === requested;
      return previous[e.id]?.knownDigest === e.active ||
        mappings.some(m => !m.pending && m.kind === 'extension' && m.sourceId === this.store.source?.id && m.entityId === e.id && (m.installedDigest || m.installedRevision) === e.active) ||
        cache?.catalog.items.some(i => i.kind === 'extension' && i.entityName === e.id && (i.release.packageDigest === e.active || i.upgradeFromDigests?.includes(e.active)));
    });
  }
  async json(route, options) {
    const url = new URL('api/v1/extensions/' + route, this.store.source.baseUrl);
    return JSON.parse(await this.download(url.href,MAX_CATALOG,{fetcher:this.store.fetcher,signal:this.abort.signal,...options}));
  }
  validate(record, id, prev) {
    const r = signedPayload(record,this.store.source), now = this.store.now();
    const time = Date.parse(r.generatedAt), end = Date.parse(r.expiresAt);
    if (r.kind !== 'extension-update' || r.schemaVersion !== 1 || r.entityName !== id || r.sourceId !== this.store.source.id ||
        !ID.test(r.id) || !Number.isFinite(time) || !Number.isFinite(end) || time > now + 300000 || end <= now || end <= time ||
        end-time > 31*DAY || !DIGEST.test(r.release?.artifactSha256) || !DIGEST.test(r.release?.packageDigest) ||
        !['published','yanked','revoked'].includes(r.release.status)) throw Error('STORE_INVALID_UPDATE_RECORD');
    if (prev && (prev.listingId !== r.id || time < prev.time || time === prev.time && record.signature !== prev.signature)) throw Error('STORE_CATALOG_ROLLBACK');
    return r;
  }
  async batch(ids, previous) {
    const {items} = await this.json('check-updates',{body:JSON.stringify({ids})});
    if (!Array.isArray(items) || items.length !== ids.length || new Set(items.map(i=>i.id)).size !== ids.length ||
        items.some(i=>!ids.includes(i.id))) throw Error('STORE_INVALID_UPDATE_BATCH');
    return items.map(i => i.status === 'unknown' && !i.record ? {id:i.id} :
      {id:i.id, record:this.validate(i.record,i.id,previous[i.id]), signature:i.record.signature});
  }
  check({automatic=false,entityId}={}) {
    if (this.running) return entityId || this.autoRun && !automatic ? this.running.then(()=>this.check({automatic,entityId})) : this.running;
    this.autoRun = automatic;
    this.running = this.scan(automatic,entityId).finally(()=>{this.running=null;});
    return this.running;
  }
  async scan(automatic,entityId) {
    const old = await this.status(), now = this.store.now();
    if (automatic && !old.auto) return old;
    const inventory=JSON.stringify(this.packages().map(e=>[e.id,e.active,e.enabled]).sort((a,b)=>a[0].localeCompare(b[0])));
    if (automatic && old.inventory===inventory && (old.retryAt || (old.lastSuccess || 0)+DAY)>now) return old;
    if (!this.store.source) throw Error('STORE_NOT_CONFIGURED');
    const previous = Object.assign(Object.create(null),old.records), candidates = await this.candidates(entityId,previous);
    const updates = [], outcomes = Object.create(null); let failed = 0;
    for(let offset=0;offset<candidates.length;offset+=50) {
      const batch = candidates.slice(offset,offset+50);
      try {
        for (const row of await this.batch(batch.map(e=>e.id),previous)) {
          const extension = this.packages().find(e=>e.id===row.id);
          if (!extension) continue;
          if (!row.record) {outcomes[row.id]='unknown'; continue;}
          const r=row.record, outcome=classify(extension,r,this.store);
          outcomes[row.id]=outcome;
          previous[row.id]={time:Date.parse(r.generatedAt),signature:row.signature,digest:r.release.artifactSha256,
            version:r.release.version,listingId:r.id,status:r.release.status,
            knownDigest:(extension.active===r.release.packageDigest||r.upgradeFromDigests.includes(extension.active))?extension.active:undefined};
          if (outcome==='update') updates.push({entityId:row.id,listingId:r.id,version:r.release.version});
          if (outcome!=='update' || extension.enabled || !automatic)
            await this.notify(row.id,outcome==='update'?{record:r,version:extension.manifest.version}:null);
        }
      } catch {failed+=batch.length;}
    }
    if (!entityId) for (const id of Object.keys(previous)) if (!this.packages().some(e=>e.id===id)) await this.notify(id,null);
    const state={inventory:entityId?old.inventory:inventory,records:previous,lastSuccess:failed||entityId?old.lastSuccess:now,retryAt:failed?now+15*60000:undefined};
    await this.setting('scan',state);
    return {...state,auto:old.auto,checked:candidates.length,failed,updates,outcomes};
  }
  async notify(entityId,target) {
    const changed=await this.store.database.call('storeUpdateNotification',{sourceId:this.store.source.id,entityId,target,locale:this.locale});
    if(changed?.status==='published'||changed?.settled)this.changed?.();
  }
  async detail(id,signal) {
    const extension=this.packages().find(e=>e.id===id);
    if (!extension) throw Error('STORE_EXTENSION_NOT_INSTALLED');
    const previous=(await this.status()).records?.[id];
    if (!previous?.knownDigest || previous.knownDigest!==extension.active) throw Error('STORE_CHECK_UPDATE_FIRST');
    const envelope=await this.json(encodeURIComponent(id)+'/detail',{signal:signal||this.abort.signal});
    const {catalog,stale}=verifyEnvelope(envelope,this.store.source,this.store.now()),item=catalog.items[0];
    if (stale || catalog.items.length!==1 || item.kind!=='extension' || item.entityName!==id || item.id!==previous.listingId ||
        Date.parse(catalog.generatedAt)<previous.time || Date.parse(catalog.generatedAt)===previous.time &&
        (item.release.artifactSha256!==previous.digest || item.release.status!==previous.status || item.release.version!==previous.version)) throw Error('STORE_INVALID_UPDATE_RECORD');
    return {catalog,item,outcome:classify(extension,item,this.store),currentVersion:extension.manifest.version};
  }
  start() {
    const tick=()=>this.check({automatic:true}).catch(()=>{});
    this.timer=setTimeout(tick,5000);this.timer.unref();
    this.interval=setInterval(tick,15*60000);this.interval.unref();
  }
  async stop() {clearTimeout(this.timer);clearInterval(this.interval);this.abort.abort();await this.running?.catch(()=>{});}
}
module.exports={ExtensionUpdates,newer,classify};
