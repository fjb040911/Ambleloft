import {test,expect} from '@playwright/test';
for(const width of [1280,390])test(`provider failure keeps controls and swaps recovery without a blank chat ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{
  const w=window as any,qa=w.spaceQA,api=window.desktop!,get=api.getRunPage!.bind(api);
  const p=qa.snapshot.plans[0].packages[0];p.status='failed';p.attempts[0].status='failed';qa.snapshot.plans[0].status='running';
  api.getRunPage=async input=>{const r={...await get({id:'evidence'}),id:input.id,status:input.id==='evidence'?'failed':'running',error:input.id==='evidence'?'模型服务暂不可用':''} as any;if(input.id==='recovered'){if(!w.recoveryReleased)await new Promise(resolve=>{(w.recoveryWaiters||=[]).push(resolve);w.releaseRecovery=()=>{w.recoveryReleased=true;for(const done of w.recoveryWaiters)done();};});r.model='模型 B';}return r;};
  api.spaces!.controlPlan=async(input:any)=>{qa.calls.push({action:'control',input});p.status='starting';p.attempts.push({id:'attempt-recovery',number:2,status:'starting'});w.attachRecovery=()=>{p.attempts.at(-1).runId='recovered';qa.emit();};qa.emit();return qa.snapshot.plans[0];};qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 const model=page.getByRole('button',{name:'选择模型',exact:true});await expect(model).toBeVisible();await expect(model).toBeEnabled();
 await expect(page.getByRole('button',{name:'添加内容',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'默认权限',exact:true})).toBeVisible();
 await model.click();await page.getByRole('option',{name:'模型 B 测试服务 A',exact:true}).click();
 await page.locator('.wf-node-conversation .conversation-page').evaluate(el=>{(window as any).oldConversation=el;});
 await page.getByRole('textbox',{name:'修改要求',exact:true}).fill('服务不可用，切换模型继续');await page.getByRole('button',{name:width===390?'核对后重试此任务':'提交修改要求',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='control')?.input.modelChoice)).toEqual({providerId:'provider-a',model:'模型 B'});
 await expect(page.locator('.wf-node-conversation .conversation-page')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).oldConversation.isConnected)).toBe(true);
 await page.evaluate(()=>(window as any).attachRecovery());
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseRecovery)).toBe('function');
 await expect(page.locator('.wf-node-conversation .conversation-page')).toBeVisible();await expect(model).toBeVisible();await expect(model).toBeDisabled();
 await expect(page.getByText('正在读取执行结果…',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).releaseRecovery());await expect(page.getByRole('button',{name:'停止',exact:true})).toBeVisible();await expect(model).toContainText('模型 B');
 const box=await model.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(900);
});
