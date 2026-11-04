import {test,expect} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
async function enter(page:any){await page.goto(fixture);await page.getByRole('button',{name:/产品发布 准备新版/}).click();}
test('overview is actionable and does not duplicate plan requests',async({page})=>{
 await enter(page);await expect(page.getByRole('heading',{name:/需要你处理\s*2/})).toBeVisible();
 await expect(page.locator('.wf-action-row')).toHaveCount(2);await expect(page.locator('.wf-overview-plan')).toContainText('已验收 0 / 3');await expect(page.locator('.wf-overview-plan')).toContainText('等待验收：发布文案');
 await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();const sheet=page.getByRole('region',{name:'任务详情与验收'});await expect(sheet).toBeVisible();await expect(sheet).toContainText('发布包整理');
 await expect(sheet.getByRole('button',{name:'验收通过'})).toBeEnabled();await sheet.getByLabel('验收说明（未通过时必填）').fill('已核对文案、链接和验证记录。');await sheet.getByRole('button',{name:'验收通过'}).click();await expect(sheet).toBeVisible();await expect(sheet).toContainText('已记录验收');await page.getByRole('tab',{name:'概览',exact:true}).click();await expect(page.locator('.wf-action-row')).toHaveCount(1);await expect(page.locator('.wf-overview-plan')).toContainText('已验收 1 / 3');
});
test('source task roundtrip keeps review and note, and tabs survive returning to space',async({page})=>{
 await enter(page);await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();await page.getByLabel('验收说明（未通过时必填）').fill('正在核对证据');await page.getByRole('button',{name:'查看完整任务与证据'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'返回项目空间'}).click();await expect(page.getByLabel('验收说明（未通过时必填）')).toHaveValue('正在核对证据');await page.keyboard.press('Escape');await page.getByRole('tab',{name:'团队与项目'}).click();await page.getByRole('button',{name:'项目空间',exact:true}).click();await page.getByRole('button',{name:/产品发布 准备新版/}).click();await expect(page.getByRole('tab',{name:'团队与项目'})).toHaveAttribute('aria-selected','true');
});
test('documents distinguish draft/adoption and show real dependency impact before adopting',async({page})=>{
 await enter(page);await page.locator('.wf-basis-list button').click();await expect(page.getByRole('dialog')).toContainText('当前采纳：v1');await page.getByRole('button',{name:'对照当前采纳版'}).click();await expect(page.locator('.wf-document-comparison')).toContainText('已采纳方案');await expect(page.locator('.wf-document-comparison')).toContainText('新版方案草稿');await page.getByRole('button',{name:'采纳此版本',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('发布包整理（下游依赖）');expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='adopt'))).toHaveLength(0);await page.getByRole('button',{name:'确认采纳此版本'}).click();expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='adopt'))).toHaveLength(1);await expect(page.getByRole('dialog')).toContainText('当前采纳：v2');await page.getByRole('button',{name:'以此制定计划'}).click();await page.getByLabel('计划名称').fill('新发布计划');await page.getByRole('button',{name:'继续分配工作'}).click();await page.getByRole('button',{name:'添加工作包',exact:true}).click();await expect(page.locator('.wf-package-editor[open]')).toContainText('发布方案 · v2');
});
test('discussion failure keeps input and explicit participants',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.getByLabel('这次想推进什么？').fill('讨论新版发布目标');await page.getByRole('button',{name:'本条发送给',exact:true}).click();await page.getByRole('dialog',{name:'本条消息的接收者'}).getByRole('checkbox').first().check();await page.keyboard.press('Escape');await page.getByRole('button',{name:'发起讨论',exact:true}).click();await expect(page.getByRole('alert')).toContainText('测试网络失败');await expect(page.getByLabel('这次想推进什么？')).toHaveValue('讨论新版发布目标');
});
test('discussion composer selects mentioned experts in a narrow window',async({page})=>{
 await page.setViewportSize({width:390,height:800});await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.getByLabel('这次想推进什么？').fill('请 @文案');await page.getByRole('option',{name:/文案员工/}).click();
 await expect(page.getByRole('button',{name:'本条发送给',exact:true})).toContainText('文案员工');
 await expect(page.getByRole('button',{name:'发起讨论',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('.wf-discussion-composer').screenshot({path:'/tmp/workforce-discussion-composer.png'});
});
test('removed expert association is visible, can be unlinked, and does not block member edits',async({page})=>{
 await enter(page);
 await page.evaluate(async()=>{const qa=(window as any).spaceQA,space=qa.snapshot.spaces.find((s:any)=>s.id==='space');space.members.push({employeeId:'removed',assignment:'Old assignment',projectIds:['project']});(window.desktop!.spaces as any).save=async(input:any)=>{qa.calls.push({action:'saveSpace',input});Object.assign(space,input.value,{revision:space.revision+1});return structuredClone(space);};await window.desktop!.spaces!.lifecycle({id:'empty',action:'archive'});});
 await page.getByRole('tab',{name:'团队与项目'}).click();
 await expect(page.getByText('专家已移除')).toBeVisible();
 await page.getByRole('button',{name:'选择成员与分工'}).click();
 const dialog=page.getByRole('dialog',{name:'空间成员与分工'});
 await expect(dialog.getByText(/仍关联一位已移除的专家/)).toBeVisible();
 await dialog.getByLabel('文案员工在本空间的分工').fill('更新分工');
 await dialog.getByRole('button',{name:'保存空间'}).click();
 await expect(dialog).toBeHidden();
 let calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='saveSpace'));
 expect(calls[0].input.value.members.find((m:any)=>m.employeeId==='writer').assignment).toBe('更新分工');
 await page.getByRole('button',{name:'从空间移除'}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'移除关联'}).click();
 await expect(page.getByText('专家已移除')).toHaveCount(0);
 calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='saveSpace'));
 expect(calls[1].input.value.members.map((m:any)=>m.employeeId)).toEqual(['writer']);
});
for(const width of [390,800,1280])test(`space layout is contained at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`/tmp/workforce-space-${width}.png`,fullPage:true});await page.locator('.wf-action-row').filter({hasText:'发布文案'}).click();const box=await page.getByRole('region',{name:'任务详情与验收'}).boundingBox();expect(box!.width).toBeLessThanOrEqual(width);expect(box!.x).toBeGreaterThanOrEqual(0);await page.screenshot({path:`/tmp/workforce-space-review-${width}.png`});
});
test('reading an empty space does not reorder spaces and onboarding is contextual',async({page})=>{
 await page.goto(fixture);const order=await page.locator('.wf-space-entry-title strong').allTextContents();await page.getByRole('button',{name:/下一轮规划 明确下一轮/}).click();await expect(page.getByRole('button',{name:'添加空间成员',exact:true})).toBeVisible();await expect(page.getByText('先对齐，再一起推进')).toHaveCount(0);await page.getByRole('button',{name:'项目空间',exact:true}).click();expect(await page.locator('.wf-space-entry-title strong').allTextContents()).toEqual(order);
});
test('empty team guides member selection without a redundant experts link',async({page})=>{
 await page.setViewportSize({width:390,height:800});await page.goto(fixture);
 await page.getByRole('button',{name:/下一轮规划 明确下一轮/}).click();
 await page.getByRole('tab',{name:'团队与项目'}).click();
 const empty=page.locator('.wf-team-empty');await expect(empty.getByText('还没有空间成员')).toBeVisible();
 await expect(page.getByRole('button',{name:'我的专家',exact:true})).toHaveCount(0);
 expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await empty.screenshot({path:'/tmp/space-team-empty-narrow.png'});
 await empty.getByRole('button',{name:'选择成员与分工'}).click();
 await expect(page.getByRole('dialog',{name:'空间成员与分工'})).toBeVisible();
});
test('empty team without experts explains the next step',async({page})=>{
 await page.goto(fixture);
 await page.evaluate(async()=>{const api=window.desktop!.workforce!,snapshot=await api.snapshot();api.snapshot=async()=>({...snapshot,employees:[]});await window.desktop!.spaces!.lifecycle({id:'space',action:'archive'});});
 await page.getByRole('button',{name:/下一轮规划 明确下一轮/}).click();
 await page.getByRole('tab',{name:'团队与项目'}).click();
 const empty=page.locator('.wf-team-empty');await expect(empty.getByText(/可从角色库添加/)).toBeVisible();
 await empty.getByRole('button',{name:'选择成员与分工'}).click();
 await expect(page.getByRole('dialog',{name:'空间成员与分工'}).getByRole('button',{name:'从角色库添加专家'})).toBeVisible();
});
test('archived empty team remains read-only',async({page})=>{
 await page.goto(fixture);
 await page.evaluate(async()=>{const api=window.desktop!.workforce!,snapshot=await api.snapshot();api.snapshot=async()=>({...snapshot,employees:[]});await window.desktop!.spaces!.lifecycle({id:'empty',action:'archive'});});
 await page.getByRole('tab',{name:/已归档/}).click();
 await page.getByRole('button',{name:/下一轮规划 明确下一轮/}).click();
 await page.getByRole('tab',{name:'团队与项目'}).click();
 const empty=page.locator('.wf-team-empty');await expect(empty.getByText(/恢复空间后可继续配置/)).toBeVisible();
 await expect(empty.getByRole('button',{name:'选择成员与分工'})).toHaveCount(0);
});
test('document comparison survives viewing original evidence',async({page})=>{
 await enter(page);await page.locator('.wf-basis-list button').click();await page.getByRole('button',{name:'对照当前采纳版'}).click();await page.getByRole('button',{name:'查看来源任务与角色'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'返回项目空间'}).click();await expect(page.locator('.wf-document-comparison')).toBeVisible();
});
test('continuing a discussion keeps its pinned revision, even with a newer draft',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.getByLabel('这次想推进什么？').fill('请继续梳理这份方案');await page.getByRole('button',{name:'参考资料',exact:true}).click();await expect(page.getByRole('dialog',{name:'参考资料与历史空间'})).toContainText('发布方案 v1');await page.keyboard.press('Escape');await page.getByRole('button',{name:'发起讨论',exact:true}).click();await expect(page.getByRole('alert')).toContainText('测试网络失败');const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='coordinateDiscussion'));expect(calls[0].input.documentRefs).toEqual([{id:'basis',title:'发布方案',revision:1,hash:'hash1'}]);
});
for(const width of [390,800,1280])test(`switching space tabs keeps the navigation anchored at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await enter(page);
 const scroller=page.locator('.qa-scroll'),tabs=page.locator('.wf-space-navigation');
 // Stale per-tab offsets must not be restored when switching panels.
 await page.evaluate(()=>{sessionStorage.setItem('workforce.scroll:space:discussion','1200');sessionStorage.setItem('workforce.scroll:space:documents','0');});
 await scroller.evaluate(el=>{el.scrollTop=70;});const partial=(await tabs.boundingBox())!.y;
 for(const name of ['文档与产物','讨论','团队与项目','任务','概览']){
  await page.getByRole('tab',{name,exact:true}).click();await expect.poll(async()=>(await tabs.boundingBox())!.y).toBeCloseTo(partial,0);await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeCloseTo(70,0);
 }
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].output='讨论内容。\n\n'.repeat(120);qa.emit();});
 await expect.poll(()=>scroller.evaluate(el=>el.scrollHeight)).toBeGreaterThan(2000);
 await scroller.evaluate(el=>{el.scrollTop=1000;});await expect.poll(async()=>(await tabs.boundingBox())!.y).toBeCloseTo(0,0);
 for(const name of ['文档与产物','团队与项目','任务','概览','讨论']){
  await page.getByRole('tab',{name,exact:true}).click();await expect.poll(async()=>(await tabs.boundingBox())!.y).toBeCloseTo(0,0);
  // A short panel starts directly below the pinned bar, not at the old deep offset.
  const panel=page.getByRole('tabpanel',{name,exact:true});await expect.poll(async()=>(await panel.boundingBox())!.y).toBeGreaterThanOrEqual(40);await expect.poll(async()=>(await panel.boundingBox())!.y).toBeLessThan(70);
 }
 await page.getByRole('tab',{name:'文档与产物',exact:true}).click();await expect(page.getByRole('tab',{name:'文档与产物',exact:true})).toHaveAttribute('aria-selected','true');await page.screenshot({animations:'disabled',path:`/tmp/space-tabs-anchored-${width}.png`});
 await scroller.evaluate(el=>{el.scrollTop=0;});await expect.poll(async()=>(await tabs.boundingBox())!.y).toBeGreaterThan(100);
});
test('dark, English and long-content layouts keep controls reachable',async({page})=>{
 await page.setViewportSize({width:800,height:900});await page.goto(fixture+'?theme=dark&lang=en&long=1');await page.locator('.wf-space-entry-open').first().click();await expect(page.getByRole('heading',{name:/Needs your attention/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.locator('.wf-action-row').first().click();await expect(page.getByRole('button',{name:'Accept delivery'})).toBeVisible();expect(await page.getByRole('region',{name:'Task details and review'}).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
});
test('plan editor checks assignments before saving and never starts automatically',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'任务',exact:true}).click();await page.getByRole('button',{name:'制定协作计划',exact:true}).click();await page.getByLabel('计划名称').fill('下一轮交付');await page.getByRole('button',{name:'继续分配工作'}).click();await page.getByRole('button',{name:'添加工作包',exact:true}).click();await expect(page.getByRole('button',{name:'检查计划',exact:true})).toBeDisabled();await page.getByLabel('工作包名称').fill('需求分析');await page.getByRole('combobox',{name:'负责人',exact:true}).selectOption('writer');await page.getByLabel('任务内容',{exact:true}).fill('分析需求并列出验证方法');await page.getByLabel('预期产物').fill('需求分析文档');await page.getByLabel('验收标准',{exact:true}).fill('包含范围、问题和验证方法');await page.getByRole('button',{name:'检查计划',exact:true}).click();await expect(page.locator('.wf-plan-final-review')).toContainText('需求分析文档');await page.getByRole('button',{name:'保存计划',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.map((c:any)=>c.action)).toEqual(['savePlan']);expect(calls[0].input.value.packages[0].ownerId).toBe('writer');
});
test('space archive is discoverable, read-only across views and can be restored',async({page})=>{
 await enter(page);await page.getByRole('button',{name:'产品发布的空间操作'}).click();await page.getByRole('menuitem',{name:'归档空间'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'归档空间'}).click();await expect(page.getByText('空间已归档',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(page.getByLabel('这次想推进什么？')).toHaveCount(0);await page.getByRole('button',{name:'回复操作'}).first().click();await expect(page.getByRole('menuitem',{name:'保存为文档草稿'})).toBeDisabled();await page.keyboard.press('Escape');
 await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(page.getByRole('button',{name:'制定协作计划'})).toBeDisabled();
 await page.getByRole('tab',{name:'文档与产物'}).click();await expect(page.getByRole('button',{name:'新建文档'})).toBeDisabled();await page.getByRole('button',{name:'查看文档',exact:true}).click();await expect(page.getByRole('button',{name:'采纳此版本',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'项目空间',exact:true}).click();await expect(page.locator('.wf-space-entry-title')).not.toContainText(['产品发布']);await page.getByRole('tab',{name:/已归档/}).click();await page.locator('.wf-space-entry-open').click();await page.getByRole('button',{name:'恢复空间',exact:true}).click();await expect(page.getByText('空间已归档',{exact:true})).toHaveCount(0);await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(page.getByLabel('这次想推进什么？')).toBeVisible();
});
test('deleting an archived space requires a separate destructive confirmation',async({page})=>{
 await page.goto(fixture);await page.getByRole('button',{name:'下一轮规划的空间操作'}).click();await page.getByRole('menuitem',{name:'归档空间'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'归档空间'}).click();await page.getByRole('tab',{name:/已归档/}).click();
 await page.getByRole('button',{name:'下一轮规划的空间操作'}).click();await page.getByRole('menuitem',{name:'删除空间…'}).click();await expect(page.getByRole('alertdialog')).toContainText('原始聊天任务不会删除');await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.wf-space-entry')).toHaveCount(1);
 await page.getByRole('button',{name:'下一轮规划的空间操作'}).click();await page.getByRole('menuitem',{name:'删除空间…'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'永久删除'}).click();await expect(page.getByText('暂无归档空间')).toBeVisible();await page.getByRole('tab',{name:/活跃空间/}).click();await expect(page.locator('.wf-space-entry')).toHaveCount(1);
});
test('discussion context, close and reopen retain the selected history',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'讨论上下文'});await expect(panel.getByText('明确发布目标')).toBeVisible();
 await panel.getByRole('tab',{name:'本讨论的文档'}).click();await expect(panel.getByText('发布方案')).toBeVisible();
 await page.getByRole('button',{name:'关闭讨论',exact:true}).click();await expect(page.getByText('讨论已关闭。重新打开后可以继续补充。')).toBeVisible();await expect(page.getByLabel('这次想推进什么？')).toHaveCount(0);
 await page.getByRole('button',{name:'重新打开讨论',exact:true}).click();await expect(page.getByLabel('这次想推进什么？')).toBeVisible();
 await panel.getByRole('tab',{name:'话题'}).click();await panel.getByRole('button',{name:'新建话题',exact:true}).click();await expect(page.getByRole('heading',{name:'新话题'})).toBeVisible();await expect(page.getByText('建议先明确受众')).toHaveCount(0);
 await panel.getByText('明确发布目标').click();await expect(page.getByText('建议先明确受众')).toBeVisible();await page.screenshot({path:'/tmp/workforce-discussion-layout.png'});
});
test('a discussion document can be submitted for review without changing the adopted version',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();const panel=page.getByRole('complementary',{name:'讨论上下文'});await panel.getByRole('tab',{name:'本讨论的文档'}).click();await panel.getByText('发布方案').click();
 await page.getByRole('button',{name:'提交审核'}).click();await expect(page.getByRole('dialog')).toContainText('当前采纳：v1');await expect(page.getByLabel('文档版本')).toContainText('待审核');
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.filter((c:any)=>c.action==='submitDocumentReview')).toHaveLength(1);expect(calls.filter((c:any)=>c.action==='adopt')).toHaveLength(0);
});
test('discussion context remains usable in a narrow window',async({page})=>{
 await page.setViewportSize({width:390,height:800});await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.getByRole('button',{name:'查看讨论与相关内容'}).click();const panel=page.getByRole('complementary',{name:'讨论上下文'});await panel.getByRole('tab',{name:'本讨论的文档'}).click();await expect(panel.getByText('发布方案')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'/tmp/workforce-discussion-narrow.png',fullPage:true});
});
for(const width of [390,1280])test(`discussion renders the real task transcript and keeps the composer fixed at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await page.goto(fixture);
 await page.evaluate(async()=>{const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');r.participants[0].runId='discussion-run';const run={id:'discussion-run',title:'Expert task',projectId:null,cwd:'/fixture',model:'fixture',baseUrl:'',createdAt:r.createdAt,status:'completed',error:'',tools:[],approvals:[],messages:[{id:'u',role:'user',text:r.prompt},{id:'a',role:'assistant',phase:'final_answer',text:Array.from({length:60},(_,i)=>`真实回复段落 ${i+1}。`).join('\n\n')}]};(window.desktop as any).getRunPage=async()=>structuredClone(run);(window.desktop as any).forms={list:async()=>[],onChanged:()=>()=>{}};await window.desktop!.spaces!.lifecycle({id:'empty',action:'archive'});});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const composer=page.getByLabel('这次想推进什么？'),transcript=page.locator('.qa-scroll');await expect(page.locator('.discussion-expert-transcript [aria-label="助手消息"]')).toContainText('真实回复段落 60');await expect(page.getByRole('article',{name:'你的消息'})).toHaveCount(1);
 const before=await composer.boundingBox();await transcript.evaluate(el=>{el.scrollTop=0});await expect.poll(()=>transcript.evaluate(el=>el.scrollHeight>el.clientHeight)).toBeTruthy();
 const top=await composer.boundingBox();expect(Math.abs(before!.y-top!.y)).toBeLessThan(2);await page.getByRole('button',{name:'回到最新消息'}).click();await expect.poll(()=>transcript.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);const bottom=await composer.boundingBox();expect(Math.abs(before!.y-bottom!.y)).toBeLessThan(2);
 await page.screenshot({path:`/tmp/discussion-long-fixed-${width}.png`});expect(bottom!.y+bottom!.height).toBeLessThanOrEqual(800);const send=await page.getByRole('button',{name:'发起讨论',exact:true}).boundingBox();expect(send!.y+send!.height).toBeLessThanOrEqual(800);
});

for(const width of [390,1280])test(`long discussion remains interactive with model and participant popovers at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await page.goto(fixture);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.find((r:any)=>r.id==='discussion').prompt='基于当前代码核对职责与实现，完成链路验证、范围与验收基线。'.repeat(40);qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await expect(page.locator('.wf-discussion-header h2')).toContainText('基于当前代码核对职责与实现');
 const transcript=page.locator('.wf-request-list'),composer=page.getByLabel('这次想推进什么？');
 expect((await transcript.boundingBox())!.height).toBeGreaterThan(100);
 expect((await page.locator('.wf-discussion-header').boundingBox())!.height).toBeLessThan(140);
 if(width>800){await expect(page.getByRole('button',{name:'查看讨论与相关内容'})).toBeHidden();const side=await page.locator('.wf-discussion-sidebar').boundingBox(),main=await page.locator('.wf-discussion-main').boundingBox();expect(side!.x).toBeGreaterThan(main!.x);expect(Math.abs(side!.y-main!.y)).toBeLessThan(2);}
 await page.getByRole('button',{name:'本条发送给',exact:true}).click();const experts=page.getByRole('dialog',{name:'本条消息的接收者'});await expect(experts.getByRole('checkbox')).not.toBeChecked();await page.keyboard.press('Escape');await composer.fill('继续核对边界');await expect(page.getByRole('button',{name:'发起讨论',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'本条发送给',exact:true}).click();await experts.getByRole('checkbox').check();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:'模型 B 测试服务 A',exact:true}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('模型 B');
 const send=page.getByRole('button',{name:'发起讨论',exact:true});expect((await send.boundingBox())!.y+(await send.boundingBox())!.height).toBeLessThanOrEqual(800);
 await send.click();await expect(page.getByRole('alert')).toContainText('测试网络失败');await expect(composer).toHaveValue('继续核对边界');
 const input=await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='start').input);expect(input).toMatchObject({providerId:'provider-a',model:'模型 B',employeeIds:['writer'],replyTo:'discussion'});
 await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);await page.screenshot({path:`/tmp/discussion-interactive-${width}.png`});
});
test('discussion send acknowledges immediately and preserves edits while a slow request fails',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.evaluate(()=>{window.desktop!.spaces!.coordinateDiscussion=async()=>new Promise((_resolve,reject)=>{(window as any).failDiscussion=()=>reject(Error('测试延迟失败'));});});
 const composer=page.getByLabel('这次想推进什么？');await composer.fill('新的一轮讨论');await composer.press('Enter');
 await expect(composer).toHaveValue('');await expect(page.getByRole('article',{name:'你的消息'}).last()).toContainText('新的一轮讨论');await expect(page.getByRole('button',{name:'正在发送…',exact:true})).toBeVisible();
 await composer.fill('随后补充的草稿');await page.evaluate(()=>(window as any).failDiscussion());await expect(page.getByRole('alert')).toContainText('测试延迟失败');await expect(composer).toHaveValue('随后补充的草稿');await page.getByRole('button',{name:'恢复未发送内容'}).click();await expect(composer).toHaveValue('新的一轮讨论\n\n随后补充的草稿');
});

