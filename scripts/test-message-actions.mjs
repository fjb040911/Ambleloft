import {_electron as electron} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'amble-message-actions-'));let app;
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out');};
const view=code=>app.evaluate(({webContents},code)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('amble-extension:'))?.executeJavaScript(code),code);
try{
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${root}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容'}).waitFor();return page;};
 let page=await launch();await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});dialog.showMessageBox=async()=>({response:1});},path.resolve('examples/extensions/notification-auth'));
 await page.evaluate(()=>window.desktop.extensions.install({development:true}));
 await page.locator('.sidebar').getByRole('button',{name:'通知与认证演示',exact:true}).click();
 await wait(()=>view('document.querySelector("#status")?.textContent==="已准备好"'));
 await view('document.querySelector("[data-op=publish]").click()');await page.getByRole('button',{name:'确认执行',exact:true}).click();await wait(async()=> (await page.evaluate(()=>window.desktop.messages.list())).items.length===1);
 await page.getByRole('button',{name:/消息中心/}).click();await page.locator('.message-open').click();await page.getByRole('button',{name:'完成任务',exact:true}).click();await page.getByRole('button',{name:'确认执行',exact:true}).click();await wait(async()=> (await page.evaluate(()=>window.desktop.messages.list())).items[0].businessState==='resolved');
 const before=(await page.evaluate(()=>window.desktop.messages.list())).items[0];assert.equal(before.executions[0].state,'completed');assert.equal(await page.getByRole('button',{name:'完成任务',exact:true}).isDisabled(),true);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/message-action-native.png'});await app.close();app=null;
 page=await launch();const after=(await page.evaluate(()=>window.desktop.messages.list())).items[0];assert.equal(after.executions[0].id,before.executions[0].id);assert.equal(after.executions[0].state,'completed');assert.equal(after.businessState,'resolved');
 console.log('Native action passed: extension page, two explicit confirmations, persisted result, disabled replay and restart.');
}finally{await app?.close();await rm(root,{recursive:true,force:true});}
