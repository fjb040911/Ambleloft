// Opt-in: fixed synthetic requests against configured providers. No project data,
// execution, or writes to the user's provider settings. Never log credentials.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createProviderStore,probeProvider}=require('../../electron/provider.cjs');
const root=path.join(os.tmpdir(),'structured-capabilities-'+Date.now());
app.setName('Ambleloft');app.setPath('userData',root);app.commandLine.removeSwitch('use-mock-keychain');app.commandLine.removeSwitch('password-store');app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const settings=JSON.parse(execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(c.execute(\"select data from settings where key='providers'\").fetchone()[0])",path.join(app.getPath('appData'),'Atelier/atelier.sqlite')],{encoding:'utf8'}));
 await fs.mkdir(root,{recursive:true});
 const results=await Promise.all(settings.providers.map(async selected=>{
  const state={version:2,defaultId:selected.id,providers:[{...selected,outputProfiles:[]}]};
  const store=createProviderStore(root,safeStorage,{call:async(method,args)=>{if(method==='readSetting')return structuredClone(state);if(method==='writeSetting'){Object.assign(state,structuredClone(args.value));return;}throw Error('Unexpected operation');}});
  const started=Date.now();try{
   const result=await probeProvider(await store.secret(selected.id));
   const restored=await store.secret(selected.id);
   const evidence={provider:selected.name,model:selected.model,passed:true,protocol:result.capability.protocol,mode:result.capability.mode,unsupported:result.capability.unsupported,cachedProfiles:restored.outputProfiles.length,elapsedMs:Date.now()-started};
   console.log(JSON.stringify(evidence));return evidence;
  }catch(error){const evidence={provider:selected.name,model:selected.model,passed:false,error:error.message,elapsedMs:Date.now()-started};console.log(JSON.stringify(evidence));return evidence;}
 }));
 await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(results,null,2));console.log('Evidence: '+root);app.exit(results.every(r=>r.passed)?0:1);
}).catch(()=>{console.error('Probe setup failed; no credentials logged.');app.exit(1);});
