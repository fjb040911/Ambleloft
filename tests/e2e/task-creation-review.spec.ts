import {test,expect} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
async function enter(page:import('@playwright/test').Page,query=''){
 await page.goto(fixture+query);
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[];r.host={status:'ready',revision:1,steps:[{id:'ready',action:'ready',at:'',text:'范围已明确，请整理为任务。'}],brief:{goal:'检查发布链接',items:[]}};qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
}
async function openGuide(page:import('@playwright/test').Page){
 await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.getByRole('region',{name:'本次任务',exact:true}).getByRole('button',{name:/^(整理为任务|继续完善|查看并确认)$/}).click();
 return page.getByRole('region',{name:'整理为任务'});
}
async function clarify(page:import('@playwright/test').Page,text:string){
 const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByLabel('需要检查哪些链接？').fill(text);
 await guide.getByRole('button',{name:'提交补充并检查'}).click();
}
test('discussion to task: missing information, form answers, confirmation, then explicit start',async({page})=>{
 await enter(page);const guide=await openGuide(page);
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();
 await expect(guide.getByText('明确本次检查的范围')).toBeVisible();await guide.getByLabel('需要检查哪些链接？').fill('只检查新版发布页的三个链接');
 await guide.getByRole('button',{name:'提交补充并检查'}).click();await expect(guide.getByText('待确认',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.some((c:any)=>['control','createGuidedPlan'].includes(c.action)))).toBeFalsy();
 await guide.getByRole('button',{name:'确认并启动'}).click();await expect(guide).toBeHidden();await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.filter((c:any)=>c.action==='createGuidedPlan')).toHaveLength(1);expect(calls.filter((c:any)=>c.action==='control')[0].input.action).toBe('start');await page.locator('.wf-graph-node[data-package-id="verify"]').click();await expect(page.getByRole('region',{name:'任务详情与验收'})).toContainText('检查发布链接');await page.getByRole('button',{name:'返回讨论',exact:true}).click();await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
});
test('task drafts can resume; edited candidates require rechecking; save never starts',async({page})=>{
 await enter(page);await openGuide(page);
 let guide=page.getByRole('region',{name:'整理为任务'});await clarify(page,'请检查发布页的三个链接');
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();await guide.getByRole('button',{name:'编辑计划',exact:true}).click();await guide.getByLabel('共同目标').fill('检查发布页与帮助页');
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();await page.getByRole('button',{name:'收起任务配置',exact:true}).click();
 await openGuide(page);guide=page.getByRole('region',{name:'整理为任务'});await guide.getByRole('button',{name:'编辑计划',exact:true}).click();await expect(guide.getByLabel('共同目标')).toHaveValue('检查发布页与帮助页');
 await guide.getByRole('button',{name:'重新检查任务信息'}).click();await clarify(page,'两个页面所有链接均返回 200 即可');await expect(guide.getByRole('button',{name:'确认并保存计划'})).toBeEnabled();await guide.getByRole('button',{name:'确认并保存计划'}).click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toHaveLength(0);
});
test('delivery and evidence stay in space; rejection requires a reason; acceptance keeps detail',async({page})=>{
 await enter(page);await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();const detail=page.getByRole('region',{name:'任务详情与验收'});
 await expect(detail).toContainText('实际交付：发布文案已完成');await expect(detail.getByRole('button',{name:'未通过，保留原因'})).toBeDisabled();
 await detail.getByText('执行过程与工具证据',{exact:true}).click();await expect(detail.locator('.discussion-expert-transcript')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await detail.getByRole('button',{name:'验收通过',exact:true}).click();await expect(detail).toBeVisible();await expect(detail).toContainText('发布包整理');await expect(detail).toContainText('等待调度');await expect(page.getByRole('tab',{name:'任务',exact:true})).toHaveAttribute('aria-selected','true');
});
for(const width of [1280,390])test('task review layout remains usable at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page,width===390?'?theme=dark':'');await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();
 const detail=page.getByRole('region',{name:'任务详情与验收'});await expect(detail).toContainText('实际交付：');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await detail.getByRole('button',{name:'验收通过',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/task-review-'+width+'.png'});
 const back=detail.getByRole('button',{name:'返回流程图',exact:true});
 await back.click();const node=page.locator('.wf-graph-node[data-package-id="copy"]');
 await expect(node).toBeVisible();await expect(node).toBeFocused();
 await node.press('Enter');await expect(detail).toContainText('实际交付：');
});
test('closing a slow guide cancels the request and preserves answers for retry',async({page})=>{
 await enter(page);const guide=await openGuide(page);
 await guide.getByLabel('需要检查哪些链接？').fill('请先确认任务范围');
 await page.evaluate(()=>{
  const api=window.desktop!.spaces!,qa=(window as any).spaceQA,original=api.guideTask;let rejectJob:(error:Error)=>void;
  api.guideTask=async input=>{qa.calls.push({action:'slowGuideTask',input});return new Promise((_,reject)=>{rejectJob=reject;});};
  api.cancelTaskGuide=async input=>{qa.calls.push({action:'cancelTaskGuide',input});api.guideTask=original;rejectJob(Error('整理已停止，已保留草稿'));return {};};
 });
 await guide.getByRole('button',{name:'提交补充并检查'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='slowGuideTask').length)).toBe(1);
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await expect(guide).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='cancelTaskGuide').length)).toBe(1);
 await openGuide(page);await expect(guide.getByLabel('需要检查哪些链接？')).toHaveValue('请先确认任务范围');
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();
 await guide.getByRole('button',{name:'提交补充并检查'}).click();await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toHaveLength(0);
});
test('start failure keeps the created plan; retry does not create it twice',async({page})=>{
 await enter(page);await page.evaluate(()=>{const qa=(window as any).spaceQA;window.desktop!.spaces!.controlPlan=async input=>{qa.calls.push({action:'control',input});if(qa.calls.filter((c:any)=>c.action==='control').length===1)throw Error('模型暂不可用');return qa.snapshot.plans.find((p:any)=>p.id===input.id);};});
 await openGuide(page);const guide=page.getByRole('region',{name:'整理为任务'});
 await clarify(page,'核对链接');await guide.getByRole('button',{name:'确认并启动'}).click();
 await expect(guide).toContainText('计划已保存；启动未完成');await guide.getByRole('button',{name:'重试启动'}).click();await expect(guide).toBeHidden();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='createGuidedPlan'))).toHaveLength(1);
});
test('missing execution evidence cannot be accepted; loading can retry in place',async({page})=>{
 await enter(page);await page.evaluate(()=>{const old=window.desktop!.getRunPage!;let fail=true;window.desktop!.getRunPage=async input=>{if(fail){fail=false;throw Error('证据读取失败');}return old(input);};});
 await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();const detail=page.getByRole('region',{name:'任务详情与验收'});
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeDisabled();await detail.getByRole('button',{name:'重新读取证据'}).click();await expect(detail).toContainText('实际交付：');await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeEnabled();
});
test('task guide form and footer fit a narrow window and preserve unsent input',async({page})=>{
 await page.setViewportSize({width:390,height:840});await enter(page,'?theme=dark');await openGuide(page);
 let guide=page.getByRole('region',{name:'整理为任务'});await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();
 await page.getByLabel('这次想推进什么？',{exact:true}).fill('还没发送的约束');expect(await guide.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await page.screenshot({path:'/tmp/task-guide-390-dark.png'});
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await openGuide(page);guide=page.getByRole('region',{name:'整理为任务'});await expect(page.getByLabel('这次想推进什么？',{exact:true})).toHaveValue('还没发送的约束');
});
