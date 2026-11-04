import {test,expect} from '@playwright/test';
const open=async(page:any)=>{await page.goto('/tests/manual/project-space-qa.html');await page.getByRole('button',{name:/产品发布 准备新版/}).click();};
test('review shortcuts land directly on delivery acceptance',async({page})=>{
 await open(page);await page.getByRole('button',{name:/待验收.*发布文案.*去验收/}).click();
 await expect(page.locator('.wf-task-review')).toHaveAttribute('data-view','review');await expect(page.getByRole('button',{name:'验收通过',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回流程图'}).click();await page.locator('.wf-plan-command-center summary').click();await page.getByRole('button',{name:/发布文案 · 检查交付并验收/}).click();await expect(page.locator('.wf-task-review')).toHaveAttribute('data-view','review');
});
test('register another project protects unsaved associations',async({page})=>{
 await open(page);await page.getByRole('tab',{name:'团队与项目'}).click();await page.getByRole('button',{name:'管理项目关联'}).click();
 const editor=page.getByRole('dialog');await editor.getByRole('checkbox').first().uncheck();await editor.getByRole('button',{name:'登记其他项目'}).click();
 await expect(page.getByRole('alertdialog')).toContainText('空间修改尚未保存');await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(editor.getByRole('checkbox').first()).not.toBeChecked();
 await editor.getByRole('button',{name:'登记其他项目'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改',exact:true}).click();await expect(editor).toBeHidden();
});
test('persistent requests update overview and graph consistently and failed reads stay unknown',async({page})=>{
 await open(page);await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.pending=true;qa.inputListeners=new Set();const p=qa.snapshot.plans[0];p.packages.forEach((w:any)=>{w.status='accepted';w.attempts=[];});p.packages[2].status='running';p.packages[2].attempts=[{id:'input-attempt',runId:'input-run'}];qa.snapshot.requests=[];
 const old=window.desktop!.getRunPage!;window.desktop!.getRunPage=async input=>({...await old({id:'evidence'}),id:input.id,status:'running',approvals:[],questions:[]});
 window.desktop!.inputs={list:async()=>{if(qa.fail)throw Error('offline');return {policy:{paused:false,generation:0},deliveries:[],requests:qa.pending?[{id:'form',state:'pending',runId:'input-run',conversationId:'input-run',originKey:'model',revision:1,reason:'请补充环境信息',draft:{},draftTouched:false,locale:'zh-CN',createdAt:'2026-11-03',template:{version:1,id:'form-template',title:'环境信息',steps:[{id:'step',title:'补充',fields:[{name:'answer',label:'环境地址',type:'text'}]}],submit:{kind:'chat',label:'提交'}}}]:[]};},onChanged:(fn:any)=>{qa.inputListeners.add(fn);return()=>qa.inputListeners.delete(fn);}} as any;qa.emit();});
 await expect(page.locator('.wf-attention-list')).toContainText('环境验证');await page.getByRole('tab',{name:'任务',exact:true}).click();await expect(page.locator('.wf-graph-node').filter({hasText:'环境验证'})).toContainText('待补充信息');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.pending=false;qa.inputListeners.forEach((fn:any)=>fn({runId:'input-run'}));});await expect(page.locator('.wf-graph-node').filter({hasText:'环境验证'})).not.toContainText('待补充信息');
 await page.getByRole('tab',{name:'概览',exact:true}).click();await expect(page.getByText('暂无需要处理的事项',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.fail=true;qa.inputListeners.forEach((fn:any)=>fn({runId:'input-run'}));});await expect(page.locator('.wf-attention-list')).toContainText('请求状态待确认');
});
test('failed start preserves saved plan and retries start without recreating it',async({page})=>{
 await open(page);await page.evaluate(()=>{const old=window.desktop!.spaces!.controlPlan;let fail=true;window.desktop!.spaces!.controlPlan=async input=>{if(fail){fail=false;throw Error("Error invoking remote method 'spaces:controlPlan': Error: 测试启动失败");}return old(input);};});
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await page.getByRole('tab',{name:'本讨论的相关计划',exact:true}).click();await page.getByRole('button',{name:'整理为任务',exact:true}).click();
 const guide=page.getByRole('region',{name:'整理为任务'});await guide.getByRole('button',{name:'根据讨论整理任务'}).click();await guide.getByRole('textbox',{name:'需要检查哪些链接？'}).fill('检查首页链接');await guide.getByRole('button',{name:'提交补充并检查'}).click();await guide.getByRole('button',{name:'确认并启动',exact:true}).click();
 await expect(guide).toContainText('计划已保存，但启动未完成');await expect(guide.getByText('技术详情',{exact:true})).toBeVisible();await guide.getByRole('button',{name:'重试启动',exact:true}).click();await expect(guide).toBeHidden();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='createGuidedPlan').length)).toBe(1);
});
