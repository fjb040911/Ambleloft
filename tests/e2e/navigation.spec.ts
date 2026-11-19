import { test, expect } from '@playwright/test';

test('native titlebar colors follow the latest theme after deferred layout reads',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.__nativeColors=[];w.desktop={platform:'win32',getDevice:async()=>({platform:'win32',mode:'desktop'}),getProvider:async()=>({configured:false}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},setWindowChrome:async(value:any)=>{w.__nativeColors.push(value);}};});
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>(window as any).__nativeColors.length)).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as any).__nativeColors=[];for(const theme of ['dark','light','dark'])document.documentElement.dataset.theme=theme;});
 await expect.poll(()=>page.evaluate(()=>(window as any).__nativeColors.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__nativeColors[0])).toEqual(await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return{color:style.getPropertyValue('--activity-rail').trim(),symbolColor:style.getPropertyValue('--text').trim()};}));
});

for(const platform of ['win32','darwin'])for(const failure of [false,true])test(`initial native chrome survives ${platform} device ${failure?'failure':'delay'} without moving the draft`,async({page})=>{
 await page.addInitScript(({platform})=>{
  const w=window as any;w.__chromeStates=[];let previous:boolean|undefined;
  new MutationObserver(()=>{const el=document.querySelector('.app-shell');if(!el)return;const current=el.classList.contains('windows-desktop');if(current!==previous){w.__chromeStates.push(current);previous=current;}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  w.desktop={platform,getProvider:async()=>({configured:false}),getDevice:()=>new Promise((resolve,reject)=>{w.__finishDevice=()=>resolve({platform,mode:'desktop'});w.__failDevice=()=>reject(Error('Synthetic device lookup failure'));}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light',layoutMode:'activity'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{}};
 },{platform});
 await page.goto('/');const input=page.locator('.chat-composer-input').first();await input.fill('Keep this unsent draft');
 await expect(page.locator('.windows-chrome')).toHaveCount(platform==='win32'?1:0);
 const before=await input.boundingBox();await page.evaluate(failure=>(window as any)[failure?'__failDevice':'__finishDevice'](),failure);
 if(failure)await expect(page.getByText('无法读取设备信息，请重新打开设备页面或重启应用。',{exact:true})).toBeVisible();
 await expect(input).toHaveValue('Keep this unsent draft');await expect(input).toBeFocused();
 expect(await page.evaluate(()=>(window as any).__chromeStates)).toEqual([platform==='win32']);
 // A device response must not add/remove the 38px Windows titlebar.
 if(!failure)expect(Math.abs((await input.boundingBox())!.y-before!.y)).toBeLessThan(2);
});
// Seed the current category layout on the test's actual origin; preserve it on reload.
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  if(!localStorage.getItem('atelier.workspace.v1'))localStorage.setItem('atelier.workspace.v1',JSON.stringify({tasks:[],projects:[],theme:'light',layoutMode:'activity'}));
  if(!sessionStorage.getItem('atelier.active-view.v1'))sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'projects'}));
 });
});
const category=(page:import('@playwright/test').Page,name:string)=>page.getByRole('navigation',{name:'分组导航'}).getByRole('button',{name,exact:true});

test('unvisited categories stay unmounted while visited project state survives switching',async({page})=>{
 await page.addInitScript(()=>{
  const createdAt='2026-11-19T00:00:00Z';
  const workspace={theme:'light',layoutMode:'activity',projects:[{id:'p',name:'保留导航状态',path:'/fixture',createdAt}],tasks:Array.from({length:12},(_,i)=>({id:'t'+i,title:'草稿 '+i,prompt:'正文 '+i,projectId:'p',createdAt}))};
  (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>workspace,listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{}};
 });
 await page.goto('/');
 await expect(page.locator('.workspace-navigation > [data-slot="sidebar-group"]')).toHaveCount(1);
 await page.getByRole('button',{name:'展开显示：保留导航状态'}).click();
 await expect(page.locator('.project-children .tree-task')).toHaveCount(10);
 await page.getByRole('button',{name:'折叠项目：保留导航状态'}).click();
 await category(page,'任务').click();
 await expect(page.locator('#nav-projects')).toBeHidden();
 await expect(page.locator('#nav-workforce')).toHaveCount(0);
 await expect(page.locator('#nav-extensions')).toHaveCount(0);
 await category(page,'项目').click();
 await expect(page.getByRole('button',{name:'展开项目：保留导航状态'})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'展开项目：保留导航状态'}).click();
 await expect(page.locator('.project-children .tree-task')).toHaveCount(10);
 await expect(page.locator('.project-children .tree-task').first()).toBeVisible();
});

