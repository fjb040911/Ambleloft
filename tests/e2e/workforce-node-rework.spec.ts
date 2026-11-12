import {test,expect} from '@playwright/test';
for(const trigger of ['enter','button'])test(`stopped node preserves the draft and sends by ${trigger} after status reconciliation`,async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA;
  qa.snapshot.plans[0].packages.find((p:any)=>p.id==='copy').status='waiting';
  const get=window.desktop!.getRunPage!;
  window.desktop!.getRunPage=async input=>({...await get(input),status:'interrupted',error:'已停止。若工具已执行，请核实结果后继续。'});
  qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 const text='请核实已完成的操作，并从未完成的步骤继续。';
 await page.getByRole('textbox',{name:'继续对话',exact:true}).fill(text);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages.find((p:any)=>p.id==='copy').status='interrupted';qa.emit();});
 const composer=page.getByRole('textbox',{name:'修改要求',exact:true});
 await expect(composer).toHaveValue(text);
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(0);
 if(trigger==='enter')await composer.press('Enter');else await page.getByRole('button',{name:'提交修改要求',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='control').input)).toMatchObject({action:'retry',packageId:'copy',note:text});
});
test('node conversation sends changes through rejection and retry, not ordinary continuation',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await page.getByRole('tab',{name:'任务对话',exact:true}).click();
 await page.getByRole('textbox',{name:'修改要求',exact:true}).fill('补充可核对的链接检查结果');
 await page.getByRole('button',{name:'提交修改要求',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(1);
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['review','control'].includes(c.action)));
 expect(calls[0].input).toMatchObject({accepted:false,packageId:'copy',note:'补充可核对的链接检查结果'});
 expect(calls[1].input).toMatchObject({action:'retry',packageId:'copy'});
});
