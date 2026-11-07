import {test,expect,type Page} from '@playwright/test';
async function prepare(page:Page,english=false,dark=false){
 await page.goto(`/tests/manual/project-space-qa.html?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.evaluate(({english})=>{
  const q=(window as any).spaceQA;
  q.snapshot.requests=q.snapshot.requests.filter((r:any)=>r.mode!=='discussion');
  const clone=()=>structuredClone(q.snapshot);
  window.desktop!.spaces!.coordinateDiscussion=async(input:any)=>{
   q.calls.push({action:'host',input});
   if(input.answerTo){const previous=q.snapshot.requests.find((r:any)=>r.id===input.answerTo);previous.host.question.answeredBy=input.clientRequestId;}
   q.snapshot.requests.unshift({id:input.clientRequestId,spaceId:input.spaceId,prompt:input.prompt,replyTo:input.replyTo,round:q.snapshot.requests.length+1,mode:'discussion',projectId:null,createdAt:new Date().toISOString(),documentRefs:input.documentRefs,participants:[],host:{status:input.answerTo?'ready':'needs-input',revision:1,ruleVersion:'fixture',model:'Fixture model',steps:[{id:'step',text:english?'First, clarify the audience.':'先明确使用对象。',action:'ask',at:''}],brief:{goal:english?'Repair ticket system':'设备维修工单',items:[{id:'scope',kind:'proposal',text:english?'Start with ticket registration and status tracking.':'先实现工单登记与状态查询。',sourceIds:[input.clientRequestId]}]},question:input.answerTo?null:{requestKey:'q1',reason:'Audience',prefill:{answer0:'staff'},source:{definition:{title:'Audience',fields:[{name:'answer0',type:'select',label:english?'Who will use it?':'谁来使用？',required:true,options:[{label:english?'Internal staff':'内部员工',value:'staff'},{label:english?'Customers':'客户',value:'customers'}]}]}}}}});q.emit();return clone();
  };
  window.desktop!.spaces!.stopDiscussionHost=async(input:any)=>{q.calls.push({action:'stopHost',input});q.snapshot.requests.find((r:any)=>r.id===input.requestId).host.status='interrupted';q.emit();};
  window.desktop!.spaces!.start=async(input:any)=>{q.calls.push({action:'direct',input});q.snapshot.requests.unshift({id:input.clientRequestId,spaceId:input.spaceId,prompt:input.prompt,replyTo:input.replyTo,mode:'discussion',projectId:null,createdAt:new Date().toISOString(),documentRefs:[],participants:input.employeeIds.map((id:string)=>({employeeId:id,status:'completed',output:english?'Expert analysis result.':'专家分析结果。',role:{name:'文案员工',revision:1,skills:[]}}))});q.emit();return clone();};q.emit();
 },{english});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
test('default host, precise mention and one-turn recipient selection',async({page})=>{
 await prepare(page);const input=page.getByLabel('这次想推进什么？');
 await expect(page.getByRole('button',{name:'本条发送给'})).toContainText('主持人');
 await input.fill('规划设备维修工单');await input.press('Enter');await expect(page.getByRole('combobox',{name:'谁来使用？'})).toBeVisible();
 await page.getByRole('button',{name:'确认并继续'}).click();await expect(page.getByRole('combobox',{name:'谁来使用？'})).toHaveCount(0);
 await input.fill('@文案员工 请检查文案');await expect(page.getByRole('button',{name:'本条发送给'})).toContainText('文案员工');await input.press('Enter');
 await expect(page.getByRole('button',{name:'本条发送给'})).toContainText('主持人');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='direct').at(-1).input.employeeIds)).toEqual(['writer']);
 await expect(page.getByRole('button',{name:'继续与此专家讨论'})).toHaveCount(0);
 await page.getByRole('button',{name:'本条发送给'}).click();await page.getByRole('checkbox').filter({visible:true}).first().check();await page.keyboard.press('Escape');await input.fill('继续检查');await input.press('Enter');await expect(page.getByRole('button',{name:'本条发送给'})).toContainText('主持人');
 await input.fill('请汇总');await input.press('Enter');await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='host').length)).toBe(3);
 await page.getByRole('region',{name:'本次任务',exact:true}).getByRole('button',{name:'整理为任务',exact:true}).click();await expect(page.getByRole('region',{name:'整理为任务'})).toBeVisible();expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control').length)).toBe(0);
});
for(const [width,english,dark] of [[1280,false,false],[390,false,false],[1280,true,true],[720,true,false]] as const)test(`host clarification visual ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await prepare(page,english,dark);const input=page.getByLabel(english?'What should we discuss?':'这次想推进什么？');await input.fill(english?'Plan a repair-ticket system for internal teams.':'规划一个内部使用的设备维修工单系统。');await input.press('Enter');
 const composer=page.locator('.wf-discussion-composer');await expect(composer.getByRole('button',{name:english?'Add content':'添加内容',exact:true})).toBeVisible();await expect(composer.getByRole('button',{name:english?'Default permissions':'默认权限',exact:true})).toBeVisible();
 const field=page.getByRole('combobox',{name:english?'Who will use it?':'谁来使用？'});await expect(field).toBeVisible();await expect(field).toHaveValue('staff');await field.focus();await expect(field).toBeFocused();
 await page.screenshot({path:`/tmp/discussion-host-${width}-${english}-${dark}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 if(width<1000){await page.getByRole('button',{name:english?'Show discussion context':'查看讨论与相关内容'}).click();await page.getByText(english?'Goal and decision sources':'目标与决定的来源',{exact:true}).click();await expect(page.locator('.wf-host-brief')).toBeVisible();await page.screenshot({path:`/tmp/discussion-host-context-${width}.png`,fullPage:true});}
 if(await page.getByRole('button',{name:english?'Back to discussion':'返回讨论',exact:true}).isVisible())await page.getByRole('button',{name:english?'Back to discussion':'返回讨论',exact:true}).click();
 await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.find((r:any)=>r.host).host.status='running';q.emit();});await page.getByRole('button',{name:english?'Stop':'停止',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='stopHost').length)).toBe(1);
});
test('host evidence expands from a source citation; question drafts survive navigation and failures',async({page})=>{
 await prepare(page);const input=page.getByLabel('这次想推进什么？');await input.fill('工单设计');await input.press('Enter');
 const field=page.getByRole('combobox',{name:'谁来使用？'});await field.selectOption('customers');await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(field).toHaveValue('customers');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;window.desktop!.spaces!.coordinateDiscussion=async()=>{throw Error('暂时离线');};});await page.getByRole('button',{name:'确认并继续'}).click();await expect(page.getByText('暂时离线', {exact:true})).toBeVisible();await expect(field).toHaveValue('customers');await expect(field).toBeEnabled();
 await page.evaluate(()=>{const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.host);r.host.question=null;r.host.status='completed';r.participants=[{employeeId:'writer',status:'completed',output:'真实记录：'.repeat(300),contribution:{id:'expert-source',author:{name:'文案员工',id:'writer',kind:'expert'},stage:'analysis',context:null,provenance:'recorded'}}];r.host.brief.items[0].sourceIds=['expert-source'];qa.emit();});
 const details=page.locator('.wf-host-experts');await expect(details).not.toHaveAttribute('open');await page.getByText('目标与决定的来源',{exact:true}).click();await page.locator('.wf-host-brief').getByRole('button',{name:'来源 1'}).click();await expect(details).toHaveAttribute('open');await expect(page.locator('[data-expert-id="writer"]')).toBeFocused();
 await page.screenshot({path:'/tmp/discussion-host-long-evidence.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('same-name experts require an explicit choice and never broadcast accidentally',async({page})=>{
 await prepare(page);await page.evaluate(async()=>{const qa=(window as any).spaceQA,old=await window.desktop!.workforce!.snapshot();const twin={...old.employees[0],id:'writer-two',responsibilities:'二号职责'};window.desktop!.workforce!.snapshot=async()=>({...old,employees:[...old.employees,twin]});qa.snapshot.spaces[0].members.push({employeeId:twin.id,assignment:'二号职责',projectIds:[]});qa.emit();});
 const input=page.getByLabel('这次想推进什么？');await input.fill('@文案员工 检查');await expect(page.getByText('存在同名专家，请从 @ 列表明确选择本次接收者。')).toBeVisible();await expect(page.getByRole('button',{name:'发起讨论',exact:true})).toBeDisabled();
 await input.fill('@文案');await page.getByRole('option',{name:/二号职责/}).click();await input.press('Enter');await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='direct').length)).toBe(1);expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='direct').input.employeeIds)).toEqual(['writer-two']);
});

test('host composer cancels permission escalation and clears attachments only after a successful send',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{window.desktop!.selectAttachments=async()=>[{name:'brief.md',path:'/tmp/brief.md'}];});
 const composer=page.locator('.wf-discussion-composer'),add=composer.getByRole('button',{name:'添加内容',exact:true}),permission=composer.getByRole('button',{name:'默认权限',exact:true});
 await add.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();await expect(composer.getByRole('button',{name:'移除附件 brief.md'})).toBeVisible();
 await permission.click();await page.getByRole('dialog',{name:'权限模式'}).getByRole('button',{name:'完全访问',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(permission).toBeFocused();
 await page.getByLabel('这次想推进什么？').fill('根据附件整理讨论目标');await composer.getByRole('button',{name:'发起讨论',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'谁来使用？'})).toBeVisible();await expect(composer.getByRole('button',{name:'移除附件 brief.md'})).toHaveCount(0);
 const first=await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='host').input);expect(first).toMatchObject({permission:'default',attachments:[{name:'brief.md',path:'/tmp/brief.md'}]});
 await page.getByRole('button',{name:'确认并继续'}).click();const second=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='host').at(-1).input);expect(second.attachments).toEqual([]);expect(second.selectedSkillIds).toEqual([]);await expect(add).toBeEnabled();await expect(permission).toBeEnabled();
});

test('old pinned expert is removed without losing the composer draft',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('workforce-discussion:space',JSON.stringify({routeVersion:2,pinnedExpert:'writer',prompt:'保留我的未发送草稿',members:[]})));
 await prepare(page);
 await expect(page.getByLabel('这次想推进什么？')).toHaveValue('保留我的未发送草稿');
 await expect(page.getByRole('button',{name:'本条发送给'})).toContainText('主持人');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('workforce-discussion:space')!).pinnedExpert)).toBeUndefined();
 await page.getByLabel('这次想推进什么？').press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='host').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='direct').length)).toBe(0);
});

for(const output of ['专家回复内容',''])test(`execution record lives in the response menu, including before output: ${!!output}`,async({page})=>{
 await prepare(page);
 const input=page.getByLabel('这次想推进什么？');await input.fill('@文案员工 检查文案');await input.press('Enter');
 await expect(page.locator('[data-expert-id="writer"]')).toBeVisible();
 await page.evaluate(output=>{const q=(window as any).spaceQA,p=q.snapshot.requests.find((r:any)=>r.participants?.length).participants[0];p.runId='expert-record';p.output=output;q.emit();},output);
 const response=page.locator('[data-expert-id="writer"]');
 await expect(response.getByRole('button',{name:'完整任务',exact:true})).toHaveCount(0);
 await expect(response.getByRole('button',{name:'继续与此专家讨论'})).toHaveCount(0);
 await response.getByRole('button',{name:'回复操作'}).click();
 await expect(page.getByRole('menuitem',{name:'保存为文档草稿'})).toHaveCount(output?1:0);
 await expect(page.getByRole('menuitem',{name:'查看执行记录'})).toBeVisible();
 await page.screenshot({path:`/tmp/discussion-response-menu-${!!output}.png`});
 await page.getByRole('menuitem',{name:'查看执行记录'}).click();
 await expect(page.getByRole('heading',{name:'原始任务证据（测试数据）'})).toBeVisible();
 await page.getByRole('button',{name:'返回项目空间'}).click();
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
});
