const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {DatabaseSync} = require('node:sqlite');

const backupName = /^backup-\d{13}$/;
const payload = ['atelier.sqlite', 'atelier.sqlite-wal', 'atelier.sqlite-shm', 'codex-home'];
const manifest = 'backup-manifest.json';
const cacheNames = ['Cache', 'Code Cache'];
const keep = 2;

async function stat(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// lstat treats Windows junctions like symbolic links. Never descend into either.
async function walk(file, visit, relative = '') {
  const info = await fs.lstat(file);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    for (const name of (await fs.readdir(file)).sort()) {
      await walk(path.join(file, name), visit, path.join(relative, name));
    }
  }
  visit(relative, info);
}

async function measure(file) {
  let bytes = 0;
  if (await stat(file)) await walk(file, (_, info) => { if (info.isFile()) bytes += info.size; });
  return bytes;
}

async function inventory(dir, names, allowLinks = false, collectEntries = false) {
  const digest = createHash('sha256'), entries = [];
  let bytes = 0;
  for (const name of [...names].sort()) {
    await walk(path.join(dir, name), (relative, info) => {
      if (!info.isDirectory() && !info.isFile() && !(allowLinks && relative && info.isSymbolicLink())) throw Error('UNSAFE_BACKUP_ENTRY');
      const key = path.join(name, relative);
      digest.update(JSON.stringify([key.split(path.sep).join('/'), info.isFile() ? info.size : info.isSymbolicLink() ? 'link' : 'dir']));
      if (info.isFile()) bytes += info.size;
      if (collectEntries) entries.push({key, directory: info.isDirectory()});
    });
  }
  return {bytes, entries, fingerprint: digest.digest('hex')};
}

function isAtelierDatabase(file, checkIntegrity = false) {
  // immutable prevents even a read-only open from creating SQLite sidecars in a backup.
  const db = new DatabaseSync(pathToFileURL(file).href + '?immutable=1', {readOnly: true});
  try {
    if (checkIntegrity && db.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok') return false;
    const tables=db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('runs','run_items','settings','projects')").get().n;
    if (tables !== 4 || db.prepare('PRAGMA user_version').get().user_version < 10) return false;
    // These columns have been present since the first Windows updater (schema v10).
    db.prepare('SELECT runs.project_id, runs.archived_at, run_items.turn_key, run_items.collection, run_items.item_key FROM runs JOIN run_items ON run_items.run_id=runs.id LIMIT 0');
    return true;
  }
  finally { db.close(); }
}

async function inspect(dir, id, collectEntries = false) {
  if (!backupName.test(id)) return null;
  const base = path.join(dir, id);
  if (!(await stat(base))?.isDirectory()) return null;
  const names = await fs.readdir(base);
  if (!names.includes(payload[0]) || names.some(n => !payload.includes(n) && n !== manifest)) return null;
  for (const name of names) {
    const item = await fs.lstat(path.join(base,name));
    if (name === 'codex-home' ? !item.isDirectory() : !item.isFile()) return null;
  }
  const info = await inventory(base, names.filter(n => n !== manifest), names.includes(manifest), collectEntries);
  if (!isAtelierDatabase(path.join(base, payload[0]))) return null;
  let kind = 'legacy';
  if (names.includes(manifest)) {
    const file = path.join(base, manifest), metadata = await fs.lstat(file);
    if (!metadata.isFile() || metadata.size > 4096) return null;
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.format !== 1 || data.id !== id || data.fingerprint !== info.fingerprint) return null;
    info.bytes += metadata.size;
    if (collectEntries) info.entries.push({key: manifest, directory: false});
    kind = 'verified';
  }
  return {id, kind, ...info};
}

async function state(root) {
  const dir = path.join(root, 'updates');
  if (!(await stat(dir))?.isDirectory()) return {dir, records:[], blocked:true};
  let blocked = false, transactionBackup;
  const file = path.join(dir, 'transaction.json');
  if (await stat(file)) {
    try {
      if (!(await fs.lstat(file)).isFile()) throw Error('INVALID_TRANSACTION');
      const txn = JSON.parse(await fs.readFile(file,'utf8'));
      blocked = txn.status !== 'healthy';
      transactionBackup = txn.backupId;
    }
    catch { blocked = true; }
  }
  const records = [];
  for (const id of (await fs.readdir(dir)).filter(id => backupName.test(id)).sort().reverse()) {
    let record;
    try { record = await inspect(dir, id); } catch { /* Unverified entries stay untouched. */ }
    records.push(record || {id, kind:'unknown', bytes:await measure(path.join(dir,id)).catch(()=>0)});
  }
  const recognized = records.filter(r => r.kind !== 'unknown');
  const protectedIds = new Set(recognized.slice(0, keep).map(r => r.id));
  for (const r of recognized.filter(r => r.kind === 'verified').slice(0, keep)) protectedIds.add(r.id);
  for (const r of records) r.eligible = !blocked && r.kind !== 'unknown' && !protectedIds.has(r.id) && r.id !== transactionBackup;
  return {dir, records, blocked};
}

function group(name) {
  if (cacheNames.includes(name)) return 'cache';
  if (payload.slice(0,3).includes(name) || ['conversations.json','workspace.json'].includes(name)) return 'records';
  if (['attachments','scratch','workforce','ssh-agent-workspaces'].includes(name)) return 'tasks';
  if (['codex-home','extensions','skills','catalog-store'].includes(name)) return 'engine';
  return 'other';
}

