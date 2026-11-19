import {openExtensionCenter} from './fixtures/desktop.mjs';
import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-catalog-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await mkdir('test-results',{recursive:true});
 await openExtensionCenter(page);
 await page.getByRole('button',{name:/系统内置/}).click();
 await page.getByRole('button',{name:'查看详情 技能大师',exact:true}).click();
 await page.getByRole('heading',{name:'技能大师',exact:true}).waitFor();
 await page.screenshot({path:'test-results/catalog-builtin-skill.png'});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const settings=page.getByRole('navigation',{name:'设置导航'});
 assert.equal(await settings.getByRole('button',{name:'本地模型',exact:true}).count(),0);
 await settings.getByRole('button',{name:'模型提供商',exact:true}).click();
 await page.getByRole('button',{name:'添加服务',exact:true}).waitFor();
 console.log('PASS desktop catalog: built-in skill detail and current model provider navigation.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
