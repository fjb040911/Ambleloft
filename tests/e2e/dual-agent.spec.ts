import {test,expect} from '@playwright/test';

test('ordinary followups need no conversation-agent tag and do not replace form delivery feedback',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
  const run:any={id:'legacy',title:'追问兼容性',model:'fixture',baseUrl:'http://localhost/v1',cwd:'/fixture',createdAt:new Date().toISOString(),status:'running',error:'',approvals:[],messages:[
   {id:'u',role:'user',text:'分析项目'},
   {id:'followup',role:'user',userInputId:'user:followup',inputSource:'user',turnKey:'u',order:1,text:'现在执行到哪里了？'},
   {id:'form',role:'user',formSubmissionId:'form:answer',turnKey:'u',order:2,text:'表单中的预算：3000'}
  ],tools:[]};
  const snapshot:any={policy:{paused:false,generation:0},requests:[],deliveries:[{id:'user:followup',runId:'legacy',source:'user',text:'现在执行到哪里了？',state:'delivered'},{id:'form:answer',runId:'legacy',text:'表单中的预算：3000',state:'delivered'}]};
  const w=window as any;let changed:any;
  w.__formLatest=()=>{snapshot.deliveries.reverse();changed({runId:run.id});};
  w.desktop={getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test',mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',tasks:[],projects:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[run],onRun:()=>()=>{},onCommand:()=>()=>{},stopRun:async()=>{},inputs:{list:async()=>structuredClone(snapshot),onChanged:(fn:any)=>{changed=fn;return()=>{};}}};
 });
 await page.goto('/');await page.locator('.tree-task > button:first-child').filter({hasText:'追问兼容性'}).click();
 await expect(page.getByText('现在执行到哪里了？',{exact:true})).toHaveCount(1);
 await expect(page.getByText('表单中的预算：3000',{exact:true})).toBeVisible();
 await expect(page.getByText('补充消息已送达',{exact:true})).toHaveCount(0);
 await page.locator('.turn-progress-toggle').click();
 await expect(page.getByText('现在执行到哪里了？',{exact:true})).toBeVisible();
 await expect(page.getByText('表单中的预算：3000',{exact:true})).not.toBeVisible();
 await page.evaluate(()=>(window as any).__formLatest());
 await expect(page.getByText('补充消息已送达',{exact:true})).toBeVisible();
});

test('conversation replies stay visible while execution and native subagents continue',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
  const run:any={id:'dual',title:'双 Agent 调度',model:'fixture',baseUrl:'http://localhost/v1',cwd:'/fixture',createdAt:new Date().toISOString(),status:'running',error:'',approvals:[],messages:[
   {id:'u',role:'user',text:'优化调度引擎'},
   {id:'plan',role:'assistant',agentRole:'conversation',phase:'commentary',turnKey:'u',order:1,text:'先检查任务队列，再优化并发控制。'}
  ],tools:[{id:'child',nativeThreadId:'native-child',turnKey:'u',order:2,type:'analysis',label:'并发审查',analysisAgent:{id:'child',name:'并发审查',avatar:0},status:'running',detail:'正在检查并发控制'}]};
  const w=window as any;let callback:any;w.__dualRun=run;
  w.desktop={getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test',mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',tasks:[],projects:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[structuredClone(run)],onRun:(fn:any)=>{callback=fn;w.__emitDual=()=>callback(structuredClone(run));return()=>{};},onCommand:()=>()=>{},stopRun:async()=>{},
   inputs:{list:async()=>({policy:{paused:false,generation:0},deliveries:[],requests:[]}),onChanged:()=>()=>{},append:async(input:any)=>{
    run.messages.push({id:'question',role:'user',agentRole:'conversation',turnKey:'u',order:3,text:input.text},{id:'reply',role:'assistant',agentRole:'conversation',phase:'commentary',turnKey:'u',order:4,text:'并发审查还在进行，尚未修改代码。'});
    callback(structuredClone(run));return {id:'input',state:'delivered'};
   }}
  };
 });
 await page.goto('/');await page.locator('.tree-task > button:first-child').filter({hasText:'双 Agent 调度'}).click();
 await expect(page.getByText('先检查任务队列，再优化并发控制。',{exact:true})).toBeVisible();
 await page.locator('.turn-progress-toggle').click();
 const composer=page.getByRole('textbox',{name:'继续对话'});await composer.fill('现在到哪一步？');await composer.press('Enter');
 await expect(page.getByText('并发审查还在进行，尚未修改代码。',{exact:true})).toBeVisible();
 await expect(page.getByText('现在到哪一步？',{exact:true})).toHaveCount(1);
 await expect(page.getByText('先检查任务队列，再优化并发控制。',{exact:true})).toHaveCount(1);
 await expect(page.getByRole('img',{name:'并发审查 · 子代理头像'})).toBeVisible();
 await expect(composer).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).__dualRun.status)).toBe('running');
 await page.evaluate(()=>{const w=window as any;w.__dualRun.status='completed';w.__dualRun.tools[0].status='completed';w.__dualRun.messages.push({id:'final',role:'assistant',phase:'final_answer',turnKey:'u',order:5,text:'优化已完成并通过测试。'});w.__emitDual();});
 await expect(page.getByText('优化已完成并通过测试。',{exact:true})).toBeVisible();
 await expect(page.getByText('并发审查还在进行，尚未修改代码。',{exact:true})).toBeVisible();
});

