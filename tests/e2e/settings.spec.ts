import {test,expect} from '@playwright/test';
async function setup(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const stamp=new Date().toISOString();let callback:any;
  let state=JSON.parse(localStorage.getItem('fixture-workspace')||'null')||{theme:'light',language:'zh-CN',projects:[{id:'p',name:'Design',path:'/fixture',createdAt:stamp}],tasks:[]};
  let runs=JSON.parse(localStorage.getItem('fixture-runs')||'null')||[{id:'r',title:'保留原会话',projectId:'p',model:'model-a',baseUrl:'https://one.example/v1',createdAt:stamp,status:'completed',messages:[{id:'u',role:'user',text:'原始提问不要翻译'},{id:'a',role:'assistant',text:Array.from({length:60},(_,i)=>`回答段落 ${i}\n\n`).join('')}],tools:[],approvals:[],error:''}];
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
 await expect(page.locator('.settings-sidebar .nav-item')).toHaveCount(11);
 await page.getByRole('button',{name:'深色',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByLabel('界面语言').selectOption('en');
 await expect(page.getByRole('heading',{name:'Make yourself at home'})).toBeVisible();
 await page.getByRole('button',{name:'Back to app'}).click();
 await expect(page.getByRole('textbox',{name:'Continue conversation'})).toHaveValue('未发送草稿保持原文');
 expect(await page.locator('.conversation-page').evaluate(el=>(el as any).__identity)).toBe('retained');
 expect(Math.abs(await page.locator('.conversation-scroll').evaluate(el=>el.scrollTop)-220)).toBeLessThan(4);
 await expect(page.locator('.message.user')).toHaveText('原始提问不要翻译');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Interface language').selectOption('zh-CN');
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();await page.getByRole('button',{name:'设为默认'}).click();
 await page.getByRole('button',{name:'返回应用'}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-a');
 await page.locator('.new-task').click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-c');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('button',{name:/model-b/}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('model-b');
});
test('archive leaves main navigation, restores, and permanent deletion requires confirmation',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'管理任务：保留原会话'}).click();await page.getByRole('button',{name:'归档任务',exact:true}).click();await page.getByRole('button',{name:'确认归档任务'}).click();
 await expect(page.locator('.tree-task')).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'会话',exact:true}).click();
 await expect(page.locator('.archive-row')).toContainText('保留原会话');await page.getByRole('button',{name:'还原',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(0);
 await page.getByRole('button',{name:'返回应用'}).click();await page.getByRole('button',{name:'管理任务：保留原会话'}).click();await page.getByRole('button',{name:'归档任务',exact:true}).click();await page.getByRole('button',{name:'确认归档任务'}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'永久删除',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(1);
 await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(1);
 await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.getByRole('button',{name:'确认永久删除'}).click();await expect(page.locator('.archive-row')).toHaveCount(0);
});
