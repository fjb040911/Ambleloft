import {test,expect} from '@playwright/test';

test('graph assignments reuse relationships, batch unassigned nodes and check without regeneration',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/manual/project-relations-qa.html');
 const planner=page.getByRole('region',{name:'确认项目与关系',exact:true});
 await expect(planner.locator('.wf-graph-node')).toHaveCount(2);
 await expect(planner.locator('.wf-graph-node').first()).toContainText('待关联项目');
 await planner.locator('[data-package-id="client"]').click();
 await planner.getByRole('combobox',{name:'主执行项目',exact:true}).selectOption('web');
 await expect(planner.getByRole('textbox',{name:'主项目职责',exact:true})).toHaveValue('Web client');
 await expect(planner.getByRole('textbox',{name:'交接约定',exact:true})).toHaveValue('Use /v1; verify connectivity at execution');
 await planner.getByRole('checkbox').check();await planner.getByRole('button',{name:'确认此项目配置',exact:true}).click();
 await expect(planner.locator('.wf-graph-node').last()).toContainText('项目配置已确认');
 await planner.getByRole('button',{name:'保存到空间供复用',exact:true}).click();
 await expect(planner.getByText('已保存到空间，后续任务可复用。当前计划保留自己的快照。')).toBeVisible();
 await page.getByRole('button',{name:'检查并保存草稿',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).relationQA.getDraft().value.packages.every((p:any)=>p.projectId==='web'&&p.projectBinding.confirmed))).toBe(true);
 await page.getByRole('button',{name:'确认并启动',exact:true}).click();await expect(page.getByRole('heading',{name:'Plan created'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).relationQA.calls.map((c:any)=>c.action))).toEqual(['context','saveDraft','check','create','start']);expect(errors).toEqual([]);
});

test('editing confirmed configuration invalidates confirmation; validation remains inline',async({page})=>{
 await page.goto('/tests/manual/project-relations-qa.html');const planner=page.getByRole('region',{name:'确认项目与关系',exact:true});
 await planner.getByRole('combobox',{name:'主执行项目',exact:true}).selectOption('web');
 await planner.getByRole('button',{name:'确认此项目配置',exact:true}).click();
 await planner.getByRole('textbox',{name:'主项目职责',exact:true}).fill('Revised client scope');
 await expect(planner.locator('[data-package-id="client"]')).toContainText('待确认项目关系');
 await planner.getByRole('textbox',{name:'交接约定',exact:true}).fill('');await planner.getByRole('button',{name:'确认此项目配置',exact:true}).click();
 await expect(planner.getByRole('alert')).toContainText('补全');await expect(page.getByRole('dialog')).toHaveCount(0);
 await planner.getByRole('textbox',{name:'交接约定',exact:true}).fill('Verify /v2');await planner.getByRole('button',{name:'确认此项目配置',exact:true}).click();
 await expect(planner.locator('[data-package-id="client"]')).toContainText('项目配置已确认');
 await planner.getByRole('region',{name:'节点项目配置',exact:true}).screenshot({path:'/tmp/project-relations-ui.png'});
});

test('space project responsibilities are editable and persist after reopening',async({page})=>{
 await page.goto('/tests/manual/project-relations-qa.html?space');
 await page.getByRole('combobox',{name:'配置项目',exact:true}).selectOption('web');await page.getByRole('textbox',{name:'主项目职责',exact:true}).fill('Web and accessibility');
 await page.getByRole('button',{name:'保存项目职责与关系',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).relationQA.calls.length)).toBe(1);
 await page.getByRole('combobox',{name:'配置项目',exact:true}).selectOption('api');await page.getByRole('combobox',{name:'配置项目',exact:true}).selectOption('web');
 await expect(page.getByRole('textbox',{name:'主项目职责',exact:true})).toHaveValue('Web and accessibility');
});

