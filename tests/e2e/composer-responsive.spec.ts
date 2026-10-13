import {test,expect} from '@playwright/test';
import {prepare} from './fixtures/file-panel';
test('composer keeps full-access and a long model on one line at narrow widths',async({page})=>{
 await prepare(page);await page.addInitScript(()=>{(window as any).__panelRun.permission='full';(window as any).__panelRun.model='DeepSeek-v4-flash-very-long-model-name';});await page.reload();
 await page.locator('.tree-task > button:first-child').filter({hasText:'项目任务'}).click();
 const permission=page.getByRole('button',{name:'完全访问',exact:true});const model=page.getByRole('button',{name:'选择模型',exact:true});const send=page.getByRole('button',{name:'发送后续消息',exact:true});
 for(const width of [680,460,360,320]){
  await page.locator('.conversation-dock').evaluate((el,width)=>{el.style.width=width+'px';el.style.paddingInline='10px';},width);
  if(width<500)await expect(permission.locator('span')).toBeHidden();else await expect(permission.locator('span')).toBeVisible();
  const boxes=await Promise.all([permission,model,send].map(el=>el.boundingBox()));const centers=boxes.map(box=>box!.y+box!.height/2);expect(Math.max(...centers)-Math.min(...centers)).toBeLessThan(3);
  expect(await page.locator('.composer:visible').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await permission.click();await expect(page.getByRole('dialog',{name:'权限模式'})).toBeVisible();await page.keyboard.press('Escape');
 await page.screenshot({path:'test-results/composer-width-compact.png',animations:'disabled'});
});