test('projects organize drafts, preview details, edit and detach safely',async({page})=>{
 await page.goto('/');
 await expect(page.getByText('最近的任务',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('品牌设计');
 await page.locator('.project-description summary').click();
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
 await category(page,'项目').click();
 await expect(category(page,'项目')).toHaveAttribute('aria-expanded','false');
 await category(page,'项目').click();
 await expect(category(page,'项目')).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('button',{name:'新建项目',exact:true})).toBeVisible();
 await expect(page.locator('.project-tree')).toBeVisible();

 await category(page,'任务').click();
 await page.getByRole('complementary',{name:'主导航'}).getByRole('button',{name:/^新建任务/}).click();
 await expect(page.getByRole('combobox',{name:'当前项目'})).toHaveText('不关联项目');
 await category(page,'项目').click();
 await page.getByRole('button',{name:'管理任务：设计包装'}).click();
 await page.getByRole('textbox',{name:'任务名称'}).fill('包装方案');
 await page.getByLabel('所属项目').selectOption('');
 await page.getByRole('button',{name:'保存修改'}).click();
 await expect(page.getByRole('region',{name:'我的项目'})).not.toContainText('包装方案');
 await category(page,'任务').click();
 await expect(page.getByRole('region',{name:'任务',exact:true})).toContainText('包装方案');
 await category(page,'任务').click();
 await expect(category(page,'任务')).toHaveAttribute('aria-expanded','false');
 await category(page,'任务').click();
 await expect(category(page,'任务')).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#nav-chats')).toBeVisible();

 await page.getByRole('button',{name:'管理任务：包装方案'}).click();
 await page.getByLabel('所属项目').selectOption({label:'品牌设计'});
 await page.getByRole('button',{name:'保存修改'}).click();
 await expect(page.getByRole('region',{name:'任务',exact:true})).not.toContainText('包装方案');
 await category(page,'项目').click();
 await expect(page.getByRole('region',{name:'我的项目'})).toContainText('包装方案');
 await page.getByRole('button',{name:'管理项目：品牌设计'}).click();
 await page.getByRole('button',{name:'删除项目',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('项目文件不会被删除');
 await page.getByRole('button',{name:'确认删除项目',exact:true}).click();
 await expect(page.locator('.project-tree')).toHaveCount(0);
 await category(page,'任务').click();
 await expect(page.getByRole('region',{name:'任务',exact:true})).not.toContainText('包装方案');
 await page.reload();await expect(page.getByRole('region',{name:'任务',exact:true})).not.toContainText('包装方案');
 await page.screenshot({path:'test-results/sidebar-new.png'});
});

test('sidebar component preserves project and task pagination and keyboard access',async({page})=>{
 await page.addInitScript(()=>{
 const projects=Array.from({length:32},(_,i)=>({id:'p'+i,name:'项目 '+i,path:'/tmp/project'+i,createdAt:'2026-09-30'}));
 const runs=Array.from({length:35},(_,i)=>({id:'r'+i,title:'任务 '+i,projectId:null,status:'completed',createdAt:new Date(Date.UTC(2026,8,i+1)).toISOString(),messages:[],tools:[],approvals:[]}));
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({layoutMode:'activity',projects,tasks:[],theme:'light'}),listRuns:async()=>runs,onRun:()=>()=>{},onCommand:()=>()=>{}};
 });
 await page.goto('/');
 const projects=page.getByRole('region',{name:'我的项目'});const tasks=page.getByRole('region',{name:'任务',exact:true});
 // Offscreen project rows are virtualized; verify pagination through its user-facing control.
 await expect(projects.getByRole('button',{name:'加载更多项目'})).toBeAttached();
 await projects.getByRole('button',{name:'加载更多项目'}).click();await expect(projects.getByRole('button',{name:'加载更多项目'})).toHaveCount(0);await projects.locator('#nav-projects [data-slot=sidebar-group-content] > div').nth(31).scrollIntoViewIfNeeded();await expect(projects.getByRole('button',{name:'管理项目：项目 31',exact:true})).toBeAttached();
 const projectScroll=await page.locator('.workspace-navigation').evaluate(e=>e.scrollTop);
 await category(page,'任务').click();
 await expect(tasks.locator('.tree-task')).toHaveCount(30);
 await tasks.getByRole('button',{name:/加载更多/}).click();await expect(tasks.locator('#nav-task-list-chats > [data-slot=sidebar-menu-item]')).toHaveCount(35);await expect(tasks.getByRole('button',{name:/加载更多/})).toHaveCount(0);
 const toggle=category(page,'任务');await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','true');
 await category(page,'项目').click();
 await expect.poll(()=>page.locator('.workspace-navigation').evaluate((e,target)=>Math.abs(e.scrollTop-target),projectScroll)).toBeLessThan(2);
});

test('project task and extension selection is mutually exclusive',async({page})=>{
 await page.addInitScript(()=>{
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({layoutMode:'activity',projects:[{id:'p',name:'测试项目',path:'/tmp',createdAt:'2026-09-30'}],tasks:[],theme:'light'}),listRuns:async()=>[{id:'r',title:'测试任务',projectId:'p',status:'completed',createdAt:'2026-09-30',messages:[],tools:[],approvals:[]}],onRun:()=>()=>{},onCommand:()=>()=>{},extensions:{list:async()=>({installed:[{manifest:{id:'ext',name:'测试扩展',description:'',contributes:{}},home:{title:'测试扩展',available:true},trusted:true,enabled:true}],capabilities:{}})}};
 });
 await page.goto('/');
 const nav=page.locator('.workspace-navigation');
 await nav.locator('.tree-task > button:first-child').click();
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await expect(nav.locator('.tree-task.selected')).toHaveCount(1);
 await category(page,'扩展').click();
 await nav.getByRole('button',{name:'测试扩展',exact:true}).click();
 await expect(nav.locator('.tree-task.selected')).toHaveCount(0);
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await expect(nav.locator('.extension-nav-row[aria-current=page]')).toHaveCount(1);
 await category(page,'项目').click();
 await nav.locator('.project-tree-name').click();
 await expect(nav.locator('.extension-nav-row[aria-current=page]')).toHaveCount(0);
 await expect(nav.locator('[aria-current=page]')).toHaveCount(1);
 await category(page,'扩展').click();
 await nav.getByRole('button',{name:'测试扩展',exact:true}).click();
 await expect(nav.locator('.project-tree-row.selected')).toHaveCount(0);
 await category(page,'项目').click();
 await expect(nav.getByRole('button',{name:'折叠项目：测试项目'})).toHaveAttribute('aria-expanded','true');
 await nav.locator('.tree-task > button:first-child').click();
 await expect(nav.locator('.extension-nav-row[aria-current=page]')).toHaveCount(0);
 await expect(nav.locator('.tree-task.selected')).toHaveCount(1);
});
