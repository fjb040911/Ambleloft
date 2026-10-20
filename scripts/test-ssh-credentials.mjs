// Isolated OS-encrypted SSH credential persistence probe; never uses user credentials.
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'amble-ssh-credentials-'));let app;
const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${temp}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByLabel('任务内容',{exact:true}).waitFor();return page;};
try{
 let page=await launch();
 await app.evaluate(({ipcMain})=>ipcMain.removeHandler('ssh:list'));
 await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('radio',{name:'SSH 远端项目',exact:false}).check();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('请完全退出并重新启动应用');
 await page.getByLabel('主机 / IP',{exact:true}).fill('example.test');await page.getByLabel('SSH 用户名',{exact:true}).fill('fixture');await page.getByLabel('SSH 密码',{exact:true}).fill('isolated-ssh-fixture');
 await expect(page.getByRole('button',{name:'保存连接并测试',exact:true})).toBeDisabled();
 await app.close();app=undefined;page=await launch();
 // Keep real save/list/encryption; avoid making a network connection in this probe.
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('ssh:connect');ipcMain.handle('ssh:connect',()=>{throw Error('TEST_CONNECTION_STAGE_REACHED');});});
 await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('radio',{name:'SSH 远端项目',exact:false}).check();
 await page.getByLabel('主机 / IP',{exact:true}).fill('example.test');await page.getByLabel('SSH 用户名',{exact:true}).fill('fixture');await page.getByLabel('SSH 密码',{exact:true}).fill('isolated-ssh-fixture');await page.getByLabel('使用系统安全存储记住凭据',{exact:true}).check();
 await page.getByRole('button',{name:'保存连接并测试',exact:true}).click();
 const alert=page.getByRole('dialog').getByRole('alert');await expect(alert).toContainText('TEST_CONNECTION_STAGE_REACHED',{timeout:20000});
 const records=await page.evaluate(()=>window.desktop.ssh.list());assert.equal(records[0].remember,true);assert.ok(!JSON.stringify(records).includes('isolated-ssh-fixture'));
 await app.close();app=undefined;page=await launch();
 const result=await app.evaluate(({app,safeStorage})=>{
  const requireModule=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
  const {DatabaseSync}=requireModule('node:sqlite');const db=new DatabaseSync(requireModule('node:path').join(app.getPath('userData'),'atelier.sqlite'),{readOnly:true});
  try{const raw=db.prepare('SELECT data FROM settings WHERE key=?').get('sshConnections').data;const entry=JSON.parse(raw)[0];return {encrypted:!raw.includes('isolated-ssh-fixture'),decrypted:JSON.parse(safeStorage.decryptString(Buffer.from(entry.secret,'base64'))).password==='isolated-ssh-fixture'};}finally{db.close();}
 });assert.deepEqual(result,{encrypted:true,decrypted:true});console.log('PASS: missing handler guidance and submit guard; remember checkbox → real SSH IPC save → OS encrypted database → restart/decrypt; no plaintext credentials exposed.');
}finally{await app?.close();await rm(temp,{recursive:true,force:true});}
