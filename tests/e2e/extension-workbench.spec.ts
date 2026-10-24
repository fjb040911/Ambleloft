import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,{classic=false,language='zh-CN',delay=0}={}){
 page.on('pageerror',error=>console.error(error));
 await page.addInitScript(({classic,language,delay})=>{
  const entries:any[]=[
   {manifest:{id:'service',name:'服务台扩展',version:'1',contributes:{}},home:{title:'售后服务',available:true},trusted:true,enabled:true,active:'one',hasConfiguration:true,grants:[{capability:'configuration',resource:'self'}]},
   {manifest:{id:'devices',name:'设备扩展',version:'1',contributes:{}},home:{title:'设备调试',when:'project.exists',available:false},trusted:true,enabled:true,active:'one'},
   {manifest:{id:'tools',name:'无页面工具',version:'1',contributes:{}},trusted:true,enabled:true},
   {manifest:{id:'untrusted',name:'未信任',version:'1',contributes:{}},home:{title:'未信任'},trusted:false,enabled:true}
  ];
  const state={theme:'light',language,layoutMode:classic?'classic':'activity',projects:[{id:'p',name:'调试项目',path:'/tmp/test',createdAt:'today'}],tasks:[]};
  const calls:any[]=[];const listeners=new Set<()=>void>();let context:any={};let config={revision:1,generation:1,value:{endpoint:'https://example.test'},schema:{type:'object',properties:{endpoint:{type:'string'}},required:['endpoint']}};
  const emit=()=>listeners.forEach(cb=>cb());
  (window as any).__fixture={entries,calls,emit};
  (window as any).desktop={readWorkspace:async()=>state,getDevice:async()=>({mode:'desktop',platform:'darwin'}),getProvider:async()=>({configured:false}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},
   extensions:{list:async()=>{if(delay)await new Promise(r=>setTimeout(r,delay));return {installed:structuredClone(entries),capabilities:{}};},onChanged:(cb:()=>void)=>{listeners.add(cb);return()=>listeners.delete(cb);},details:async()=>({readme:'Fixture',publisher:'Tests',size:1}),configuration:async(input:any)=>{if(input.action==='save')config={...config,value:input.value,revision:config.revision+1};return structuredClone(config);},enable:async({id,enabled}:any)=>{entries.find(item=>item.manifest.id===id).enabled=enabled;emit();}},
   skills:{list:async()=>[{id:'ai-rules',name:'ai-rules',enabled:true,description:'规则',version:1}]},
   extensionPage:{onInteraction:()=>()=>{},onInteractionClose:()=>()=>{},context:async(value:any)=>{context=value;const devices=entries.find(e=>e.manifest.id==='devices');if(devices)devices.home.available=!!value.projectId;emit();},open:async(value:any)=>{calls.push({type:'open',...value,context});return {};},close:async(value:any)=>{calls.push({type:'close',...value});},layout:async()=>{},overlay:(value:any)=>calls.push({type:'overlay',...value}),onClosed:()=>()=>{}}
  };
 },{classic,language,delay});await page.goto('/');
}
const rail=(page:Page)=>page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true});
const entries=(page:Page)=>page.getByRole('region',{name:'扩展业务入口',exact:true});
async function opens(page:Page){return page.evaluate(()=>(window as any).__fixture.calls.filter((c:any)=>c.type==='open'));}
async function settings(page:Page){await page.getByRole('button',{name:'扩展页面操作'}).click();await page.getByRole('menuitem',{name:'设置与权限'}).click();return page.getByRole('dialog',{name:'服务台扩展 · 设置与权限',exact:true});}

