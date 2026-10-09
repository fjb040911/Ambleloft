import {test,expect} from '@playwright/test';

test('unconfigured tasks explicitly save drafts and reopen directly for editing',async({page})=>{
 await page.goto('/');const input=page.getByRole('textbox',{name:'任务内容',exact:true});
 await expect(page.getByRole('button',{name:'保存任务草稿',exact:true})).toHaveText('保存草稿');
 await expect(page.locator('.composer-hint')).toContainText('Enter 保存草稿');
 await input.fill('需要恢复编辑的草稿');await page.getByRole('button',{name:'保存任务草稿',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(input).toHaveValue('需要恢复编辑的草稿');
 await page.getByRole('button',{name:'新建任务',exact:true}).click();await expect(input).toHaveValue('');
 await page.locator('.tree-task [data-slot=sidebar-menu-button]').click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(input).toHaveValue('需要恢复编辑的草稿');await expect(input).toBeFocused();
 await input.fill('更新后的草稿');await input.press('Enter');await expect(page.locator('.tree-task')).toHaveCount(1);await expect(page.locator('.tree-task')).toContainText('更新后的草稿');
 await page.getByRole('button',{name:'配置模型服务',exact:true}).click();await expect(page.locator('.settings-content h1')).toHaveText('模型提供商');
});

test('project disclosure and navigation are independent and draft keyboard navigation works',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',language:'zh-CN',projects:[{id:'p',name:'Demo',path:'/tmp',createdAt:new Date().toISOString()}],tasks:[{id:'d',title:'项目草稿',prompt:'保留项目上下文',modelId:'',projectId:'p',status:'draft',createdAt:new Date().toISOString()}]})));
 await page.goto('/');const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('未发送内容');
 await page.getByRole('button',{name:'折叠项目：Demo',exact:true}).click();await expect(input).toHaveValue('未发送内容');
 await page.locator('.project-tree-name').click();await expect(page.locator('.content-page h1')).toHaveText('Demo');await expect(page.getByRole('button',{name:'展开项目：Demo',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'展开项目：Demo',exact:true}).click();await expect(page.locator('.content-page h1')).toHaveText('Demo');
 const draft=page.locator('.workspace-navigation .tree-task [data-slot=sidebar-menu-button]');await draft.focus();await page.keyboard.press('Enter');await expect(input).toHaveValue('保留项目上下文');await expect(input).toBeFocused();
 await expect(page.getByRole('combobox',{name:'当前项目'})).toContainText('Demo');
});

test('home draft action and quiet examples reflow in English dark mode at large text size',async({page})=>{
 await page.setViewportSize({width:640,height:800});
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'dark',language:'en',fontScale:130,layoutMode:'activity',projects:[],tasks:[]})));
 await page.goto('/');await expect(page.locator('.home-page h1')).toHaveText('What would you like to work on today?');
 const action=page.getByRole('button',{name:'Save task draft',exact:true});await expect(action).toHaveText('Save draft');
 await expect(page.locator('.composer-hint')).toContainText('Enter to save draft');await expect(page.locator('.starter-suggestions button')).toHaveCount(3);
 expect(await page.locator('.home-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 expect(await page.locator('.composer').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.getByRole('textbox',{name:'Task prompt',exact:true}).fill('A draft to keep');await action.click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:'test-results/home-focus-english-dark.png',animations:'disabled'});
});
