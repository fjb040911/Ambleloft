import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'amble-project-editor-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${temp}`],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByLabel('任务内容',{exact:true}).waitFor();
 await app.evaluate(({ipcMain})=>{
  let connections=[],attempt=0;
  const handlers={list:()=>connections,save:(_e,input)=>{const {password,passphrase,...record}=input;connections=[{...record,state:'disconnected'}];return record;},connect:()=>{if(++attempt===1)throw Error('SSH 认证失败，请检查凭据');connections[0].state='connected';return connections;},browse:(_e,input)=>({path:input.path||'/home/developer',parent:'/home',entries:[]}),validate:(_e,input)=>{if(input.path==='/missing')throw Error('远端路径不是目录');return {path:input.path};}};
  for(const [name,handler] of Object.entries(handlers)){ipcMain.removeHandler('ssh:'+name);ipcMain.handle('ssh:'+name,handler);}
 });
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const dialog=page.getByRole('dialog'),save=dialog.getByRole('button',{name:'保存项目',exact:true});
 await expect(save).toBeDisabled();await dialog.getByRole('radio',{name:'本地项目',exact:false}).focus();await page.keyboard.press('ArrowRight');await expect(dialog.getByRole('radio',{name:'SSH 远端项目',exact:false})).toBeChecked();await page.keyboard.press('ArrowLeft');await expect(dialog.getByRole('radio',{name:'本地项目',exact:false})).toBeChecked();await expect(dialog.getByLabel('项目说明',{exact:true})).toBeHidden();
 await dialog.getByLabel('项目名称',{exact:true}).fill('Website');await dialog.getByLabel('工作目录',{exact:true}).fill('/tmp/local-project');await expect(save).toBeEnabled();
 await page.waitForTimeout(200);await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/project-editor-local.png'});
 await dialog.getByRole('radio',{name:'SSH 远端项目',exact:false}).check();await expect(save).toBeDisabled();
 await dialog.getByLabel('连接名称',{exact:true}).fill('Development');await dialog.getByLabel('主机 / IP',{exact:true}).fill('example.test');await dialog.getByLabel('SSH 用户名',{exact:true}).fill('developer');await dialog.getByLabel('SSH 密码',{exact:true}).fill('test-only');
 await dialog.getByRole('button',{name:'保存连接并测试',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('SSH 认证失败');await expect(dialog.getByLabel('SSH 密码',{exact:true})).toHaveValue('test-only');await expect(save).toBeDisabled();
 await page.screenshot({path:'test-results/project-editor-ssh-error.png'});
 await dialog.getByRole('button',{name:'保存连接并测试',exact:true}).click();await expect(dialog.getByRole('button',{name:'使用此目录',exact:true})).toBeVisible();await expect(dialog.getByText('此目录中没有子文件夹，可直接使用当前目录。')).toBeVisible();
 await dialog.getByRole('button',{name:'使用此目录',exact:true}).click();await expect(dialog.getByLabel('工作目录',{exact:true})).toHaveValue('/home/developer');await expect(save).toBeEnabled();
 await dialog.getByRole('radio',{name:'本地项目',exact:false}).check();await expect(dialog.getByLabel('工作目录',{exact:true})).toHaveValue('/tmp/local-project');
 await dialog.getByRole('radio',{name:'SSH 远端项目',exact:false}).check();await expect(dialog.getByLabel('工作目录',{exact:true})).toHaveValue('/home/developer');await expect(save).toBeEnabled();
 await dialog.getByLabel('工作目录',{exact:true}).fill('/missing');await save.click();await expect(dialog.getByRole('alert')).toContainText('远端路径不是目录');
 await dialog.getByLabel('工作目录',{exact:true}).fill('/home/developer');
 await page.evaluate(async()=>{const s=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:s.settingsRevision,value:{theme:'dark'}}]});});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.waitForTimeout(300);await expect(dialog).toHaveCSS('background-color','rgb(36, 39, 46)');await expect(dialog).toHaveCSS('color','rgb(232, 234, 240)');await page.screenshot({path:'test-results/project-editor-dark.png'});
 await page.setViewportSize({width:480,height:650});
 const body=dialog.locator('.project-editor-body');await body.evaluate(el=>el.scrollTop=el.scrollHeight);await expect(save).toBeInViewport();await expect(dialog.locator('.project-location-options')).toHaveCSS('grid-template-columns',await dialog.locator('.project-location-options').evaluate(el=>getComputedStyle(el).width));assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:'test-results/project-editor-small.png'});
 await save.click();await expect(dialog).toHaveCount(0);const state=await page.evaluate(()=>window.desktop.readWorkspace());assert.equal(state.projects[0].path,'/home/developer');assert.equal(state.projects[0].name,'Website');assert.deepEqual(errors,[]);
 console.log('PASS: project editor readiness, local/SSH draft preservation, failed authentication retry, directory choice, inline validation, dark theme, narrow layout and persistence.');
}finally{await app?.close();await rm(temp,{recursive:true,force:true});}
