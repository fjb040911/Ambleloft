import {test,expect} from '@playwright/test';

test('existing plans prioritize execution and hide independent creation entries',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await expect(page.locator('.wf-plan-worklist')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'AI 帮我整理任务',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'制定协作计划',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'去讨论并生成计划',exact:true})).toHaveCount(0);
});

test('empty tasks lead to discussion without starting a plan',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans=[];qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await expect(page.getByText('先讨论目标，再生成计划',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'去讨论并生成计划',exact:true}).click();
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['control','savePlan','start'].includes(c.action)))).toEqual([]);
});

test('multiple plans show one graph and remember the selected plan',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=structuredClone(qa.snapshot.plans[0]);p.id='second';p.name='后续优化';qa.snapshot.plans.push(p);qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 const select=page.getByRole('combobox',{name:'选择协作计划'});
 await expect(select.locator('option')).toHaveCount(2);await expect(select.locator('option').last()).toContainText('待处理 2');
 await select.selectOption('second');await expect(page.locator('.wf-plan-worklist')).toHaveCount(1);await expect(page.locator('#wf-plan-second')).toBeVisible();
 await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(select).toHaveValue('second');
 await page.locator('#wf-plan-second [data-package-id="bundle"]').click();await page.getByRole('button',{name:'返回流程图',exact:true}).click();await expect(select).toHaveValue('second');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans=qa.snapshot.plans.filter((p:any)=>p.id!=='second');qa.emit();});
 await expect(page.locator('#wf-plan-launch')).toBeVisible();await expect(select).toHaveCount(0);
});

test('related plans describe their source and open the selected graph',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;const discussion=qa.snapshot.requests.find((r:any)=>r.mode==='discussion');const p=structuredClone(qa.snapshot.plans[0]);p.id='discussion-plan';p.name='讨论生成计划';p.source={discussionId:discussion.id};qa.snapshot.plans.push(p);qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.getByRole('tab',{name:'本讨论的相关计划',exact:true}).click();
 const sidebar=page.getByRole('complementary',{name:'讨论上下文'});
 await expect(sidebar.getByRole('button',{name:'整理为任务',exact:true})).toHaveCount(0);
 const plan=sidebar.getByRole('button',{name:/讨论生成计划/});await expect(plan).toContainText('由本讨论生成');await expect(plan).toContainText('已验收');await plan.click();
 await expect(page.getByRole('tab',{name:'任务',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('combobox',{name:'选择协作计划'})).toHaveValue('discussion-plan');await expect(page.locator('#wf-plan-discussion-plan .wf-plan-graph')).toBeVisible();await expect(page.getByRole('region',{name:'任务详情与验收'})).toHaveCount(0);
});

test('single-node plan ignores legacy list preferences and returns to graph',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{sessionStorage.setItem('workforce.plan-views:space',JSON.stringify({launch:'list'}));const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages=qa.snapshot.plans[0].packages.slice(0,1);qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 await expect(page.locator('.wf-graph-node')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'列表',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'流程图',exact:true})).toHaveCount(0);
 await page.locator('.wf-graph-node').click();await page.getByRole('button',{name:'返回流程图',exact:true}).click();await expect(page.locator('.wf-graph-node')).toBeFocused();
 await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(page.locator('.wf-plan-graph')).toBeVisible();
});
