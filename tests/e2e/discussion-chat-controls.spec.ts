import {test,expect} from '@playwright/test';

for(const [width,theme] of [[1280,'light'],[390,'dark']] as const)test(`discussion help and shared jump control at ${width}px in ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.goto('/tests/manual/project-space-qa.html?theme='+theme);
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA;
  qa.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].output='核对目标、项目关系与验收标准。\n\n'.repeat(100);qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const composer=page.locator('.wf-discussion-composer'),scroll=page.locator('.qa-scroll');
 await expect(composer.getByText('模型与发送内容',{exact:true})).toHaveCount(0);
 const input=page.getByLabel('这次想推进什么？');await input.fill('尚未发送的讨论内容');
 await scroll.evaluate(el=>{el.scrollTop=0;});
 const before=await composer.boundingBox();
 await page.getByRole('button',{name:'讨论说明',exact:true}).click();
 const help=page.getByRole('dialog',{name:'模型与发送内容'});
 await expect(help).toBeVisible();await expect(help).toContainText('不会自动启动协作计划');
 expect((await composer.boundingBox())!.height).toBeCloseTo(before!.height,0);
 await page.keyboard.press('Escape');await expect(help).toHaveCount(0);
 await expect(page.getByRole('button',{name:'讨论说明',exact:true})).toBeFocused();
 await expect(input).toHaveValue('尚未发送的讨论内容');
 await scroll.evaluate(el=>{el.scrollTop=500;});
 const jump=page.getByRole('button',{name:'回到最新消息',exact:true});
 await expect(jump).toBeVisible();await expect(jump).toBeInViewport();
 await expect(jump).toHaveCSS('width','28px');await expect(jump).toHaveCSS('height','28px');
 await expect(jump).toHaveCSS('border-radius','6px');
 expect((await jump.boundingBox())!.y+28).toBeLessThan((await composer.boundingBox())!.y);
 await page.screenshot({path:`/tmp/discussion-shared-controls-${width}.png`});
 await jump.focus();await page.keyboard.press('Enter');
 await expect.poll(()=>scroll.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);
 await expect(jump).toHaveCount(0);await expect(input).toHaveValue('尚未发送的讨论内容');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
