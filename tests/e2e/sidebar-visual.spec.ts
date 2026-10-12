import {test,expect} from '@playwright/test';
test('populated project sidebar retains clear selection and independent disclosure',async({page})=>{
 await page.addInitScript(()=>{const stamp=new Date().toISOString();const projects=['Agent','AI-Coding','课题项目','论文','testt','ai-rule','web'].map((name,index)=>({id:'p'+index,name,path:'/tmp/'+index,createdAt:stamp}));const tasks=projects.flatMap((project,index)=>Array.from({length:index<4?2:1},(_,i)=>({id:project.id+'-'+i,title:['阅读代码，理解这个项目的整体结构','我们一起讨论下一步的实现方案'][i],prompt:'保留原始任务内容',projectId:project.id,status:'draft',modelId:'',createdAt:stamp})));localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',language:'zh-CN',layoutMode:'activity',projects,tasks}));});
 await page.goto('/');const nav=page.locator('.workspace-navigation');
 await nav.locator('.tree-task [data-slot=sidebar-menu-button]').first().click();await expect(nav.locator('.tree-task.selected')).toHaveCount(1);
 await nav.evaluate(el=>el.scrollTop=0);await page.mouse.move(1000,100);await page.screenshot({path:'test-results/sidebar-projects-light.png',animations:'disabled'});
 await page.getByRole('button',{name:'折叠项目：AI-Coding',exact:true}).click();await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('保留原始任务内容');
 await page.getByRole('button',{name:'展开项目：AI-Coding',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'折叠项目：AI-Coding',exact:true})).toHaveAttribute('aria-expanded','true');
 await nav.locator('.tree-task').first().hover();await expect(page.getByRole('button',{name:'管理任务：阅读代码，理解这个项目的整体结构',exact:true}).first()).toBeVisible();
 expect(await nav.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.locator('.activity-rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('button',{name:'Back to app',exact:true}).click();await nav.evaluate(el=>el.scrollTop=0);await page.mouse.move(1000,100);await page.screenshot({path:'test-results/sidebar-projects-dark.png',animations:'disabled'});
});
