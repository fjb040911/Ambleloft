import {test,expect} from '@playwright/test';
test('integration tabs share search and status filters and retain management actions',async({page})=>{
 await page.addInitScript(()=>{
  const extensions=[{manifest:{id:'demo',name:'示例扩展',description:'整理资料',version:'1',contributes:{}},enabled:true},{manifest:{id:'off',name:'停用扩展',description:'其他工具',version:'1',contributes:{}},enabled:false}];
  const skills=[{id:'skill',name:'写作技能',description:'整理文字',enabled:true,version:1,updatedAt:new Date().toISOString()}];
  (window as any).desktop={readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},extensions:{list:async()=>({installed:extensions,capabilities:{}}),enable:async({id,enabled}:any)=>{extensions.find(x=>x.manifest.id===id)!.enabled=enabled;}},skills:{list:async()=>skills}};
 });
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'设置导航'});
 for(const kind of ['连接','扩展','技能']){
  await nav.getByRole('button',{name:kind,exact:true}).click();
  await expect(page.getByRole('tab')).toHaveText(['已安装',kind+'市场']);
  await expect(page.getByRole('searchbox',{name:'搜索'+kind})).toBeVisible();await expect(page.getByRole('combobox',{name:'过滤'+kind})).toBeVisible();
  await page.screenshot({path:'test-results/integration-'+kind+'.png'});
  await page.getByRole('tab',{name:kind+'市场'}).click();
  await expect(page.getByRole('tabpanel')).toContainText(kind+'市场即将开放');
  await page.getByRole('tab',{name:'已安装',exact:true}).click();
 }
 await nav.getByRole('button',{name:'扩展',exact:true}).click();
 await expect(page.getByText('我的技能',{exact:true})).toHaveCount(0);
 await page.getByRole('searchbox').fill('整理资料');
 await expect(page.locator('.extension-list-card').filter({hasText:'示例扩展'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'停用扩展',exact:true})).toHaveCount(0);
 await page.locator('.extension-list-card').click();await page.getByRole('button',{name:'停用',exact:true}).click();await page.getByRole('button',{name:'返回扩展列表'}).click();
 await page.getByRole('combobox',{name:'过滤扩展'}).selectOption('enabled');
 await expect(page.getByRole('tabpanel')).toContainText('没有匹配的扩展');
 await page.getByRole('button',{name:'清除筛选'}).click();
 await expect(page.locator('.extension-list-card')).toHaveCount(2);
 await page.getByRole('tab',{name:'扩展市场'}).click();
 await page.screenshot({path:'test-results/integration-market.png'});
 for(const kind of ['连接','扩展','技能']){
  await nav.getByRole('button',{name:kind,exact:true}).click();
  const installed=page.getByRole('tab',{name:'已安装',exact:true});const market=page.getByRole('tab',{name:kind+'市场'});
  await installed.click();await page.getByRole('searchbox').fill('保留条件');await page.getByRole('combobox',{name:'过滤'+kind}).selectOption('disabled');
  await installed.focus();await page.keyboard.press('ArrowRight');await expect(market).toBeFocused();await expect(market).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page.keyboard.press('Home');await expect(installed).toBeFocused();await expect(page.getByRole('searchbox')).toHaveValue('保留条件');await expect(page.getByRole('combobox',{name:'过滤'+kind})).toHaveValue('disabled');
  await page.keyboard.press('End');await expect(market).toBeFocused();await expect(page.getByRole('tabpanel')).toHaveCount(1);
  const panelId=await market.getAttribute('aria-controls');await expect(page.getByRole('tabpanel')).toHaveAttribute('id',panelId!);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
 }
 await nav.getByRole('button',{name:'技能',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.getByRole('tab',{name:'已安装',exact:true}).click();await page.getByRole('tab',{name:'技能市场'}).click();
 await expect(page.getByRole('tab',{name:'技能市场'})).toHaveCSS('transition-duration','0s');
 await page.screenshot({path:'test-results/integration-dark.png'});
 await page.setViewportSize({width:720,height:900});
 for(const kind of ['连接','技能','扩展']){
  await nav.getByRole('button',{name:kind,exact:true}).click();
  await page.getByRole('tab',{name:'已安装',exact:true}).click();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox').selectOption('all');
  expect(await page.locator('.settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/integration-narrow-'+kind+'.png'});
 }
});
