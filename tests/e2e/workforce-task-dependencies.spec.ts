import {test,expect} from '@playwright/test';
// These regressions exercise the retained list view; graph behavior has its own suite.
test.beforeEach(async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('workforce.plan-views:space',JSON.stringify({launch:'list'})));});

for(const [width,english,dark] of [[1280,false,false],[390,false,true],[1280,true,true],[390,true,false]] as const)test(`task dependencies and responsive navigation ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:english?'Tasks':'任务',exact:true}).click();
 const rows=page.locator('.wf-work-item');
 const order=()=>rows.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('data-package-id')));
 const original=await order();expect(original).toEqual(['copy','bundle','testing']);
 await expect(page.locator('[data-package-id="copy"]')).toContainText(english?'No prerequisites; scheduled independently':'无前置任务，可独立调度');
 await expect(page.locator('[data-package-id="bundle"]')).toContainText(english?'Awaiting acceptance: 发布文案':'等待前置验收：发布文案');
 await page.locator('[data-package-id="bundle"]').click();
 const detail=page.getByRole('region',{name:english?'Task details and review':'任务详情与验收'});
 const basis=detail.getByRole('region',{name:english?'Scheduling basis':'调度依据'});
 await expect(basis).toContainText(english?'Scheduling requires acceptance of every prerequisite.':'全部前置任务验收通过后才可调度。');
 const dependency=basis.getByRole('button',{name:english?'发布文案 · Awaiting review':'发布文案 · 待验收',exact:true});
 await dependency.focus();await expect(dependency).toBeFocused();
 await dependency.press('Enter');await expect(detail.getByRole('heading',{name:'发布文案',exact:true})).toBeVisible();
 await detail.getByRole('button',{name:english?'Instructions and history':'任务说明与记录',exact:true}).click();
 await expect(basis).toContainText(english?'No prerequisites; scheduled independently.':'无前置任务，可独立调度。');
 const back=detail.getByRole('button',{name:english?'Back to tasks':'返回任务列表',exact:true});
 await expect(page.locator('.wf-task-list-column')).toBeHidden();await back.click();
 await expect(page.locator('[data-package-id="copy"]')).toBeFocused();
 // Status updates must not reorder tasks or change the selected task.
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].status='accepted';qa.emit();});
 await expect(page.locator('[data-package-id="bundle"]')).toContainText(english?'All prerequisites accepted':'前置任务已全部验收');
 expect(await order()).toEqual(original);
 await page.locator('[data-package-id="bundle"]').click();
 await expect(basis.getByRole('button',{name:english?'发布文案 · Accepted':'发布文案 · 已验收',exact:true})).toBeVisible();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].definition.title='接口契约、部署边界与多项目环境核验 '.repeat(6);qa.emit();});
 await expect(basis.getByRole('button')).toContainText('接口契约、部署边界与多项目环境核验 '.repeat(6).trim());
 await expect(detail.getByRole('heading',{name:'发布包整理',exact:true})).toBeVisible();
 await basis.scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(await basis.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/task-dependencies-${width}-${english}-${dark}.png`});
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['control','review','approve','savePlan'].includes(c.action)))).toEqual([]);
});

test('plan events identify the task whose status changed',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 const events=page.locator('.wf-plan-events');await events.getByText('最近事件与状态来源').click();
 await expect(events.locator('p')).toContainText('发布文案 · 待验收');
});
