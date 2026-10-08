import {_electron as electron} from '@playwright/test';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {zipSync,strToU8} from 'fflate';
const root=await mkdtemp(path.join(tmpdir(),'amble-a3-desktop-')),profile=path.join(root,'profile'),archive=path.join(root,'fixture.amble-extension');let app;
const manifest=version=>({specVersion:'1.0-draft',publisher:'fixture',name:'desktop',version,displayName:'A3 Desktop Fixture',engines:{api:'1'},main:'main.cjs',permissions:[{capability:'projects.read',scope:'project'},{capability:'storage',scope:'self'}]});
async function pack(version){await writeFile(archive,zipSync({'extension.json':strToU8(JSON.stringify(manifest(version))),'main.cjs':strToU8('throw Error("A3 must not execute extension code")')}));}
async function launch(){app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容'}).waitFor();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},archive);return page;}
try{
 await pack('1.0.0');let page=await launch();
 await page.evaluate(root=>window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'fixture-project',expectedRevision:null,value:{id:'fixture-project',name:'Fixture Project',path:root,createdAt:new Date().toISOString()}}]}),root);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'安装扩展',exact:true}).click();await page.getByRole('heading',{name:'A3 Desktop Fixture',exact:true}).waitFor();
 let snapshot=await page.evaluate(()=>window.desktop.extensions.list());assert.equal(snapshot.installed[0].enabled,true);const first=snapshot.installed[0].active;
 await page.getByRole('button',{name:'授权资源',exact:true}).click();await page.getByLabel('选择授权项目',{exact:true}).selectOption('fixture-project');await page.getByRole('button',{name:'确认授权',exact:true}).click();await page.getByText('projects.read · project:fixture-project',{exact:true}).waitFor();
 await pack('2.0.0');await page.getByRole('button',{name:'安装扩展',exact:true}).click();await page.getByText('fixture.desktop · v2.0.0',{exact:true}).waitFor();snapshot=await page.evaluate(()=>window.desktop.extensions.list());assert.equal(snapshot.installed[0].grants.length,0);
 await page.getByRole('button',{name:/恢复版本 1.0.0/}).click();await page.getByText('fixture.desktop · v1.0.0',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.desktop.extensions.list())).installed[0].active,first);
 await page.getByRole('button',{name:'停用',exact:true}).click();await page.getByRole('button',{name:'启用',exact:true}).waitFor();await app.close();app=null;
 page=await launch();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'启用',exact:true}).click();await page.getByRole('button',{name:'停用',exact:true}).waitFor();
 await page.getByRole('button',{name:'授权资源',exact:true}).click();await page.getByLabel('选择授权项目',{exact:true}).selectOption('fixture-project');await page.getByRole('button',{name:'确认授权',exact:true}).click();await page.getByText('projects.read · project:fixture-project',{exact:true}).waitFor();await page.getByRole('button',{name:'撤销全部授权',exact:true}).click();await page.getByText('projects.read · project:fixture-project',{exact:true}).waitFor({state:'detached'});
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/extensions-a3.png'});
 await page.getByRole('button',{name:'卸载',exact:true}).click();await page.getByText('尚未安装扩展。',{exact:true}).waitFor();
 console.log('A3 desktop passed: archive install, explicit trust, project grants, update, fresh grants, rollback, restart, enable, revocation and uninstall. No extension code executed.');
}finally{await app?.close();await rm(root,{recursive:true,force:true});}
