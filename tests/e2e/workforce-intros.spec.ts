import {test,expect} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
for(const view of ['spaces','experts','store','knowledge'])for(const config of [{name:'wide',width:1280,query:''},{name:'narrow-dark-en',width:390,query:'&lang=en&theme=dark'}])test(`${view} introduction ${config.name}`,async({page})=>{
 await page.setViewportSize({width:config.width,height:900});await page.goto(`${fixture}?view=${view}&role-demo=1${config.query}`);
 const intro=page.locator('.wf-intro');await expect(intro).toBeVisible();await expect(intro.getByRole('heading',{level:1})).toHaveCount(1);
 await expect(intro.getByRole('group')).toBeVisible();await expect(intro.locator('.wf-intro-map-nodes > div')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(await intro.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await expect(intro).toHaveAttribute('data-tone',({spaces:'lilac',experts:'mint',store:'cream',knowledge:'pink'} as Record<string,string>)[view]);
 await intro.screenshot({path:`/tmp/workforce-intro-${view}-${config.name}.png`});
 if(view==='knowledge'){
  const en=!!config.query;await intro.getByRole('button',{name:en?'Search execution references':'搜索执行依据'}).click();
  await expect(page.getByRole('textbox',{name:en?'Search execution references':'搜索执行依据'})).toBeFocused();
  await page.locator('.qa-scroll').evaluate(el=>{el.scrollTop=0;});
  await intro.getByRole('button',{name:en?'View project spaces':'查看项目空间'}).click();
  await expect(page.locator('.wf-intro')).toHaveAttribute('data-tone','lilac');
 }
 if(view==='experts'){
  const en=!!config.query;await intro.getByRole('button',{name:en?'Add expert':'添加专家',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await intro.getByRole('button',{name:en?'Browse role library':'浏览角色库',exact:true}).click();await expect(page.locator('.wf-intro')).toHaveAttribute('data-tone','cream');
 }
});
