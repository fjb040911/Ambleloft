// Isolated Windows Electron component soak. Not a substitute for full application E2E.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||'output/windows-longrun-20261118/component');fs.mkdirSync(out,{recursive:true});
const {Database}=require(root+'/electron/database.cjs');
const {append}=require(root+'/electron/text-spool.cjs');
const {range}=require(root+'/electron/runtime-text-cache.cjs');
const {pageRun}=require(root+'/electron/history-pages.cjs');
const {createRunPublisher}=require(root+'/electron/run-events.mjs');
const {WindowRegistry}=require(root+'/electron/window-registry.cjs');
const {metrics}=require(root+'/electron/performance-metrics.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const log=(file,value)=>fs.appendFileSync(path.join(out,file),JSON.stringify(value)+'\n');
const duration=Number(process.argv[3]||120)*60000;
const profile=path.join(out,'soak-profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
let db,windows=[],server,started,phase='',blocked=false;const errors=[];
const runs=Array.from({length:4},(_,i)=>({id:'soak-'+i,status:'running',terminalTurnId:'u',messages:[{id:'u',role:'user',text:'Synthetic isolated task '+i},{id:'a',role:'assistant',text:''},{id:'r',role:'assistant',kind:'reasoning',text:''}],tools:[{id:'child',type:'analysis',status:'running',detail:'',analysisAgent:{name:'Evidence Reviewer'}}],questions:[],approvals:[]}));
const expected=new Map();for(const r of runs)for(const key of ['a','r','child'])expected.set(r.id+'/'+key,{hash:crypto.createHash('sha256'),length:0});
const owners=r=>[[r.messages[1],'text','a'],[r.messages[2],'text','r'],[r.tools[0],'detail','child']];
async function verify(restored,label){const checks=[];assert.equal(restored.length,4);assert.ok(restored.every(r=>r.status==='completed'));for(const r of restored)for(const [owner,field,key] of owners(r)){const h=crypto.createHash('sha256');let length=0;for(let offset=0;;){const p=range(owner,field,offset);h.update(p.text,'utf16le');length+=p.text.length;offset+=p.text.length;if(offset>=p.total)break;assert.ok(p.text.length);}const e=expected.get(r.id+'/'+key),actual=h.digest('hex'),wanted=e.hash.copy().digest('hex');assert.equal(length,e.length);assert.equal(actual,wanted);checks.push({runId:r.id,field:key,length,sha256:actual});}log('integrity.jsonl',{at:new Date().toISOString(),label,checks});}
app.whenReady().then(async()=>{
 fs.writeFileSync(out+'/soak.pid',String(process.pid));started=Date.now();db=new Database(profile);await db.call('ready');const spool=db.getSpool();
 const file=path.join(out,'soak.html');fs.writeFileSync(file,'<!doctype html><title>Isolated Ambleloft IPC soak</title><body>Waiting</body>');
 const publisher=createRunPublisher('windows-soak'),registry=new WindowRegistry(require('url').pathToFileURL(file).href);registry.configureRunDelivery(id=>publisher.snapshot(id));
 ipcMain.on('agent:ready',e=>registry.authorize(e).delivery.reset());ipcMain.on('agent:ack',(e,v)=>{const r=registry.authorize(e);if(!(blocked&&r.window===windows[0]))r.delivery.ack(v);});
 ipcMain.handle('agent:message-text',(e,v)=>{registry.authorize(e);return range(runs.find(r=>r.id===v.id).messages.find(m=>m.id===v.messageId),'text',v.offset);});
 for(let i=0;i<2;i++){const w=new BrowserWindow({show:false,webPreferences:{preload:root+'/electron/preload.cjs',sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(w);registry.add(w,'test');w.webContents.on('render-process-gone',(_,details)=>{errors.push(details);log('events.jsonl',{type:'renderer-exit',details});});await w.loadFile(file);await w.webContents.executeJavaScript("window.events=0;window.latest={};window.desktop.onRunEvent(e=>{window.events++;window.latest[e.id||e.run?.id]=e;document.body.textContent='Received '+window.events;});true");}
 const token='中文 English 😀\n"quote" \\ slash ';let sequence=0;
 server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({sequence:sequence++,text:token.repeat(128)}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let nextSample=0,lastReload=-1,lastSave=0;const savePromises=new Set();
 log('events.jsonl',{type:'start',at:new Date().toISOString(),duration,versions:process.versions,scope:'real Electron main/preload/renderer + DB worker; synthetic HTTP input; no engine/UI task workflow'});
 while(Date.now()-started<duration){const elapsed=Date.now()-started;const next=elapsed<60000?'idle-baseline':elapsed<20*60000?'single-stream':elapsed<60*60000?'four-streams':elapsed<90*60000?'slow-renderer':elapsed<duration-10*60000?'reload-recovery':'idle-after-completion';
  if(next!==phase){phase=next;log('events.jsonl',{type:'phase',phase,elapsed,at:new Date().toISOString()});}
  blocked=phase==='slow-renderer'&&Math.floor(elapsed/30000)%2===0;
  if(!blocked)for(const r of registry.records.values())if(r.delivery.current&&r.delivery.stats().awaitingAckMs>2000)r.delivery.reset();
  if(phase==='reload-recovery'&&Math.floor(elapsed/60000)!==lastReload){lastReload=Math.floor(elapsed/60000);await windows[0].reload();await delay(300);await windows[0].webContents.executeJavaScript("window.events=0;window.latest={};window.desktop.onRunEvent(e=>{window.events++;window.latest[e.id||e.run?.id]=e;});true");registry.records.get(windows[0].webContents.id).delivery.reset();}
  if(!phase.startsWith('idle')){const payload=await (await fetch('http://127.0.0.1:'+server.address().port)).json();for(const r of (phase==='single-stream'?runs.slice(0,1):runs)){for(const [owner,field,key] of owners(r)){const text=payload.sequence+':'+payload.text;append(owner,field,text,spool);const e=expected.get(r.id+'/'+key);e.hash.update(text,'utf16le');e.length+=text.length;}registry.broadcast('test','agent:event',publisher.encode(pageRun(r)));}
   if(elapsed-lastSave>=1000){lastSave=elapsed;const t=performance.now();const p=db.call('saveRunUpdates',runs).then(()=>log('writes.jsonl',{elapsed,ms:performance.now()-t,pendingBytes:db.pendingBytes}));savePromises.add(p);p.finally(()=>savePromises.delete(p));await p;}
  }else if(phase==='idle-after-completion'&&runs[0].status!=='completed'){for(const r of runs){r.status='completed';r.tools[0].status='completed';registry.broadcast('test','agent:event',publisher.encode(pageRun(r)));}await db.call('saveRunUpdates',runs);await verify(runs,'active-complete');}
  if(elapsed>=nextSample){nextSample=elapsed+5000;const t=performance.now(),responses=[];for(const w of windows)responses.push(await w.webContents.executeJavaScript('({events:window.events,heap:performance.memory?.usedJSHeapSize,visible:document.visibilityState})'));const sizes={};for(const name of fs.readdirSync(profile).filter(n=>n.startsWith('atelier.sqlite')))sizes[name]=fs.statSync(path.join(profile,name)).size;log('samples.jsonl',{at:new Date().toISOString(),elapsed,phase,memory:process.memoryUsage(),cpu:process.cpuUsage(),processes:app.getAppMetrics(),renderer:responses,responseMs:performance.now()-t,database:{pendingBytes:db.pendingBytes,queuedCalls:db.queuedCalls,sizes},activeTextSpool:spool.stats(),runPublisher:publisher.stats(),runDelivery:[...registry.records.values()].map(r=>r.delivery.stats()),runtimeTextCache:db.textCache?.stats(),metrics:metrics.snapshot().current});}
  await delay(250);
 }
 await Promise.all(savePromises);await db.call('saveRunUpdates',runs);await verify(runs,'before-close');await db.close();db=new Database(profile);await db.call('ready');const restored=await db.call('readRuntimeRuns');log('events.jsonl',{type:'cold-load',cache:db.textCache.stats(),heap:process.memoryUsage()});await verify(restored,'database-reopened');await db.close();db=null;
 assert.ok(Date.now()-started>=duration);assert.equal(errors.length,0);log('result.jsonl',{passed:errors.length===0,elapsedMs:Date.now()-started,errors,completedAt:new Date().toISOString()});
}).catch(e=>{log('result.jsonl',{passed:false,error:e.stack,elapsedMs:started?Date.now()-started:0});process.exitCode=1;}).finally(async()=>{server?.closeAllConnections();server?.close();for(const w of windows)if(!w.isDestroyed())w.destroy();await db?.close().catch(()=>{});app.exit(process.exitCode||0);});
