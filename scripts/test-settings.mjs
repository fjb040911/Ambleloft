import {seedRuns} from './fixtures/desktop.mjs';
import {_electron as electron} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {Database} from '../electron/database.cjs';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-settings-'));let app;
const stamp=new Date().toISOString();
const db=new Database(directory);
try {
  await db.call('patchWorkspace',{changes:[{kind:'settings',action:'patch',expectedRevision:0,value:{theme:'light',language:'zh-CN'}}]});
  await db.call('writeSetting',{key:'providers',value:{baseUrl:'https://legacy.example/v1',model:'legacy-model',executable:'',encryptedKey:''}});
} finally {await db.close();}
await seedRuns(directory,{id:'archive',title:'品牌视觉提案',projectId:null,providerId:'legacy',model:'legacy-model',baseUrl:'https://legacy.example/v1',cwd:directory,createdAt:stamp,archivedAt:stamp,status:'completed',messages:[{id:'u',role:'user',text:'整理品牌视觉方案'},{id:'a',role:'assistant',text:'方案已准备。'}],tools:[],approvals:[],error:''});
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('heading',{name:'舒服地，开始工作'}).waitFor();
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/settings-general.png'});
 await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'任务',exact:true}).click();await page.screenshot({path:'test-results/settings-archives.png'});
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();await page.getByRole('button',{name:'添加服务'}).click();
 await page.getByLabel('服务名称',{exact:true}).fill('Design model service');await page.getByLabel('Base URL',{exact:true}).fill('https://design.example/v1');await page.getByLabel('模型 ID',{exact:true}).fill('design-a');await page.getByRole('button',{name:'模型能力与协议',exact:true}).click();await page.getByLabel('可选模型',{exact:true}).fill('design-a\ndesign-b');await page.getByLabel('API Key',{exact:true}).fill('isolated-settings-fixture-key');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('heading',{name:'Design model service',exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.desktop.listProviders())).providers.length,2);
 const stored=await app.evaluate(({app,safeStorage})=>{
   const {DatabaseSync}=process.getBuiltinModule('node:sqlite');
   const path=process.getBuiltinModule('node:path');
   const db=new DatabaseSync(path.join(app.getPath('userData'),'atelier.sqlite'),{readOnly:true});
   try {
    const raw=db.prepare('SELECT data FROM settings WHERE key=?').get('providers').data;
    const provider=JSON.parse(raw).providers.find(item=>item.name==='Design model service');
    return {exposed:raw.includes('isolated-settings-fixture-key'),encrypted:safeStorage.decryptString(Buffer.from(provider.encryptedKey,'base64'))==='isolated-settings-fixture-key'};
   } finally {db.close();}
 });
 assert.deepEqual(stored,{exposed:false,encrypted:true});
 await page.getByRole('button',{name:'设为默认'}).click();await page.screenshot({path:'test-results/settings-providers.png'});
 const legacy=page.locator('[data-slot=card]').filter({hasText:'legacy.example'});await legacy.getByRole('button',{name:'删除服务',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'确认删除服务',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:/仍被.*引用/}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'通用',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('heading',{name:'Make yourself at home'}).waitFor();await page.screenshot({path:'test-results/settings-general-dark-en.png'});
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/settings-compact.png'});
 await page.getByRole('button',{name:'Back to app'}).click();assert.equal((await page.evaluate(()=>window.desktop.getProvider())).model,'design-a');
 await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Make yourself at home'}).waitFor();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal((await page.evaluate(()=>window.desktop.listProviders())).providers.length,2);
 console.log('PASS Electron settings: legacy migration, multiple endpoints, encrypted key, deletion guard, default propagation, language/theme persistence and responsive layout.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
