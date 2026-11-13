import {test,expect} from '@playwright/test';
test('plan surface handles two approval requests without opening nodes',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,api=window.desktop!,original=api.getRunPage!.bind(api);for(const [i,p] of qa.snapshot.plans[0].packages.slice(0,2).entries()){p.status='waiting';p.attempts=[{id:'a'+i,number:1,runId:'wait'+i,status:'waiting'}];}api.getRunPage=async input=>({...await original({id:'evidence'}),id:input.id,status:'waiting',approvals:[{id:'approval-'+input.id,method:'commandExecution',detail:JSON.stringify({command:'pwd',cwd:'/example',reason:'核对工作目录'})}]});api.approveRun=async input=>{qa.calls.push({action:'approve',input});};qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 const panel=page.getByRole('region',{name:'计划控制与待处理'});await expect(panel.getByRole('button',{name:'查看并处理',exact:true})).toHaveCount(2);
 await panel.getByRole('button',{name:'查看并处理',exact:true}).first().click();await panel.getByRole('region',{name:'处理任务请求',exact:true}).filter({has:page.getByRole('button',{name:'批准本次',exact:true})}).getByRole('button',{name:'批准本次',exact:true}).click();await panel.getByRole('button',{name:'收起请求',exact:true}).click();await panel.getByRole('button',{name:'查看并处理',exact:true}).last().click();await panel.getByRole('region',{name:'处理任务请求',exact:true}).filter({has:page.getByRole('button',{name:'批准本次',exact:true})}).getByRole('button',{name:'批准本次',exact:true}).click();await panel.getByRole('button',{name:'收起请求',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='approve').map((c:any)=>c.input.runId))).toEqual(['wait0','wait1']);
 await expect(page.locator('.wf-task-review')).toHaveCount(0);await page.screenshot({path:'/tmp/plan-control-center.png'});
});
test('plan permission changes have explicit scope and pause-interrupted node can continue plan',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].status='paused';qa.snapshot.plans[0].packages[0].status='interrupted';qa.snapshot.plans[0].packages[0].stopReason='plan-pause';qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.getByRole('combobox',{name:'计划授权模式'}).selectOption('full');await expect(page.getByRole('alertdialog')).toContainText('确认新权限后继续');await page.getByRole('button',{name:'应用计划授权',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();await page.getByRole('button',{name:'继续计划',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'));expect(calls[0].input).toMatchObject({action:'permission',permission:'full'});expect(calls[0].input.packageId).toBeUndefined();expect(calls[1].input.action).toBe('resume');
});

test('running node shows permission receipt and preserves the selected task',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,plan=qa.snapshot.plans[0],p=plan.packages.find((p:any)=>p.id==='copy');plan.status='running';p.status='running';
 window.desktop!.spaces!.controlPlan=async input=>{qa.calls.push({action:'control',input});p.permission=input.permission;p.permissionChange={id:'switch',requested:input.permission,previous:'default',state:'switching',effective:null,startedAt:new Date().toISOString()};qa.emit();await new Promise<void>(resolve=>{qa.finishPermission=()=>{p.permissionChange.state='applied';p.permissionChange.effective=input.permission;qa.emit();resolve();};});return plan;};qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 await page.getByRole('combobox',{name:'节点授权模式'}).selectOption('full');
 await expect(page.getByRole('alertdialog')).toContainText('此节点及其子 Agent');await page.getByRole('button',{name:'更改授权模式',exact:true}).click();
 await expect(page.getByText(/权限切换中，尚未确认生效/)).toBeVisible();
 await page.evaluate(()=>(window as any).spaceQA.finishPermission());await expect(page.getByText(/完全访问 · 权限已生效/)).toBeVisible();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='control').input)).toMatchObject({packageId:'copy',permission:'full',confirmed:true});
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0].packages.find((p:any)=>p.id==='copy');p.permissionChange.state='failed';p.permissionChange.effective=null;p.permissionChange.error='引擎未确认';qa.emit();});await expect(page.getByRole('alert').filter({hasText:'权限切换失败'})).toContainText('引擎未确认');
});
