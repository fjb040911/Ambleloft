import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-catalog-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await mkdir('test-results',{recursive:true});
 await page.getByRole('button',{name:'能力与插件',exact:true}).click();await page.locator('.skill-card').first().waitFor();await page.screenshot({path:'test-results/catalog-main-skills.png'});
 const radius=await page.locator('.skill-card').first().evaluate(el=>getComputedStyle(el).borderRadius);assert.equal(radius,'16px');
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.locator('.settings-workspace');await settings.getByRole('navigation').getByRole('button',{name:'探索',exact:true}).click();assert.equal(await settings.locator('.model-card').count(),3);assert.equal(await settings.locator('.model-card').first().evaluate(el=>getComputedStyle(el).borderRadius),radius);await page.screenshot({path:'test-results/catalog-settings-models.png'});
 await settings.getByRole('navigation').getByRole('button',{name:'插件',exact:true}).click();await settings.getByRole('heading',{name:'插件目录正在准备中'}).waitFor();await page.screenshot({path:'test-results/catalog-settings-plugins.png'});
 await settings.getByRole('tab',{name:'技能',exact:true}).click();await settings.locator('.skill-card').first().click();await page.getByRole('dialog').waitFor();await page.screenshot({path:'test-results/catalog-settings-detail.png'});await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/catalog-compact.png'});
 console.log('PASS desktop catalog: shared pages, local default, skill/plugin tabs, settings details and unified card radius.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
