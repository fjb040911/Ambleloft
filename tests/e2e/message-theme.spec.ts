import {test,expect} from '@playwright/test';
import {prepare} from './fixtures/file-panel';
test('message palette follows explicit and system themes without inverting to white',async({page})=>{
 await prepare(page);
 await page.locator('.tree-task > button:first-child').filter({hasText:'项目任务'}).click();
 const bubble=page.getByRole('article',{name:'你的消息'}).first();
 await expect(bubble).toBeVisible();
 for(const [theme,system,dark] of [['dark','light',true],['system','dark',true],['system','light',false],['light','dark',false]] as const){
  await page.emulateMedia({colorScheme:system});
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await expect(bubble).toHaveCSS('background-color',dark?'rgb(48, 48, 48)':'rgb(0, 0, 0)');
  await expect(bubble).toHaveCSS('color','rgb(255, 255, 255)');
 }
});
