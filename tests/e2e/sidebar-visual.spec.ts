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

test('empty expanded projects have the same spacing as collapsed projects',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',layoutMode:'activity',language:'zh-CN',projects:['First','Second','Third','Fourth'].map((name,i)=>({id:'p'+i,name,path:'/tmp/'+i,createdAt:new Date().toISOString()})),tasks:[{id:'t',projectId:'p3',title:'Draft',prompt:'Draft',status:'draft',modelId:'',createdAt:new Date().toISOString()}]})));
 await page.goto('/');
 await page.getByRole('button',{name:'折叠项目：First',exact:true}).click();
 await page.getByRole('button',{name:'折叠项目：Second',exact:true}).click();
 const rows=page.locator('.project-tree-row');
 await expect(rows).toHaveCount(4);
 await expect.poll(async()=>rows.evaluateAll(elements=>{const boxes=elements.map(el=>el.getBoundingClientRect());const gaps=boxes.slice(1).map((box,i)=>box.top-boxes[i].bottom);return Math.max(...gaps)-Math.min(...gaps);})).toBeLessThan(1);
});

for(const theme of ['light','dark'])test(`sidebar rows have one surface through hover press and selection (${theme})`,async({page})=>{
 await page.addInitScript(theme=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme,layoutMode:'activity',language:'zh-CN',projects:[{id:'p',name:'Project',path:'/tmp',createdAt:new Date().toISOString()}],tasks:[{id:'t',projectId:'p',title:'Task',prompt:'Draft',status:'draft',modelId:'',createdAt:new Date().toISOString()}]})),theme);
 await page.goto('/');
 const nav=page.locator('.workspace-navigation');
 for(const row of [nav.locator('.project-tree-row').first(),nav.locator('.tree-task').first()]){
  const title=row.locator(':scope > [data-slot=sidebar-menu-button]');
  await title.hover();await expect(title).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const hover=await row.evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.mouse.down();await expect(title).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const pressed=await row.evaluate(el=>getComputedStyle(el).backgroundColor);expect(pressed).not.toBe(hover);
  await page.screenshot({path:`test-results/sidebar-press-${theme}-${await row.getAttribute('class')}.png`});
  await page.mouse.up();await expect(row).toHaveClass(/selected/);await expect(title).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const selected=await row.evaluate(el=>getComputedStyle(el).backgroundColor);expect(selected).not.toBe(pressed);
  await page.mouse.move(1000,100);await expect(row).toHaveCSS('background-color',selected);
  await title.hover();await expect(row).toHaveCSS('background-color',selected);
 }
 const toggle=nav.locator('.tree-toggle').first();await toggle.hover();await expect(toggle).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await page.keyboard.press('Tab');await toggle.focus();await expect(toggle).toHaveCSS('outline-style','solid');
});
