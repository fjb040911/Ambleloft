// Explicit opt-in integration: fictional travel role + public signed Store metadata only.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {Database}=require('../../electron/database.cjs'),{createSkills}=require('../../electron/skills.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{CatalogStore}=require('../../core/catalog-store/service.cjs'),{WorkforceService}=require('../../core/workforce/service.cjs');
const directory=path.resolve(process.argv[2]||path.join(os.tmpdir(),'amble-expert-match-live-'+Date.now()));app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let db,catalog,workforce;
async function close(){await workforce?.shutdown();await catalog?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');assert.ok(selected&&safeStorage.isEncryptionAvailable());
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};}});
 db=new Database(directory);await db.call('ready');const skills=createSkills(directory,db);catalog=new CatalogStore({directory,database:db,skills,extensions:{items:[]},sources:require('../../core/catalog-store/sources.json')});await catalog.initialize();
 workforce=new WorkforceService({directory,database:db,skills,catalog,providers});await workforce.initialize();
 const draft=await workforce.createDraft({commandId:'synthetic-travel'}),value={...draft.value,name:'虚构差旅申请专家',domain:'差旅业务',responsibilities:'梳理差旅登记需求、用户故事与验收标准',deliverables:'差旅申请产品需求和验收场景',methods:'先检查缺项，再形成可验证的建议',skills:[]};
 const saved=await workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value,step:2,mode:'manual',brief:''});
 const result=await workforce.suggestExpertSkills({requestId:'synthetic-travel-match',draftId:saved.id,draftRevision:saved.revision,providerId:selected.id,model:selected.model});
 for(const item of result.items){const decl=await workforce.resolveExpertSkillSuggestion({requestId:result.requestId,draftId:saved.id,draftRevision:saved.revision,snapshotId:result.snapshotId,listingId:item.id,version:item.version});assert.equal(decl.source.listingId,item.id);}
 assert.equal((await skills.list()).length,0);const evidence={status:'completed',model:selected.model,snapshotId:result.snapshotId,ruleVersion:result.ruleVersion,verifiedCandidates:result.items.length,unmatchedCapabilities:result.unmatchedCapabilities.length,automaticInstalls:0,scope:'Fictional travel role and public Store candidate summaries; no real project or user data.'};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await close();app.exit(0);
}).catch(async error=>{console.error(error.message);await close().catch(()=>{});app.exit(1);});
