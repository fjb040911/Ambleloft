import {test,expect} from '@playwright/test';
test('node conversation sends changes through rejection and retry, not ordinary continuation',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await page.getByRole('textbox',{name:'修改要求',exact:true}).fill('补充可核对的链接检查结果');
 await page.getByRole('button',{name:'提交修改要求',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(1);
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['review','control'].includes(c.action)));
 expect(calls[0].input).toMatchObject({accepted:false,packageId:'copy',note:'补充可核对的链接检查结果'});
 expect(calls[1].input).toMatchObject({action:'retry',packageId:'copy'});
});
