import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
 const item={manifest:{id:'demo',name:'项目助手',description:'整理项目资料',version:'1.0.0',contributes:{}},kind:'package',enabled:true,trusted:true,hasConfiguration:true,active:'one',permissions:[{capability:'projects.read',scope:'project'}],grants:[{capability:'projects.read',resource:'project:private-id'},{capability:'configuration',resource:'self'}]};
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},readWorkspace:async()=>({tasks:[],projects:[{id:'private-id',name:'品牌设计'}],theme:'light'}),extensions:{list:async()=>({installed:[item],capabilities:{}}),details:async()=>({readme:'# 使用指南\n\n**先选择项目**，再开始整理。',publisher:'Amble Studio',size:2048}),install:async(input:any)=>{(window as any).__installation=input?.development?'directory':'package';},configuration:async(input:any)=>{if(input.action==='save')(window as any).__saved=input.value;return {schema:{type:'object',properties:{language:{type:'string',description:'输出语言'},format:{type:'string',enum:['markdown','text'],description:'选择生成内容的格式'},compact:{type:'boolean',description:'使用精简输出，减少重复说明。'},limit:{type:'integer',minimum:1,maximum:100,description:'每次最多处理的条目数'},options:{type:'object',description:'附加输出选项'}}},value:(window as any).__saved||{language:'中文',format:'markdown',compact:true,limit:20,options:{}},generation:1,revision:1};},enable:async({enabled}:any)=>{item.enabled=enabled;}}};
 });
});
test('extension details render README, configuration and named project permissions',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();
 await page.locator('.extension-list-card').click();await expect(page.getByRole('heading',{name:'使用指南'})).toBeVisible();await page.getByRole('tab',{name:'权限',exact:true}).click();await expect(page.locator('.extension-permissions')).toContainText('品牌设计');await expect(page.locator('.extension-detail')).not.toContainText('private-id');
 await page.getByRole('tab',{name:'设置',exact:true}).click();await expect(page.getByLabel('language')).toHaveValue('中文');
 await page.getByLabel('language').fill('English');
 await page.getByLabel('format',{exact:true}).selectOption(JSON.stringify('text'));
 await page.getByRole('switch',{name:'compact',exact:true}).click();
 await page.getByLabel('limit',{exact:true}).fill('30');
 await page.getByLabel('options',{exact:true}).fill('{"preview":true}');
 await page.getByRole('tab',{name:'详情',exact:true}).click();
 await page.getByRole('tab',{name:'设置',exact:true}).click();
 await expect(page.getByLabel('language')).toHaveValue('English');
 await page.screenshot({path:'test-results/extension-settings-shadcn.png'});
 await page.getByRole('button',{name:'保存配置',exact:true}).click();
 await expect(page.getByRole('button',{name:'保存配置',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).__saved)).toEqual({language:'English',format:'text',compact:false,limit:30,options:{preview:true}});

 await page.getByRole('tab',{name:'权限',exact:true}).click();await page.getByRole('button',{name:'管理权限'}).click();await expect(page.getByRole('dialog')).toContainText('品牌设计');await expect(page.getByRole('dialog')).not.toContainText('private-id');await page.keyboard.press('Escape');
 await page.screenshot({path:'test-results/extension-detail.png'});
 await page.getByRole('button',{name:'更多操作'}).click();await expect(page.getByRole('menu')).toBeVisible();await page.screenshot({path:'test-results/extension-menu-shadcn.png'});await page.keyboard.press('Escape');await page.getByRole('button',{name:'停用',exact:true}).click();await expect(page.locator('.extension-detail-title')).toContainText('已停用');
 await page.getByRole('button',{name:'返回扩展列表'}).click();await expect(page.locator('.extension-list-card')).toBeVisible();
});

