import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,query=''){
 await page.goto('/tests/manual/project-space-qa.html'+query);
 await page.evaluate(()=>{const q=(window as any).spaceQA,base=q.snapshot.requests.find((r:any)=>r.id==='discussion');
 base.host={status:'completed',revision:1,steps:[],brief:{goal:'形成发布目标与方案',items:[{id:'q',kind:'question',text:'确认验收范围',sourceIds:[]}]}};
 for(let i=0;i<14;i++)q.snapshot.requests.push({...structuredClone(base),id:'topic-'+i,prompt:'架构话题 '+i,createdAt:`2026-10-${String(10+i).padStart(2,'0')}T09:00:00Z`,documentRefs:[],host:undefined,participants:[]});
 const other=q.snapshot.requests.find((r:any)=>r.id==='topic-0');other.documentRefs=base.documentRefs;
 q.snapshot.documents[0].sourceDiscussionId='discussion';
 q.snapshot.plans[0].source={discussionId:'discussion',draftId:'old',revision:1,confirmedAt:'2026-10-26T09:00:00Z'};
 q.snapshot.taskDrafts=[];q.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:/^(讨论|Discussion)$/}).click();
 const toggle=page.getByRole('button',{name:/^(查看讨论与相关内容|Show discussion context)$/});if(await toggle.isVisible())await toggle.click();
 return page.getByRole('region',{name:/^(话题与相关内容|Topics and related content)$/});
}
test('switching topics preserves separate drafts and source selection',async({page})=>{
 const sidebar=await setup(page);const input=page.getByLabel('这次想推进什么？');await input.fill('话题一的草稿');
 await sidebar.getByRole('button',{name:'架构话题 0',exact:true}).click();await expect(input).toHaveValue('');await input.fill('话题二的草稿');
 await sidebar.getByRole('button',{name:'明确发布目标',exact:true}).click();await expect(input).toHaveValue('话题一的草稿');
 await sidebar.getByRole('button',{name:'架构话题 0',exact:true}).click();await expect(input).toHaveValue('话题二的草稿');
 await sidebar.getByRole('button',{name:'新话题',exact:true}).click();await expect(input).toHaveValue('');await expect(page.getByRole('button',{name:/参考资料/})).toContainText('0');await expect(page.locator('.wf-discussion-header')).not.toContainText('架构话题 0');
 await sidebar.getByRole('button',{name:'明确发布目标',exact:true}).click();await expect(input).toHaveValue('话题一的草稿');
 await expect(page.getByRole('button',{name:/参考资料/})).toContainText('1');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('workforce-discussion:space:topics')!).drafts['topic-0'].prompt)).toBe('话题二的草稿');
});
for(const width of [1280,390])test(`topic plan reuses delivery review and shows scheduling in place ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const sidebar=await setup(page,width===390?'?theme=dark':'');
 await page.getByRole('region',{name:'本次任务',exact:true}).getByRole('button',{name:'查看交付并验收',exact:true}).click();
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.qa-scroll')).not.toHaveAttribute('data-wf-node-viewport','true');
 await page.getByRole('button',{name:'验收通过',exact:true}).click();
 const result=page.getByRole('region',{name:'验收结果与后续任务'});await expect(result).toContainText('尚无后续任务开始执行');
 await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.plans[0].packages[1].status='running';q.emit();});
 await expect(result).toContainText('1 项执行中，0 项准备中');await expect(result).toContainText('发布包整理');
 await expect(sidebar.getByRole('listitem')).toHaveCount(15);
 await page.screenshot({path:`/tmp/topic-review-in-place-${width}.png`});
 await page.getByRole('button',{name:'返回讨论',exact:true}).click();await expect(page.getByLabel('这次想推进什么？')).toBeVisible();
 await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(page.locator('.wf-task-review')).toHaveCount(0);await expect(page.locator('.wf-plan-graph')).toBeVisible();
});

test('topic output collection includes every round and never starts execution',async({page})=>{
 const sidebar=await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA;const r=q.snapshot.requests.find((r:any)=>r.id==='discussion');q.snapshot.requests.push({...structuredClone(r),id:'round-two',replyTo:r.id,prompt:'补充第二轮目标',createdAt:'2026-11-06T09:00:00Z',participants:[{employeeId:'writer',status:'completed',output:'第二轮专家的结论'}],host:undefined});q.emit();});
 await expect(page.locator('#wf-request-round-two')).toHaveCount(1);await page.getByRole('button',{name:'讨论操作',exact:true}).click();await page.getByRole('menuitem',{name:'整理讨论为文档'}).click();
 const body=page.getByRole('dialog').getByRole('textbox',{name:'正文（Markdown）'});await expect(body).toContainText('明确发布目标');await expect(body).toContainText('补充第二轮目标');await expect(body).toContainText('第二轮专家的结论');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
});


for(const [width,english,dark] of [[1280,false,false],[390,true,true]] as const)test(`one status per topic with compact selected item ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const sidebar=await setup(page,`?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`),root=sidebar.locator('[data-slot=item][data-topic-id="discussion"]');
 await expect(root).toHaveAttribute('data-selected','true');await expect(root).toContainText(english?'Needs attention':'待处理');await expect(root.getByRole('button')).toHaveCount(1);expect((await root.boundingBox())!.height).toBeLessThan(90);
 await expect(sidebar.locator('[data-topic-entry]')).toHaveCount(0);await expect(sidebar.getByRole('tab')).toHaveCount(0);
 const list=sidebar.locator('.wf-topic-scroll');await expect(list).toHaveCSS('overflow-y','visible');await expect(list).toHaveCSS('mask-image','none');const last=sidebar.locator('[data-slot=item]').last();
 await last.getByRole('button').focus();await page.keyboard.press('Enter');await expect(last).toHaveAttribute('data-selected','true');
 const summary=page.getByRole('region',{name:english?'Current task':'本次任务',exact:true});await expect(summary).toContainText(english?'Not created':'未生成');
 await sidebar.getByRole('textbox',{name:english?'Search topics':'搜索话题'}).fill('架构话题 13');await expect(sidebar.getByRole('listitem')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`/tmp/topic-serial-${width}.png`});
});

