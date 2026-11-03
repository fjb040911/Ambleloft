// Opt-in integration: fictional travel expert, no project data or skill installation.
const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {Database}=require('../../electron/database.cjs'),{createSkills}=require('../../electron/skills.cjs'),{createProviderStore}=require('../../electron/provider.cjs'),{CatalogStore}=require('../../core/catalog-store/service.cjs'),{WorkforceService}=require('../../core/workforce/service.cjs');
const directory=path.resolve(process.argv[2]||path.join(os.tmpdir(),'amble-guide-live-'+Date.now()));app.setName('Ambleloft');app.setPath('userData',directory);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
let db,catalog,workforce;
async function close(){await workforce?.shutdown();await catalog?.shutdown();await db?.close();}
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 const selected=settings.providers.find(p=>new URL(p.baseUrl).hostname==='api.deepseek.com');assert.ok(selected&&safeStorage.isEncryptionAvailable());
 const providers=createProviderStore(directory,safeStorage,{call:async(method,args)=>{assert.equal(method,'readSetting');assert.equal(args.key,'providers');return {version:2,defaultId:selected.id,providers:[{...selected,webSearch:'disabled'}]};}});
 db=new Database(directory);await db.call('ready');const skills=createSkills(directory,db);catalog=new CatalogStore({directory,database:db,skills,extensions:{items:[]}});await catalog.initialize();
 workforce=new WorkforceService({directory,database:db,skills,catalog,providers});await workforce.initialize();
 let draft=await workforce.createDraft({commandId:'fictional-travel-guide'});
 const user={id:'guide-user-1',role:'user',text:'我想创建一位差旅登记专家，帮助员工整理虚构的出差申请。'};
 draft=await workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:user.text,guide:[user]});
 const first=await workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-live-1',providerId:selected.id,model:selected.model});
 const question=first.message.question;
 const answer=question?question.source.definition.fields[0].options[0].label:'希望它帮助员工检查差旅申请缺失信息。';
 const secondUser={id:'guide-user-2',role:'user',text:answer};
 draft=await workforce.saveDraft({id:draft.id,expectedRevision:draft.revision,value:draft.value,step:0,mode:'guided',brief:user.text,guide:[user,first.message,secondUser]});
 const second=await workforce.guideRole({id:draft.id,expectedRevision:draft.revision,requestId:'guide-live-2',providerId:selected.id,model:selected.model});
 assert.equal((await skills.list()).length,0);
 const evidence={model:selected.model,ruleVersion:first.ruleVersion,turns:2,firstTurnDeclarativeQuestion:!!question,secondTurnResponse:!!second.message.text,automaticInstalls:0,scope:'Fictional travel expert and invented answers; no project or user data.'};
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await close();app.exit(0);
}).catch(async error=>{console.error(error.message);await close().catch(()=>{});app.exit(1);});
