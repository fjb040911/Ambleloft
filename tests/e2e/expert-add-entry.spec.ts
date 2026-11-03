import {test,expect} from '@playwright/test';

for (const config of [
 {name:'zh-light',width:1200,query:'view=experts'},
 {name:'en-dark-narrow',width:390,query:'view=experts&lang=en&theme=dark'},
]) test(`expert creation choices stay contained: ${config.name}`,async({page})=>{
 await page.setViewportSize({width:config.width,height:800});
 await page.goto('/tests/manual/project-space-qa.html?'+config.query);
 const trigger=page.getByRole('button',{name:config.name==='zh-light'?'添加专家':'Add expert',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:config.name==='zh-light'?'添加 AI 专家':'Add an AI expert'});
 await expect(dialog).toBeVisible();
 await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 await dialog.screenshot({path:`/tmp/expert-choice-check-${config.name}.png`});
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 const options=dialog.locator('.wf-add-option');await expect(options).toHaveCount(2);
 const boxes=await options.evaluateAll(els=>els.map(el=>{const rect=el.getBoundingClientRect();const children=[...el.querySelectorAll('strong,small,svg')].map(c=>c.getBoundingClientRect());return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,children:children.map(r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right}))};}));
 for(const box of boxes){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(config.width);}
 for(const box of boxes)for(const child of box.children){expect(child.top).toBeGreaterThanOrEqual(box.top-1);expect(child.bottom).toBeLessThanOrEqual(box.bottom+1);expect(child.left).toBeGreaterThanOrEqual(box.left-1);expect(child.right).toBeLessThanOrEqual(box.right+1);}
 expect(boxes[0].bottom).toBeLessThan(boxes[1].top);
 await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 await page.screenshot({path:`/tmp/expert-choice-${config.name}.png`});
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
});

test('creation choices retain context and return to experts',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await expect(page.getByRole('button',{name:'返回我的专家'})).toBeVisible();
 await page.getByRole('button',{name:'返回我的专家'}).click();
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/自己设计角色/}).click();
 await expect(page.getByRole('heading',{name:'添加 AI 专家',level:1})).toBeVisible();
 await page.getByRole('button',{name:'我的专家',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
});

test('viewing an unchanged template does not prompt to save a draft',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'查看详情：产品经理'}).click();
 await page.getByRole('button',{name:'调整后添加'}).click();
 await page.getByRole('button',{name:'配置技能'}).click();
 await page.getByRole('button',{name:'我的专家',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
 await expect(page.getByRole('alertdialog',{name:'保留这份草稿？'})).toHaveCount(0);
});

test('editing a template still prompts before leaving',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'查看详情：产品经理'}).click();
 await page.getByRole('button',{name:'调整后添加'}).click();
 await page.getByLabel('专家名称').fill('产品规划专家');
 await page.getByRole('button',{name:'我的专家',exact:true}).click();
 const leaveDialog=page.getByRole('alertdialog',{name:'保留这份草稿？'});
 await expect(leaveDialog).toBeVisible();
 const leaveFooter=await leaveDialog.locator('[data-slot=alert-dialog-footer]').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopWidth,margin:s.marginBottom};});
 expect(leaveFooter).toEqual({background:'rgba(0, 0, 0, 0)',border:'0px',margin:'0px'});
 await page.getByRole('button',{name:'放弃更改'}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
});

test('opening an existing expert and browsing its configuration does not prompt',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts');
 await page.evaluate(()=>{
  const api=window.desktop!.workforce!;
  const original=api.createDraft;
  api.createDraft=async input=>{
   const draft=await original(input);
   if(!input.employeeId)return draft;
   return {...draft,employeeId:input.employeeId,employeeRevision:1,origin:'employee',ephemeral:true,value:{name:'文案员工',domain:'文案',responsibilities:'编写发布材料',deliverables:'发布文案',methods:'先查依据再编写',skills:[]}};
  };
 });
 await page.getByRole('button',{name:'查看档案'}).click();
 await page.getByRole('button',{name:'编辑专家配置'}).click();
 await expect(page.getByLabel('专家名称')).toHaveValue('文案员工');
 await page.getByRole('navigation',{name:'专家配置分区'}).getByRole('button',{name:'技能',exact:true}).click();
 await page.getByRole('button',{name:'我的专家',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
 await expect(page.getByRole('alertdialog',{name:'保留这份草稿？'})).toHaveCount(0);
});

test('role card adds the default configuration without opening the editor',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.evaluate(()=>{window.desktop!.workforce!.submit=async input=>{(window as any).__quickAdd=input;return {id:'writer',revision:1};};});
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'添加专家：产品经理'}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
 const input=await page.evaluate(()=>(window as any).__quickAdd);
 expect(input.value.name).toBe('产品经理');expect(input.value.skills.map((skill:any)=>skill.name)).toEqual(['research']);
 expect(input.value.templateRef).toEqual({id:'product-manager',version:'1.0.0'});
 expect(input.draftId).toBeUndefined();
});

