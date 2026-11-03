// Explicit live integration probe. Uses a temporary profile and never starts a model.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Database}=require('../electron/database.cjs'),{createSkills}=require('../electron/skills.cjs'),{CatalogStore,loadSources}=require('../core/catalog-store/service.cjs'),{WorkforceService}=require('../core/workforce/service.cjs');
(async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-role-live-'));let database,catalog,workforce;try{
 database=new Database(directory);await database.call('ready');const skills=createSkills(directory,database);catalog=new CatalogStore({directory,database,skills,extensions:{items:[]},sources:await loadSources(process.argv[2])});await catalog.initialize();workforce=new WorkforceService({directory,database,skills,catalog});await workforce.initialize();
 const roles=await workforce.roles({refresh:true});assert.equal(roles.error,undefined);assert.equal(roles.items.length,7);
 for(const template of roles.items){const e=await workforce.save({value:{...template.zh,skills:template.skills}});await workforce.activate({id:e.id,expectedRevision:e.revision});}
 const snapshot=await workforce.snapshot();assert.equal(snapshot.employees.length,7);assert.ok(snapshot.employees.every(e=>e.status==='ready'));assert.equal(snapshot.globalSkills.length,8);
 const reused=snapshot.employees.flatMap(e=>e.job.steps).filter(s=>s.status==='reused').length;assert.equal(reused,6);
 const restarted=new WorkforceService({directory,database,skills,catalog,fetcher:async()=>{throw Error('offline');}});await restarted.initialize();assert.ok((await restarted.snapshot()).employees.every(e=>e.status==='ready'));
 const old=catalog.fetcher;catalog.fetcher=async()=>{throw Error('offline');};for(const e of snapshot.employees)assert.equal((await restarted.prepare(e.id)).skills.length,2);catalog.fetcher=old;
 const listings=await catalog.catalog({refresh:true});assert.ok(listings.items.some(i=>i.id==='labs.service-desk'&&i.release.version==='0.1.0'));assert.ok(listings.items.some(i=>i.id==='examples.travel-registration'&&i.release.version==='0.1.1'));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),roles:7,globalSkills:8,reused:6,signedRemoteInstallation:true,restartAndOfflineReuse:true,existingStoreEntriesPreserved:true,modelCalls:0},null,2));await restarted.shutdown();
 }finally{await workforce?.shutdown();await catalog?.shutdown();await database?.close();await fs.rm(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