test('new discussion sends once, displays its result and continues with the selected model',async({page})=>{
 await enter(page);await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.getByRole('complementary',{name:'讨论上下文'}).getByRole('button',{name:'新建',exact:true}).click();
 await page.evaluate(()=>{window.desktop!.spaces!.coordinateDiscussion=async(input:any)=>{const qa=(window as any).spaceQA;qa.calls.push({action:'start',input});qa.snapshot.requests.unshift({id:input.clientRequestId,spaceId:'space',prompt:input.prompt,mode:'discussion',replyTo:input.replyTo,createdAt:new Date().toISOString(),documentRefs:[],participants:[{employeeId:'writer',status:'completed',output:'已核对目标'}]});return structuredClone(qa.snapshot);};});
 const composer=page.getByLabel('这次想推进什么？');await composer.fill('新的发布讨论');await composer.press('Enter');await expect(page.locator('.wf-discussion-header h2')).toHaveText('新的发布讨论');await expect(page.getByText('已核对目标',{exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:'模型 C 测试服务 B',exact:true}).click();await composer.fill('继续核对');await composer.press('Enter');await expect(page.getByText('已核对目标',{exact:true})).toHaveCount(2);
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='start'));expect(calls).toHaveLength(2);expect(calls[0].input.replyTo).toBeUndefined();expect(calls[1].input).toMatchObject({replyTo:calls[0].input.clientRequestId,providerId:'provider-b',model:'模型 C'});
});
test('running discussion offers stop, keeps next model selection and accepts the next turn after stopping',async({page})=>{
 await page.goto(fixture);await page.evaluate(()=>{const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');r.participants[0].status='running';r.participants[0].runId='active-expert';window.desktop!.stopRun=async(id:string)=>{qa.calls.push({action:'stop',input:id});r.participants[0].status='interrupted';return {} as any;};qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(page.getByRole('button',{name:'关闭讨论',exact:true})).toBeDisabled();await expect(page.locator('.wf-discussion-composer').getByRole('button',{name:'默认权限',exact:true})).toHaveCount(0);await expect(page.locator('.wf-discussion-composer').getByRole('button',{name:'添加内容',exact:true})).toHaveCount(0);
 const composer=page.getByLabel('这次想推进什么？');await composer.fill('停止后继续');await composer.press('Enter');await expect(composer).toHaveValue('停止后继续');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:'模型 B 测试服务 A',exact:true}).click();await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByRole('button',{name:'发起讨论',exact:true})).toBeEnabled();await composer.press('Enter');await expect(page.getByRole('alert')).toContainText('测试网络失败');
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.filter((c:any)=>c.action==='stop')).toEqual([{action:'stop',input:'active-expert'}]);expect(calls.filter((c:any)=>c.action==='coordinateDiscussion')).toHaveLength(1);expect(calls.find((c:any)=>c.action==='coordinateDiscussion').input.model).toBe('模型 B');
});