test('role details keep the heading clear and space example tasks',async({page})=>{
 await page.setViewportSize({width:390,height:800});
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.evaluate(()=>{const api=window.desktop!.workforce!,original=api.roles;api.roles=async input=>{const result=await original(input);return {...result,items:result.items.map(item=>({...item,id:'amble.product'}))};};});
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'查看详情：产品经理'}).click();
 const dialog=page.getByRole('dialog',{name:'产品经理'});
 const footer=await dialog.locator('[data-slot=dialog-footer]').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopWidth,margin:s.marginBottom};});
 expect(footer).toEqual({background:'rgba(0, 0, 0, 0)',border:'0px',margin:'0px'});
 await expect(dialog.getByText('角色模板',{exact:true})).toHaveCount(0);
 await expect(dialog.getByText('Ambleloft',{exact:true})).toHaveCount(0);
 const section=dialog.locator('.wf-role-detail-examples');
 const gap=await section.evaluate(el=>el.querySelector('ul')!.getBoundingClientRect().top-el.querySelector('h3')!.getBoundingClientRect().bottom);
 expect(gap).toBeGreaterThanOrEqual(10);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await dialog.screenshot({path:'/tmp/expert-role-details-narrow.png'});
});

test('configuration exposes skill function and details',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.evaluate(()=>{window.desktop!.openLink=async url=>{(window as any).__openedSkillUrl=url;};});
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'查看详情：产品经理'}).click();
 await page.getByRole('button',{name:'调整后添加'}).click();
 await page.getByRole('button',{name:'配置技能'}).click();
 await expect(page.getByText('分析需求',{exact:true})).toBeVisible();
 await expect(page.getByText(/GitHub · example\/skills/)).toBeVisible();
 await expect(page.getByRole('link',{name:'在 GitHub 打开'})).toHaveAttribute('href','https://github.com/example/skills');
 await page.getByRole('link',{name:'在 GitHub 打开'}).click();
 expect(await page.evaluate(()=>(window as any).__openedSkillUrl)).toBe('https://github.com/example/skills');
 await page.screenshot({path:'/tmp/expert-skills-after.png'});
 await page.getByText('查看技能详情').click();
 await expect(page.getByText('固定版本')).toBeVisible();
});

test('role actions remain usable in a narrow window',async({page})=>{
 await page.setViewportSize({width:390,height:800});
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 const card=page.locator('.wf-role-card').first();
 await expect(card.getByRole('button',{name:'添加专家：产品经理'})).toBeVisible();
 const banner=card.locator('.wf-role-banner');
 const title=card.getByRole('button',{name:'查看角色：产品经理'});
 await expect(banner.getByRole('button',{name:'查看角色：产品经理'})).toBeVisible();
 await title.evaluate(el=>{el.textContent='负责跨区域复杂产品规划与交付的资深产品专家';});
 const layout=await banner.evaluate(el=>{const text=el.querySelector('h3')!.getBoundingClientRect(),badge=el.querySelector('[data-slot=badge]')!.getBoundingClientRect(),box=el.getBoundingClientRect();return {right:text.right,badgeLeft:badge.left,bottom:text.bottom,boxBottom:box.bottom};});
 expect(layout.right).toBeLessThanOrEqual(layout.badgeLeft);expect(layout.bottom).toBeLessThanOrEqual(layout.boxBottom);
 expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await card.screenshot({path:'/tmp/expert-role-card-narrow.png'});
});

