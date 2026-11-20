import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import {showTasks, taskButton, seedRuns} from './fixtures/desktop.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Database} from '../electron/database.cjs';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-sidebar-'));
const stamp=new Date().toISOString();
const project={id:'project',name:'品牌视觉设计',path:directory,description:'品牌方向、网页与包装的设计工作。',createdAt:stamp};
const run={id:'run',title:'品牌方向探索',projectId:'project',model:'fixture',baseUrl:'http://127.0.0.1/v1',cwd:directory,createdAt:stamp,status:'completed',error:'',approvals:[],tools:[],messages:[{id:'u',role:'user',text:'帮我探索品牌方向'},{id:'a',role:'assistant',text:'从自然、简洁、亲和三个方向开始。'}]};
const db=new Database(directory);
try {
 await db.call('patchWorkspace',{changes:[{kind:'project',action:'put',id:project.id,expectedRevision:null,value:project}]});
} finally {await db.close();}
await seedRuns(directory,run);
let app;
try {
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow();
 await page.getByRole('button',{name:project.name,exact:true}).focus();await page.getByRole('region',{name:'项目信息'}).waitFor();
 await page.screenshot({path:'test-results/sidebar-project-desktop.png'});
 await page.getByRole('button',{name:project.name,exact:true}).click();
 await page.getByRole('button',{name:'管理任务：品牌方向探索'}).click();
 await page.getByLabel('任务名称').fill('品牌视觉方向');await page.getByLabel('所属项目').selectOption('');await page.getByRole('button',{name:'保存修改'}).click();
 await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal((await page.evaluate(()=>window.desktop.getRunPage({id:'run'}))).projectId,null);
 await showTasks(page);
 await page.getByRole('button',{name:'管理任务：品牌视觉方向'}).click();await page.getByLabel('所属项目').selectOption('project');await page.getByRole('button',{name:'保存修改'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.locator('.activity-rail').getByRole('button',{name:'项目',exact:true}).click();
 await page.getByRole('button',{name:'管理项目：品牌视觉设计'}).click();await page.getByRole('button',{name:'删除项目',exact:true}).click();await page.getByRole('button',{name:'确认删除项目'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal((await page.evaluate(()=>window.desktop.readWorkspace())).projects.length,0);
 await page.reload();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'任务',exact:true}).click();
 const archived=page.locator('.archive-row').filter({hasText:'品牌视觉方向'});
 await expect(archived).toBeVisible();
 await archived.getByRole('button',{name:'还原',exact:true}).click();
 await expect(archived).toHaveCount(0);
 await page.getByRole('button',{name:'返回应用',exact:true}).click();
 await showTasks(page);await taskButton(page,/品牌视觉方向/).click();
 await expect(page.getByText('从自然、简洁、亲和三个方向开始。',{exact:true})).toBeVisible();
 console.log('PASS desktop sidebar: project preview, conversation rename/move, archive on project removal, restore and preserved history.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
