import {test,expect} from '@playwright/test';
async function setup(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const stamp=new Date().toISOString();let callback:any;
  let state=JSON.parse(localStorage.getItem('fixture-workspace')||'null')||{theme:'light',language:'zh-CN',projects:[{id:'p',name:'Design',path:'/fixture',createdAt:stamp}],tasks:[]};
  let runs=JSON.parse(localStorage.getItem('fixture-runs')||'null')||[{id:'r',title:'保留原任务',projectId:'p',model:'model-a',baseUrl:'https://one.example/v1',createdAt:stamp,status:'completed',messages:[{id:'u',role:'user',text:'原始提问不要翻译'},{id:'a',role:'assistant',text:Array.from({length:60},(_,i)=>`回答段落 ${i}\n\n`).join('')}],tools:[],approvals:[],error:''}];
  const providers=[{id:'one',name:'First service',configured:true,model:'model-a',models:['model-a','model-b'],baseUrl:'https://one.example/v1',executable:'',hasKey:false},{id:'two',name:'Second service',configured:true,model:'model-c',models:['model-c'],baseUrl:'https://two.example/v1',executable:'',hasKey:false}];let defaultId='one';
  (window as any).desktop={getProvider:async()=>providers.find(p=>p.id===defaultId),listProviders:async()=>({defaultId,providers}),setDefaultProvider:async(id:string)=>{defaultId=id;return {defaultId,providers}},readWorkspace:async()=>state,saveWorkspace:async(next:any)=>{state=next;localStorage.setItem('fixture-workspace',JSON.stringify(state));},listRuns:async()=>runs,onRun:(fn:any)=>{callback=fn;return()=>{}},onCommand:()=>()=>{},getDevice:async()=>({mode:'desktop',name:'Mac',memoryGB:64}),editRun:async(input:any)=>{runs=input.remove?runs.filter((r:any)=>r.id!==input.id):runs.map((r:any)=>r.id===input.id?{...r,archivedAt:input.archived?new Date().toISOString():null}:r);localStorage.setItem('fixture-runs',JSON.stringify(runs));return runs;},copyText:async()=>{},stopRun:async()=>{}};
 });
 await page.goto('/');await page.locator('.tree-task > button:first-child').click();
}
test('settings preserve conversation DOM, draft and scroll while appearance and language update',async({page})=>{
 await setup(page);
 await page.getByRole('textbox',{name:'继续对话'}).fill('未发送草稿保持原文');
 await page.locator('.conversation-scroll').evaluate(el=>{el.scrollTop=220;});
 await page.locator('.conversation-page').evaluate(el=>(el as any).__identity='retained');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await expect(page.getByRole('heading',{name:'舒服地，开始工作'})).toBeVisible();
 await expect(page.locator('.settings-sidebar [data-slot="sidebar-menu-button"]')).toHaveCount(8);
 await page.getByRole('button',{name:'深色',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByLabel('界面语言').selectOption('en');
 await expect(page.getByRole('heading',{name:'Make yourself at home'})).toBeVisible();
 await page.getByRole('button',{name:'Back to app'}).click();
 await expect(page.getByRole('textbox',{name:'Continue task'})).toHaveValue('未发送草稿保持原文');
 expect(await page.locator('.conversation-page').evaluate(el=>(el as any).__identity)).toBe('retained');
 expect(Math.abs(await page.locator('.conversation-scroll').evaluate(el=>el.scrollTop)-220)).toBeLessThan(4);
 await expect(page.locator('.message.user')).toHaveText('原始提问不要翻译');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Interface language').selectOption('zh-CN');
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();await page.getByRole('button',{name:'设为默认'}).click();
 await page.getByRole('button',{name:'返回应用'}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-a');
 await page.locator('.new-task').click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-c');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:/model-b/}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-b');
});
test('archive leaves main navigation, restores, and permanent deletion requires confirmation',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'管理任务：保留原任务'}).click();await page.getByRole('button',{name:'归档任务',exact:true}).click();await page.getByRole('button',{name:'确认归档任务'}).click();
 await expect(page.locator('.tree-task')).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'任务',exact:true}).click();
 await expect(page.locator('.archive-row')).toContainText('保留原任务');await page.getByRole('button',{name:'还原',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(0);
 await page.getByRole('button',{name:'返回应用'}).click();await page.getByRole('button',{name:'管理任务：保留原任务'}).click();await page.getByRole('button',{name:'归档任务',exact:true}).click();await page.getByRole('button',{name:'确认归档任务'}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'永久删除',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(1);
 await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(1);
 await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.getByRole('button',{name:'确认永久删除'}).click();await expect(page.locator('.archive-row')).toHaveCount(0);
});
test('provider editor guards only dirty changes and validates the endpoint before saving',async({page})=>{
 await setup(page);await page.evaluate(()=>{(window as any).desktop.saveProvider=async(input:any)=>{(window as any).__providerSave=input;return {...input,id:'one'};};});
 await page.getByRole('button',{name:'设置',exact:true}).click();const nav=page.getByRole('navigation',{name:'设置导航'});await nav.getByRole('button',{name:'模型提供商',exact:true}).click();await page.getByRole('button',{name:'编辑',exact:true}).first().click();await page.getByRole('button',{name:'返回服务列表'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'编辑',exact:true}).first().click();await page.getByLabel('服务名称',{exact:true}).fill('Changed');await nav.getByRole('button',{name:'通用',exact:true}).click();await page.getByRole('button',{name:'继续编辑'}).click();await expect(page.getByLabel('服务名称',{exact:true})).toHaveValue('Changed');await page.getByLabel('Base URL',{exact:true}).fill('invalid');await page.getByRole('button',{name:'保存配置',exact:true}).click();expect(await page.evaluate(()=>(window as any).__providerSave)).toBeUndefined();expect(await page.getByLabel('Base URL').evaluate(el=>(el as HTMLInputElement).validity.valid)).toBe(false);
 await page.getByLabel('Base URL').fill('https://valid.example/v1');await page.screenshot({path:'test-results/settings-provider-editor.png',animations:'disabled'});await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByText('配置已保存',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'返回服务列表'})).toHaveCount(0);
 await page.screenshot({path:'test-results/settings-provider-saved.png',animations:'disabled'});
});