test('installation actions stay in the header and dirty configuration survives cancelled navigation',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();
 await expect(page.locator('.integration-heading').getByRole('button',{name:'安装扩展',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'已安装扩展',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'安装扩展',exact:true}).click();expect(await page.evaluate(()=>(window as any).__installation)).toBe('package');
 await page.getByRole('button',{name:'更多安装方式'}).click();await page.getByRole('menuitem',{name:'加载开发目录'}).click();expect(await page.evaluate(()=>(window as any).__installation)).toBe('directory');
 await page.locator('.extension-list-card').click();await expect(page.getByRole('button',{name:'安装扩展',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByLabel('language').fill('English');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'返回扩展列表'}).click();await expect(page.getByLabel('language')).toHaveValue('English');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'停用',exact:true}).click();await expect(page.locator('.extension-detail-title')).toContainText('已启用');
 await page.getByRole('tab',{name:'权限',exact:true}).click();await page.getByRole('tab',{name:'设置',exact:true}).click();await expect(page.getByLabel('language')).toHaveValue('English');
 await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByText('已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'返回扩展列表'}).click();await expect(page.locator('.extension-list-card')).toBeVisible();
});

test('English dark layout reflows inside narrow settings content at 130 percent text scale',async({page})=>{
 await page.addInitScript(()=>{const desktop=(window as any).desktop;const read=desktop.readWorkspace;desktop.readWorkspace=async()=>({...await read(),language:'en',theme:'dark',fontScale:130});});
 await page.setViewportSize({width:820,height:900});await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings navigation'}).getByRole('button',{name:'Extensions',exact:true}).click();
 const noOverflow=async()=>{expect(await page.locator('.settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);};
 await expect(page.locator('.extension-list-card')).toBeVisible();await noOverflow();await page.screenshot({path:'test-results/extensions-list-narrow-dark.png'});
 await page.locator('.extension-list-card').click();await page.getByRole('tab',{name:'Settings',exact:true}).click();await expect(page.getByLabel('language')).toBeVisible();await noOverflow();await page.screenshot({path:'test-results/extensions-settings-narrow-dark.png'});
 await page.getByRole('tab',{name:'Permissions',exact:true}).click();await expect(page.locator('.extension-permissions')).toContainText('品牌设计');await noOverflow();
});

test('configuration authorization is scoped and detail errors clear when returning to list',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const snapshot=await (window as any).desktop.extensions.list();snapshot.installed[0].grants=snapshot.installed[0].grants.filter((grant:any)=>grant.capability!=='configuration');(window as any).desktop.extensions.grants=async(input:unknown)=>{(window as any).__grantInput=input;throw Error("Error invoking remote method 'extensions:grants': Error: 请选择有效项目");};});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();
 await page.locator('.extension-list-card').click();await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'授权扩展配置',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__grantInput)).toEqual({id:'demo',capabilities:['configuration']});
 await expect(page.getByRole('alert')).toHaveText('请选择有效项目');await page.getByRole('button',{name:'返回扩展列表'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
 await page.locator('.extension-list-card').click();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('permission dialog keeps failures visible and submits only the selected project',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{(window as any).desktop.extensions.grants=async(input:any)=>{(window as any).__grantInput=input;if(!(window as any).__allowGrant)throw Error('授权失败，请重试');return {};};});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();await page.locator('.extension-list-card').click();await page.getByRole('tab',{name:'权限',exact:true}).click();await page.getByRole('button',{name:'管理权限',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'管理权限'});
 await expect(dialog.getByRole('button',{name:'确认授权'})).toBeDisabled();
 await expect(dialog).not.toContainText('private-id');
 await dialog.getByLabel('选择授权项目',{exact:true}).selectOption('private-id');
 await page.screenshot({path:'test-results/extension-permission-dialog.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'确认授权'}).click();await expect(dialog.getByRole('alert')).toHaveText('授权失败，请重试');
 expect(await page.evaluate(()=>(window as any).__grantInput)).toEqual({id:'demo',projectId:'private-id'});
 await page.setViewportSize({width:640,height:720});await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/extension-permission-dialog-dark.png',animations:'disabled'});
 await page.evaluate(()=>{(window as any).__allowGrant=true;});await dialog.getByRole('button',{name:'确认授权'}).click();await expect(dialog).toHaveCount(0);
});
