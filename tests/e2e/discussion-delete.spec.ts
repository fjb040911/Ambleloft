import {test,expect,type Page} from '@playwright/test';
async function enter(page:Page,english=false,dark=false){
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.evaluate(()=>{const q=(window as any).spaceQA;const original=q.snapshot.requests.find((r:any)=>r.id==='discussion');q.snapshot.requests.push({...structuredClone(original),id:'followup',replyTo:original.id,prompt:'确认使用测试数据',createdAt:'2026-10-27T09:00:00Z'});q.snapshot.plans[0].source={discussionId:'discussion',draftId:'draft',revision:1,confirmedAt:''};q.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
async function openDelete(page:Page,english=false){
 await page.getByRole('button',{name:english?'Discussion actions':'讨论操作',exact:true}).click();
 await page.getByRole('menuitem',{name:english?'Delete discussion…':'删除讨论…',exact:true}).click();
 return page.getByRole('alertdialog');
}
for(const [width,english,dark] of [[1280,false,false],[390,false,false],[1280,true,true],[390,true,true]] as const)test(`delete discussion confirmation and evidence ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:950});await enter(page,english,dark);
 const input=page.getByLabel(english?'What should we discuss?':'这次想推进什么？');await input.fill('尚未发送的目标');
 const dialog=await openDelete(page,english);await expect(dialog).toContainText(english?'source snapshots':'来源快照');
 const cancel=dialog.getByRole('button',{name:english?'Cancel':'取消',exact:true});await expect(cancel).toBeFocused();await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/discussion-delete-${width}-${english}-${dark}.png`,animations:'disabled'});
 await cancel.click();await expect(page.getByRole('heading',{name:'明确发布目标',exact:true})).toBeVisible();await expect(input).toHaveValue('尚未发送的目标');
 await openDelete(page,english);await dialog.getByRole('button',{name:english?'Delete discussion':'删除讨论',exact:true}).click();
 await expect(page.getByRole('heading',{name:english?'New discussion':'新讨论',exact:true})).toBeVisible();await expect(input).toHaveValue('尚未发送的目标');await expect(input).toBeFocused();
 const after=await page.evaluate(()=>{const q=(window as any).spaceQA;return {discussions:q.snapshot.requests.filter((r:any)=>r.mode==='discussion'),docs:q.snapshot.documents.length,plans:q.snapshot.plans.length,calls:q.calls.filter((c:any)=>c.action==='discussionLifecycle')};});
 expect(after.discussions).toHaveLength(0);expect(after.docs).toBe(1);expect(after.plans).toBe(1);expect(after.calls).toHaveLength(1);expect(after.calls[0].input.action).toBe('delete');
 await page.getByRole('tab',{name:english?'Tasks':'任务',exact:true}).click();await page.locator('.wf-work-item').first().click();
 await expect(page.getByRole('button',{name:english?'Return to source discussion':'返回来源讨论'})).toHaveCount(0);
 await expect(page.getByText(english?'The source discussion was deleted. This plan retains its source snapshot and execution evidence.':'来源讨论已删除；本计划的来源快照与执行证据仍保留。')).toBeVisible();
});
test('active work disables deletion and a failed delete preserves the discussion for retry',async({page})=>{
 await enter(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.find((r:any)=>r.id==='discussion').host={status:'running',steps:[],brief:null,revision:1,ruleVersion:'test'};q.emit();});
 await page.getByRole('button',{name:'讨论操作',exact:true}).click();await expect(page.getByRole('menuitem',{name:'请先停止讨论，再删除'})).toBeDisabled();await page.keyboard.press('Escape');
 await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.find((r:any)=>r.id==='discussion').host.status='interrupted';const api=window.desktop!.spaces!,original=api.discussionLifecycle;let first=true;api.discussionLifecycle=async input=>{if(first){first=false;throw Error('保存失败，请重试');}return original(input);};q.emit();});
 await openDelete(page);await page.getByRole('alertdialog').getByRole('button',{name:'删除讨论',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败，请重试');await expect(page.getByRole('heading',{name:'明确发布目标',exact:true})).toBeVisible();
 await openDelete(page);await page.getByRole('alertdialog').getByRole('button',{name:'删除讨论',exact:true}).click();await expect(page.getByRole('heading',{name:'新讨论',exact:true})).toBeVisible();
});
