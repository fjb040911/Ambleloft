import {test,expect} from '@playwright/test';
for(const width of [1280,390])test(`node messages scroll while composer stays visible ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const api=window.desktop!,original=api.getRunPage!.bind(api);api.getRunPage=async input=>{const run=await original(input);for(const message of run.messages)if(message.role==='assistant')message.text=Array.from({length:100},(_,i)=>`结果段落 ${i}：这是用于核对滚动和输入区位置的任务输出。`).join('\n\n');return run;};});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await page.getByRole('tab',{name:'任务对话',exact:true}).click();
 const input=page.getByRole('textbox',{name:'修改要求',exact:true});await expect(input).toBeVisible();
 const scroll=page.locator('.wf-node-conversation .conversation-scroll');
 await expect.poll(()=>scroll.evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight>0)).toBeTruthy();
 const before=await input.boundingBox();expect(before!.y+before!.height).toBeLessThanOrEqual(900);
 await scroll.evaluate(el=>{el.scrollTop=0;});await scroll.hover();await page.mouse.wheel(0,450);
 await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 const after=await input.boundingBox();expect(Math.abs(after!.y-before!.y)).toBeLessThan(2);
 // Wheel over chrome or at a message boundary must not move/resize the workspace.
 const review=page.locator('.wf-task-review');const bounds=await review.boundingBox();
 await review.locator('h2').hover();await page.mouse.wheel(0,500);
 await page.waitForTimeout(150);
 expect(await review.boundingBox()).toEqual(bounds);
 await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});await scroll.hover();await page.mouse.wheel(0,600);
 await page.waitForTimeout(150);expect(await review.boundingBox()).toEqual(bounds);
 await scroll.evaluate(el=>{el.scrollTop=0;});await page.mouse.wheel(0,-600);
 await page.waitForTimeout(150);expect(await review.boundingBox()).toEqual(bounds);
 await input.fill('补充说明');await expect(input).toHaveValue('补充说明');
 const group=input.locator('xpath=..');await input.focus();
 // No keyboard-help row or page footer should consume the message viewport.
 const groupBox=await group.boundingBox();
 expect(900-groupBox!.y-groupBox!.height).toBeLessThanOrEqual(16);
 expect(await input.evaluate(el=>{const hint=document.getElementById(el.getAttribute('aria-describedby')!);return hint?.getBoundingClientRect().height;})).toBeLessThanOrEqual(1);

 await expect.poll(()=>group.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 3px');
 // The outer focus ring must fit every clipping ancestor, including the dock.
 const clipped=await group.evaluate(el=>{const box=el.getBoundingClientRect();const failures:string[]=[];for(let parent=el.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(!['hidden','auto','scroll','clip'].includes(style.overflowX))continue;const rect=parent.getBoundingClientRect();if(box.left-3<rect.left+parent.clientLeft-0.5||box.right+3>rect.left+parent.clientLeft+parent.clientWidth+0.5)failures.push(parent.className);}return failures;});
 expect(clipped).toEqual([]);

 await page.screenshot({path:`/tmp/node-scroll-fixed-${width}.png`});
 await page.getByRole('tab',{name:'交付验收',exact:true}).click();
 const detail=page.locator('.wf-task-detail');await expect.poll(()=>detail.evaluate(el=>el.scrollHeight>el.clientHeight)).toBeTruthy();
 await detail.evaluate(el=>{el.scrollTop=200;});await expect.poll(()=>detail.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'概览',exact:true}).click();await expect(page.locator('.qa-scroll')).toHaveCSS('overflow-y','auto');
 await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(page.locator('.qa-scroll')).toHaveCSS('overflow-y','hidden');
 await page.getByRole('button',{name:'返回流程图',exact:true}).click();await expect(page.locator('.wf-graph-canvas')).toBeVisible();
 await page.getByRole('tab',{name:'概览',exact:true}).click();await expect(page.locator('.wf-task-review')).toBeHidden();
});
test('interrupted node supports explicit retry and plan continuation',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].status='paused';qa.snapshot.plans[0].packages[0].status='interrupted';qa.emit();const api=window.desktop!,original=api.getRunPage!.bind(api);api.getRunPage=async input=>({...await original(input),status:'interrupted'});});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await expect(page.locator('.wf-node-conversation .conversation-dock')).toBeVisible();
 await expect(page.getByText('计划未运行。重试时可确认继续整个计划；其他符合条件的任务也会开始。')).toBeVisible();
 await page.getByRole('button',{name:'重试并继续计划',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'重试并继续计划',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'));
 expect(calls).toHaveLength(1);expect(calls[0].input.action).toBe('retry');
});
for(const width of [1280,390])test(`old host permission error does not displace composer ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{window.desktop!.spaces!.controlPlan=async()=>{throw Error("Error invoking remote method 'spaces:controlPlan': Error: 不支持的控制操作");};});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await page.getByRole('tab',{name:'任务对话',exact:true}).click();
 const input=page.getByRole('textbox',{name:'修改要求',exact:true});const before=await input.boundingBox();
 await page.getByRole('combobox',{name:'节点授权模式'}).selectOption('full');await page.getByRole('button',{name:'更改授权模式',exact:true}).click();
 await expect(page.getByText(/当前桌面主进程尚不支持更改授权模式/)).toHaveCount(1);
 await expect(page.getByRole('combobox',{name:'节点授权模式'})).toHaveValue('inherit');await expect(page.getByRole('combobox',{name:'节点授权模式'})).toBeDisabled();
 const after=await input.boundingBox();expect(after!.y+after!.height).toBeLessThanOrEqual(900);expect(Math.abs(after!.y-before!.y)).toBeLessThan(2);
 await page.screenshot({path:`/tmp/node-error-${width}.png`});
});