test('task statuses cover readiness, pause, blockers and completion without treating shared references as ownership',async({page})=>{
 const sidebar=await setup(page),summary=page.getByRole('region',{name:'本次任务',exact:true});
 for(const [status,node,label,button,variant] of [['draft','pending','待执行','开始执行','outline'],['running','running','执行中','查看进度','info'],['paused','interrupted','已暂停','恢复执行','secondary'],['running','failed','待处理','查看并处理','destructive'],['running','review','待处理','查看交付并验收','warning'],['completed','accepted','已结束','创建下一项任务','outline']]){
  await page.evaluate(({status,node})=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status=status;p.packages.forEach((n:any)=>{n.status=node;});q.emit();},{status,node});
  await expect(summary).toContainText(label);await expect(summary.getByRole('button',{name:button,exact:true})).toBeVisible();
  await expect(summary.locator('[data-slot=badge]')).toHaveAttribute('data-variant',variant);await expect(sidebar.locator('[data-topic-id=discussion] .wf-topic-status')).toHaveAttribute('data-variant',variant);await expect(summary.locator('[data-slot=badge] svg')).toHaveAttribute('aria-hidden','true');
 }
 await expect(summary).not.toContainText('任务记录');await sidebar.getByRole('button',{name:'任务记录 · 1',exact:true}).click();await expect(sidebar.getByRole('button',{name:'发布准备',exact:true})).toBeVisible();
 await sidebar.getByRole('button',{name:'架构话题 0',exact:true}).click();await expect(summary).toContainText('未生成');await expect(summary).not.toContainText('发布准备');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
});