test('expert cards show live preparation and current skill readiness',async({page})=>{
 await page.setViewportSize({width:1200,height:800});
 await page.goto('/tests/manual/project-space-qa.html?view=experts');
 await page.evaluate(async()=>{
  const api=window.desktop!.workforce!,initial=await api.snapshot(),base=initial.employees[0];
  const skill=(name:string)=>({name,label:name,purpose:'',key:name,source:{kind:'installed' as const,skillId:name}});
  const a=skill('资料整理'),b=skill('需求分析');
  const pending={id:'job-1',employeeId:'pending',status:'running',candidate:{...base,name:'筹备中专家',skills:[a,b]},steps:[{key:a.key,label:a.label,status:'reused'},{key:b.key,label:b.label,status:'downloading'}]};
  const employees=[{...base,id:'pending',name:'筹备中专家',pending:true,pendingJob:pending,job:pending,status:'activating' as const,skills:[a,b],requirements:[]},
   {...base,id:'updated',name:'已有配置专家',skills:[a],requirements:[{...a,readiness:'ready' as const}],status:'ready' as const,pendingJob:{...pending,id:'job-2',employeeId:'updated'}},
   {...base,id:'disabled',name:'技能停用专家',skills:[a],requirements:[{...a,readiness:'disabled' as const}],job:{id:'old',status:'ready',steps:[{key:a.key,label:a.label,status:'installed'}]},status:'saved' as const}];
  api.snapshot=async()=>({...initial,employees});
  await window.desktop!.spaces!.lifecycle({id:'empty',action:'archive'});
 });
 const pending=page.locator('.wf-expert-card').filter({hasText:'筹备中专家'});
 await expect(pending.getByRole('button',{name:/正在准备技能 · 1 \/ 2 项就绪/})).toBeVisible();
 await expect(pending.getByText('正在处理：需求分析')).toBeVisible();
 await expect(page.locator('.wf-expert-card').filter({hasText:'已有配置专家'}).getByText(/当前配置可用 · 新配置/)).toBeVisible();
 const disabled=page.locator('.wf-expert-card').filter({hasText:'技能停用专家'});
 await expect(disabled.getByText('0 / 1 项技能就绪')).toBeVisible();
 await page.screenshot({path:'/tmp/expert-cards-status.png'});
 await disabled.getByRole('button',{name:/0 \/ 1 项技能就绪/}).click();
 const dialog=page.getByRole('dialog',{name:/技能停用专家/});
 await expect(dialog.getByText('已停用',{exact:true})).toBeVisible();
 await expect(dialog.getByText('已安装到全局库')).toHaveCount(0);
 await page.screenshot({path:'/tmp/expert-preparation-status.png'});
});

test('custom expert opens directly at the first of three steps',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/自己设计角色/}).click();
 await expect(page.getByRole('dialog',{name:'添加 AI 专家'})).toBeHidden();
 await expect(page.locator('.wf-steps li').filter({hasText:'定义角色'})).toBeVisible();
 await expect(page.locator('.wf-steps li').filter({hasText:'配置技能'})).toBeVisible();
 await expect(page.locator('.wf-steps li').filter({hasText:'确认配置'})).toBeVisible();
 await expect(page.getByRole('button',{name:'AI 帮我梳理'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'建议职责与交付'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'上一步'})).toBeDisabled();
 await page.screenshot({path:'/tmp/expert-simple-first-step.png',fullPage:true});
 await page.getByRole('button',{name:'确认配置'}).click();
 await expect(page.getByText('请先填写专家名称和主要职责，再提交配置。')).toBeVisible();
 await expect(page.getByRole('button',{name:'添加专家并准备技能',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'定义角色',exact:true}).click();
 await page.getByLabel('专家名称').fill('虚构差旅专家');
 await page.getByLabel('主要职责').fill('帮助员工整理差旅信息');
 await page.getByRole('button',{name:'配置技能'}).click();
 await expect(page.getByRole('button',{name:'添加或替换技能'})).toBeVisible();
 await expect(page.getByRole('button',{name:'AI 推荐技能'})).toHaveCount(0);
 await page.getByRole('button',{name:'定义角色',exact:true}).click();
 await expect(page.getByLabel('主要职责')).toHaveValue('帮助员工整理差旅信息');
});

