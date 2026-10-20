import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'amble-ssh-status-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${temp}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByLabel('任务内容',{exact:true}).waitFor();
 await app.evaluate(({ipcMain,BrowserWindow})=>{
  const connection={id:'status',name:'开发服务器',host:'dev.example.test',port:22,username:'developer',authType:'password',state:'disconnected',error:''};
  const publish=()=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.send('ssh:event'));globalThis.setSshState=(state,error='')=>{connection.state=state;connection.error=error;publish();};globalThis.sshConnectCalls=0;
  const handlers={list:()=>[connection],connect:()=>{globalThis.sshConnectCalls++;globalThis.setSshState('connecting');return new Promise(resolve=>{globalThis.finishSshConnect=()=>{globalThis.setSshState('connected');resolve([connection]);};globalThis.resolveOldConnect=()=>resolve([connection]);});},disconnect:()=>{globalThis.setSshState('disconnected');globalThis.resolveOldConnect?.();return [connection];}};
  for(const [name,handler] of Object.entries(handlers)){ipcMain.removeHandler('ssh:'+name);ipcMain.handle('ssh:'+name,handler);}publish();
 });
 await page.evaluate(()=>window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'remote',expectedRevision:null,value:{id:'remote',name:'远端开发项目',type:'ssh',connectionId:'status',path:'/srv/projects/team-website',createdAt:new Date().toISOString()}}]}));
 await page.locator('.project-tree-name').filter({hasText:'远端开发项目'}).click();const status=page.getByRole('region',{name:'SSH 连接',exact:true}),badge=status.getByRole('status'),nav=page.locator('.project-tree-name').filter({hasText:'远端开发项目'});
 await expect(badge).toContainText('未连接');assert.equal(await app.evaluate(()=>globalThis.sshConnectCalls),0);await expect(nav).toContainText('未连接');
 await mkdir('test-results',{recursive:true});await page.waitForTimeout(200);await page.screenshot({path:'test-results/ssh-status-disconnected.png'});
 await status.getByRole('button',{name:'连接服务器',exact:true}).click();await expect(badge).toContainText('连接中');await expect(nav).toContainText('连接中');await status.getByRole('button',{name:'取消连接',exact:true}).click();await expect(badge).toContainText('未连接');
 await status.getByRole('button',{name:'连接服务器',exact:true}).click();await app.evaluate(()=>globalThis.finishSshConnect());await expect(badge).toContainText('已连接');await expect(nav).toContainText('已连接');await expect(status.getByRole('button',{name:'打开终端',exact:true})).toBeEnabled();await page.screenshot({path:'test-results/ssh-status-connected.png'});
 await status.getByRole('button',{name:'断开连接',exact:true}).click();await expect(badge).toContainText('未连接');
 await app.evaluate(()=>globalThis.setSshState('authentication','SSH 认证失败，请检查凭据'));await expect(badge).toContainText('需要认证');await status.getByRole('button',{name:'检查连接设置',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('项目名称',{exact:true})).toHaveValue('远端开发项目');await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 await app.evaluate(()=>globalThis.setSshState('error','连接超时，请检查网络'));await expect(status.getByRole('button',{name:'重新连接',exact:true})).toBeEnabled();await expect(status.getByRole('alert')).toContainText('连接超时');
 await app.evaluate(()=>globalThis.setSshState('reconnecting','连接中断；执行中的命令不会自动重跑'));await expect(status.getByRole('button',{name:'停止重连',exact:true})).toBeEnabled();await status.getByRole('button',{name:'停止重连',exact:true}).click();await expect(badge).toContainText('未连接');
 // The chat disclosure is independent of the SSH connection lifecycle.
 await page.getByRole('button',{name:'新建项目任务',exact:true}).click();
 const summary=status.locator('.ssh-status-summary'),body=status.locator('.ssh-status-body');
 await expect(summary).toHaveAttribute('aria-expanded','false');await expect(body).toBeHidden();await expect(summary).toContainText('developer@dev.example.test:22');assert.ok((await status.boundingBox()).height<=48);
 const callsBefore=await app.evaluate(()=>globalThis.sshConnectCalls);
 await page.screenshot({path:'test-results/ssh-chat-collapsed.png'});
 await summary.focus();await page.keyboard.press('Enter');await expect(summary).toHaveAttribute('aria-expanded','true');await expect(body).toBeVisible();
 await page.reload();await expect(summary).toHaveAttribute('aria-expanded','true');await expect(body).toBeVisible();
 await page.screenshot({path:'test-results/ssh-chat-expanded.png'});
 await summary.focus();await page.keyboard.press('Space');await expect(body).toBeHidden();
 await app.evaluate(()=>globalThis.setSshState('connected'));await expect(badge).toContainText('已连接');await expect(body).toBeHidden();
 await app.evaluate(()=>globalThis.setSshState('error','连接已中断'));await expect(badge).toContainText('连接失败');await expect(body).toBeHidden();
 await page.reload();await expect(summary).toHaveAttribute('aria-expanded','false');assert.equal(await app.evaluate(()=>globalThis.sshConnectCalls),callsBefore);
 await page.setViewportSize({width:640,height:800});await expect(summary).toBeInViewport();assert.ok(await status.evaluate(el=>el.scrollWidth<=el.clientWidth));assert.ok((await status.boundingBox()).height<=48);await page.screenshot({path:'test-results/ssh-chat-narrow.png'});
 await page.setViewportSize({width:1200,height:900});await nav.click();await expect(body).toBeVisible();await expect(summary).toHaveCount(0);
 await page.evaluate(async()=>{const s=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:s.settingsRevision,value:{theme:'dark'}}]});});await app.evaluate(()=>globalThis.setSshState('untrusted','服务器指纹发生变化，连接已阻止'));await expect(badge).toContainText('身份校验失败');await expect(status.getByRole('button',{name:'检查连接设置',exact:true})).toBeEnabled();await page.waitForTimeout(200);await expect(status).toHaveCSS('background-color','rgb(36, 39, 46)');await page.screenshot({path:'test-results/ssh-status-dark.png'});
 await page.setViewportSize({width:640,height:800});await expect(status.getByRole('button',{name:'检查连接设置',exact:true})).toBeInViewport();assert.ok(await status.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:'test-results/ssh-status-narrow.png'});await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('ssh:list');globalThis.setSshState('connected');});await expect(badge).toContainText('状态不可用');await expect(nav).toContainText('状态不可用');await expect(status.getByRole('button',{name:'状态不可用',exact:true})).toBeDisabled();assert.deepEqual(errors,[]);
 console.log('PASS: chat disclosure, keyboard, reload persistence, live collapsed states, no connection side effects, narrow chat;  synchronized sidebar state, connect/cancel/late completion, terminal shortcut, disconnect, auth repair, retry/stop, host verification failure, light/dark/narrow layout.');
}finally{await app?.close();await rm(temp,{recursive:true,force:true});}
