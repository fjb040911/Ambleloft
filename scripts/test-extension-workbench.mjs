// Real native views, isolated profile, synthetic extensions; no external service calls.
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
const root=await mkdtemp(path.join(tmpdir(),'amble-workbench-'));let app;
async function archive(name,version='1.0.0'){
 const manifest={specVersion:'1.0-draft',publisher:'workbench',name,version,displayName:name==='service'?'Service desk':'Device console',engines:{api:'1'},contributes:{home:{title:name==='service'?'Service desk':'Device console',webRoot:'web',entry:'index.html',...(name==='device'?{when:'project.exists'}:{})}},permissions:[{capability:'configuration',scope:'self'}],configuration:{type:'object',properties:{endpoint:{type:'string'}},additionalProperties:false}};
 const html=`<html><body><h1>${manifest.displayName}</h1><label>Draft <input id="draft"></label><button id="submit">Submit</button><p id="count">0</p><script src="app.js"></script></body></html>`;
 const js='window.submissions=0;window.ready=ambleExtension.initialize().then(c=>window.context=c);document.querySelector("#submit").onclick=()=>document.querySelector("#count").textContent=++window.submissions;';
 const file=path.join(root,`${name}-${version}.amble-extension`);await writeFile(file,zipSync({'extension.json':strToU8(JSON.stringify(manifest)),'web/index.html':strToU8(html),'web/app.js':strToU8(js)}));return file;
}
const views=()=>app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL().startsWith('amble-extension://')).map(w=>w.id));
const run=(id,code)=>app.evaluate(({webContents},{id,code})=>webContents.fromId(id).executeJavaScript(code),{id,code});
async function wait(check){await expect.poll(check,{timeout:15000}).toBeTruthy();}
async function install(page,file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await page.evaluate(()=>window.desktop.extensions.install());}
try{
 const service=await archive('service'),device=await archive('device');
 app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容'}).waitFor();
 await page.evaluate(root=>window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'test-project',expectedRevision:null,value:{id:'test-project',name:'Workbench project',path:root,createdAt:new Date().toISOString()}}]}),root);
 await install(page,service);await install(page,device);
 const rail=page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true});await rail.click();await wait(async()=>(await views()).length===1);let id=(await views())[0];await run(id,'window.ready');assert.equal(await run(id,'window.context.extensionId'),'workbench.service');
 await run(id,'document.querySelector("#draft").value="keep this draft"');await rail.click();await rail.click();assert.deepEqual(await views(),[id]);
 await page.getByRole('button',{name:'扩展页面操作'}).click();await page.getByRole('menuitem',{name:'设置与权限'}).click();const dialog=page.getByRole('dialog',{name:'Service desk · 设置与权限',exact:true});await expect(dialog).toBeVisible();
 await wait(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.every(v=>!v.getVisible())));
 if(await dialog.getByRole('button',{name:'授权扩展配置'}).count())await dialog.getByRole('button',{name:'授权扩展配置'}).click();
 await dialog.getByLabel('endpoint').fill('https://changed.test');await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await dialog.getByRole('button',{name:'保存配置',exact:true}).click();await expect(dialog.getByText('已保存',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'返回业务页面'}).click();await expect(dialog).toBeHidden();
 assert.deepEqual(await views(),[id]);assert.equal(await run(id,'document.querySelector("#draft").value'),'keep this draft');await wait(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.some(v=>v.getVisible())));
 console.log('PASS native page retained through rail toggles, settings overlay, dirty close guard and save.');
 const nav=page.getByRole('region',{name:'扩展业务入口',exact:true});await nav.getByRole('button',{name:/Device console/}).click();await expect(page.getByText('此入口暂不可用',{exact:true})).toBeVisible();await wait(async()=>(await views()).length===0);
 await page.getByRole('combobox',{name:'当前项目'}).click();await page.getByRole('option',{name:'Workbench project'}).click();await wait(async()=>(await views()).length===1);id=(await views())[0];await run(id,'window.ready');assert.equal(await run(id,'window.context.extensionId'),'workbench.device');
 assert.equal(await run(id,'window.submissions'),0);await page.evaluate(()=>window.desktop.extensions.enable({id:'workbench.device',enabled:false}));await wait(async()=>(await views()).length===0);await expect(page.getByText('此扩展入口已不可用',{exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Service desk',exact:true}).click();await wait(async()=>(await views()).length===1);id=(await views())[0];await run(id,'document.querySelector("#submit").click()');assert.equal(await run(id,'window.submissions'),1);
 await install(page,await archive('service','1.0.1'));await wait(async()=>{const list=await views();return list.length===1&&list[0]!==id;});id=(await views())[0];assert.equal(await run(id,'window.submissions'),0);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/extension-workbench-native-host.png'});const image=await app.evaluate(async({webContents},id)=>(await webContents.fromId(id).capturePage()).toPNG().toString('base64'),id);await writeFile('test-results/extension-workbench-native-page.png',Buffer.from(image,'base64'));
 await page.evaluate(()=>window.desktop.extensions.remove('workbench.service'));await wait(async()=>(await views()).length===0);await expect(page.getByText('此扩展入口已不可用',{exact:true})).toBeVisible();console.log('PASS conditional project entry, two native UIs, disable, update, uninstall, and no submission replay.');
}finally{await app?.close();await rm(root,{recursive:true,force:true});}
