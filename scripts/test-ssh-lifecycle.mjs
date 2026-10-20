import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'amble-ssh-lifecycle-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${temp}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByLabel('任务内容',{exact:true}).waitFor();
 await app.evaluate(()=>{const requireModule=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');globalThis.sshAttempts=0;requireModule('./core/ssh/service.cjs').SshService.prototype.open=async function(){globalThis.sshAttempts++;throw Error('ISOLATED_CONNECTION_ATTEMPT');};});
 await page.evaluate(async()=>{const connection=await window.desktop.ssh.save({id:'lifecycle',host:'example.test',port:22,username:'fixture',authType:'password',password:'test-only'});await window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'remote',expectedRevision:null,value:{id:'remote',name:'Remote lifecycle',type:'ssh',connectionId:connection.id,path:'/work',createdAt:new Date().toISOString()}},{kind:'project',action:'put',id:'local',expectedRevision:null,value:{id:'local',name:'Local lifecycle',path:'/tmp',createdAt:new Date().toISOString()}}]});});
 await page.reload();await page.locator('.project-tree-name').filter({hasText:'Remote lifecycle'}).click();
 const remote=page.locator('.project-tree-row').filter({hasText:'Remote lifecycle'}),local=page.locator('.project-tree-row').filter({hasText:'Local lifecycle'});
 await expect(remote.locator('.tree-toggle .lucide-server')).toHaveCount(1);await expect(local.locator('.tree-toggle svg')).toHaveClass(/lucide-folder/);
 await expect(page.locator('[role=status]').filter({hasText:'SSH ·'})).toContainText('未连接');
 await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();await page.waitForTimeout(2200);assert.equal(await app.evaluate(()=>globalThis.sshAttempts),0,'Passive file refresh must not connect');
 await page.reload();await expect(page.locator('[role=status]').filter({hasText:'SSH ·'})).toContainText('未连接');await page.waitForTimeout(2200);assert.equal(await app.evaluate(()=>globalThis.sshAttempts),0,'Restoring a visible project must not connect');
 await page.getByRole('button',{name:'连接服务器',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.sshAttempts)).toBe(1);
 await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='视图').submenu.items.find(i=>i.label==='打开终端').click());await expect.poll(()=>app.evaluate(()=>globalThis.sshAttempts)).toBe(2);
 console.log('PASS: distinct project icons; startup, project restoration and file polling stay disconnected; explicit connect and terminal opening initiate connections.');
}finally{await app?.close();await rm(temp,{recursive:true,force:true});}
