import {test,expect} from '@playwright/test';
test('document actions expose execution references without a review workflow',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'文档与产物',exact:true}).click();
 await expect(page.getByText('引用任务 · 2')).toBeVisible();await page.getByRole('button',{name:'查看文档',exact:true}).last().click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'提交审核',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'编辑文档',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'设为执行依据',exact:true})).toBeVisible();
});
test('plan confirmation displays changed reference impact and sends explicit confirmation only after consent',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const old=window.desktop!.spaces!.guideTask;window.desktop!.spaces!.guideTask=async input=>{const d:any=await old(input),qa=(window as any).spaceQA,doc=qa.snapshot.documents[0];d.status='ready';d.assessment.ready=true;d.assessment.question=null;d.sourceDocuments=[{id:doc.id,title:doc.title,revision:doc.revision,hash:doc.hash,body:'basis'}];Object.assign(d.value.packages[0],{mode:'work',projectId:'project',documentRefs:[{id:doc.id,revision:doc.revision,hash:doc.hash}]});Object.assign(qa.snapshot.taskDrafts[0],d);return d;};});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.evaluate(()=>{const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');r.host={status:'ready',revision:1,steps:[],brief:{goal:'核对发布',items:[]}};q.emit();});await page.getByRole('button',{name:'整理为任务',exact:true}).click();
 const guide=page.getByRole('region',{name:'整理为任务'});await expect(guide.getByRole('region',{name:'本计划的执行依据'})).toContainText('发布方案');await guide.getByRole('button',{name:'确认并保存计划'}).click();
 const confirm=page.getByRole('alertdialog');await expect(confirm).toContainText('更换依据会使以下任务');await expect(confirm).toContainText('发布文案');await confirm.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='createGuidedPlan'))).toHaveLength(0);
 await guide.getByRole('button',{name:'确认并保存计划'}).click();await confirm.getByRole('button',{name:'确认依据并创建计划'}).click();await expect(guide).toBeHidden();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.find((c:any)=>c.action==='createGuidedPlan').input.basisConfirmation.documents[0]).toMatchObject({id:'basis',revision:2,expectedAdoptedRevision:1});expect(calls.filter((c:any)=>c.action==='control')).toHaveLength(0);
});