test('rail changes sidebar; direct pages, repeated clicks and manager return preserve location',async({page})=>{
 await setup(page);await rail(page).click();await expect(entries(page).locator('.extension-nav-row')).toHaveCount(2);await expect(page.getByRole('region',{name:'我的项目'})).toBeHidden();
 await expect(page.locator('.extension-workbench h1')).toHaveText('售后服务');await expect.poll(async()=>(await opens(page)).length).toBe(1);
 await rail(page).click();await rail(page).click();expect((await opens(page)).length).toBe(1);
 await page.getByRole('button',{name:'技能与扩展',exact:true}).click();await page.getByRole('tab',{name:'发现',exact:true}).click();await expect(page.locator('.store-feature')).toBeVisible();
 await page.locator('.activity-rail').getByRole('button',{name:'任务',exact:true}).click();await rail(page).click();await expect(page.getByRole('tab',{name:'发现',exact:true})).toHaveAttribute('aria-selected','true');
 await entries(page).getByRole('button',{name:'售后服务',exact:true}).click();await expect(page.locator('.extension-workbench h1')).toHaveText('售后服务');
 await entries(page).getByRole('searchbox').fill('设备');await expect(entries(page).locator('.extension-nav-row')).toHaveCount(1);await entries(page).getByRole('searchbox').fill('');
 expect(await entries(page).getByRole('searchbox').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(32);
 await page.screenshot({path:'test-results/extension-workbench.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await expect.poll(()=>page.getByRole('button',{name:'扩展页面操作'}).evaluate(el=>{const rgb=getComputedStyle(el).color.match(/\d+/g)!.slice(0,3).map(Number);return Math.min(...rgb);})).toBeGreaterThan(180);await page.screenshot({path:'test-results/extension-workbench-dark.png'});
});

test('business settings retain native slot; every close path guards dirty configuration',async({page})=>{
 await setup(page);await rail(page).click();await expect.poll(async()=>(await opens(page)).length).toBe(1);const closes=await page.evaluate(()=>(window as any).__fixture.calls.filter((c:any)=>c.type==='close').length);const dialog=await settings(page);
 await dialog.getByLabel('endpoint').fill('https://changed.test');await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(dialog.getByLabel('endpoint')).toHaveValue('https://changed.test');
 await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改',exact:true}).click();await expect(dialog).toBeHidden();expect((await opens(page)).length).toBe(1);expect(await page.evaluate(()=>(window as any).__fixture.calls.filter((c:any)=>c.type==='close').length)).toBe(closes);
 const reopened=await settings(page);await reopened.getByLabel('endpoint').fill('https://saved.test');await reopened.getByRole('button',{name:'保存配置',exact:true}).click();await expect(reopened.getByText('已保存',{exact:true})).toBeVisible();await reopened.getByRole('button',{name:'返回业务页面'}).click();await expect(reopened).toBeHidden();expect((await opens(page)).length).toBe(1);
});

test('conditions use host context; disable, remove and update never open another business',async({page})=>{
 await setup(page);await rail(page).click();await entries(page).getByRole('button',{name:/设备调试/}).click();await expect(page.getByText('此入口暂不可用',{exact:true})).toBeVisible();expect((await opens(page)).length).toBe(1);
 await page.getByRole('combobox',{name:'当前项目'}).click();await page.getByRole('option',{name:'调试项目'}).click();await expect.poll(async()=>(await opens(page)).at(-1)?.extensionId).toBe('devices');expect((await opens(page)).at(-1)?.context.projectId).toBe('p');
 await page.evaluate(()=>{const f=(window as any).__fixture;f.entries[1].active='two';f.emit();});await expect.poll(async()=>(await opens(page)).filter((c:any)=>c.extensionId==='devices').length).toBe(2);
 await page.evaluate(()=>{const f=(window as any).__fixture;f.entries[1].enabled=false;f.emit();});await expect(page.getByText('此扩展入口已不可用',{exact:true})).toBeVisible();await expect(entries(page).locator('.extension-nav-row')).toHaveCount(1);
 await page.evaluate(()=>{const f=(window as any).__fixture;f.entries.splice(1,1);f.emit();});await expect(page.getByText('此扩展入口已不可用',{exact:true})).toBeVisible();expect((await opens(page)).length).toBe(3);
});

test('classic layout and late inventory show home entries only; new installs synchronize',async({page})=>{
 await setup(page,{classic:true,delay:250});await expect(entries(page).locator('.extension-nav-row')).toHaveCount(2);await entries(page).getByRole('button',{name:'售后服务',exact:true}).click();await expect.poll(async()=>(await opens(page)).length).toBe(1);
 await page.evaluate(()=>{const f=(window as any).__fixture;f.entries.push({manifest:{id:'orders',name:'订单扩展',contributes:{}},home:{title:'售后服务',available:true},trusted:true,enabled:true});f.emit();});await expect(entries(page).getByText('订单扩展',{exact:true})).toBeVisible();await expect(entries(page).getByText('服务台扩展',{exact:true})).toBeVisible();await entries(page).getByRole('button',{name:'售后服务 订单扩展',exact:true}).click();await expect.poll(async()=>(await opens(page)).at(-1)?.extensionId).toBe('orders');
});

test('English empty workspace and keyboard navigation remain clear at narrow widths',async({page})=>{
 await setup(page,{language:'en'});await page.evaluate(()=>{const f=(window as any).__fixture;f.entries.splice(0);f.emit();});await page.setViewportSize({width:650,height:850});await page.locator('.activity-rail').getByRole('button',{name:'Extensions',exact:true}).click();await expect(page.getByRole('dialog',{name:'Main navigation'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByText('Your business tools, in one workspace',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Discover tools',exact:true}).click();await expect(page.locator('.store-feature')).toBeVisible();await page.screenshot({path:'test-results/extension-workbench-empty-en.png'});
});

test('global search opens a business page directly',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'搜索工作台',exact:true}).click();await page.getByRole('tab',{name:'扩展',exact:true}).click();await page.getByRole('combobox').fill('服务台');await page.getByRole('option').filter({hasText:'服务台扩展'}).click();await expect(page.locator('.extension-workbench h1')).toHaveText('售后服务');await expect(entries(page)).toBeVisible();await expect.poll(async()=>(await opens(page)).length).toBe(1);
});
