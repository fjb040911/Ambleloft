import {test,expect} from '@playwright/test';
test('layout preference persists and group switching preserves draft and navigation state',async({page})=>{
 await page.goto('/');
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('布局切换保留输入');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'活动栏 按项目、任务、扩展分别浏览。',exact:true}).click();
 await page.getByRole('button',{name:'返回应用',exact:true}).click();
 await expect(page.locator('.activity-rail')).toBeVisible();await expect(input).toHaveValue('布局切换保留输入');
 await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();
 await expect(input).toHaveValue('布局切换保留输入');await expect(page.getByRole('region',{name:'我的项目',exact:true})).toBeHidden();
 await page.locator('.activity-rail').getByRole('button',{name:'任务',exact:true}).click();await expect(page.getByText('还没有独立任务')).toBeVisible();
 await page.getByRole('button',{name:'隐藏侧栏',exact:true}).click();await expect(page.locator('.activity-rail')).toBeVisible();await expect(page.getByRole('button',{name:'搜索工作台',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('.activity-rail')).toBeVisible();
 await page.locator('.activity-rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'分组侧栏 所有分组一起展示，快速浏览。',exact:true}).click();await page.getByRole('button',{name:'返回应用',exact:true}).click();await expect(page.locator('.activity-rail')).toHaveCount(0);
 await page.reload();await expect(page.locator('.activity-rail')).toHaveCount(0);
});

test('activity navigation exposes contextual actions, tooltips and date sections',async({page})=>{
 await page.addInitScript(()=>{const today=new Date();const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',layoutMode:'activity',projects:[],tasks:[{id:'today',title:'今天的草稿',prompt:'',modelId:'',createdAt:today.toISOString(),status:'draft',projectId:null},{id:'yesterday',title:'昨天的草稿',prompt:'',modelId:'',createdAt:yesterday.toISOString(),status:'draft',projectId:null}]}));});
 await page.goto('/');await expect(page.getByRole('button',{name:'新建项目',exact:true})).toBeVisible();await expect(page.getByText('还没有项目',{exact:true})).toBeVisible();
 const rail=page.locator('.activity-rail');await rail.getByRole('button',{name:'任务',exact:true}).hover();await expect(page.locator('[data-slot=tooltip-content]')).toContainText('任务');await rail.getByRole('button',{name:'任务',exact:true}).click();
 await expect(page.locator('.nav-date-heading')).toHaveText(['今天','昨天']);await expect(page.locator('.workspace-navigation .nav-caption:visible')).toHaveCount(0);
 await rail.getByRole('button',{name:'扩展',exact:true}).click();await expect(page.getByRole('button',{name:'管理扩展',exact:true})).toBeVisible();await expect(page.getByText('暂无可用扩展',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'管理扩展',exact:true}).click();await expect(page.getByRole('complementary').filter({has:page.getByRole('button',{name:'返回应用'})})).toBeVisible();
});

test('mobile Sidebar sheet dismisses with Escape and preserves the composer',async({page})=>{
 await page.setViewportSize({width:650,height:850});
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',layoutMode:'activity',projects:[],tasks:[]})));
 await page.goto('/');const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('窄窗口保留输入');
 const projects=page.locator('.activity-rail').getByRole('button',{name:'项目',exact:true});await projects.click();
 await expect(page.getByRole('dialog',{name:'主导航'})).toBeVisible();await expect(page.getByRole('button',{name:'新建项目',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'主导航'})).toBeHidden();await expect(input).toHaveValue('窄窗口保留输入');
 await page.getByRole('button',{name:'显示侧栏',exact:true}).click();await expect(page.getByRole('dialog',{name:'主导航'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'显示侧栏',exact:true})).toBeFocused();
});

test('activity rail remains visible and stationary throughout sidebar animation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',layoutMode:'activity',projects:[],tasks:[]})));
 await page.goto('/');await expect(page.locator('.activity-rail')).toBeVisible();
 for(const label of ['隐藏侧栏','显示侧栏','隐藏侧栏','显示侧栏']){
  await page.getByRole('button',{name:label,exact:true}).click();
  const frames=await page.evaluate(async()=>{const samples=[];for(let i=0;i<18;i++){await new Promise(requestAnimationFrame);const rail=document.querySelector('.activity-rail')!;const box=rail.getBoundingClientRect();const button=rail.querySelector('.activity-group')!.getBoundingClientRect();samples.push({x:box.x,width:box.width,visible:!!document.elementFromPoint(button.x+button.width/2,button.y+button.height/2)?.closest('.activity-rail')});}return samples;});
  expect(frames.every(frame=>frame.x===0&&frame.width===60&&frame.visible)).toBe(true);
 }
});

test('activity task date groups and navigation labels follow interface language',async({page})=>{
 await page.addInitScript(()=>{
  const now=new Date();now.setHours(12,0,0,0);
  const tasks=[10,3,1,0].map(days=>{const date=new Date(now);date.setDate(date.getDate()-days);return {id:`day-${days}`,title:`Task ${days}`,prompt:'',modelId:'',createdAt:date.toISOString(),status:'draft',projectId:null};});
  localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',language:'en',layoutMode:'activity',projects:[],tasks}));
 });
 await page.goto('/');const rail=page.locator('.activity-rail');
 await expect(page.getByRole('button',{name:'New project',exact:true})).toBeVisible();
 await expect(page.locator('.composer-status')).toHaveText('Connect a model service to run tasks. You can save a draft for now.');
 await rail.getByRole('button',{name:'Tasks',exact:true}).click();
 await expect(page.locator('.nav-date-heading')).toHaveText(['Today','Yesterday','Previous 7 days','Earlier']);
 await expect(page.locator('.tree-task .task-status-label')).toHaveText(['Draft','Draft','Draft','Draft']);
 expect(await page.locator('.tree-task [data-slot="sidebar-menu-button"]').evaluateAll(elements=>elements.map(el=>el.getAttribute('title')))).toEqual(['Task 0','Task 1','Task 3','Task 10']);
 await expect(page.getByRole('button',{name:'Manage task: Task 0',exact:true})).toHaveCount(1);
 await rail.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Interface language').selectOption('zh-CN');await page.getByRole('button',{name:'返回应用',exact:true}).click();
 await expect(page.locator('.nav-date-heading')).toHaveText(['今天','昨天','近 7 天','更早']);
 await rail.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByLabel('界面语言').selectOption('en');await page.getByRole('button',{name:'Back to app',exact:true}).click();
 await expect(page.locator('.nav-date-heading')).toHaveText(['Today','Yesterday','Previous 7 days','Earlier']);
});
