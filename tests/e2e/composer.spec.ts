import {test,expect} from '@playwright/test';
async function setup(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
 const providers=[{id:'a',name:'服务 A',model:'Model A',models:['Model A','Model B'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''},{id:'b',name:'服务 B',model:'Model 1',models:['Model 1'],configured:true,baseUrl:'http://localhost/v2',hasKey:false,executable:''}];
 const run={id:'r',providerId:'a',title:'现有任务',model:'Model A',baseUrl:providers[0].baseUrl,cwd:'/tmp',createdAt:new Date().toISOString(),status:'completed',error:'',messages:[{id:'u',role:'user',text:'你好'},{id:'a',role:'assistant',text:'你好'}],tools:[],approvals:[]};
 (window as any).desktop={getProvider:async()=>providers[0],listProviders:async()=>({defaultId:'a',providers}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[run],onRun:()=>()=>{},onCommand:()=>()=>{},selectAttachments:async()=>[{name:'brief.txt',path:'/tmp/brief.txt'}],startRun:async(input:any)=>{(window as any).__sent=input;return {...run,model:input.model,providerId:input.providerId,status:'running'};}};
 });await page.goto('/');
}
test('composer groups models, adds context, preserves draft through settings',async({page})=>{
 await setup(page);await page.getByRole('textbox',{name:'任务内容',exact:true}).fill('我的草稿');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();const menu=page.getByRole('dialog',{name:'模型列表'});
 await expect(menu.getByText('本地模型',{exact:true})).toHaveCount(0);await expect(menu.getByText('自定义模型',{exact:true})).toBeVisible();
 await menu.getByRole('button',{name:'Model B 服务 A'}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('Model B');
 await page.getByRole('button',{name:'添加内容',exact:true}).click();await expect(page.getByRole('button',{name:'关闭添加菜单'})).toBeVisible();await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();await expect(page.locator('.composer-chips')).toContainText('brief.txt');await expect(page.getByRole('combobox',{name:'当前项目'})).toContainText('不关联项目');
 await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'技能',exact:true}).click();await page.getByRole('button',{name:'管理技能'}).click();await expect(page.locator('.settings-workspace')).toBeVisible();await page.getByRole('button',{name:'返回应用'}).click();await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('我的草稿');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();const sent=await page.evaluate(()=>(window as any).__sent);expect(sent.model).toBe('Model B');expect(sent.attachments[0].path).toBe('/tmp/brief.txt');
});
test('existing task confirms service and full access changes and submits next-turn options',async({page})=>{
 await setup(page);await page.locator('.tree-task > button:first-child').filter({hasText:'现有任务'}).click();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Model 1 服务 B'}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('Model A');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Model 1 服务 B'}).click();
 await page.getByRole('button',{name:'默认权限',exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('switch',{name:'允许完全访问'}).click();await expect(page.getByRole('button',{name:'完全访问',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'继续对话'}).fill('继续');await page.getByRole('button',{name:'发送后续消息'}).click();const sent=await page.evaluate(()=>(window as any).__sent);expect(sent).toMatchObject({runId:'r',providerId:'b',model:'Model 1',permission:'full',confirmProviderChange:true});
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/composer-compact.png'});
});

test('composer popovers move and restore keyboard focus without overflowing',async({page})=>{
 await setup(page);await page.setViewportSize({width:760,height:600});
 const trigger=page.getByRole('button',{name:'选择模型',exact:true});
 await trigger.focus();await page.keyboard.press('Enter');
 const menu=page.getByRole('dialog',{name:'模型列表'});
 await expect(menu.getByRole('button').first()).toBeFocused();
 const bounds=await menu.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(12);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(748);
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(menu).toHaveCount(0);
 await trigger.click();await page.getByRole('button',{name:'Model B 服务 A'}).click();await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'添加内容',exact:true}).click();
 await expect(page.getByRole('button',{name:'文件和文件夹',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'添加内容',exact:true})).toBeFocused();
 await page.evaluate(()=>{(window as any).desktop.selectAttachments=async()=>[{name:'很长的文件名'.repeat(35)+'.md',path:'/tmp/long.md'}];});
 await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();
 const chip=page.getByRole('button',{name:/移除附件/});await expect(chip).toBeVisible();
 expect(await page.locator('.composer:visible').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();
 expect(await menu.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.screenshot({path:'test-results/composer-accessibility.png'});
});

test('pending submission protects input and a failure retains the draft',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{(window as any).desktop.startRun=()=>new Promise((resolve,reject)=>{(window as any).__rejectSend=reject;});});
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('保留这份草稿');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(input).toBeDisabled();
 await page.evaluate(()=>(window as any).__rejectSend(new Error('暂时无法发送')));
 await expect(input).toBeEnabled();await expect(input).toHaveValue('保留这份草稿');
});
