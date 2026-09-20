import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-sidebar-'));
const stamp=new Date().toISOString();
const project={id:'project',name:'品牌视觉设计',path:directory,description:'品牌方向、网页与包装的设计工作。',createdAt:stamp};
const run={id:'run',title:'品牌方向探索',projectId:'project',model:'fixture',baseUrl:'http://127.0.0.1/v1',cwd:directory,createdAt:stamp,status:'completed',error:'',approvals:[],tools:[],messages:[{id:'u',role:'user',text:'帮我探索品牌方向'},{id:'a',role:'assistant',text:'从自然、简洁、亲和三个方向开始。'}]};
await writeFile(path.join(directory,'workspace.json'),JSON.stringify({projects:[project],tasks:[],theme:'light'}));
await writeFile(path.join(directory,'conversations.json'),JSON.stringify([run]));
let app;
try {
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow();
 await page.locator('.project-tree-name').hover();await page.getByRole('region',{name:'项目信息'}).waitFor();
 await page.screenshot({path:'test-results/sidebar-project-desktop.png'});
 await page.getByRole('button',{name:'管理任务：品牌方向探索'}).click();
 await page.getByLabel('任务名称').fill('品牌视觉方向');await page.getByLabel('所属项目').selectOption('');await page.getByRole('button',{name:'保存修改'}).click();
 await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(JSON.parse(await readFile(path.join(directory,'conversations.json')))[0].projectId,null);
 await page.getByRole('button',{name:'管理任务：品牌视觉方向'}).click();await page.getByLabel('所属项目').selectOption('project');await page.getByRole('button',{name:'保存修改'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:'管理项目：品牌视觉设计'}).click();await page.getByRole('button',{name:'删除项目',exact:true}).click();await page.getByRole('button',{name:'确认删除项目'}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(JSON.parse(await readFile(path.join(directory,'conversations.json')))[0].projectId,null);
 assert.equal(JSON.parse(await readFile(path.join(directory,'workspace.json'))).projects.length,0);
 await page.reload();await page.locator('.tree-task > button:first-child').filter({hasText:'品牌视觉方向'}).click();
 assert.equal(await page.locator('.message.assistant').textContent().then(s=>s.includes('Codex')),false);
 console.log('PASS desktop sidebar: project preview, real conversation rename/move, project removal retains history across reload.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