async function snapshot(root) {
  const {records,dir} = await state(root);
  const groups = {records:0,tasks:0,engine:0,cache:0,backups:0,other:0};
  let partial = false;
  async function add(key,file) {
    try { groups[key] += await measure(file); } catch { partial = true; }
  }
  for (const name of await fs.readdir(root)) {
    if (name === 'updates' && (await stat(dir))?.isDirectory()) {
      groups.backups = records.reduce((total,r)=>total+r.bytes,0);
      for (const entry of await fs.readdir(dir)) {
        if (!backupName.test(entry)) await add(entry.startsWith('.partial-')?'backups':'other',path.join(dir,entry));
      }
    } else await add(group(name), path.join(root,name));
  }
  const disk = await fs.statfs(root);
  return {root, groups, free:disk.bavail*disk.bsize, partial,
    backups:records.map(({id,kind,bytes,eligible,fingerprint})=>({id,kind,bytes,eligible,fingerprint})),
    reclaimable:groups.cache+records.filter(r=>r.eligible).reduce((n,r)=>n+r.bytes,0)};
}

// Accept only IDs selected from a fresh inventory. Delete individual verified files
// and then empty directories. An unexpected extra file therefore survives.
async function prune(root, selection, automatic = false) {
  const {dir, records} = await state(root);
  const result = {freed:0, skipped:0};
  const targets = automatic ? records.filter(r=>r.eligible && r.kind==='verified') : selection;
  const baseRoot = await fs.realpath(root);
  const selected = new Map(targets.map(r=>[r.id,r.fingerprint]));
  for (const [id,fingerprint] of selected) {
    const record = records.find(r=>r.id===id);
    if (!record?.eligible || record.fingerprint !== fingerprint) { result.skipped++; continue; }
    const base = path.join(dir,id);
    try {
      const checked = await inspect(dir,id,true);
      if (!checked || checked.fingerprint !== record.fingerprint) throw Error('BACKUP_CHANGED');
      for (const {key,directory} of checked.entries) {
        const file = path.join(base,key);
        // Refuse if a parent was replaced with a junction after inventory.
        if (await fs.realpath(path.dirname(file)) !== path.join(baseRoot,'updates',id,path.dirname(key))) throw Error('BACKUP_CHANGED');
        if (directory) await fs.rmdir(file);
        else await fs.unlink(file);
      }
      await fs.rmdir(base);
    } catch { result.skipped++; }
    const after = await measure(base).catch(()=>record.bytes);
    result.freed += Math.max(0,record.bytes-after);
  }
  return result;
}

async function clearCache(root, session) {
  if (!session.storagePath || await fs.realpath(session.storagePath) !== await fs.realpath(root)) throw Error('缓存目录与当前数据目录不匹配');
  const result = {freed:0, skipped:0};
  for (const name of cacheNames) {
    const file = path.join(root,name);
    if (!await stat(file)) continue;
    try {
      const before = await inventory(root,[name]);
      if (name === 'Cache') await session.clearCache();
      else await session.clearCodeCaches({});
      result.freed += Math.max(0,before.bytes-await measure(file));
    } catch { result.skipped++; }
  }
  return result;
}

async function preflight(root,installerBytes=0) {
  const dir = path.join(root,'updates');
  const updates = await stat(dir);
  if (updates && !updates.isDirectory()) throw Error('更新目录无效');
  let bytes = 0;
  for (const name of payload) {
    const file = path.join(root,name), info = await stat(file);
    if (!info && name !== 'atelier.sqlite') continue;
    if (!info || (name === 'codex-home' ? !info.isDirectory() : !info.isFile())) throw Error('更新备份源无效');
    bytes += await measure(file);
  }
  const disk = await fs.statfs(root);
  if (disk.bavail*disk.bsize < bytes+Math.max(256*1024*1024,installerBytes||0)) throw Error('更新备份空间不足，请前往设置中的存储空间释放磁盘后重试。');
}

async function createBackup(root, id, versions) {
  if (!backupName.test(id)) throw Error('INVALID_BACKUP_ID');
  const dir = path.join(root,'updates');
  if (!(await stat(dir))?.isDirectory()) throw Error('INVALID_UPDATE_DIRECTORY');
  const temp = path.join(dir,'.partial-'+randomUUID());
  await fs.mkdir(temp);
  try {
    const names = [];
    for (const name of payload) {
      const source = path.join(root,name);
      if (!await stat(source)) continue;
      names.push(name);
      await fs.cp(source,path.join(temp,name),{recursive:true,dereference:false,verbatimSymlinks:true});
    }
    if (!names.includes(payload[0]) || !isAtelierDatabase(path.join(temp,payload[0]),true)) throw Error('INVALID_BACKUP_DATABASE');
    const info = await inventory(temp,names,true);
    const original = await inventory(root,names,true);
    if (original.fingerprint !== info.fingerprint) throw Error('INCOMPLETE_BACKUP');
    await fs.writeFile(path.join(temp,manifest),JSON.stringify({...versions,format:1,id,fingerprint:info.fingerprint}),{flag:'wx'});
    await fs.rename(temp,path.join(dir,id));
  } catch (error) {
    await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
}
module.exports = {snapshot,prune,clearCache,createBackup,preflight};
