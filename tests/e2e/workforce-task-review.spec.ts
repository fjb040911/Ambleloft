import {test,expect,type Page} from '@playwright/test';
async function openTask(page:Page){
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:/^(任务|Tasks)$/}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 return page.locator('.wf-task-review');
}
for(const [width,english,dark] of [[1280,false,false],[390,false,true],[1280,true,true],[390,true,false]] as const)test(`delivery review has two views and fixed actions ${width} ${english}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 const detail=await openTask(page);
 const tabs=detail.getByRole('tablist',{name:english?'Task views':'任务视图'});
 await expect(tabs.getByRole('tab')).toHaveCount(2);
 const review=tabs.getByRole('tab',{name:english?'Delivery review':'交付验收',exact:true});
 await expect(review).toHaveAttribute('aria-selected','true');
 await expect(detail.getByRole('button',{name:/^(检查交付并验收|Review delivery)$/})).toHaveCount(0);
 const accept=detail.getByRole('button',{name:english?'Accept delivery':'验收通过',exact:true});
 await expect(accept).toBeEnabled();
 const before=await accept.boundingBox();expect(before!.y+before!.height).toBeLessThanOrEqual(900);
 expect((await detail.locator('.wf-review-actions').boundingBox())!.height).toBeLessThanOrEqual(49);
 const context=detail.locator('.wf-task-context');await expect(context).not.toHaveAttribute('open','');
 await context.locator(':scope > summary').click();await expect(context).toHaveAttribute('open','');
 await expect(context.getByRole('region',{name:english?'Scheduling basis':'调度依据'})).toBeVisible();
 await detail.locator('.wf-task-detail').evaluate(el=>el.scrollTop=el.scrollHeight);
 expect(await accept.boundingBox()).toEqual(before);
 await context.locator(':scope > summary').click();
 await detail.locator('.wf-task-detail').evaluate(el=>el.scrollTop=0);
 expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/task-review-${width}-${english}.png`});
 await tabs.getByRole('tab',{name:english?'Conversation':'任务对话',exact:true}).click();
 await expect(detail.locator('.wf-node-conversation')).toBeVisible();
 // Status refresh must not steal the view from a user writing rework instructions.
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.emit();});
 await expect(tabs.getByRole('tab',{name:english?'Conversation':'任务对话',exact:true})).toHaveAttribute('aria-selected','true');
 await tabs.getByRole('tab',{name:english?'Conversation':'任务对话',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(review).toBeFocused();await page.keyboard.press('Enter');await expect(review).toHaveAttribute('aria-selected','true');await expect(accept).toBeEnabled();await accept.click();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='review'));
 expect(calls).toHaveLength(1);expect(calls[0].input).toMatchObject({packageId:'copy',attemptId:'attempt1',resultHash:'result-hash',accepted:true});
 await expect(detail).toContainText(english?'Delivery accepted':'验收已通过');
});
test('rejection preserves note and old info links open the disclosure',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('workforce.package:space',JSON.stringify({planId:'launch',packageId:'copy',detailTab:'info'})));
 await page.goto('/tests/manual/project-space-qa.html');
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
 const detail=page.locator('.wf-task-review');await expect(detail.locator('.wf-task-context')).toHaveAttribute('open','');
 const reject=detail.getByRole('button',{name:'未通过，保留原因',exact:true});await expect(reject).toBeDisabled();
 await detail.getByLabel('验收说明（未通过时必填）').fill('补充链接验证证据');
 await reject.click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='review').input)).toMatchObject({accepted:false,note:'补充链接验证证据',resultHash:'result-hash'});
});

test('historical evidence stays read-only for acceptance and latest restores review',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0].packages[0];p.attempts.unshift({...p.attempts[0],id:'old-attempt',number:0,runId:'older'});const original=window.desktop!.getRunPage!;window.desktop!.getRunPage=async input=>({...await original({id:'evidence'}),id:input.id});qa.emit();});
 const detail=await openTask(page);await detail.locator('.wf-task-context > summary').click();
 await detail.getByText('执行记录 · 2',{exact:true}).click();
 await detail.getByRole('button',{name:'查看证据',exact:true}).first().click();
 await expect(detail).toContainText('正在查看历史执行');
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeDisabled();
 await detail.getByRole('button',{name:'返回本次执行',exact:true}).click();
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeEnabled();
});
