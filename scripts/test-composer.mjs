import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-composer-'));let app;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await mkdir('test-results',{recursive:true});
 await page.evaluate(async()=>{await window.desktop.saveProvider({create:true,name:'设计工作室',baseUrl:'http://127.0.0.1:8080/v1',model:'DeepSeek-v4-flash',models:['DeepSeek-v4-flash','Model B'],executable:''});});await page.reload();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('dialog',{name:'模型列表'}).waitFor();await page.screenshot({path:'test-results/composer-desktop-models.png'});
 const box=await page.getByRole('dialog',{name:'模型列表'}).boundingBox();assert.ok(box.y>=0);assert.ok(box.x>=0);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'技能',exact:true}).click();await page.screenshot({path:'test-results/composer-desktop-skills.png'});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'默认权限',exact:true}).click();await page.screenshot({path:'test-results/composer-desktop-permission.png'});
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/composer-desktop-compact.png'});
 console.log('PASS desktop composer: model groups, skills, permission popover and compact layout');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
