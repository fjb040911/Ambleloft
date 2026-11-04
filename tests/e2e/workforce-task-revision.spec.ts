import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,api=window.desktop!.spaces!;
  api.controlPlan=async(input:any)=>{qa.calls.push({action:'control',input});if((window as any).__pauseFailure)throw Error('暂停失败');qa.snapshot.plans[0].status='paused';qa.emit();return structuredClone(qa.snapshot.plans[0]);};
  api.savePlan=async(input:any)=>{qa.calls.push({action:'savePlan',input});if((window as any).__saveFailure)throw Error('版本冲突');const p=qa.snapshot.plans[0];p.name=input.value.name;p.goal=input.value.goal;p.revision++;p.status='draft';p.packages=input.value.packages.map((definition:any)=>({...p.packages.find((n:any)=>n.id===definition.id),id:definition.id,definition}));qa.emit();return structuredClone(p);};
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="bundle"]').click();
 await page.getByRole('button',{name:'修订任务',exact:true}).click();
 return page.getByRole('dialog');
}
test('node revision replaces instructions and pauses only on explicit save, without restarting',async({page})=>{
 const dialog=await setup(page);
 await expect(dialog).toContainText('编辑草稿不会影响执行');
 await expect(dialog.getByRole('textbox',{name:'任务内容',exact:true})).toBeFocused();
 await dialog.getByRole('textbox',{name:'任务内容',exact:true}).fill('将 client 部署到云端，并通过公网对接真实 API');
 await dialog.getByRole('textbox',{name:'约束与非目标（可选）',exact:true}).fill('仅使用虚构数据，保留既有服务');
 await dialog.getByRole('button',{name:'上一步',exact:true}).click();
 await dialog.getByRole('textbox',{name:'共同目标',exact:true}).fill('交付公网可访问的前端与 API');
 await dialog.getByRole('button',{name:'继续分配工作',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls)).toEqual([]);
 await page.screenshot({path:'/tmp/task-revision-editor.png'});
 await dialog.getByRole('button',{name:'检查计划',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'确认并启动',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'暂停计划并保存修订',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);
 expect(calls.map((c:any)=>c.action)).toEqual(['control','savePlan']);expect(calls[0].input.action).toBe('pause');
 const value=calls[1].input.value;expect(value.goal).toBe('交付公网可访问的前端与 API');expect(value.packages.find((p:any)=>p.id==='bundle').instruction).toBe('将 client 部署到云端，并通过公网对接真实 API');expect(value.packages.find((p:any)=>p.id==='copy').instruction).toBe('根据已采纳的发布方案完成任务，并提供验证证据。');
 await expect(page.getByRole('region',{name:'任务详情与验收',exact:true})).toContainText('将 client 部署到云端');
});
for(const failure of ['pause','save'])test(`${failure} failure retains the revision draft and never starts execution`,async({page})=>{
 const dialog=await setup(page);await dialog.getByRole('textbox',{name:'任务内容',exact:true}).fill('新的正式任务定义');
 await page.evaluate(f=>{(window as any)[f==='pause'?'__pauseFailure':'__saveFailure']=true;},failure);
 await dialog.getByRole('button',{name:'检查计划',exact:true}).click();await dialog.getByRole('button',{name:'暂停计划并保存修订',exact:true}).click();
 await expect(dialog).toContainText(failure==='pause'?'暂停失败':'计划已暂停，但修订尚未保存；草稿已保留。');
 await dialog.getByRole('button',{name:'上一步',exact:true}).click();await expect(dialog.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('新的正式任务定义');
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.map((c:any)=>c.action)).toEqual(failure==='pause'?['control']:['control','savePlan']);
});
test('closing the editor retains its draft without pausing and works in a narrow viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});const dialog=await setup(page);
 await dialog.getByRole('textbox',{name:'任务内容',exact:true}).fill('保留但尚未生效的修订');
 const close=dialog.getByRole('button',{name:'保留草稿并关闭',exact:true});
 await expect(close).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
 await page.screenshot({path:'/tmp/task-revision-narrow.png'});
 await close.click();await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>(window as any).spaceQA.calls)).toEqual([]);
 await page.getByRole('button',{name:'修订任务',exact:true}).click();await expect(dialog.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('保留但尚未生效的修订');
});
