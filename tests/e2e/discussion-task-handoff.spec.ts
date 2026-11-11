import {test,expect,type Page} from '@playwright/test';

async function enter(page:Page,english=false,dark=false){
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.evaluate(({english})=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[];r.host={status:'ready',revision:1,ruleVersion:'fixture',model:'模型 A',steps:[{id:'ready',action:'ready',at:'',text:english?'The scope is agreed. Prepare and check tasks below, then review assignments and acceptance.':'范围已明确。点击下方“整理为任务”，再核对分工与验收条件。'}],brief:{goal:english?'Review the launch links':'检查发布链接',items:[]}};qa.emit();
 },{english});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
const handoff=(page:Page)=>page.getByRole('region',{name:'本次任务'});
const calls=(page:Page,action:string)=>page.evaluate(action=>(window as any).spaceQA.calls.filter((c:any)=>c.action===action),action);

test('ready reply prepares once with the selected model, clarifies, then waits for explicit start',async({page})=>{
 await enter(page);
 await page.getByRole('button',{name:'选择模型'}).click();await page.getByRole('option',{name:/模型 B/}).click();
 await expect(page.getByRole('button',{name:'选择模型'})).toContainText('模型 B');await expect(page.getByRole('dialog')).toHaveCount(0);
 await handoff(page).getByRole('button',{name:'整理为任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('form.composer')).toHaveCount(1);expect(await calls(page,'guideTask')).toHaveLength(1);
 expect((await calls(page,'guideTask'))[0].input).toMatchObject({providerId:'provider-a',model:'模型 B',message:''});
 expect(await calls(page,'createGuidedPlan')).toHaveLength(0);expect(await calls(page,'control')).toHaveLength(0);
 await guide.getByLabel('需要检查哪些链接？').fill('三个已确认的发布链接');await guide.getByRole('button',{name:'提交补充并检查'}).click();
 await expect(guide.getByText(/信息已通过检查/)).toBeVisible();await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();
 expect(await calls(page,'control')).toHaveLength(0);
 await guide.getByRole('button',{name:'确认并启动'}).click();await expect(guide).toBeHidden();
 expect(await calls(page,'createGuidedPlan')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(1);
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');await page.getByRole('button',{name:'返回讨论',exact:true}).click();
 await expect(handoff(page).getByRole('button',{name:/^查看任务：/})).toBeVisible();await handoff(page).getByRole('button',{name:/^查看任务：/}).click();await page.locator('.wf-graph-node[data-package-id="verify"]').click();await expect(page.getByRole('region',{name:'任务详情与验收'})).toBeVisible();expect(await calls(page,'createTaskDraft')).toHaveLength(1);
});

test('resuming preserves edits and unsent clarification without another model request',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理为任务'}).click();let guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByRole('button',{name:'编辑计划',exact:true}).click();await expect(guide.getByLabel('共同目标')).toHaveValue('核对所有发布链接');await guide.getByLabel('共同目标').fill('只检查用户指定的三个链接');await page.getByLabel('这次想推进什么？',{exact:true}).fill('未发送的限制');
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await handoff(page).getByRole('button',{name:'继续完善'}).click();guide=page.getByRole('region',{name:'整理为任务'});await guide.getByRole('button',{name:'编辑计划',exact:true}).click();
 await expect(guide.getByLabel('共同目标')).toHaveValue('只检查用户指定的三个链接');await expect(page.getByLabel('这次想推进什么？',{exact:true})).toHaveValue('未发送的限制');expect(await calls(page,'guideTask')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(0);
});

test('missing experts leads to team setup; later discussion suppresses stale handoff',async({page})=>{
 await enter(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.spaces[0].members=[];q.emit();});
 await page.getByRole('button',{name:'添加专家以参与后续协作',exact:true}).click();await expect(page.getByRole('tab',{name:'团队与项目',exact:true})).toHaveAttribute('aria-selected','true');expect(await calls(page,'createTaskDraft')).toHaveLength(0);
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.push({id:'later',spaceId:'space',replyTo:'discussion',mode:'discussion',prompt:'修改范围',createdAt:'2026-11-02',participants:[],documentRefs:[],host:{status:'running',revision:1,steps:[]}});q.emit();});
 await expect(handoff(page).getByRole('button',{name:'整理为任务'})).toBeDisabled();
});