test('a draft stays current until explicitly ended; next task creation never executes it',async({page})=>{
 await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.plans=[];q.snapshot.taskDrafts=[{id:'draft',spaceId:'space',discussionId:'discussion',revision:1,status:'needs-input',source:[],messages:[],value:{name:'当前草稿',goal:'',packages:[]}}];q.emit();});
 const summary=page.getByRole('region',{name:'本次任务',exact:true});await expect(summary).toContainText('梳理中');await expect(summary.getByRole('button',{name:'创建下一项任务'})).toHaveCount(0);
 await summary.getByRole('button',{name:'更多任务操作'}).click();await page.getByRole('menuitem',{name:'结束草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(summary).toContainText('梳理中');
 await summary.getByRole('button',{name:'更多任务操作'}).click();await page.getByRole('menuitem',{name:'结束草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'结束草稿',exact:true}).click();await expect(summary).toContainText('已结束');
 await summary.getByRole('button',{name:'创建下一项任务',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='coordinateDiscussion').at(-1)?.input.intent)).toBe('restart-guide');
 await expect(page.getByRole('region',{name:'整理为任务',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['guideTask','createTaskDraft'].includes(c.action)))).toEqual([]);
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
});

for(const english of [false,true])test(`draft presentation follows readiness without changing lifecycle or history (${english?'en':'zh'})`,async({page},testInfo)=>{
 const sidebar=await setup(page,english?'?lang=en':'');
 await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='completed';p.packages.forEach((n:any)=>n.status='accepted');q.snapshot.taskDrafts=[{id:'new-goal',spaceId:'space',discussionId:'discussion',revision:1,status:'needs-input',requirementsPending:true,source:[],messages:[],value:{name:'',goal:'',packages:[]}}];q.emit();});
 const summary=page.getByRole('region',{name:english?'Current task':'本次任务',exact:true}),badge=summary.locator('[data-slot=badge]'),topicBadge=sidebar.locator('[data-topic-id=discussion] .wf-topic-status');
 for(const name of ['', 'A named but incomplete draft']){
  await page.evaluate(name=>{const q=(window as any).spaceQA;q.snapshot.taskDrafts[0].value.name=name;q.emit();},name);
  await expect(badge).toHaveText(english?'Clarifying':'梳理中');await expect(topicBadge).toHaveText(english?'Clarifying':'梳理中');
  await expect(badge).toHaveAttribute('data-status','collecting');await expect(badge).toHaveAttribute('data-variant','secondary');
  await expect(summary.getByRole('button',{name:english?'Continue refining':'继续完善',exact:true})).toBeVisible();
  await expect(summary.getByRole('button',{name:english?'Create next task':'创建下一项任务'})).toHaveCount(0);
 }
 await page.screenshot({path:testInfo.outputPath('clarifying.png')});
 await expect(sidebar.getByRole('button',{name:english?'Task records · 1':'任务记录 · 1',exact:true})).toBeVisible();
 await page.evaluate(()=>{const q=(window as any).spaceQA,d=q.snapshot.taskDrafts[0];d.status='ready';d.requirementsPending=false;d.assessment={ready:true,revision:d.revision,missing:[],summary:'Ready',question:null};q.emit();});
 await expect(badge).toHaveText(english?'To confirm':'待确认');await expect(topicBadge).toHaveText(english?'To confirm':'待确认');await expect(badge).toHaveAttribute('data-variant','warning');
 await expect(summary.getByRole('button',{name:english?'Review and confirm':'查看并确认',exact:true})).toBeVisible();
 // A revision draft must not hide the active task's acceptance action or status.
 await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0],d=q.snapshot.taskDrafts[0];p.status='running';p.packages[0].status='review';d.basePlanId=p.id;d.status='needs-input';q.emit();});
 await expect(badge).toHaveText(english?'Needs attention':'待处理');await expect(summary.getByRole('button',{name:english?'Review delivery':'查看交付并验收',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['control','createTaskDraft','guideTask','createGuidedPlan'].includes(c.action)))).toEqual([]);
});

test('starting requires an explicit action and failures preserve the current task',async({page})=>{
 await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='draft';p.packages.forEach((n:any)=>n.status='pending');window.desktop!.spaces!.controlPlan=async input=>{q.calls.push({action:'control',input});throw Error('暂时无法启动，请重试');};q.emit();});
 const summary=page.getByRole('region',{name:'本次任务',exact:true});await summary.getByRole('button',{name:'开始执行',exact:true}).click();await expect(summary).toContainText('暂时无法启动，请重试');await expect(summary).toContainText('待执行');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(1);
});


test('analysis execution requests never become topics, including after remount',async({page})=>{
 const sidebar=await setup(page);
 await page.evaluate(()=>{const q=(window as any).spaceQA;const request=q.snapshot.requests.find((r:any)=>r.id==='plan-request');request.mode='discussion';request.prompt='INTERNAL EXECUTION PROMPT';q.snapshot.plans[0].packages[0].definition.mode='discussion';q.emit();});
 await expect(sidebar.getByRole('listitem')).toHaveCount(15);await expect(sidebar).not.toContainText('INTERNAL EXECUTION PROMPT');
 await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await expect(sidebar.getByRole('listitem')).toHaveCount(15);await expect(sidebar).not.toContainText('INTERNAL EXECUTION PROMPT');
 await page.getByRole('region',{name:'本次任务',exact:true}).getByRole('button',{name:'查看交付并验收',exact:true}).click();
 await expect(page.locator('.wf-task-review')).toContainText('实际交付');
});