test('running chat permission switch confirms elevation, reports application and keeps draft and children',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
  const run:any={id:'permissions',title:'运行中权限切换',permission:'default',model:'fixture',baseUrl:'http://localhost/v1',cwd:'/fixture',createdAt:new Date().toISOString(),status:'running',error:'',approvals:[],questions:[],messages:[{id:'u',role:'user',text:'执行原任务'}],tools:[{id:'child',nativeThreadId:'child-thread',turnKey:'u',order:1,type:'analysis',label:'审查专家',analysisAgent:{id:'child',name:'审查专家',avatar:0},status:'running',detail:'继续审查'}]};
  const w=window as any;let publish:any;w.__permissionCalls=[];
  w.desktop={getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test',mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',tasks:[],projects:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[structuredClone(run)],onRun:(fn:any)=>{publish=fn;return()=>{};},onCommand:()=>()=>{},stopRun:async()=>{},inputs:{list:async()=>({policy:{paused:false,generation:0},deliveries:[],requests:[]}),onChanged:()=>()=>{},append:async()=>({state:'delivered'})},
   switchRunPermission:async(input:any)=>{w.__permissionCalls.push(input);run.permissionChange={id:'change',requested:input.permission,previous:run.permission,state:'switching',effective:null};publish(structuredClone(run));return new Promise(resolve=>{w.__finishPermission=(fail=false)=>{run.permissionChange.state=fail?'failed':'applied';run.permissionChange.effective=fail?null:input.permission;if(fail)run.permissionChange.error='引擎未确认权限';else run.permission=input.permission;publish(structuredClone(run));resolve(structuredClone(run.permissionChange));};});}};
 });
 await page.goto('/');await page.locator('.tree-task > button:first-child').filter({hasText:'运行中权限切换'}).click();
 const composer=page.locator('.composer');const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('保留这条未发送的补充要求');
 await composer.getByRole('button',{name:'默认权限',exact:true}).click();await page.getByRole('dialog',{name:'权限模式'}).getByRole('button',{name:'完全访问',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>(window as any).__permissionCalls.length)).toBe(0);
 await composer.getByRole('button',{name:'默认权限',exact:true}).click();await page.getByRole('dialog',{name:'权限模式'}).getByRole('button',{name:'完全访问',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'允许完全访问',exact:true}).click();
 await expect(page.getByText('完全访问 · 权限切换中，尚未确认生效',{exact:true})).toBeVisible();await expect(input).toHaveValue('保留这条未发送的补充要求');await expect(input).toBeEnabled();
 await page.evaluate(()=>(window as any).__finishPermission());await expect(page.getByText('完全访问 · 权限已生效',{exact:true})).toBeVisible();await expect(composer.getByRole('button',{name:'完全访问',exact:true})).toBeEnabled();
 await expect(page.getByRole('img',{name:'审查专家 · 子代理头像'})).toBeVisible();
 await composer.getByRole('button',{name:'完全访问',exact:true}).click();await page.getByRole('dialog',{name:'权限模式'}).getByRole('button',{name:'默认权限',exact:true}).click();await expect(page.getByText('默认权限 · 权限切换中，尚未确认生效',{exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__finishPermission(true));await expect(page.getByText(/默认权限 · 权限切换失败，未确认生效/)).toBeVisible();await expect(input).toHaveValue('保留这条未发送的补充要求');
});