test('custom authentication distinguishes configuration from sign-in and explains its fields',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{let catalog:any={revision:0,defaultId:null,connections:[]};(window as any).desktop.authentication={connections:async(input:any)=>{if(input?.action==='save'){(window as any).__authSaved=input.value;catalog={...catalog,revision:1,connections:[{...input.value,id:'custom'}]};}return catalog;},sessions:async()=>[],onChanged:()=>()=>{}};});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'账号',exact:true}).click();
 const settings=page.locator('.settings-workspace');await expect(settings.getByRole('heading',{name:'自定义认证',exact:true})).toBeVisible();await expect(settings).not.toContainText('企业连接');
 await settings.getByRole('button',{name:'添加认证配置'}).click();await expect(settings).toContainText('保存配置不会自动登录');
 await expect(settings.getByLabel('租户限制',{exact:true})).not.toBeVisible();
 await settings.getByLabel('配置名称',{exact:true}).fill('个人认证服务');await settings.getByLabel('认证服务地址（Issuer URL）',{exact:true}).fill('https://login.example.com');await settings.getByLabel('客户端 ID（Client ID）',{exact:true}).fill('desktop-client');
 await page.screenshot({path:'test-results/custom-authentication.png'});
 await settings.getByRole('button',{name:'保存配置',exact:true}).click();
 await expect(settings.getByRole('status')).toContainText('认证配置已保存');await expect(settings).toContainText('暂无已登录账号');
 expect(await page.evaluate(()=>(window as any).__authSaved)).toMatchObject({name:'个人认证服务',issuer:'https://login.example.com',clientId:'desktop-client',tenant:''});
});
