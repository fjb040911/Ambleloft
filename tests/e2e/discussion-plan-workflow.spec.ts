import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,query=''){
 await page.goto('/tests/manual/project-space-qa.html'+query);
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,api=window.desktop!.spaces!;qa.snapshot.plans=[];qa.snapshot.taskDrafts=[];
  let serial=0;
  const definition={id:'verify',title:'接口验证',ownerId:'writer',mode:'discussion',projectId:null,instruction:'验证真实接口',deliverables:'验证记录',acceptance:'响应符合契约',verification:'逐项断言',constraints:'使用虚构数据',dependencies:[],documentRefs:[]};
  api.coordinateDiscussion=async(input:any)=>{
   qa.calls.push({action:'coordinate',input});let draft=qa.snapshot.taskDrafts.find((d:any)=>!d.planId),plan=qa.snapshot.plans[0];
   const explain=input.prompt.includes('解释'),status=input.prompt.includes('进度'),action=input.intent==='restart-guide'||input.prompt.includes('开始新的引导')||input.prompt.includes('重新梳理')||input.prompt.includes('Revisit')?'restart-guide':explain?'reply':status?'status':'plan';
   const host:any={status:'ready',revision:1,steps:[{id:'step-'+(++serial),text:explain?'接口验证是后续交付的前置条件。':status?'当前计划尚未验收。':'规划说明：先验证接口，再验收交付。',action,at:new Date().toISOString()}],brief:{goal:'验证交付',items:[]}};
   if(action==='plan'){
    if(!draft){draft={id:'draft-'+serial,spaceId:'space',discussionId:'discussion',revision:1,status:'needs-input',value:{name:'验证交付计划',goal:'验证接口与交付',packages:[structuredClone(definition)]},messages:[],source:[],...(plan?{basePlanId:plan.id,basePlanRevision:plan.revision}:{} )};qa.snapshot.taskDrafts.unshift(draft);}
    else {draft.revision++;if(!draft.value.packages.length)draft.value={name:'验证交付计划',goal:'验证接口与交付',packages:[structuredClone(definition)]};}
    if(input.prompt.includes('重试'))draft.value.packages[0].acceptance='失败后重试并验证恢复';
    const question=input.prompt.includes('生成任务')?{source:{definition:{title:'确认验收范围',fields:[{name:'scope',label:'验收范围',type:'textarea',required:true}]}}}:null;
    draft.status=question?'needs-input':'ready';draft.assessment={revision:draft.revision,summary:'先验证接口，再由用户验收。',missing:question?['验收范围']:[],question,ready:!question};host.status=question?'needs-input':'ready';host.task={draftId:draft.id,draftRevision:draft.revision,summary:draft.assessment.summary,changes:null};
   }
   if(action==='restart-guide'){host.status='completed';host.steps[0].text='本话题已有未结束任务，可以继续修改当前任务。';}
   if(action==='status')host.progress={planId:plan?.id,revision:plan?.revision,name:plan?.name,status:plan?.status,observedAt:new Date().toISOString(),nodes:plan?.packages.map((p:any)=>({id:p.id,title:p.definition.title,status:p.status,accepted:false,reason:'',inputCount:0,approvalCount:0,runId:null}))||[]};
   qa.snapshot.requests.push({id:input.clientRequestId,spaceId:'space',prompt:input.prompt,intent:input.intent,taskContext:input.taskContext,replyTo:input.replyTo||'discussion',mode:'discussion',createdAt:new Date(Date.now()+serial*1000).toISOString(),participants:[],documentRefs:[],host});qa.emit();return structuredClone(qa.snapshot);
  };
  api.createGuidedPlan=async(input:any)=>{qa.calls.push({action:'createGuidedPlan',input});if((window as any).__failApply)throw Error('版本已变化，请重新检查');const d=qa.snapshot.taskDrafts.find((d:any)=>d.id===input.id);let p=qa.snapshot.plans.find((p:any)=>p.id===d.basePlanId);if(p){p.revision++;p.status='draft';p.packages=d.value.packages.map((definition:any)=>({id:definition.id,definition,status:'pending',attempts:[]}));}else {p={id:'saved-plan',spaceId:'space',name:d.value.name,goal:d.value.goal,revision:1,status:'draft',source:{discussionId:'discussion'},packages:d.value.packages.map((definition:any)=>({id:definition.id,definition,status:'pending',attempts:[]})),events:[]};qa.snapshot.plans.unshift(p);}d.planId=p.id;d.status='created';qa.emit();return structuredClone(p);};
  api.controlPlan=async(input:any)=>{qa.calls.push({action:'control',input});qa.snapshot.plans[0].status='running';qa.emit();return structuredClone(qa.snapshot.plans[0]);};qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:/^(讨论|Discussion)$/}).click();
}
const card=(page:Page)=>page.getByRole('region',{name:/^(当前任务流程|Current task workflow)$/});
async function openPlan(page:Page){await page.getByRole('region',{name:/^(本次任务|Current task)$/}).getByRole('button',{name:/^(查看并确认|Review and confirm|确认修订|Review revision|继续完善|Continue refining)$/}).click();}
async function send(page:Page,text:string,review=true){await page.getByRole('textbox',{name:/^(这次想推进什么？|What should we discuss\?)$/}).fill(text);await page.getByRole('button',{name:/^(发起讨论|Start discussion)$/}).click();if(review)await openPlan(page);}
const calls=(page:Page,action:string)=>page.evaluate(a=>(window as any).spaceQA.calls.filter((c:any)=>c.action===a),action);
test('host plans inside the topic, questions share the composer, explanation preserves draft and explicit start runs once',async({page})=>{
 await setup(page);await send(page,'生成任务');await expect(card(page)).toBeVisible();await expect(card(page).locator('.wf-graph-node')).toHaveCount(1);await expect(page.locator('form.composer')).toHaveCount(1);await expect(card(page).getByRole('button',{name:'确认并启动'})).toBeDisabled();
 await card(page).getByLabel('验收范围').fill('验证所有接口的失败重试');await card(page).getByRole('button',{name:'补充给主持人'}).click();await openPlan(page);await expect(card(page).getByRole('button',{name:'确认并启动'})).toBeEnabled();
 await card(page).locator('.wf-graph-node').click();await card(page).getByRole('button',{name:'请主持人解释'}).click();let sent=await calls(page,'coordinate');expect(sent.at(-1).input.taskContext.packageId).toBe('verify');expect(sent.at(-1).input.intent).toBe('explain-node');await expect(page.getByText('接口验证是后续交付的前置条件。',{exact:true})).toBeVisible();
 await send(page,'修改选中节点：增加失败重试验收');await expect(card(page)).toHaveCount(1);await expect(card(page).getByRole('region',{name:'选中节点'})).toContainText('失败后重试');expect(await calls(page,'createGuidedPlan')).toHaveLength(0);
 await card(page).getByRole('button',{name:'确认并启动'}).click();expect(await calls(page,'createGuidedPlan')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(1);await expect(card(page)).toContainText('执行中');
 await card(page).getByRole('button',{name:'汇报进展'}).click();sent=await calls(page,'coordinate');expect(sent.at(-1).input.taskContext.planId).toBe('saved-plan');await expect(page.getByText(/状态查询时间/)).toBeVisible();
});
test('running plan creates a separate revision; applying requires confirmation and does not restart',async({page})=>{
 await setup(page);await send(page,'准备一个计划');await card(page).getByRole('button',{name:'确认并启动'}).click();await send(page,'修改计划，增加重试验证');await expect(card(page)).toContainText('修订草稿');await expect(card(page).getByRole('button',{name:'确认并启动'})).toHaveCount(0);
 await card(page).getByRole('button',{name:'检查并应用修订'}).click();const confirm=page.getByRole('alertdialog');await expect(confirm).toContainText('暂停整个计划');await confirm.getByRole('button',{name:'取消',exact:true}).click();expect(await calls(page,'createGuidedPlan')).toHaveLength(1);
 await card(page).getByRole('button',{name:'检查并应用修订'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'应用修订',exact:true}).click();expect((await calls(page,'createGuidedPlan')).at(-1).input.pauseBeforeApply).toBe(true);expect(await calls(page,'control')).toHaveLength(1);await expect(card(page).getByRole('button',{name:'启动此计划'})).toBeVisible();
});
test('failed save retains the plan and never starts execution; manually editing returns to the same draft',async({page})=>{
 await setup(page);await send(page,'准备一个计划');await page.evaluate(()=>{(window as any).__failApply=true;});await card(page).getByRole('button',{name:'确认并启动'}).click();await expect(card(page).getByRole('alert')).toContainText('版本已变化');expect(await calls(page,'control')).toHaveLength(0);
 await card(page).getByRole('button',{name:'手动编辑草稿'}).click();await expect(page.getByRole('region',{name:'整理为任务',exact:true})).toBeVisible();expect(await calls(page,'createTaskDraft')).toHaveLength(0);await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await expect(card(page)).toHaveCount(0);await page.getByRole('region',{name:'本次任务'}).getByRole('button',{name:'查看并确认'}).click();await expect(card(page)).toBeVisible();
});
for(const [width,lang,theme] of [[1280,'zh','light'],[390,'en','dark']] as const)test(`host workflow layout ${width} ${lang} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,`?lang=${lang}&theme=${theme}`);await send(page,'准备一个计划');await expect(card(page)).toBeVisible();await card(page).scrollIntoViewIfNeeded();await expect(page.locator('form.composer')).toHaveCount(1);expect(await card(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();await page.screenshot({path:`/tmp/host-workflow-${width}.png`});expect(await calls(page,'control')).toHaveLength(0);
});
test('requirements and relationships are guided one step at a time, then each relationship unlocks',async({page})=>{
 await setup(page);await send(page,'生成任务');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,d=qa.snapshot.taskDrafts[0];d.relationGuide={requestKey:'relations',spaceRevision:1,nodes:['first','second'].map((id,index)=>({packageId:id,title:index?'网页交接':'接口职责',reason:'核对项目职责',fields:[{name:'responsibility',type:'textarea',label:'项目职责',required:true}],prefill:{responsibility:index?'接收 API':'提供 API'}}))};
  window.desktop!.spaces!.answerTaskRelations=async(input:any)=>{qa.calls.push({action:'relations',input});d.relationGuide.nodes=d.relationGuide.nodes.filter((n:any)=>n.packageId!==input.packageId);if(!d.relationGuide.nodes.length)d.relationGuide=null;d.revision++;d.assessment.revision=d.revision;qa.emit();return structuredClone(d);};qa.emit();
 });
 await expect(card(page).getByRole('region',{name:'补齐项目关系'})).toHaveCount(0);
 await card(page).getByLabel('验收范围').fill('完整验收范围');await card(page).getByRole('button',{name:'补充给主持人'}).click();await openPlan(page);
 await expect(card(page).getByLabel('验收范围')).toHaveCount(0);
 const relations=card(page).getByRole('region',{name:'补齐项目关系'});
 await expect(relations.getByLabel('项目职责')).toBeEnabled();await relations.getByLabel('项目职责').fill('确认的接口职责');await relations.getByRole('button',{name:'确认关系并用于后续流程'}).click();
 await expect(relations.getByRole('status')).toContainText('已保存「接口职责」');await expect(relations.getByLabel('项目职责')).toHaveValue('接收 API');await expect(relations.getByLabel('项目职责')).toBeEnabled();
 await page.screenshot({path:'test-results/progressive-relationships.png'});
 await relations.getByLabel('项目职责').fill('确认的网页交接');await relations.getByRole('button',{name:'确认关系并用于后续流程'}).click();
 await expect(relations).toHaveCount(0);const requests=await calls(page,'relations');expect(requests).toHaveLength(2);expect(requests[1].input.expectedRevision).toBe(requests[0].input.expectedRevision+1);expect(await calls(page,'control')).toHaveLength(0);
});

test('slow or failed clarification preserves the answer and never shows a locked second form',async({page})=>{
 await setup(page);await send(page,'生成任务');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,d=qa.snapshot.taskDrafts[0];d.relationGuide={requestKey:'relations',spaceRevision:1,nodes:[{packageId:'verify',title:'接口验证',reason:'确认职责',fields:[],prefill:{}}]};
  window.desktop!.spaces!.coordinateDiscussion=async()=>{d.pendingQuestion=d.assessment.question;d.requirementsPending=true;delete d.assessment;d.revision++;qa.emit();await new Promise(resolve=>{(window as any).__releaseClarification=resolve;});throw Error('模型暂时不可用，补充已保存');};qa.emit();
 });
 await card(page).getByLabel('验收范围').fill('失败后仍保留的回答');await card(page).getByRole('button',{name:'补充给主持人'}).click();
 await expect(card(page)).toHaveCount(0);await expect(card(page).getByRole('region',{name:'补齐项目关系'})).toHaveCount(0);
 await page.evaluate(()=>(window as any).__releaseClarification());await expect(page.getByRole('alert').filter({hasText:'模型暂时不可用'})).toBeVisible();await openPlan(page);
 await expect(card(page).getByLabel('验收范围')).toBeEnabled();await expect(card(page).getByLabel('验收范围')).toHaveValue('失败后仍保留的回答');await expect(card(page).getByRole('region',{name:'补齐项目关系'})).toHaveCount(0);await expect(card(page).getByRole('button',{name:'补充给主持人'})).toBeEnabled();
 await page.screenshot({path:'test-results/progressive-clarification-retry.png'});
});

test('explaining a node shows the reply and leaves relationship review behind an explicit entry',async({page})=>{
 await setup(page);await send(page,'准备一个计划');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,d=qa.snapshot.taskDrafts[0];d.status='needs-input';d.assessment.ready=false;
  d.relationGuide={requestKey:'relations',spaceRevision:1,nodes:[{packageId:'verify',title:'接口验证',reason:'核对项目职责',fields:[{name:'responsibility',type:'textarea',label:'项目职责',required:true}],prefill:{responsibility:'提供 API'}}]};
  window.desktop!.spaces!.answerTaskRelations=async(input:any)=>{qa.calls.push({action:'relations',input});return structuredClone(d);};qa.emit();
 });
 await card(page).getByLabel('项目职责').fill('尚未确认的职责');await card(page).locator('.wf-graph-node').click();
 const before=await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts));
 await card(page).getByRole('button',{name:'请主持人解释'}).click();
 const reply=page.getByText('接口验证是后续交付的前置条件。',{exact:true});await expect(reply).toBeVisible();await expect(reply).toBeInViewport();
 await expect(card(page).getByRole('region',{name:'补齐项目关系'})).toHaveCount(0);await expect(page.getByRole('region',{name:'本次任务'}).getByRole('button',{name:'继续完善',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts))).toBe(before);expect(await calls(page,'relations')).toHaveLength(0);expect(await calls(page,'control')).toHaveLength(0);
 await page.screenshot({path:'test-results/node-explanation-reply.png'});
 await openPlan(page);await card(page).getByRole('button',{name:'继续完善计划'}).click();await expect(card(page).getByLabel('项目职责')).toHaveValue('尚未确认的职责');await expect(card(page).getByLabel('项目职责')).toBeEnabled();
});

test('node explanation preserves an earlier host question without forcing it open',async({page})=>{
 await setup(page);await send(page,'准备一个计划');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.at(-1);
  r.host.question={requestKey:'scope-question',source:{definition:{title:'确认范围',fields:[{name:'scope',label:'原先的范围问题',type:'textarea',required:true}]}}};qa.emit();
 });
 await page.getByLabel('原先的范围问题').fill('保留我的回答');
 await card(page).locator('.wf-graph-node').click();await card(page).getByRole('button',{name:'请主持人解释'}).click();
 await expect(page.getByText('接口验证是后续交付的前置条件。',{exact:true})).toBeVisible();
 await expect(page.getByLabel('原先的范围问题')).toBeHidden();
 await page.getByText('继续回答之前的问题',{exact:true}).click();
 await expect(page.getByLabel('原先的范围问题')).toHaveValue('保留我的回答');
 await expect(page.getByLabel('原先的范围问题')).toBeEnabled();
});

test('collapsed workflow stays closed through updates and navigation, and restores unsent input',async({page})=>{
 await setup(page);await send(page,'生成任务');
 await card(page).getByLabel('验收范围').fill('先核对数据来源，不确认旧范围');
 const before=await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts));
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();
 await expect(card(page)).toHaveCount(0);await expect(page.getByRole('region',{name:'本次任务'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'这次想推进什么？',exact:true})).toBeFocused();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.at(-1).host.revision++;qa.emit();});
 await expect(card(page)).toHaveCount(0);
 await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await expect(card(page)).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts))).toBe(before);
 await page.getByRole('region',{name:'本次任务'}).getByRole('button',{name:'继续完善',exact:true}).click();
 await expect(card(page).getByLabel('验收范围')).toHaveValue('先核对数据来源，不确认旧范围');
 expect(await calls(page,'coordinate')).toHaveLength(1);expect(await calls(page,'control')).toHaveLength(0);
 await page.getByRole('button',{name:'收起任务配置',exact:true}).click();await page.screenshot({path:'/tmp/task-guide-collapsed.png'});
});

for(const viaChat of [true,false])test(`revisit keeps the current task (${viaChat?'chat':'button'})`,async({page})=>{
 await setup(page);await send(page,'生成任务');const before=await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts));
 if(viaChat)await send(page,'开始新的引导',false);else {await page.getByRole('button',{name:'讨论操作',exact:true}).click();await page.getByRole('menuitem',{name:'重新梳理当前任务',exact:true}).click();}
 await expect(card(page)).toHaveCount(0);await expect(page.getByText('本话题已有未结束任务，可以继续修改当前任务。',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify((window as any).spaceQA.snapshot.taskDrafts))).toBe(before);expect(await calls(page,'control')).toHaveLength(0);await openPlan(page);await expect(card(page)).toBeVisible();
});

test('host clarification can be deferred and resumed without losing answers',async({page})=>{
 await setup(page);await send(page,'准备一个计划');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.at(-1).host.question={requestKey:'defer-question',source:{definition:{title:'确认范围',fields:[{name:'scope',label:'需要核对的数据',type:'textarea',required:true}]}}};qa.emit();});
 await page.getByLabel('需要核对的数据').fill('尚未提交的数据说明');await page.getByRole('button',{name:'稍后回答',exact:true}).click();
 await expect(page.getByLabel('需要核对的数据')).toHaveCount(0);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.at(-1).host.revision++;qa.emit();});
 await expect(page.getByLabel('需要核对的数据')).toHaveCount(0);
 await page.getByRole('button',{name:'继续回答',exact:true}).click();
 await expect(page.getByLabel('需要核对的数据')).toHaveValue('尚未提交的数据说明');
 expect(await calls(page,'coordinate')).toHaveLength(1);
});

test('a late host submission cannot reopen the old topic after starting over',async({page})=>{
 await setup(page);await send(page,'准备一个计划');
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.coordinateDiscussion;api.coordinateDiscussion=async input=>new Promise(resolve=>{(window as any).__finishOldHost=async()=>resolve(await original(input));});});
 await card(page).getByRole('button',{name:'汇报进展'}).click();
 await page.getByRole('button',{name:'新话题',exact:true}).click();
 await expect(card(page)).toHaveCount(0);
 await page.evaluate(async()=>{await (window as any).__finishOldHost();});
 await expect(page.getByRole('button',{name:'发起讨论',exact:true})).toBeDisabled();
 await expect(card(page)).toHaveCount(0);
 await expect(page.locator('.wf-request')).toHaveCount(0);
});

for(const [width,lang,theme] of [[1280,'zh','light'],[390,'en','dark']] as const)test(`long guide yields to pending chat and reply ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,`?lang=${lang}&theme=${theme}`);await send(page,'生成任务');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,d=qa.snapshot.taskDrafts[0];d.value.goal='需要先核对数据与项目关系。'.repeat(300);qa.emit();});
 const back=page.getByRole('button',{name:lang==='zh'?'收起任务配置':'Collapse task configuration',exact:true});
 await expect(back).toBeInViewport();await expect.poll(()=>back.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBeTruthy();
 await page.evaluate(()=>{const api=window.desktop!.spaces!,original=api.coordinateDiscussion;api.coordinateDiscussion=async input=>new Promise(resolve=>{(window as any).__finishVisibleReply=async()=>resolve(await original(input));});});
 await send(page,'解释一下需要核对哪些数据',false);
 await expect(card(page)).toHaveCount(0);await expect(page.locator('.pending-message')).toBeInViewport();
 await page.evaluate(async()=>{await (window as any).__finishVisibleReply();});
 await expect(page.getByText('接口验证是后续交付的前置条件。',{exact:true})).toBeInViewport();await expect(card(page)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/chat-first-guide-${width}.png`});
});

test('round document collection remains available from its menu and old drafts can be reopened',async({page})=>{
 await setup(page);await send(page,'准备一个计划');await send(page,'开始新的引导',false);
 await openPlan(page);
 await expect(card(page).locator('.wf-graph-node')).toHaveCount(1);await page.getByRole('button',{name:'收起任务配置',exact:true}).click();
 await page.getByRole('button',{name:'本轮操作',exact:true}).last().click();await page.getByRole('menuitem',{name:'整理为文档',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByRole('textbox').last()).toContainText('未结束任务');expect(await calls(page,'control')).toHaveLength(0);
});