test('completed topic next-task action asks for a new goal without copying the previous draft',async({page})=>{
 await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='completed';p.packages.forEach((n:any)=>n.status='accepted');q.emit();});
 await page.getByRole('textbox',{name:'这次想推进什么？'}).fill('保留尚未发送的新目标');
 await page.getByRole('region',{name:'本次任务',exact:true}).getByRole('button',{name:'创建下一项任务',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='coordinateDiscussion')?.input.intent)).toBe('restart-guide');
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);const request=calls.find((c:any)=>c.action==='coordinateDiscussion').input;
 expect(request.replyTo).toBe('discussion');expect(request.prompt).toContain('新目标');
 expect(calls.some((c:any)=>['createTaskDraft','guideTask','control','createGuidedPlan'].includes(c.action))).toBe(false);
 await expect(page.getByRole('textbox',{name:'这次想推进什么？'})).toHaveValue('保留尚未发送的新目标');
 await expect(page.getByRole('region',{name:'本次任务',exact:true})).toContainText('已结束');
});

for(const width of [1280,390])test(`conflicts stay compact and resolve explicitly without starting a plan ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const sidebar=await setup(page,width===390?'?theme=dark':'');
 await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='paused';p.name='多项目开发流程测试计划'.repeat(8);q.snapshot.taskDrafts=[{id:'extra',spaceId:'space',discussionId:'discussion',revision:1,status:'needs-input',source:[],messages:[],value:{name:'不再需要的旧草稿',goal:'',packages:[]}}];q.emit();});
 const summary=page.getByRole('region',{name:'本次任务',exact:true});
 await expect(summary).toContainText('存在多个未结束任务');await expect(summary.getByRole('button')).toHaveCount(1);await expect(summary).not.toContainText('不再需要的旧草稿');
 expect((await summary.boundingBox())!.height).toBeLessThan(width===1280?57:100);
 await summary.getByRole('button',{name:'处理任务冲突'}).click();const dialog=page.getByRole('dialog',{name:'处理任务冲突'});
 await expect(dialog).toContainText('多项目开发流程测试计划');await expect(dialog).toContainText('不再需要的旧草稿');
 await dialog.getByRole('button',{name:'结束草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'结束草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'结束草稿',exact:true}).click();
 await expect(dialog).toBeHidden();await expect(summary).toContainText('已暂停');await expect(summary.getByRole('button',{name:'查看交付并验收',exact:true})).toBeVisible();
 await expect(sidebar.getByRole('button',{name:'任务记录 · 1',exact:true})).toBeVisible();await expect(summary).not.toContainText('任务记录');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
 expect((await summary.boundingBox())!.height).toBeLessThan(width===1280?57:100);
 const title=await summary.locator('.wf-current-task-name').boundingBox(),bar=await summary.boundingBox();expect(title!.x+title!.width).toBeLessThanOrEqual(bar!.x+bar!.width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/topic-status-compact-${width}.png`});
});

test('paused plan prioritizes delivery review and never resumes implicitly',async({page})=>{
 await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.plans[0].status='paused';q.emit();});
 const summary=page.getByRole('region',{name:'本次任务',exact:true});await expect(summary.getByRole('button',{name:'恢复执行',exact:true})).toHaveCount(0);
 await summary.getByRole('button',{name:'查看交付并验收',exact:true}).click();await page.getByRole('button',{name:'验收通过',exact:true}).click();
 const result=page.getByRole('region',{name:'验收结果与后续任务'});await expect(result).toContainText('计划未运行，不会启动新的任务');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
 await page.getByRole('button',{name:'返回讨论',exact:true}).click();await summary.getByRole('button',{name:'恢复执行',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').map((c:any)=>c.input.action))).toEqual(['resume']);
});

test('sidebar history opens its owning topic and preserves the other topic composer',async({page})=>{
 const sidebar=await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='completed';p.packages.forEach((n:any)=>n.status='accepted');q.emit();});
 await sidebar.getByRole('button',{name:'架构话题 0',exact:true}).click();await page.getByLabel('这次想推进什么？').fill('另一个话题尚未发送的内容');
 await sidebar.getByRole('button',{name:'任务记录 · 1',exact:true}).click();await sidebar.getByRole('button',{name:'发布准备',exact:true}).click();
 await expect(sidebar.locator('[data-topic-id="discussion"]')).toHaveAttribute('data-selected','true');await expect(page.getByRole('region',{name:'本次任务详情'})).toContainText('发布准备');
 await page.getByRole('button',{name:'返回讨论',exact:true}).click();await expect(page.getByRole('region',{name:'本次任务',exact:true})).toContainText('已结束');
 await sidebar.getByRole('button',{name:'架构话题 0',exact:true}).click();await expect(page.getByLabel('这次想推进什么？')).toHaveValue('另一个话题尚未发送的内容');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
});