test('English dark narrow layout supports keyboard editing without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:560,height:850});await page.goto('/tests/manual/project-relations-qa.html?en&dark');
 await page.getByRole('combobox',{name:'Edit node',exact:true}).selectOption('checks');
 await page.getByRole('combobox',{name:'Main execution project',exact:true}).selectOption('web');
 await page.getByRole('textbox',{name:'Execution project responsibility',exact:true}).focus();await page.keyboard.press('Tab');
 await expect(page.getByRole('combobox',{name:'Related project',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Confirm project configuration',exact:true}).click();
 await expect(page.locator('[data-package-id="checks"]')).toContainText('Project confirmed');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('changing an upstream execution project invalidates the dependent node confirmation',async({page})=>{
 await page.goto('/tests/manual/project-relations-qa.html?en&dependent');const planner=page.getByRole('region',{name:'Confirm projects and relationships',exact:true});
 await expect(planner.locator('[data-package-id="checks"]')).toContainText('Project confirmed');
 await planner.getByRole('combobox',{name:'Main execution project',exact:true}).selectOption('api');
 await expect(planner.locator('[data-package-id="checks"]')).toContainText('Confirm project relationships');
 await planner.getByRole('combobox',{name:'Edit node',exact:true}).selectOption('checks');await planner.getByRole('button',{name:'Confirm project configuration',exact:true}).click();
 await expect(planner.locator('[data-package-id="checks"]')).toContainText('Project confirmed');
});

test('guided relationships preserve answers across nodes and failures, then remove completed prompts',async({page})=>{
 await page.goto('/tests/manual/project-relations-qa.html?en&guided');
 const guide=page.getByRole('region',{name:'Complete project relationships',exact:true});
 await expect(guide.getByRole('combobox',{name:'Execution project'})).toHaveValue('web');
 const role=guide.getByRole('textbox',{name:'Project responsibility'});
 await role.fill('Web accessibility');await guide.getByRole('combobox',{name:'Select unresolved task'}).selectOption('checks');
 await expect(role).toHaveValue('Web client');await guide.getByRole('combobox',{name:'Select unresolved task'}).selectOption('client');await expect(role).toHaveValue('Web accessibility');
 await page.reload();await expect(role).toHaveValue('Web accessibility');
 await role.fill('simulate failure');await guide.getByRole('button',{name:'Confirm and reuse in future workflows',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Temporary save failure');await expect(role).toHaveValue('simulate failure');
 await role.fill('Web accessibility');await guide.getByRole('button',{name:'Confirm and reuse in future workflows',exact:true}).click();await expect(guide.getByRole('heading',{name:'Verify client',exact:true})).toBeVisible();
 await guide.getByRole('button',{name:'Confirm and reuse in future workflows',exact:true}).click();await expect(guide).toHaveCount(0);await expect(page.getByRole('button',{name:'Confirm and start',exact:true})).toBeVisible();
});

test('relation refinement keeps chat input and uses targeted API; form fits narrow dark layout',async({page})=>{
 await page.setViewportSize({width:560,height:900});await page.goto('/tests/manual/project-relations-qa.html?en&dark&guided');
 const guide=page.getByRole('region',{name:'Complete project relationships',exact:true});
 await guide.getByRole('combobox',{name:'Collaboration',exact:true}).selectOption('related');await expect(guide.getByRole('button',{name:'Confirm and reuse in future workflows',exact:true})).toBeDisabled();
 await guide.getByRole('textbox',{name:/^Handoff agreement/}).fill('Consume API response contract');
 await page.getByRole('textbox',{name:'Additional task requirements',exact:true}).fill('Keep this unsent requirement');
 await guide.getByText('Need a different suggestion? Ask AI to refine', {exact:true}).click();await guide.getByRole('textbox',{name:'Clarify project relationships',exact:true}).fill('API should execute remotely');
 await guide.getByRole('button',{name:'Refine relationships only · keep task content',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).relationQA.calls.find((c:any)=>c.action==='refine')?.input.phase)).toBe('relations');
 await expect(page.getByRole('textbox',{name:'Additional task requirements',exact:true})).toHaveValue('Keep this unsent requirement');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await guide.screenshot({path:'/tmp/project-relation-guide-dark.png'});
});
