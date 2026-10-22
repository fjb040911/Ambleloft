import {test,expect,type Page} from '@playwright/test';
const remoteName='用于跨平台远程开发与部署验证的超长项目名称-abcdefghijklmnopqrstuvwxyz';
async function setup(page:Page,layoutMode='activity',width=256,language='zh-CN'){
 await page.addInitScript(({layoutMode,width,remoteName,language})=>{
  localStorage.setItem('atelier.sidebar-width.home',String(width));
  const w=window as any;const createdAt='2026-01-01T00:00:00.000Z';
  const projects=[{id:'remote',type:'ssh',connectionId:'server',name:remoteName,path:'/srv/workspaces/remote-project/source',description:'远端研发项目，用于验证连接信息与容器环境。',createdAt,environment:{kind:'docker',endpoint:'unix:///var/run/docker.sock',daemonId:'daemon',containerId:'a'.repeat(64),containerName:'firmware-development',imageId:'image',user:'developer',shell:'bash'}},{id:'local',name:'本地资料',path:'/Users/example/Documents/research',description:'整理产品资料和研究记录。',createdAt},{id:'missing',type:'ssh',connectionId:'gone',name:'缺失连接的项目',path:'/workspace',createdAt}];
  const workspace={projects,tasks:[{id:'task',title:'项目任务',prompt:'hello',projectId:'remote',status:'draft',modelId:'',createdAt}],theme:'light',language,layoutMode};
  const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1'};
  w.__connections=[{id:'server',name:'Build server',host:'build.internal.example.test',port:2222,username:'alice',authType:'key',state:'connected',privateKeyPath:'/sensitive/private-key',password:'do-not-display'}];
  const listeners=new Set<()=>void>();w.__publish=()=>listeners.forEach(fn=>fn());
  w.desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Test',memoryGB:32}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},readWorkspace:async()=>workspace,saveWorkspace:async()=>{},
   ssh:{list:async()=>{if(w.__fail)throw Error('status service unavailable');return w.__connections;},onChanged:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);}},
   skills:{list:async()=>[]},extensions:{list:async()=>({capabilities:{},installed:[]})}};
 },{layoutMode,width,remoteName,language});await page.goto('/');
}
function remoteRow(page:Page){return page.locator('.project-tree-row').filter({has:page.locator('.project-tree-title',{hasText:remoteName})});}
for(const mode of ['activity','classic'])test(`${mode}: long names leave space for status and rich SSH metadata`,async({page})=>{
 await setup(page,mode);const row=remoteRow(page);const state=row.locator('.ssh-nav-state'),title=row.locator('.project-tree-title');await expect(state).toHaveAttribute('data-state','connected');
 const boxes=await Promise.all([title.boundingBox(),state.boundingBox(),row.boundingBox()]);expect(boxes[0]!.x+boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x);expect(boxes[1]!.x+boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x+boxes[2]!.width);
 await row.hover();const card=page.getByRole('region',{name:'项目信息',exact:true});await expect(card).toBeVisible();await expect(card).toContainText(remoteName);for(const value of ['alice','2222','build.internal.example.test','私钥','firmware-development','developer','1 个任务'])await expect(card).toContainText(value);
 await expect(card).not.toContainText('/sensitive/private-key');await expect(card).not.toContainText('do-not-display');await expect(card).toBeVisible();expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const stateBox=await state.boundingBox(),actions=await row.locator('.tree-row-actions').boundingBox();expect(stateBox!.x+stateBox!.width).toBeLessThanOrEqual(actions!.x+1);
 await card.hover();await expect(card).toBeVisible();await page.screenshot({path:`test-results/project-info-${mode}.png`});
});
test('minimum sidebar keeps status icon visible and card follows live connection failures',async({page})=>{
 await setup(page,'activity',200);const row=remoteRow(page);await expect(row.locator('.ssh-nav-state>span')).toBeHidden();await expect(row.locator('.ssh-nav-state>svg')).toBeVisible();await row.hover();const card=page.getByRole('region',{name:'项目信息',exact:true});await expect(card).toContainText('已连接');
 await page.evaluate(()=>{const w=window as any;w.__connections[0]={...w.__connections[0],state:'authentication',error:'Authentication failed'};w.__publish();});await expect(row.locator('.ssh-nav-state')).toHaveAttribute('data-state','authentication');await expect(card).toContainText('需要认证');await card.getByText('连接详情',{exact:true}).click();await expect(card).toContainText('Authentication failed');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await expect.poll(()=>card.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(36, 39, 46)');await expect.poll(()=>card.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(232, 234, 240)');await page.screenshot({path:'test-results/project-info-narrow-dark.png'});expect(await page.locator('.workspace-navigation').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
test('keyboard opens metadata, enters its action, and escapes back to the project',async({page})=>{
 await setup(page);const button=remoteRow(page).locator('.project-tree-name');await button.focus();const card=page.getByRole('region',{name:'项目信息',exact:true});await expect(card).toBeVisible();await page.keyboard.press('ArrowRight');await expect(card.getByRole('button',{name:'编辑项目'})).toBeFocused();await page.keyboard.press('Escape');await expect(card).toHaveCount(0);await expect(button).toBeFocused();
});
test('local, missing and unavailable connections show truthful details without inventing a disconnected state',async({page})=>{
 await setup(page);await page.locator('.project-tree-row').filter({hasText:'本地资料'}).hover();const card=page.getByRole('region',{name:'项目信息',exact:true});await expect(card).toContainText('/Users/example/Documents/research');await expect(card).toContainText('整理产品资料');await expect(card).not.toContainText('SSH 用户名');
 await page.locator('.project-tree-row').filter({hasText:'缺失连接的项目'}).hover();await expect(card).toContainText('未配置');await expect(card).toContainText('重新选择');
 await remoteRow(page).hover();await page.evaluate(()=>{const w=window as any;w.__fail=true;w.__publish();});await expect(card).toContainText('状态不可用');await expect(remoteRow(page).locator('.ssh-nav-state')).toHaveAttribute('data-state','unavailable');
});
test('English metadata and long content stay within a short viewport',async({page})=>{
 await setup(page,'activity',320,'en');await page.setViewportSize({width:1000,height:620});await remoteRow(page).hover();const card=page.getByRole('region',{name:'Project information',exact:true});await expect(card).toBeVisible();const box=await card.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(620);expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:'test-results/project-info-english.png'});
});
