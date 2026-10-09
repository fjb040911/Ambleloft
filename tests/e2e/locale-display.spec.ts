import {test,expect} from '@playwright/test';
test.use({locale:'zh-CN'});
test('project copy and archived dates use application English despite Chinese system locale',async({page})=>{
 const stamp='2026-01-23T12:34:56Z';
 await page.addInitScript(stamp=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',language:'en',projects:[{id:'p',name:'Demo',path:'/tmp',createdAt:stamp}],tasks:[{id:'d',title:'Draft example',prompt:'Example',projectId:'p',status:'draft',modelId:'',createdAt:stamp},{id:'a',title:'Archived example',prompt:'Example',projectId:'p',status:'draft',modelId:'',createdAt:stamp,archivedAt:stamp}]})),stamp);
 await page.goto('/');await page.locator('.project-tree-name').click();
 await expect(page.locator('.page-description')).toHaveText('Add a description to share context across project tasks.');await expect(page.locator('.project-task-list small')).toHaveText('Draft');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Tasks',exact:true}).click();
 const english=await page.evaluate(stamp=>new Date(stamp).toLocaleString('en'),stamp);
 await expect(page.locator('.archive-task-info small')).toContainText(english);
 await page.getByRole('button',{name:'General',exact:true}).click();await page.getByLabel('Interface language').selectOption('zh-CN');await page.getByRole('button',{name:'任务',exact:true}).click();
 const chinese=await page.evaluate(stamp=>new Date(stamp).toLocaleString('zh-CN'),stamp);await expect(page.locator('.archive-task-info small')).toContainText(chinese);
});