test('curated role can jump between steps without restoring a removed default skill',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/从角色库中选择/}).click();
 await page.getByRole('button',{name:'查看详情：产品经理'}).click();
 await page.getByRole('button',{name:'调整后添加'}).click();
 await expect(page.getByLabel('专家名称')).toHaveValue('产品经理');
 await page.getByRole('button',{name:'确认配置'}).focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'确认配置'})).toHaveAttribute('aria-current','step');
 await expect(page.getByText('需求研究',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'添加专家并准备技能',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'配置技能'}).click();
 await page.getByRole('button',{name:'移除声明：需求研究'}).click();
 await page.getByRole('button',{name:'定义角色',exact:true}).click();
 await page.getByLabel('专业方向（可选）').fill('芯片产品');
 await page.getByRole('button',{name:'确认配置'}).click();
 await expect(page.getByText('芯片产品',{exact:true})).toBeVisible();
 await expect(page.getByText('需求研究',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'配置技能'}).click();
 await expect(page.getByText('需求研究',{exact:true})).toHaveCount(0);
});

test('older idea drafts open the first step and retain their notes',async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&old-guide=1');
 await page.getByRole('button',{name:'添加专家',exact:true}).click();
 await page.getByRole('button',{name:/自己设计角色/}).click();
 await expect(page.locator('.wf-steps li').filter({hasText:'定义角色'})).toBeVisible();
 await page.getByText('查看之前的构思记录').click();
 await expect(page.getByText('此前写下的专家需求',{exact:false})).toBeVisible();
 await expect(page.getByText('尚未发送的补充',{exact:false})).toBeVisible();
});

for(const c of [{name:'zh-narrow',width:390,query:'view=experts'}, {name:'en-dark',width:390,query:'view=experts&lang=en&theme=dark'}]) test(`editor fits ${c.name}`,async({page})=>{
 await page.setViewportSize({width:c.width,height:800});await page.goto('/tests/manual/project-space-qa.html?'+c.query);
 const en=c.name==='en-dark';await page.getByRole('button',{name:en?'Add expert':'添加专家',exact:true}).click();
 await page.getByRole('button',{name:en?/Design your own role/:/自己设计角色/}).click();
 await page.getByLabel(en?'Expert name':'专家名称').fill(en?'Travel assistant with a long descriptive name':'差旅业务申请专家');
 await page.getByLabel(en?'Responsibilities':'主要职责').fill(en?'Clarify the request and prepare a complete, verifiable travel registration.':'整理差旅申请信息并输出可验收的业务记录。');
 await page.getByRole('button',{name:en?'Next':'下一步'}).click();
 await expect(page.getByRole('button',{name:en?'Add or replace skills':'添加或替换技能'})).toBeVisible();
 expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 const steps=await page.locator('.wf-step-button').evaluateAll(elements=>elements.map(el=>{const b=el.getBoundingClientRect(),label=el.querySelector('.wf-step-label')!.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,labelLeft:label.left,labelRight:label.right,labelTop:label.top,labelBottom:label.bottom,overflow:el.scrollWidth>el.clientWidth};}));
 for(const step of steps){expect(step.overflow).toBeFalsy();expect(step.labelLeft).toBeGreaterThanOrEqual(step.left-1);expect(step.labelRight).toBeLessThanOrEqual(step.right+1);expect(step.labelTop).toBeGreaterThanOrEqual(step.top-1);expect(step.labelBottom).toBeLessThanOrEqual(step.bottom+1);}
 await page.screenshot({path:`/tmp/expert-editor-${c.name}.png`,fullPage:true});
});

