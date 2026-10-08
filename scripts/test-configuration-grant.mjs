import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(os.tmpdir(),'amble-config-grant-'));let app;
try{
 const directory=path.join(root,'extension');await mkdir(directory);
 await writeFile(path.join(directory,'extension.json'),JSON.stringify({specVersion:'1.0-draft',publisher:'fixture',name:'config-grant',version:'1.0.0',displayName:'配置授权测试',engines:{api:'1'},main:'main.cjs',permissions:[{capability:'configuration',scope:'self'},{capability:'projects.read',scope:'project'}],configuration:{type:'object',properties:{serviceUrl:{type:'string'}},additionalProperties:false}}));
 await writeFile(path.join(directory,'main.cjs'),'exports.activate=()=>{};');
 app=await electron.launch({args:['.',`--user-data-dir=${path.join(root,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.getByRole('textbox',{name:'任务内容'}).waitFor();
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});dialog.showMessageBox=async()=>({response:1});},directory);
 await page.evaluate(()=>window.desktop.extensions.install({development:true}));
 await page.evaluate(()=>window.desktop.extensions.grants({id:'fixture.config-grant',capabilities:['configuration']}));
 const snapshot=await page.evaluate(()=>window.desktop.extensions.list());const item=snapshot.installed.find(i=>i.manifest.id==='fixture.config-grant');assert.deepEqual(item.grants,[{capability:'configuration',resource:'self'}]);
 await page.evaluate(()=>window.desktop.extensions.configuration({id:'fixture.config-grant'}));
 console.log('PASS: configuration-only grant with project permission declared and no project selected; configuration readable, no project grant.');
}finally{await app?.close();await rm(root,{recursive:true,force:true});}
