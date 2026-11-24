const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const storage=require('../electron/storage-management.cjs');

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble 空间-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const db=new DatabaseSync(path.join(root,'atelier.sqlite'));
  // Persisted table layout from the first Windows update release (f44e2c6).
  db.exec(`PRAGMA user_version=10;
    CREATE TABLE settings(key TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE projects(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE runs(id TEXT PRIMARY KEY,project_id TEXT,updated_at TEXT NOT NULL,archived_at TEXT,data TEXT NOT NULL);
    CREATE TABLE run_items(run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,collection TEXT NOT NULL,item_key TEXT NOT NULL,position INTEGER NOT NULL,turn_key TEXT,data TEXT NOT NULL,PRIMARY KEY(run_id,collection,item_key));
    INSERT INTO runs(id,updated_at,data) VALUES ('original chat','today','{}')`);
  db.close();
  const files=['attachments/pasted/image.png','scratch/task/report.xlsx','workforce/documents/result.md','codex-home/config.toml','atelier.sqlite.before-v16-123.sqlite','Local Storage/draft','project/design.md'];
  for(const file of files){
    await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await fs.writeFile(path.join(root,file),file);
  }
  const updates=path.join(root,'updates');await fs.mkdir(updates);
  const id=n=>'backup-'+(1700000000000+n);
  // The exact pre-manifest Windows updater layout, including optional sidecars.
  async function legacy(n){
    const dir=path.join(updates,id(n));await fs.mkdir(dir);
    for(const name of ['atelier.sqlite','codex-home'])await fs.cp(path.join(root,name),path.join(dir,name),{recursive:true});
    for(const name of ['atelier.sqlite-wal','atelier.sqlite-shm'])await fs.writeFile(path.join(dir,name),'');
    return dir;
  }
  async function protectedData(){
    const check=new DatabaseSync(path.join(root,'atelier.sqlite'),{readOnly:true});
    try{assert.equal(check.prepare('SELECT id FROM runs').get().id,'original chat');}finally{check.close();}
    for(const file of files)assert.equal(await fs.readFile(path.join(root,file),'utf8'),file);
  }
  return {root,updates,id,legacy,protectedData};
}

test('recognized Windows legacy backups are manually removable; last two, incomplete, foreign and in-progress backups survive',async t=>{
  const {root,updates,id,legacy,protectedData}=await fixture(t);
  for(const n of [1,2,3])await legacy(n);
  await fs.writeFile(path.join(await legacy(4),'report.xlsx'),'personal');
  const broken=path.join(updates,id(5));await fs.mkdir(broken);await fs.writeFile(path.join(broken,'atelier.sqlite'),'invalid');
  const partial=path.join(updates,'.partial-old');await fs.mkdir(partial);await fs.writeFile(path.join(partial,'attachment'),'keep');
  const view=await storage.snapshot(root);
  const select=(...ids)=>ids.map(id=>view.backups.find(b=>b.id===id)||{id});
  assert.deepEqual(view.backups.filter(b=>b.eligible).map(b=>[b.id,b.kind]),[[id(1),'legacy']]);
  assert.deepEqual(view.backups.filter(b=>b.kind==='unknown').map(b=>b.id),[id(5),id(4)]);
  assert.equal((await storage.prune(root,undefined,true)).freed,0);
  await fs.writeFile(path.join(updates,'transaction.json'),JSON.stringify({status:'installing'}));
  assert.equal((await storage.prune(root,select(id(1)))).freed,0);
  await fs.writeFile(path.join(updates,'transaction.json'),'{');
  assert.equal((await storage.prune(root,select(id(1)))).freed,0);
  await fs.writeFile(path.join(updates,'transaction.json'),JSON.stringify({status:'healthy'}));
  const removed=await storage.prune(root,select(id(1),id(1),id(2),id(3),id(4),id(5),'../scratch'));
  assert.equal(removed.skipped,5);assert.equal(removed.freed,view.backups.find(b=>b.id===id(1)).bytes);
  assert.equal(await fs.readFile(path.join(updates,id(4),'report.xlsx'),'utf8'),'personal');
  assert.equal(await fs.readFile(path.join(partial,'attachment'),'utf8'),'keep');
  await protectedData();
});

test('healthy retention removes only eligible manifest backups; a changed inventory and the transaction fallback survive',async t=>{
  const {root,updates,id,protectedData}=await fixture(t);
  await storage.preflight(root);
  for(let n=1;n<=5;n++)await storage.createBackup(root,id(n),{from:'1',target:'2'});
  await fs.writeFile(path.join(updates,id(1),'codex-home','added.md'),'keep');
  await fs.writeFile(path.join(updates,'transaction.json'),JSON.stringify({status:'healthy',backupId:id(2)}));
  const result=await storage.prune(root,undefined,true);
  assert.ok(result.freed>0);assert.equal(result.skipped,0);
  assert.deepEqual((await storage.snapshot(root)).backups.map(b=>b.id),[id(5),id(4),id(2),id(1)]);
  assert.equal((await storage.prune(root,undefined,true)).freed,0);
  await protectedData();
});

test('directory junctions and linked caches never escape into task files',async t=>{
  const {root,updates,id,legacy,protectedData}=await fixture(t);
  const old=await legacy(1);await legacy(2);await legacy(3);
  const link=(to,at)=>fs.symlink(to,at,process.platform==='win32'?'junction':'dir');
  await link(path.join(root,'scratch'),path.join(old,'codex-home','session'));
  await link(path.join(root,'attachments'),path.join(updates,id(4)));
  await link(path.join(root,'scratch'),path.join(root,'Cache'));
  assert.equal((await storage.prune(root,[{id:id(1)},{id:id(4)}])).freed,0);
  const code=path.join(root,'Code Cache');await fs.mkdir(code);await fs.writeFile(path.join(code,'compiled'),'bytes');
  let http=0;
  const result=await storage.clearCache(root,{storagePath:root,clearCache:()=>{http++;},clearCodeCaches:()=>fs.unlink(path.join(code,'compiled'))});
  assert.equal(http,0);assert.deepEqual(result,{freed:5,skipped:1});
  await protectedData();
});

test('a stale confirmation cannot remove a modified legacy backup; failed backup preparation leaves the prior fallback intact',async t=>{
  const {root,updates,id,legacy,protectedData}=await fixture(t);
  const old=await legacy(1);await legacy(2);await legacy(3);
  const selected=(await storage.snapshot(root)).backups.find(b=>b.id===id(1));
  await fs.writeFile(path.join(old,'codex-home','new-content'),'keep');
  assert.deepEqual(await storage.prune(root,[selected]),{freed:0,skipped:1});
  assert.equal(await fs.readFile(path.join(old,'codex-home','new-content'),'utf8'),'keep');
  await assert.rejects(storage.preflight(root,Number.MAX_SAFE_INTEGER),/空间不足/);
  await protectedData();
  const before=await fs.readdir(updates);
  await fs.rename(path.join(root,'atelier.sqlite'),path.join(root,'original.sqlite'));
  await assert.rejects(storage.createBackup(root,id(4),{from:'1',target:'2'}),/BACKUP_DATABASE/);
  assert.deepEqual(await fs.readdir(updates),before);
  await fs.rename(path.join(root,'original.sqlite'),path.join(root,'atelier.sqlite'));
  await protectedData();
});
