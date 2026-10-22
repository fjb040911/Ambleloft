import {test,expect} from '@playwright/test';
test('settings opens the shared skill and extension managers; filters and actions remain usable',async({page})=>{
 await page.addInitScript(()=>{
  const extensions=[{manifest:{id:'demo',name:'示例扩展',description:'整理资料',version:'1',contributes:{}},enabled:true},{manifest:{id:'off',name:'停用扩展',description:'其他工具',version:'1',contributes:{}},enabled:false}];
  const skills=[{id:'skill',name:'写作技能',description:'整理文字',enabled:true,version:1,updatedAt:new Date().toISOString()}];
  (window as any).desktop={readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},extensions:{list:async()=>({installed:extensions,capabilities:{}}),enable:async({id,enabled}:any)=>{extensions.find(x=>x.manifest.id===id)!.enabled=enabled;}},skills:{list:async()=>skills}};
 });
 await page.goto('/');
 const open=async(kind:string)=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:kind,exact:true}).click();};
 await open('连接');await expect(page.getByRole('tab')).toHaveText(['已安装','连接市场']);await page.getByRole('button',{name:'返回应用'}).click();
 for(const kind of ['扩展','技能']){
  await open(kind);await expect(page.locator('.skill-extension-center')).toBeVisible();await expect(page.getByRole('navigation',{name:'设置导航'})).toHaveCount(0);await expect(page.getByRole('tab')).toHaveText(['已安装']);await expect(page.getByRole('searchbox',{name:'搜索'+kind})).toBeVisible();await expect(page.getByRole('combobox',{name:'过滤'+kind})).toBeVisible();await page.getByRole('button',{name:'返回技能与扩展'}).click();await expect(page.getByRole('tab')).toHaveText(['发现','已安装 3','我的创作']);
 }
 await open('扩展');await page.getByRole('searchbox').fill('整理资料');await expect(page.locator('.extension-list-card')).toHaveCount(1);await page.locator('.extension-list-card').click();await page.getByRole('button',{name:'停用',exact:true}).click();await page.getByRole('button',{name:'返回扩展列表'}).click();await page.getByRole('combobox',{name:'过滤扩展'}).selectOption('enabled');await expect(page.getByRole('tabpanel')).toContainText('没有匹配的扩展');await page.getByRole('button',{name:'清除筛选'}).click();await expect(page.locator('.extension-list-card')).toHaveCount(2);
 await page.setViewportSize({width:720,height:900});await page.evaluate(()=>document.documentElement.dataset.theme='dark');expect(await page.locator('.skill-extension-center').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/integration-center-management.png'});
});