for(const width of [390,800,1280])test(`expert mention is a keyboard-controlled overlay without layout shift at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(fixture);
 await page.evaluate(async()=>{
  const qa=(window as any).spaceQA,api=window.desktop!.workforce!,snapshot=await api.snapshot(),writer=snapshot.employees[0];
  const extras=Array.from({length:10},(_,i)=>({...writer,id:'expert-'+i,name:'测试专家'+i}));
  api.snapshot=async()=>({...snapshot,employees:[writer,...extras]});
  qa.snapshot.spaces.find((s:any)=>s.id==='space').members.push(...extras.map(e=>({employeeId:e.id,assignment:'核对需求和验证证据',projectIds:[]})));qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const composer=page.getByLabel('这次想推进什么？'),box=page.locator('.wf-discussion-composer');
 await composer.fill('请 ');const before=await box.boundingBox();await composer.pressSequentially('@');
 const popup=page.getByRole('dialog',{name:'选择提及的专家'});await expect(popup).toBeVisible();await expect(composer).toBeFocused();
 await expect(popup.getByRole('option')).toHaveCount(11);
 const after=await box.boundingBox();expect(Math.abs(after!.height-before!.height)).toBeLessThan(2);expect(Math.abs(after!.y-before!.y)).toBeLessThan(2);
 const bounds=await popup.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);expect(bounds!.y).toBeGreaterThanOrEqual(0);
 await composer.press('ArrowDown');await expect(popup.getByRole('option',{name:/测试专家0/})).toHaveAttribute('aria-selected','true');
 await composer.press('ArrowUp');await expect(popup.getByRole('option',{name:/文案员工/})).toHaveAttribute('aria-selected','true');
 await composer.press('ArrowDown');await composer.press('Enter');await expect(composer).toHaveValue('请 @测试专家0 ');await expect(popup).toBeHidden();await expect(page.getByRole('button',{name:'本条发送给',exact:true})).toContainText('测试专家0');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='start'))).toHaveLength(0);
 await composer.fill('请 @不匹配');await expect(popup).toContainText('没有匹配的专家');await composer.press('Enter');await expect(composer).toHaveValue('请 @不匹配');await composer.press('Escape');await expect(popup).toBeHidden();await expect(composer).toBeFocused();
 // Chinese IME confirmation must neither choose an expert nor send a request.
 await composer.fill('请 @测试');await composer.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});await expect(composer).toHaveValue('请 @测试');await expect(popup).toBeVisible();
 await composer.press('Escape');await composer.fill('请 @测试 后续内容');await composer.evaluate((el:HTMLTextAreaElement)=>{el.setSelectionRange(5,5);el.dispatchEvent(new Event('select',{bubbles:true}));});await composer.press('ArrowLeft');await composer.press('ArrowRight');await expect(popup).toBeVisible();await composer.press('Enter');await expect(composer).toHaveValue(/请 @测试专家\d  后续内容/);
 await composer.fill('user@example.com');await expect(popup).toBeHidden();await composer.fill('请@测试');await expect(popup).toBeVisible();await composer.press('Escape');
 await composer.fill('请 @');await expect(popup).toBeVisible();await page.screenshot({animations:'disabled',path:`/tmp/discussion-mention-${width}.png`});
 await composer.press('Escape');await page.getByRole('button',{name:'回复操作'}).first().click();await expect(page.getByRole('menuitem',{name:'保存为文档草稿'})).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('.qa-scroll').evaluate(el=>{el.scrollTop=0;});const tabs=await page.locator('.wf-space-navigation').boundingBox(),header=await page.locator('.wf-discussion-header').boundingBox();expect(header!.y-(tabs!.y+tabs!.height)).toBeLessThan(width>800?40:90);
 await page.screenshot({animations:'disabled',path:`/tmp/discussion-layout-${width}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const width of [390,800,1280])test(`space tabs share headings and sticky page scrolling at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(fixture);
 // Old collapse preferences must no longer hide the shared space heading.
 await page.evaluate(()=>{sessionStorage.setItem('workforce.space-view:space',JSON.stringify({tab:'overview',memberFilter:null,headerCollapsed:true}));const qa=(window as any).spaceQA;qa.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].output='讨论内容与验收标准。\n\n'.repeat(120);qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 const heading=page.locator('.wf-space-detail-heading'),tabs=page.locator('.wf-space-navigation'),scroller=page.locator('.qa-scroll');
 const initialHeading=await heading.boundingBox(),initialTabs=await tabs.boundingBox();
 for(const title of ['文档与产物','任务','团队与项目','讨论','概览','讨论']){
  await page.getByRole('tab',{name:title,exact:true}).click();await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBe(0);
  expect((await heading.boundingBox())!.y).toBeCloseTo(initialHeading!.y,0);expect((await heading.boundingBox())!.height).toBeCloseTo(initialHeading!.height,0);expect((await tabs.boundingBox())!.y).toBeCloseTo(initialTabs!.y,0);
 }
 await expect(page.getByRole('button',{name:/讨论头部|空间页面/})).toHaveCount(0);await page.screenshot({animations:'disabled',path:`/tmp/discussion-page-top-${width}.png`});
 const composer=page.locator('.wf-discussion-composer'),input=page.getByLabel('这次想推进什么？'),send=page.getByRole('button',{name:'发起讨论',exact:true});
 // Fill without Playwright scrolling the textarea into view first.
 await input.fill('保留这份草稿');await scroller.evaluate(el=>{el.scrollTop=0;});const before=await composer.boundingBox();expect(before!.y+before!.height).toBeLessThanOrEqual(850);expect(before!.y+before!.height).toBeGreaterThan(835);
 await scroller.evaluate(el=>{el.scrollTop=600;});await expect.poll(async()=>(await tabs.boundingBox())!.y).toBeLessThan(2);
 await expect(tabs).toHaveCSS('background-color','rgb(255, 255, 255)');expect((await tabs.boundingBox())!.width).toBeCloseTo((await page.locator('.wf-space-tabs').boundingBox())!.width,0);const during=await composer.boundingBox();expect(Math.abs(before!.y-during!.y)).toBeLessThan(2);await expect(input).toHaveValue('保留这份草稿');
 await expect(page.locator('.wf-request-list')).toHaveCSS('overflow-y','visible');await expect(send).toHaveCSS('width','32px');await expect(send).toHaveCSS('height','32px');
 await page.screenshot({animations:'disabled',path:`/tmp/discussion-page-sticky-${width}.png`});
 await page.getByRole('button',{name:'回到最新消息'}).click();await expect.poll(()=>scroller.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);
 await expect(page.getByRole('button',{name:'继续讨论',exact:true})).toHaveCount(0);const lastReply=await page.locator('.wf-request-list').boundingBox();expect(lastReply!.y+lastReply!.height).toBeLessThanOrEqual((await composer.boundingBox())!.y+1);
 await page.screenshot({animations:'disabled',path:`/tmp/discussion-page-bottom-${width}.png`});
 await page.getByRole('tab',{name:'文档与产物',exact:true}).click();await expect(page.locator('.wf-discussion-composer')).toHaveCount(0);await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(input).toHaveValue('保留这份草稿');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const theme of ['light','dark'])test(`short and empty discussions keep the footer at the page bottom in ${theme}`,async({page})=>{
 await page.setViewportSize({width:800,height:900});await page.goto(fixture+(theme==='dark'?'?theme=dark':''));await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const footer=page.locator('.wf-discussion-footer'),scroller=page.locator('.qa-scroll');
 await expect.poll(async()=>{const b=await footer.boundingBox();return b!.y+b!.height;}).toBeCloseTo(900,0);
 await page.getByRole('button',{name:'查看讨论与相关内容'}).click();await page.getByRole('button',{name:'新建',exact:true}).click();
 await page.getByRole('button',{name:'收起讨论上下文'}).click();await expect(page.locator('.wf-discussion-header h2')).toHaveText('新讨论');await scroller.evaluate(el=>{el.scrollTop=0;});
 const b=await footer.boundingBox();expect(b!.y+b!.height).toBeCloseTo(900,0);await expect(page.locator('.wf-space-detail-heading')).toBeVisible();
 await page.screenshot({animations:'disabled',path:`/tmp/discussion-page-empty-${theme}.png`});
});

for(const width of [390,1280])test(`discussion context tabs stay visible while their long list scrolls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(fixture);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');r.participants[0].output='核对目标与验收标准。\n\n'.repeat(120);qa.snapshot.requests.push(...Array.from({length:30},(_,i)=>({...structuredClone(r),id:'history-'+i,prompt:'历史讨论 '+i})));qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 if(width<800)await page.getByRole('button',{name:'查看讨论与相关内容'}).click();
 const sidebar=page.getByRole('complementary',{name:'讨论上下文'}),navigation=sidebar.getByRole('tablist'),scroller=page.locator('.qa-scroll'),globalTabs=page.locator('.wf-space-navigation');
 await expect(sidebar.locator('.wf-context-item')).toHaveCount(31);
 if(width>800){
  await scroller.evaluate(el=>{el.scrollTop=650;});
  await expect.poll(async()=>{const a=await navigation.boundingBox(),b=await globalTabs.boundingBox();return a!.y-b!.y-b!.height;}).toBeCloseTo(12,0);
 }
 const before=await navigation.boundingBox(),outerTop=await scroller.evaluate(el=>el.scrollTop);
 const panel=sidebar.getByRole('tabpanel');await panel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);expect((await navigation.boundingBox())!.y).toBeCloseTo(before!.y,0);
 expect(await scroller.evaluate(el=>el.scrollTop)).toBe(outerTop);
 await page.screenshot({animations:'disabled',path:`/tmp/discussion-context-sticky-${width}.png`});
 for(const name of ['本讨论的文档','本讨论的相关计划','话题']){
  await sidebar.getByRole('tab',{name}).click();await expect(sidebar.getByRole('tab',{name})).toHaveAttribute('aria-selected','true');
  expect((await navigation.boundingBox())!.y).toBeCloseTo(before!.y,0);expect(await scroller.evaluate(el=>el.scrollTop)).toBe(outerTop);
 }
 if(width>800){await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});const a=await navigation.boundingBox(),b=await globalTabs.boundingBox();expect(a!.y).toBeGreaterThanOrEqual(b!.y+b!.height);await expect(sidebar.getByRole('tab',{name:'本讨论的相关计划'})).toBeInViewport();}
 else{await page.getByRole('button',{name:'收起讨论上下文'}).click();await expect(sidebar).toBeHidden();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const direct of [false,true])for(const width of [390,1280])test(`discussion ${direct?'expert':'host'} uses shared attachment and permission controls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(fixture);
 await page.evaluate(()=>{window.desktop!.selectAttachments=async()=>[{name:'讨论资料.md',path:'/tmp/discussion-brief.md'}];window.desktop!.skills={list:async()=>[{id:'review',name:'资料核对',description:'核对讨论资料',enabled:true}],onChanged:()=>()=>{}} as any;});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 if(direct){await page.getByRole('button',{name:'本条发送给',exact:true}).click();await page.getByRole('dialog',{name:'本条消息的接收者'}).getByRole('checkbox').check();await page.keyboard.press('Escape');}
 const composer=page.locator('.wf-discussion-composer');
 await composer.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();await expect(composer.getByRole('button',{name:'移除附件 讨论资料.md'})).toBeVisible();
 await composer.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'技能',exact:true}).click();await page.getByRole('option',{name:/资料核对/}).click();await page.keyboard.press('Escape');await expect(composer.getByLabel('已选技能')).toContainText('资料核对');
 await composer.getByRole('button',{name:'默认权限',exact:true}).click();const permissions=page.getByRole('dialog',{name:'权限模式'});await expect(permissions).toBeVisible();await permissions.getByRole('button',{name:'完全访问',exact:true}).click();
 const confirmation=page.getByRole('alertdialog');await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:'允许完全访问',exact:true}).click();await expect(composer.getByRole('button',{name:'完全访问',exact:true})).toBeVisible();
 const input=page.getByLabel('这次想推进什么？');await input.fill('结合附件进行讨论');await composer.getByRole('button',{name:'完全访问',exact:true}).click();await page.screenshot({animations:'disabled',path:`/tmp/discussion-permission-${direct?'expert':'host'}-${width}.png`});await page.keyboard.press('Escape');
 const add=await composer.getByRole('button',{name:'添加内容',exact:true}).boundingBox(),permission=await composer.getByRole('button',{name:'完全访问',exact:true}).boundingBox(),send=await composer.getByRole('button',{name:'发起讨论',exact:true}).boundingBox();expect(Math.abs(add!.y+add!.height/2-permission!.y-permission!.height/2)).toBeLessThan(2);expect(send!.width).toBe(send!.height);expect(Math.abs(send!.y+send!.height/2-permission!.y-permission!.height/2)).toBeLessThan(2);
 await input.press('Enter');await expect(page.getByRole('alert')).toContainText('测试网络失败');const call=await page.evaluate(action=>(window as any).spaceQA.calls.find((c:any)=>c.action===action),direct?'start':'coordinateDiscussion');expect(call.input).toMatchObject({permission:'full',attachments:[{name:'讨论资料.md',path:'/tmp/discussion-brief.md'}],selectedSkillIds:['review']});await expect(composer.getByRole('button',{name:'移除附件 讨论资料.md'})).toBeVisible();
 await composer.getByRole('button',{name:'完全访问',exact:true}).click();await permissions.getByRole('button',{name:'默认权限',exact:true}).click();await expect(composer.getByRole('button',{name:'默认权限',exact:true})).toBeVisible();await composer.getByRole('button',{name:'移除附件 讨论资料.md'}).click();await expect(composer.getByRole('button',{name:'移除附件 讨论资料.md'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const width of [390,800,1280])test(`space directory intro and sticky scopes at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(fixture+(width===800?'?theme=dark&lang=en':''));
 const english=width===800,scroller=page.locator('.qa-scroll'),toolbar=page.locator('.wf-space-browser-tools');
 await expect(page.locator('.wf-space-guide')).toContainText(english?'Bring your projects together':'让多个项目');
 await expect(page.getByRole('button',{name:english?'1 expert':'1 位专家',exact:true})).toBeVisible();
 if(width===1280)expect(await scroller.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
 await expect(page.getByRole('button',{name:english?'Create a project space':'创建项目空间',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/space-directory-header-${width}.png`,fullPage:true});
 // A long active list must not carry its deep scroll offset into an empty scope.
 await page.evaluate(()=>{const qa=(window as any).spaceQA;for(let i=0;i<15;i++)qa.snapshot.spaces.push({...structuredClone(qa.snapshot.spaces[1]),id:`extra-${i}`,name:`测试空间 ${i}`});qa.emit();});
 await expect(page.locator('.wf-space-entry')).toHaveCount(12);
 await scroller.evaluate(el=>{el.scrollTop=120;});
 await page.getByRole('tab',{name:english?/Needs attention/:/需要处理/}).click();
 await expect(toolbar).toBeInViewport();
 await page.getByRole('tab',{name:english?/Active/:/活跃空间/}).click();
 await scroller.evaluate(el=>{el.scrollTop=1400;});
 await expect.poll(async()=>(await toolbar.boundingBox())!.y).toBeCloseTo(0,0);
 await page.getByRole('tab',{name:english?/Archived/:/已归档/}).click();
 await expect(toolbar).toBeInViewport();
 // Short scopes use only their real content height, never a full-screen filler.
 const blank=await page.locator('.wf-space-browser').evaluate(el=>{const scroller=el.closest('.qa-scroll')!;return scroller.scrollHeight>scroller.clientHeight?scroller.scrollHeight-(el.getBoundingClientRect().bottom-scroller.getBoundingClientRect().top+scroller.scrollTop):0;});expect(blank).toBeLessThanOrEqual(49);
 await expect(page.getByText(english?'No archived spaces':'暂无归档空间',{exact:true})).toBeVisible();
 await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby',await page.getByRole('tab',{name:english?/Archived/:/已归档/}).getAttribute('id') as string);
 await page.screenshot({path:`/tmp/space-directory-sticky-${width}.png`});
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
 await expect(page.getByRole('tab',{name:english?/Needs attention/:/需要处理/})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.wf-space-entry')).toHaveCount(1);
 await scroller.evaluate(el=>{el.scrollTop=0;});
 await page.getByRole('button',{name:english?'Create a project space':'创建项目空间',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
});
test('first space uses the same directory header and creation entry',async({page})=>{
 await page.goto(fixture);await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.spaces=[];qa.emit();});
 await expect(page.getByRole('button',{name:'创建第一个项目空间'})).toBeVisible();
 await expect(page.getByRole('tab',{name:/活跃空间/})).toBeVisible();
 await expect(page.getByText('为一个共同目标建立空间',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创建第一个项目空间'}).click();await expect(page.getByRole('dialog')).toBeVisible();
});

test('space intro reflects expert count and help has no onboarding detour',async({page})=>{
 await page.goto(fixture);await expect(page.getByRole('button',{name:'1 位专家',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'概念说明',exact:true}).click();
 const help=page.getByRole('dialog');await expect(help.getByText('项目空间：围绕目标组织工作')).toBeVisible();
 await expect(help.getByRole('button',{name:'查看首次使用引导'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const api=window.desktop!.workforce!,snapshot=await api.snapshot();api.snapshot=async()=>({...snapshot,employees:[]});(window as any).spaceQA.emit();});
 await expect(page.getByRole('button',{name:'先添加专家',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'1 位专家',exact:true})).toHaveCount(0);
});

for(const width of [390,800,1280])test(`directory empty states and recovery at ${width}px`,async({page})=>{
 const en=width===800;
 await page.setViewportSize({width,height:900});await page.goto(fixture+(en?'?lang=en&theme=dark':''));
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.spaces=[];qa.emit();});
 const empty=page.locator('.wf-directory-empty'),panel=page.getByRole('tabpanel');
 await expect(empty).toBeVisible();
 await empty.getByRole('button',{name:en?'Create a project space':'创建项目空间',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 for(const [scope,name] of [['active',en?/Active/:/活跃空间/],['attention',en?/Needs attention/:/需要处理/],['archived',en?/Archived/:/已归档/]] as const){
  await page.getByRole('tab',{name}).click();await expect(empty).toBeVisible();
  const rect=await empty.boundingBox();expect(rect!.height).toBeLessThan(320);
  expect(await empty.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`/tmp/space-empty-${scope}-${width}.png`,fullPage:true});
  if(width===1280)expect(await page.locator('.qa-scroll').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
 }
 await page.getByRole('textbox',{name:en?'Search spaces':'搜索项目空间'}).fill('no-such-space');
 await empty.getByRole('button',{name:en?'Clear search':'清除搜索'}).click();
 await expect(page.getByRole('textbox',{name:en?'Search spaces':'搜索项目空间'})).toHaveValue('');
 await expect(page.getByRole('tab',{name:en?/Archived/:/已归档/})).toHaveAttribute('aria-selected','true');
 await expect(panel).toContainText(en?'No archived spaces':'暂无归档空间');
 await page.reload();await page.getByRole('tab',{name:en?/Archived/:/已归档/}).click();
 await empty.getByRole('button',{name:en?'View active spaces':'查看活跃空间'}).click();await expect(page.locator('.wf-space-entry')).toHaveCount(2);
});
