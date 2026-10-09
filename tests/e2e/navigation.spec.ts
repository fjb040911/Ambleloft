import { test, expect } from '@playwright/test';
test('projects organize drafts, preview details, edit and detach safely',async({page})=>{
 await page.goto('/');
 await expect(page.getByText('最近的任务',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'添加项目',exact:true}).click();
 await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('品牌设计');
 await page.getByRole('textbox',{name:'项目说明',exact:true}).fill('品牌视觉与包装方案');
 await page.getByRole('textbox',{name:'工作目录',exact:true}).fill('/tmp/brand');
 await page.getByRole('button',{name:'保存项目',exact:true}).click();
 await expect(page.getByRole('heading',{name:'品牌设计',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'在项目中新建任务：品牌设计',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'当前项目'})).toHaveText('品牌设计');
 await page.getByRole('textbox',{name:'任务内容'}).fill('设计包装');
 await page.getByRole('button',{name:'保存任务草稿'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.project-children .tree-task')).toContainText('设计包装');
 await page.locator('.project-tree-name').hover();
 await expect(page.getByRole('region',{name:'项目信息'})).toContainText('品牌设计');
 await expect(page.getByRole('region',{name:'项目信息'})).toContainText('1 个任务');
 await page.getByRole('region',{name:'项目信息'}).getByRole('button',{name:'编辑项目'}).click();
 await expect(page.getByRole('textbox',{name:'项目名称'})).toHaveValue('品牌设计');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'项目',exact:true}).click();
 await expect(page.locator('#nav-projects')).toHaveAttribute('aria-hidden','true');
 await expect(page.getByRole('button',{name:'添加项目',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'项目',exact:true}).click();
 await expect(page.locator('.project-tree')).toBeVisible();

 await page.locator('.new-task').click();
 await expect(page.getByRole('combobox',{name:'当前项目'})).toHaveText('不关联项目');
 await page.getByRole('button',{name:'管理任务：设计包装'}).click();
 await page.getByRole('textbox',{name:'任务名称'}).fill('包装方案');
 await page.getByLabel('所属项目').selectOption('');
 await page.getByRole('button',{name:'保存修改'}).click();
 await expect(page.getByRole('region',{name:'任务',exact:true})).toContainText('包装方案');
 await page.getByRole('button',{name:'任务',exact:true}).click();
 await expect(page.locator('#nav-chats')).toHaveAttribute('aria-hidden','true');
 await page.getByRole('button',{name:'任务',exact:true}).click();
 await expect(page.locator('#nav-chats')).toBeVisible();

 await page.getByRole('button',{name:'管理任务：包装方案'}).click();
 await page.getByLabel('所属项目').selectOption({label:'品牌设计'});
 await page.getByRole('button',{name:'保存修改'}).click();
 await page.getByRole('button',{name:'管理项目：品牌设计'}).click();
 await page.getByRole('button',{name:'删除项目',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('不会删除本机文件');
 await page.getByRole('button',{name:'确认删除项目',exact:true}).click();
 await expect(page.locator('.project-tree')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'任务',exact:true})).not.toContainText('包装方案');
 await page.reload();await expect(page.getByRole('region',{name:'任务',exact:true})).not.toContainText('包装方案');
 await page.screenshot({path:'test-results/sidebar-new.png'});
});

test('sidebar component preserves project and task pagination and keyboard access',async({page})=>{
 await page.addInitScript(()=>{
 const projects=Array.from({length:32},(_,i)=>({id:'p'+i,name:'项目 '+i,path:'/tmp/project'+i,createdAt:'2026-09-30'}));
 const runs=Array.from({length:35},(_,i)=>({id:'r'+i,title:'任务 '+i,projectId:null,status:'completed',createdAt:new Date(Date.UTC(2026,8,i+1)).toISOString(),messages:[],tools:[],approvals:[]}));
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({projects,tasks:[],theme:'light'}),listRuns:async()=>runs,onRun:()=>()=>{},onCommand:()=>()=>{}};
 });
 await page.goto('/');
 const projects=page.getByRole('region',{name:'我的项目'});const tasks=page.getByRole('region',{name:'任务',exact:true});
 // Offscreen project rows are virtualized; verify pagination through its user-facing control.
 await expect(projects.getByRole('button',{name:'加载更多项目'})).toBeAttached();
 await projects.getByRole('button',{name:'加载更多项目'}).click();await expect(projects.getByRole('button',{name:'加载更多项目'})).toHaveCount(0);await expect(projects.getByRole('button',{name:'管理项目：项目 31',exact:true})).toBeAttached();
 await expect(tasks.locator('.tree-task')).toHaveCount(30);
 await tasks.getByRole('button',{name:/加载更多/}).click();await expect(tasks.locator('[data-slot=sidebar-menu-item]')).toHaveCount(35);await expect(tasks.getByRole('button',{name:/加载更多/})).toHaveCount(0);
 const toggle=page.getByRole('button',{name:'任务',exact:true});await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','true');
});

test('project task and extension selection is mutually exclusive',async({page})=>{
 await page.addInitScript(()=>{
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({projects:[{id:'p',name:'测试项目',path:'/tmp',createdAt:'2026-09-30'}],tasks:[],theme:'light'}),listRuns:async()=>[{id:'r',title:'测试任务',projectId:'p',status:'completed',createdAt:'2026-09-30',messages:[],tools:[],approvals:[]}],onRun:()=>()=>{},onCommand:()=>()=>{},extensions:{list:async()=>({installed:[{manifest:{id:'ext',name:'测试扩展',description:'',contributes:{}},enabled:true}],capabilities:{}})}};
 });
 await page.goto('/');
 const nav=page.locator('.workspace-navigation');
 await nav.locator('.tree-task > button:first-child').click();
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await expect(nav.locator('.tree-task.selected')).toHaveCount(1);
 await nav.getByRole('button',{name:'测试扩展',exact:true}).click();
 await expect(nav.locator('.tree-task.selected')).toHaveCount(0);
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await expect(nav.locator('.extension-nav-row.selected')).toHaveCount(1);
 await nav.locator('.project-tree-name').click();
 await expect(nav.locator('.extension-nav-row.selected')).toHaveCount(0);
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await nav.getByRole('button',{name:'测试扩展',exact:true}).click();
 await expect(nav.locator('.project-tree-row.selected')).toHaveCount(0);
 await nav.getByRole('button',{name:'折叠项目：测试项目'}).count().then(async n=>{if(!n)await nav.getByRole('button',{name:'展开项目：测试项目'}).click();});
 await nav.locator('.tree-task > button:first-child').click();
 await expect(nav.locator('.extension-nav-row.selected')).toHaveCount(0);
 await expect(nav.locator('.tree-task.selected')).toHaveCount(1);
});