test('conflict resolution failure retains the draft and offers a retry',async({page})=>{
 await setup(page);await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.taskDrafts=[{id:'extra',spaceId:'space',discussionId:'discussion',revision:1,status:'needs-input',source:[],messages:[],value:{name:'应保留的草稿',goal:'',packages:[]}}];window.desktop!.spaces!.discardTaskDraft=async()=>{throw Error('保存失败，请重试');};q.emit();});
 const summary=page.getByRole('region',{name:'本次任务',exact:true});await summary.getByRole('button',{name:'处理任务冲突'}).click();
 const dialog=page.getByRole('dialog',{name:'处理任务冲突'});await dialog.getByRole('button',{name:'结束草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'结束草稿',exact:true}).click();
 await expect(dialog).toContainText('保存失败，请重试');await expect(dialog).toContainText('应保留的草稿');await expect(dialog.getByRole('button',{name:'结束草稿',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).spaceQA.snapshot.taskDrafts[0].discardedAt)).toBeUndefined();expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toEqual([]);
});

for(const [width,lang,theme] of [[1280,'zh','light'],[390,'en','dark']] as const)test(`topic badges and history stay aligned with long titles ${width} ${lang}`,async({page})=>{
 await page.setViewportSize({width,height:900});const sidebar=await setup(page,`?lang=${lang}&theme=${theme}`);
 await page.evaluate(()=>{const q=(window as any).spaceQA,p=q.snapshot.plans[0];p.status='completed';p.packages.forEach((n:any)=>n.status='accepted');p.name='状态栏验收调度验证：7+8求和与独立复核'.repeat(4);q.snapshot.plans.push({...structuredClone(p),id:'short-history',name:'短任务'});q.snapshot.taskDrafts=[{id:'discarded-long',spaceId:'space',discussionId:'discussion',revision:1,status:'ready',discardedAt:'2026-11-06T07:00:00Z',source:[],messages:[],value:{name:'https://example.test/'+ 'long-unbroken-name'.repeat(8),goal:'',packages:[]}}];q.emit();});
 const topic=sidebar.locator('[data-topic-id="discussion"]');await expect(topic.locator('.wf-topic-status')).toHaveAttribute('data-slot','badge');
 await topic.getByRole('button',{name:/^(任务记录|Task records) · 3$/}).click();const history=topic.getByRole('list',{name:/^(历史任务|Task history)$/});
 await expect(history.locator('li>[data-slot=badge]')).toHaveCount(3);await expect(history.locator('[data-status=completed]')).toHaveCount(2);await expect(history.locator('[data-status=completed]').first()).toHaveAttribute('data-variant','success');await expect(history.locator('[data-status=discarded]')).toHaveAttribute('data-variant','outline');
 const bounds=await sidebar.evaluate(el=>{const list=el.querySelector('.wf-topic-scroll')!,last=el.querySelector('[aria-label="历史任务"] li:last-child,[aria-label="Task history"] li:last-child')!;return{listBottom:list.getBoundingClientRect().bottom,lastBottom:last.getBoundingClientRect().bottom,overflow:list.scrollHeight>list.clientHeight+1};});expect(bounds.overflow).toBe(false);expect(bounds.lastBottom).toBeLessThanOrEqual(bounds.listBottom);
 const geometry=await topic.evaluate(el=>{const parent=el.getBoundingClientRect(),content=el.querySelector('[data-slot=item-content]')!.getBoundingClientRect();return{overflow:el.scrollWidth>el.clientWidth+1,contentRight:content.right,parentRight:parent.right,entries:[...el.querySelectorAll('.wf-topic-record-link,.wf-topic-record-name')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{x:r.x,right:r.right,align:s.textAlign,justify:s.justifyContent,overflow:e.scrollWidth>e.clientWidth+1};})};});
 expect(geometry.overflow).toBe(false);expect(geometry.contentRight).toBeLessThanOrEqual(geometry.parentRight);for(const e of geometry.entries){expect(e.overflow).toBe(false);expect(e.right).toBeLessThanOrEqual(geometry.parentRight);expect(Math.abs(e.x-geometry.entries[0].x)).toBeLessThan(1);}
 expect(geometry.entries[0].justify).toBe('flex-start');expect(geometry.entries[1].align).toBe('left');
 await page.screenshot({path:`/tmp/topic-badge-history-${width}.png`});
 await history.getByRole('button',{name:'短任务',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:/^(本次任务详情|Current task details)$/})).toContainText('短任务');
});
