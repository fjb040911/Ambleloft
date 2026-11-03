// Explicit integration probe: real HTTP, signatures, archives, SQLite and task snapshots.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Database}=require('../../electron/database.cjs'),{createSkills}=require('../../electron/skills.cjs');
const {CatalogStore}=require('../../core/catalog-store/service.cjs');
const {WorkforceService,roleInstructions}=require('../../core/workforce/service.cjs');
async function run({directory,baseUrl}){
 await fs.mkdir(directory,{recursive:true});const database=new Database(directory);await database.call('ready');
 const source={...require('../../core/catalog-store/sources.json')[0],baseUrl},skills=createSkills(directory,database),catalog=new CatalogStore({directory,database,skills,extensions:{items:[]},sources:[source]});await catalog.initialize();
 const workforce=new WorkforceService({directory,database,skills,catalog});await workforce.initialize();const checks=[];
 try{
  const roles=await workforce.roles({refresh:true});assert.equal(roles.stale,false,roles.error);assert.equal(roles.items.length,10);
  for(const role of roles.items){
   const defaults=role.skills.filter(s=>s.defaultSelected),value={...role.en,skills:defaults.map(s=>({...s,label:s.labelEn||s.label,purpose:s.purposeEn||s.purpose,usage:s.usageEn||s.usage}))};
   const result=await workforce.submit({commandId:'integration-'+role.id,value});await workforce.installQueue;
   const actual=(await workforce.snapshot()).employees.find(e=>e.id===result.id);assert.equal(actual.status,'ready',JSON.stringify(actual.pendingJob));
   const snapshot=await workforce.prepare(result.id);assert.equal(snapshot.skills.length,defaults.length);assert.ok(snapshot.skills.every(s=>s.body&&s.hash&&s.fixedRelease?.packageDigest&&s.usage));
   for(const skill of snapshot.skills)assert.ok(roleInstructions(snapshot).includes(skill.body.replaceAll('\\','\\\\').replaceAll('"','\\"').split('\n')[0]));
   checks.push({roleId:role.id,employeeId:actual.id,defaultCount:defaults.length,skills:snapshot.skills.map(s=>({name:s.name,hash:s.hash,release:s.fixedRelease,bodyBytes:Buffer.byteLength(s.body)})),snapshot});
   console.log(JSON.stringify({role:role.id,status:'installed-and-loaded',skills:defaults.length}));
  }
  // Validate every optional artifact using the same installer, without assigning
  // optional skills to the ten default employees.
  const optional=[...new Map(roles.items.flatMap(r=>r.skills.filter(s=>!s.defaultSelected)).map(s=>[s.source.listingId,s])).values()];
  const opt=await workforce.submit({commandId:'optional-verification',value:{name:'Optional package verification',responsibilities:'Validate package loading',domain:'Testing',methods:'No external execution',deliverables:'Evidence',skills:optional}});await workforce.installQueue;assert.equal((await workforce.snapshot()).employees.find(e=>e.id===opt.id).status,'ready');
  const all=await skills.list();assert.equal(all.length,40);
  // Persist only synthetic fixtures, skill text and verification evidence.
  const result={checkedAt:new Date().toISOString(),source:baseUrl,snapshotId:roles.snapshotId,roleChecks:checks,globalSkillCount:all.length,hostChecks:all.map(s=>({listingId:s.fixedRelease.listingId,platform:process.platform,architecture:process.arch,environment:'local',hostVersion:require('../../package.json').version,status:'passed',checkedAt:new Date().toISOString(),evidenceId:'expert-install-'+s.fixedRelease.listingId}))};
  await fs.writeFile(path.join(directory,'installation-evidence.json'),JSON.stringify(result,null,2));return result;
 }finally{await workforce.shutdown();await catalog.shutdown();await database.close();}
}
if(require.main===module)run({directory:path.resolve(process.argv[2]),baseUrl:process.argv[3]}).then(r=>console.log(JSON.stringify({roles:r.roleChecks.length,installed:r.globalSkillCount}))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
