import {test,expect,type Page} from '@playwright/test';

async function enter(page:Page,english=false,dark=false){
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.evaluate(({english})=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[];r.host={status:'ready',revision:1,ruleVersion:'fixture',model:'模型 A',steps:[{id:'ready',action:'ready',at:'',text:english?'The scope is agreed. Prepare and check tasks below, then review assignments and acceptance.':'范围已明确。点击下方“整理并检查任务”，再核对分工与验收条件。'}],brief:{goal:english?'Review the launch links':'检查发布链接',items:[]}};qa.emit();
 },{english});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
const handoff=(page:Page)=>page.getByRole('region',{name:'任务下一步'});
const calls=(page:Page,action:string)=>page.evaluate(action=>(window as any).spaceQA.calls.filter((c:any)=>c.action===action),action);

test('ready reply prepares once with the selected model, clarifies, then waits for explicit start',async({page})=>{
 await enter(page);
 await page.getByRole('button',{name:'选择模型'}).click();await page.getByRole('option',{name:/模型 B/}).click();
 await expect(handoff(page)).toContainText('模型 B');await expect(page.getByRole('dialog')).toHaveCount(0);
 await handoff(page).getByRole('button',{name:'整理并检查任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('form.composer')).toHaveCount(1);expect(await calls(page,'guideTask')).toHaveLength(1);
 expect((await calls(page,'guideTask'))[0].input).toMatchObject({providerId:'provider-a',model:'模型 B',message:''});
 expect(await calls(page,'createGuidedPlan')).toHaveLength(0);expect(await calls(page,'control')).toHaveLength(0);
 await guide.getByLabel('需要检查哪些链接？').fill('三个已确认的发布链接');await guide.getByRole('button',{name:'提交补充并检查'}).click();
 await expect(guide.getByText(/信息已通过检查/)).toBeVisible();await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();
 expect(await calls(page,'control')).toHaveLength(0);
 await guide.getByRole('button',{name:'确认并启动'}).click();await expect(guide).toBeHidden();
 expect(await calls(page,'createGuidedPlan')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(1);
 await page.getByRole('button',{name:'返回来源讨论'}).click();await expect(handoff(page).getByRole('button',{name:'查看任务计划'})).toBeVisible();
 await handoff(page).getByRole('button',{name:'查看任务计划'}).click();await expect(page.getByRole('region',{name:'任务详情与验收'})).toBeVisible();expect(await calls(page,'createTaskDraft')).toHaveLength(1);
});

test('resuming preserves edits and unsent clarification without another model request',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理并检查任务'}).click();let guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByText(/任务建议 · 可编辑/).click();await expect(guide.getByLabel('共同目标')).toHaveValue('核对所有发布链接');await guide.getByLabel('共同目标').fill('只检查用户指定的三个链接');await page.getByLabel('补充任务需求').fill('未发送的限制');
 await guide.getByRole('button',{name:'返回讨论，保留草稿'}).click();await handoff(page).getByRole('button',{name:'继续整理任务'}).click();guide=page.getByRole('region',{name:'整理为任务'});await guide.getByText(/任务建议 · 可编辑/).click();
 await expect(guide.getByLabel('共同目标')).toHaveValue('只检查用户指定的三个链接');await expect(page.getByLabel('补充任务需求')).toHaveValue('未发送的限制');expect(await calls(page,'guideTask')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(0);
});

test('missing experts leads to team setup; later discussion suppresses stale handoff',async({page})=>{
 await enter(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.spaces[0].members=[];q.emit();});
 await handoff(page).getByRole('button',{name:'选择参与专家'}).click();await expect(page.getByRole('tab',{name:'团队与项目',exact:true})).toHaveAttribute('aria-selected','true');expect(await calls(page,'createTaskDraft')).toHaveLength(0);
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.push({id:'later',spaceId:'space',replyTo:'discussion',mode:'discussion',prompt:'修改范围',createdAt:'2026-11-02',participants:[],documentRefs:[],host:{status:'running',revision:1,steps:[]}});q.emit();});
 await expect(handoff(page)).toHaveCount(0);
});

test('failed preparation can retry in place and never creates or starts a plan',async({page})=>{
 await enter(page);await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;let first=true;api.guideTask=async input=>{if(first){first=false;throw Error('测试服务离线，草稿已保留');}return original(input);};});
 await handoff(page).getByRole('button',{name:'整理并检查任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByRole('alert')).toContainText('离线');await expect(page.getByLabel('补充任务需求')).toBeEnabled();await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();
 await guide.getByRole('button',{name:'根据讨论整理任务'}).click();await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();expect(await calls(page,'control')).toHaveLength(0);
});

for(const [width,english,dark] of [[1280,false,false],[390,false,true],[1280,true,true],[390,true,false]] as const)test(`task handoff visual ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page,english,dark);
 const next=page.getByRole('region',{name:english?'Next task step':'任务下一步'}),button=next.getByRole('button');
  await button.focus();await expect(button).toBeFocused();
  await expect.poll(()=>button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`/tmp/task-handoff-${width}-${english}-${dark}.png`});
 await button.press('Enter');const guide=page.locator('.wf-task-guide-inline');await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();
 expect(await guide.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();expect((await page.locator('.wf-discussion-footer').boundingBox())!.height).toBeLessThan(200);await expect(page.locator('form.composer')).toHaveCount(1);await guide.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));await page.screenshot({path:`/tmp/task-handoff-guide-${width}-${english}-${dark}.png`});
 await guide.getByRole('button',{name:english?'Back to discussion · keep draft':'返回讨论，保留草稿'}).click();await expect(guide).toBeHidden();await expect(next.getByRole('button')).toBeFocused();
});

test('long task proposals expand on demand; editing does not collapse the active package',async({page})=>{
 await page.setViewportSize({width:390,height:840});await enter(page);
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;api.guideTask=async input=>{const d=await original(input);if(input.message){d.value.packages=Array.from({length:6},(_,i)=>({...d.value.packages[0],id:'long-'+i,title:'跨项目验证接口契约、模型路由与远端部署流程 '+(i+1),dependencies:i?['long-'+(i-1)]:[]}));(window as any).spaceQA.snapshot.taskDrafts[0]=structuredClone(d);}return d;};});
 await handoff(page).getByRole('button',{name:'整理并检查任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByLabel('需要检查哪些链接？').fill('已确认的六项隔离验证工作');await guide.getByRole('button',{name:'提交补充并检查'}).click();
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();const packages=guide.locator('.wf-guide-package');await expect(packages).toHaveCount(6);await expect(guide.locator('.wf-guide-package[open]')).toHaveCount(0);
 await packages.first().locator('summary').click();await packages.first().getByLabel('任务名称',{exact:true}).fill('只检查这轮发布的接口契约');await expect(packages.first()).toHaveAttribute('open');
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();await expect(page.locator('form.composer')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await packages.first().locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/task-proposals-long-narrow.png'});
});


test('failed form clarification retains the original editable answers',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理并检查任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByLabel('需要检查哪些链接？').fill('三个隔离测试链接');await page.evaluate(()=>{window.desktop!.spaces!.guideTask=async()=>{throw Error('测试服务暂时不可用');};});
 await guide.getByRole('button',{name:'提交补充并检查'}).click();await expect(guide.getByRole('alert')).toContainText('暂时不可用');await expect(guide.getByLabel('需要检查哪些链接？')).toHaveValue('三个隔离测试链接');await expect(guide.getByLabel('需要检查哪些链接？')).toBeEditable();
 expect(await calls(page,'control')).toHaveLength(0);
});