test('failed preparation can retry in place and never creates or starts a plan',async({page})=>{
 await enter(page);await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;let first=true;api.guideTask=async input=>{if(first){first=false;throw Error('测试服务离线，草稿已保留');}return original(input);};});
 await handoff(page).getByRole('button',{name:'整理为任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByRole('alert')).toContainText('离线');await expect(page.getByLabel('这次想推进什么？',{exact:true})).toBeEnabled();await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();
 await guide.getByRole('button',{name:'根据讨论整理任务'}).click();await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();expect(await calls(page,'control')).toHaveLength(0);
});

for(const [width,english,dark] of [[1280,false,false],[390,false,true],[1280,true,true],[390,true,false]] as const)test(`task handoff visual ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page,english,dark);
 const next=page.getByRole('region',{name:english?'Current task':'本次任务'}),button=next.getByRole('button');
  await button.focus();await expect(button).toBeFocused();
  await expect.poll(()=>button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`/tmp/task-handoff-${width}-${english}-${dark}.png`});
 await button.press('Enter');const guide=page.locator('.wf-task-guide-inline');await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();
 expect(await guide.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();expect((await page.locator('.wf-discussion-footer').boundingBox())!.height).toBeLessThan(400);await expect(page.locator('form.composer')).toHaveCount(1);await guide.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));await page.screenshot({path:`/tmp/task-handoff-guide-${width}-${english}-${dark}.png`});
 await page.getByRole('button',{name:english?'Collapse task configuration':'收起任务配置',exact:true}).click();await expect(guide).toBeHidden();await expect(page.getByRole('textbox',{name:english?'What should we discuss?':'这次想推进什么？',exact:true})).toBeFocused();
});

test('long task proposals expand on demand; editing does not collapse the active package',async({page})=>{
 await page.setViewportSize({width:390,height:840});await enter(page);
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;api.guideTask=async input=>{const d=await original(input);if(input.message){d.value.packages=Array.from({length:6},(_,i)=>({...d.value.packages[0],id:'long-'+i,title:'跨项目验证接口契约、模型路由与远端部署流程 '+(i+1),dependencies:i?['long-'+(i-1)]:[]}));(window as any).spaceQA.snapshot.taskDrafts[0]=structuredClone(d);}return d;};});
 await handoff(page).getByRole('button',{name:'整理为任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByLabel('需要检查哪些链接？').fill('已确认的六项隔离验证工作');await guide.getByRole('button',{name:'提交补充并检查'}).click();
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeEnabled();await guide.getByRole('button',{name:'编辑计划',exact:true}).click();const packages=guide.locator('.wf-guide-package');await expect(packages).toHaveCount(6);await expect(guide.locator('.wf-guide-package[open]')).toHaveCount(0);
 await packages.first().locator('summary').click();await packages.first().getByLabel('任务名称',{exact:true}).fill('只检查这轮发布的接口契约');await expect(packages.first()).toHaveAttribute('open');
 await expect(guide.getByRole('button',{name:'确认并启动'})).toBeHidden();await expect(page.locator('form.composer')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await packages.first().locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/task-proposals-long-narrow.png'});
});


test('failed form clarification retains the original editable answers',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理为任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByLabel('需要检查哪些链接？').fill('三个隔离测试链接');await page.evaluate(()=>{window.desktop!.spaces!.guideTask=async()=>{throw Error('测试服务暂时不可用');};});
 await guide.getByRole('button',{name:'提交补充并检查'}).click();await expect(guide.getByRole('alert')).toContainText('暂时不可用');await expect(guide.getByLabel('需要检查哪些链接？')).toHaveValue('三个隔离测试链接');await expect(guide.getByLabel('需要检查哪些链接？')).toBeEditable();
 expect(await calls(page,'control')).toHaveLength(0);
});

test('manual guide can close during assessment and ignores a late response',async({page})=>{
 await enter(page);
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;api.guideTask=async input=>{(window as any).__finishAssessment=()=>original(input);return new Promise(resolve=>{(window as any).__resolveAssessment=resolve;});};});
 await handoff(page).getByRole('button',{name:'整理为任务'}).click();
 const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByText('正在检查需求、分工与验收条件',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();
 await expect(guide).toHaveCount(0);await expect(page.getByRole('textbox',{name:'这次想推进什么？',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const w=window as any;w.__resolveAssessment(await w.__finishAssessment());});
 await expect(guide).toHaveCount(0);expect(await calls(page,'control')).toHaveLength(0);
});

test('incomplete manual edits do not prevent leaving and are restored locally',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理为任务'}).click();
 const guide=page.getByRole('region',{name:'整理为任务'});
 await guide.getByRole('button',{name:'编辑计划',exact:true}).click();await guide.getByLabel('共同目标').fill('');await page.getByLabel('这次想推进什么？',{exact:true}).fill('需要从头核实');
 await page.evaluate(()=>{window.desktop!.spaces!.saveTaskDraft=async()=>{throw Error('不完整的数据不能保存');};});
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await expect(guide).toHaveCount(0);
 await handoff(page).getByRole('button',{name:'继续完善'}).click();
 await guide.getByRole('button',{name:'编辑计划',exact:true}).click();await expect(guide.getByLabel('共同目标')).toHaveValue('');await expect(page.getByLabel('这次想推进什么？',{exact:true})).toHaveValue('需要从头核实');
 expect(await calls(page,'guideTask')).toHaveLength(1);
});

test('the composer talks to the host even while the old manual guide is open',async({page})=>{
 await enter(page);await handoff(page).getByRole('button',{name:'整理为任务'}).click();
 const guide=page.getByRole('region',{name:'整理为任务'});await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;window.desktop!.spaces!.coordinateDiscussion=async input=>{qa.calls.push({action:'host-from-editor',input});qa.snapshot.requests.push({id:input.clientRequestId,spaceId:'space',prompt:input.prompt,replyTo:input.replyTo,mode:'discussion',createdAt:new Date().toISOString(),participants:[],documentRefs:[],host:{status:'completed',revision:1,steps:[{id:'reply',action:'reply',text:'我们重新讨论目标，旧草稿保留。',at:new Date().toISOString()}]}});qa.emit();return structuredClone(qa.snapshot);};});
 await page.getByLabel('这次想推进什么？',{exact:true}).fill('开始新的引导');await page.getByRole('button',{name:'发起讨论',exact:true}).click();
 await expect(guide).toHaveCount(0);await expect(page.getByText('我们重新讨论目标，旧草稿保留。',{exact:true})).toBeInViewport();
 expect(await calls(page,'host-from-editor')).toHaveLength(1);expect(await calls(page,'guideTask')).toHaveLength(1);
});

for(const width of [1280,390])test('AI plan summary replaces empty and automatic forms at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page);
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.guideTask;(window as any).releaseGuide=null;api.guideTask=input=>new Promise(resolve=>{(window as any).releaseGuide=()=>original(input).then(resolve);});});
 await handoff(page).getByRole('button',{name:'整理为任务'}).click();const guide=page.getByRole('region',{name:'整理为任务'});
 await expect(guide.getByText('正在检查需求、分工与验收条件')).toBeVisible();
 await expect(guide.getByLabel('计划名称',{exact:true})).toHaveCount(0);await expect(guide.getByLabel('共同目标',{exact:true})).toHaveCount(0);
 await expect(guide.getByRole('region',{name:'计划预览'})).toHaveCount(0);await expect(guide.getByLabel('编辑节点')).toHaveCount(0);
 await page.evaluate(()=>(window as any).releaseGuide());
 const preview=guide.getByRole('region',{name:'计划预览'});
 await expect(preview.getByRole('heading',{name:'新版发布验证'})).toBeVisible();await expect(preview.getByText('核对所有发布链接',{exact:true})).toBeVisible();
 await expect(preview.locator('.wf-plan-graph')).toBeVisible();await expect(preview.getByLabel('共同目标',{exact:true})).toHaveCount(0);
 await expect(guide.getByLabel('需要检查哪些链接？')).toBeVisible();
 await preview.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/ai-plan-preview-'+width+'.png'});
 expect(await preview.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await preview.getByRole('button',{name:'编辑计划',exact:true}).click();await preview.getByLabel('共同目标',{exact:true}).fill('仅核对三个已确认链接');
 await preview.getByRole('button',{name:'收起编辑',exact:true}).click();await expect(preview.getByText('仅核对三个已确认链接',{exact:true})).toBeVisible();
 await expect(preview.getByLabel('共同目标',{exact:true})).toHaveCount(0);expect(await calls(page,'control')).toHaveLength(0);
});