for(const en of [false,true])test(`expert model preference can be selected, reviewed and reset (${en?'en':'zh'})`,async({page})=>{
 await page.goto('/tests/manual/project-space-qa.html?view=experts&role-demo=1'+(en?'&lang=en&theme=dark':''));
 await page.getByRole('button',{name:en?'Add expert':'添加专家',exact:true}).click();
 await page.getByRole('button',{name:en?/Choose from role library/:/从角色库中选择/}).click();
 await page.getByRole('button',{name:en?'View details: Product manager':'查看详情：产品经理'}).click();
 await page.getByRole('button',{name:en?'Customize first':'调整后添加'}).click();
 const select=page.getByLabel(en?'Expert default model':'专家默认模型',{exact:true});await expect(select).toHaveValue('');
 const choice=JSON.stringify(['provider-b','模型 C']);await select.selectOption(choice);
 await page.getByRole('button',{name:en?'Confirm configuration':'确认配置',exact:true}).click();
 await expect(page.locator('.wf-review')).toContainText('模型 C · 测试服务 B');
 await page.getByRole('button',{name:en?'Edit role':'编辑角色',exact:true}).click();await expect(select).toHaveValue(choice);
 await select.locator('..').locator('..').screenshot({path:`/tmp/expert-model-field-${en?'en':'zh'}.png`});
 await select.selectOption('');await page.getByRole('button',{name:en?'Confirm configuration':'确认配置',exact:true}).click();
 await expect(page.locator('.wf-review')).toContainText(en?'Use default model':'使用默认模型');
});

for(const en of [false,true])test(`expert cards show configured and inherited models (${en?'en':'zh'})`,async({page})=>{
 await page.setViewportSize({width:en?390:1280,height:900});
 await page.goto('/tests/manual/project-space-qa.html?view=experts'+(en?'&lang=en&theme=dark':''));
 const card=page.locator('.wf-expert-card'),model=card.locator('.wf-expert-model');
 await expect(model).toContainText(en?'Use default model':'使用默认模型');await expect(model).toContainText('模型 A · 测试服务 A');
 await card.getByRole('button',{name:en?'View profile':'查看档案',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('模型 A · 测试服务 A');
 await expect(page.getByRole('dialog')).toContainText(en?'Uses the task’s selected model':'沿用任务选择的模型');await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const api=window.desktop!.workforce!,data=await api.snapshot();api.snapshot=async()=>({...data,employees:data.employees.map(e=>({...e,modelChoice:{providerId:'provider-b',model:'模型 C'}}))});(window as any).spaceQA.emit();});
 await expect(model).toContainText('模型 C · 测试服务 B');await expect(model).not.toContainText(en?'Use default model':'使用默认模型');
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/expert-card-model-${en?'en-dark':'zh-light'}.png`});
 await card.getByRole('button',{name:en?'View profile':'查看档案',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('模型 C · 测试服务 B');await page.keyboard.press('Escape');
 await page.evaluate(async()=>{const api=window.desktop!.workforce!,data=await api.snapshot();api.snapshot=async()=>({...data,employees:data.employees.map(e=>({...e,modelChoice:{providerId:'removed',model:'long-unavailable-model-name-that-must-wrap-within-the-expert-card'}}))});(window as any).spaceQA.emit();});
 await expect(model).toContainText(en?'currently unavailable':'当前不可用');
 expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const en of [false,true])test(`existing expert edits save directly without the creation wizard (${en?'en':'zh'})`,async({page})=>{
 await page.setViewportSize({width:en?390:1280,height:900});await page.goto('/tests/manual/project-space-qa.html?view=experts'+(en?'&lang=en&theme=dark':''));
 await page.evaluate(()=>{const api=window.desktop!.workforce!,create=api.createDraft;api.createDraft=async input=>{const draft=await create(input),employee=(await api.snapshot()).employees[0];return {...draft,employeeId:employee.id,employeeRevision:employee.revision,origin:'employee',ephemeral:true,value:employee};};api.submit=async input=>{(window as any).__editSubmission=input;return {id:input.id!,revision:2};};});
 await page.getByRole('button',{name:en?'View profile':'查看档案',exact:true}).click();await page.getByRole('button',{name:en?'Edit expert profile':'编辑专家配置'}).click();
 await expect(page.getByRole('navigation',{name:en?'Expert setup steps':'专家配置步骤'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:en?'Next':'下一步',exact:true})).toHaveCount(0);
 const save=page.getByRole('button',{name:en?'Save changes':'保存更改',exact:true});await expect(save).toBeDisabled();
 await page.getByRole('navigation',{name:en?'Expert configuration sections':'专家配置分区'}).getByRole('button',{name:en?'Skills':'技能',exact:true}).click();await expect(save).toBeDisabled();
 await page.getByLabel(en?'Expert name':'专家名称').fill(en?'Writing expert':'文案专家');await expect(save).toBeEnabled();
 await page.getByRole('button',{name:en?'Cancel':'取消',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:en?'Keep editing':'继续编辑',exact:true}).click();
 await page.getByRole('navigation',{name:en?'Expert configuration sections':'专家配置分区'}).getByRole('button',{name:en?'Basics':'基本信息',exact:true}).click();
 await page.screenshot({path:`/tmp/expert-direct-edit-${en?'dark-narrow':'light'}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await save.click();await expect(page.getByText(en?'Changes saved':'更改已保存',{exact:true})).toBeVisible();await expect(page.locator('.wf-editor')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await page.evaluate(()=>(window as any).__editSubmission)).value.name).toBe(en?'Writing expert':'文案专家');
});

