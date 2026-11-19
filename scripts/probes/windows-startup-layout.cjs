// Isolated native regression: slow device information must not change titlebar geometry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('@playwright/test');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({args:['.',`--user-data-dir=${path.join(out,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const exits=[];app.process().on('exit',code=>exits.push(code));
 try{const page=await app.firstWindow();await page.waitForFunction(()=>window.desktop);
  await app.evaluate(({ipcMain})=>{const listener=ipcMain._invokeHandlers.get('device:get');if(!listener)throw Error('No device handler');ipcMain.removeHandler('device:get');ipcMain.handle('device:get',async(...args)=>{const result=await listener(...args);await new Promise(r=>setTimeout(r,1500));return result;});});
  await page.addInitScript(()=>{window.__layoutChanges=[];let previous;new MutationObserver(()=>{const el=document.querySelector('.app-shell');if(!el)return;const current=el.classList.contains('windows-desktop');if(current!==previous){window.__layoutChanges.push({at:performance.now(),windows:current});previous=current;}}).observe(document,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});});
  await page.reload();await page.locator('.app-shell').waitFor();await page.waitForTimeout(1900);
  const changes=await page.evaluate(()=>window.__layoutChanges);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({changes,passed:changes.length===1&&changes[0].windows},null,2));
  if(process.env.EXPECT_STABLE_CHROME==='1')assert.deepEqual(changes.map(c=>c.windows),[true]);
  await app.close();assert.deepEqual(exits,[0]);
 }finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
