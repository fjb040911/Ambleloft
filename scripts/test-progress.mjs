import {spawnSync} from 'node:child_process';
import {_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const directory=await mkdtemp(path.join(tmpdir(),'atelier-progress-'));let app;
try{
 const cwd=path.join(directory,'scratch');await mkdir(cwd);const file=path.join(cwd,'report.md');await writeFile(file,'# 知识库选型\n\n已完成方案对比。');
 const run={id:'progress',title:'知识库选型调研',cwd,model:'示例模型',baseUrl:'http://localhost/v1',status:'completed',createdAt:new Date().toISOString(),error:'',approvals:[],messages:[{id:'u',role:'user',text:'调研企业 Agent 场景中的知识库选型，生成一份文档。',timing:{startedAt:new Date().toISOString(),durationMs:174000,outcome:'completed'}},{id:'p',turnKey:'u',role:'assistant',phase:'commentary',text:'已收集候选方案，正在对比共享方式和权限控制。',order:1},{id:'a',turnKey:'u',role:'assistant',phase:'final_answer',text:'已完成选型对比，文档包含部署方式、共享策略和权限设计。'}],tools:[{id:'w',turnKey:'u',order:2,type:'webSearch',label:'搜索资料',detail:'企业 Agent 知识库共享方案',status:'completed'}],plans:[{turnKey:'u',explanation:'对比已完成，文档已检查。',steps:[{step:'调研候选方案',status:'completed'},{step:'比较共享与权限能力',status:'completed'},{step:'生成并检查文档',status:'completed'}]}],artifacts:[{id:'f',turnKey:'u',name:'report.md',path:file,size:Buffer.byteLength('# 知识库选型\n\n已完成方案对比。'),modifiedAt:new Date().toISOString()}]};
 await writeFile(path.join(directory,'conversations.json'),JSON.stringify([run]));
 app=await electron.launch({args:['.',`--user-data-dir=${directory}`],env:{...process.env,ATELIER_DEV:'0'}});const page=await app.firstWindow();await page.locator('.tree-task > button:first-child').filter({hasText:run.title}).click();
 assert.equal(await page.locator('.process-panel').count(),0);await page.screenshot({path:'test-results/progress-desktop-completed.png'});
 await page.locator('.turn-progress-toggle').click();await page.getByLabel('任务清单').waitFor();await page.screenshot({path:'test-results/progress-desktop-expanded.png'});
 await page.getByRole('button',{name:'预览 report.md',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:'知识库选型'}).waitFor();await page.screenshot({path:'test-results/progress-desktop-preview.png'});await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.setViewportSize({width:800,height:600});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'test-results/progress-desktop-compact.png'});
 const mcp=spawnSync(app.process().spawnfile,[path.resolve('electron/plan-server.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n',encoding:'utf8'});assert.equal(mcp.status,0,mcp.stderr);assert.ok(JSON.parse(mcp.stdout).result.tools.some(t=>t.name==='update_plan'));
 await rm(file);await page.getByRole('button',{name:'预览 report.md',exact:true}).click();await page.getByRole('alert').waitFor();
 console.log('PASS Electron: completed/reopened process, native file preview, missing-file handling, compact dark layout, bundled plan tool');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
