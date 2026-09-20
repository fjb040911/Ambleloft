import {_electron as electron} from '@playwright/test';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-settings-'));let app;
const stamp=new Date().toISOString();
await writeFile(path.join(directory,'workspace.json'),JSON.stringify({theme:'light',language:'zh-CN',projects:[],tasks:[]}));
await writeFile(path.join(directory,'provider.json'),JSON.stringify({baseUrl:'https://legacy.example/v1',model:'legacy-model',executable:'',encryptedKey:''}));
await writeFile(path.join(directory,'conversations.json'),JSON.stringify([{id:'archive',title:'品牌视觉提案',projectId:null,providerId:'legacy',model:'legacy-model',baseUrl:'https://legacy.example/v1',cwd:directory,createdAt:stamp,archivedAt:stamp,status:'completed',messages:[{id:'u',role:'user',text:'整理品牌视觉方案'},{id:'a',role:'assistant',text:'方案已准备。'}],tools:[],approvals:[],error:''}]));
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('heading',{name:'舒服地，开始工作'}).waitFor();
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/settings-general.png'});
 await page.getByRole('button',{name:'会话',exact:true}).click();await page.screenshot({path:'test-results/settings-archives.png'});
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();await page.getByRole('button',{name:'添加服务'}).click();
 await page.getByLabel('服务名称',{exact:true}).fill('Design model service');await page.getByLabel('Base URL',{exact:true}).fill('https://design.example/v1');await page.getByLabel('模型 ID',{exact:true}).fill('design-a');await page.getByLabel('可选模型',{exact:true}).fill('design-a\ndesign-b');await page.getByLabel('API Key',{exact:true}).fill('isolated-settings-fixture-key');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.locator('.provider-card').filter({hasText:'Design model service'}).waitFor();
 assert.equal((await page.evaluate(()=>window.desktop.listProviders())).providers.length,2);
 assert.equal((await readFile(path.join(directory,'provider.json'),'utf8')).includes('isolated-settings-fixture-key'),false);
 await page.getByRole('button',{name:'设为默认'}).click();await page.screenshot({path:'test-results/settings-providers.png'});
 const legacy=page.locator('.provider-card').filter({hasText:'legacy.example'});await legacy.getByRole('button',{name:'删除服务',exact:true}).click();await legacy.getByRole('button',{name:'确认删除服务'}).click();await page.getByRole('alert').filter({hasText:'仍被会话引用'}).waitFor();
 await page.getByRole('button',{name:'通用',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('heading',{name:'Make yourself at home'}).waitFor();await page.screenshot({path:'test-results/settings-general-dark-en.png'});
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/settings-compact.png'});
 await page.getByRole('button',{name:'Back to app'}).click();assert.ok((await page.locator('.model-pill').textContent()).includes('design-a'));
 await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Make yourself at home'}).waitFor();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal((await page.evaluate(()=>window.desktop.listProviders())).providers.length,2);
 console.log('PASS Electron settings: legacy migration, multiple endpoints, encrypted key, deletion guard, default propagation, language/theme persistence and responsive layout.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