for(const width of [390,1280])for(const entry of ['profile','menu'])test(`editing an expert via ${entry} restores its list position and updates in place at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/manual/project-space-qa.html?view=experts');
 await page.evaluate(async()=>{
  const api=window.desktop!.workforce!,snapshot=await api.snapshot();let employees=Array.from({length:12},(_,i)=>({...snapshot.employees[0],id:`expert-${i}`,name:`专家 ${i}`}));
  api.snapshot=async()=>({...snapshot,employees});
  let editDraft:any;api.createDraft=async input=>(editDraft={id:'edit-scroll',revision:1,value:employees.find(e=>e.id===input.employeeId)!,employeeId:input.copy?null:input.employeeId!,employeeRevision:input.copy?null:1,origin:input.copy?'copy':'employee',ephemeral:true,step:1,mode:'manual',brief:'',createdAt:'2026-11-01',updatedAt:'2026-11-01'});
  api.saveDraft=async input=>(editDraft={...editDraft,...input,revision:input.expectedRevision+1});
  api.submit=async input=>{await new Promise(resolve=>setTimeout(resolve,120));employees=employees.map(e=>e.id===input.id?{...e,...input.value,revision:2}:e);return {id:input.id!,revision:2};};
  (window as any).spaceQA.emit();
 });
 const card=page.locator('[data-expert-id="expert-8"]'),scroller=page.locator('.qa-scroll');await expect(card).toBeAttached();
 await card.evaluate(el=>{const scroller=el.closest('.qa-scroll')!;scroller.scrollTop+=el.getBoundingClientRect().top-100;});
 const before=(await card.boundingBox())!.y;expect(await scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(600);
 if(entry==='menu'){await card.getByRole('button',{name:'专家 8的更多操作'}).click();await page.getByRole('menuitem',{name:'编辑专家配置',exact:true}).click();}
 else{await card.getByRole('button',{name:'查看专家：专家 8'}).click();await page.getByRole('button',{name:'编辑专家配置',exact:true}).click();}
 await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeLessThan(100);await page.getByLabel('专家名称').fill('更新后的专家');
 await page.getByRole('button',{name:'保存更改',exact:true}).click();await expect(card).toContainText('更新后的专家');
 await expect.poll(async()=>(await card.boundingBox())!.y).toBeCloseTo(before,0);
 expect(await page.locator('[data-expert-id]').evaluateAll(els=>els.map(el=>el.getAttribute('data-expert-id')))).toEqual(Array.from({length:12},(_,i)=>`expert-${i}`));
 // A later host refresh must not reset the restored scroll position.
 await page.evaluate(()=>(window as any).spaceQA.emit());await expect.poll(async()=>(await card.boundingBox())!.y).toBeCloseTo(before,0);
 await card.getByRole('button',{name:'查看专家：更新后的专家'}).click();await page.getByRole('button',{name:'编辑专家配置',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();
 await expect.poll(async()=>(await card.boundingBox())!.y).toBeCloseTo(before,0);await expect(page.getByRole('alertdialog')).toHaveCount(0);
 // Copying creates a new expert: it must not inherit the edit-return anchor.
 await card.getByRole('button',{name:'更新后的专家的更多操作'}).click();
 await page.getByRole('menuitem',{name:'复制专家配置'}).click();
 await expect(page.getByRole('heading',{name:'添加 AI 专家',level:1})).toBeVisible();
 await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeLessThan(100);
 await page.getByRole('button',{name:'我的专家',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的专家'})).toBeVisible();
 await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeLessThan(100);
});
