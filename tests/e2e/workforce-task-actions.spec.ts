import {test,expect,type Page} from '@playwright/test';
// Action regressions use the retained list; graph interaction is tested separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('workforce.plan-views:space',JSON.stringify({launch:'list'})));});
async function setup(page:Page,kind:'approval'|'question'|'missing'|'form'='approval',query=''){
 await page.goto('/tests/manual/project-space-qa.html'+query);
 await page.evaluate(async kind=>{
  const w=window as any,qa=w.spaceQA,api=window.desktop!,run:any=await api.getRunPage!({id:'evidence'}),listeners=new Set<(r:any)=>void>();
  run.status='waiting';run.messages=run.messages.slice(0,1);run.tools=[];
  if(kind==='approval')run.approvals=[{id:'request-1',method:'commandExecution',detail:JSON.stringify({command:'npm test',cwd:'/example/launch',reason:'运行项目测试以验证交付'})}];
  if(kind==='question')run.questions=[{id:'question-1',questions:[{id:'target',question:'使用哪个测试环境？'}]}];
  const pkg=qa.snapshot.plans[0].packages[0];pkg.status='waiting';pkg.attempts[0].status='waiting';
  api.getRunPage=async()=>structuredClone(run);api.onRun=fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
  const emit=()=>{for(const fn of listeners)fn(structuredClone(run));};
  w.__taskRun=run;w.__taskEmit=emit;w.__failApproval=false;
  api.approveRun=async input=>{qa.calls.push({action:'approve',input});if(w.__failApproval){w.__failApproval=false;throw Error('测试网络中断，请重试');}run.approvals=[];run.status='running';emit();};
  api.answerRun=async input=>{qa.calls.push({action:'answer',input});run.questions=[];run.status='running';emit();};
  if(kind==='form'){
   const inputListeners=new Set<(event:any)=>void>(),now=new Date().toISOString();
   const request:any={id:'persistent-question',runId:run.id,conversationId:run.id,projectId:null,turnKey:'u',order:1,originKey:'model',state:'pending',revision:0,reason:'选择后继续验证',locale:'zh-CN',createdAt:now,updatedAt:now,draft:{},template:{version:1,id:'test-environment',title:'确认测试环境',steps:[{id:'environment',fields:[{name:'target',type:'text',label:'环境名称',required:true}]}],submit:{kind:'chat',label:'提交'}}};
   const snap={policy:{paused:false,generation:0},requests:[request],deliveries:[]};
   api.inputs={list:async()=>structuredClone(snap),onChanged:(fn:any)=>{inputListeners.add(fn);return()=>inputListeners.delete(fn);},action:async(input:any)=>{qa.calls.push({action:'input',input});if(input.action==='beginEdit')request.draftTouched=true;if(input.action==='saveDraft')request.draft=input.values;if(input.action==='submit'){request.state='answered';request.answer={values:input.values};run.status='running';emit();}request.revision++;for(const fn of inputListeners)fn({runId:run.id});return structuredClone(request);}} as any;
  }
  qa.emit();
 },kind);
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:/^(任务|Tasks)$/}).click();
 await page.locator('.wf-work-item[data-package-id="copy"]').click();
 if(kind!=='missing')await expect(page.getByRole('region',{name:/^(处理任务请求|Handle task requests)$/,exact:true})).toBeVisible();
 return page.getByRole('region',{name:/^(任务详情与验收|Task details and review)$/});
}
test('waiting approval is visible in task detail; failed submission retries without opening evidence',async({page})=>{
 const detail=await setup(page);const approval=page.getByRole('region',{name:'执行授权'});
 await expect(approval).toBeVisible();await expect(page.locator('.wf-node-conversation')).toBeVisible();
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeHidden();
 await page.evaluate(()=>{(window as any).__failApproval=true;});await approval.getByRole('button',{name:'批准本次'}).click();await expect(approval.getByRole('alert')).toContainText('网络中断');
 await approval.getByRole('button',{name:'查看请求详情'}).click();await expect(page.getByRole('region',{name:/^(处理任务请求|Handle task requests)$/,exact:true})).toHaveCount(1);await expect(approval.getByRole('region',{name:'授权请求详情'})).toContainText('npm test');await expect(approval.getByRole('button',{name:'收起请求详情'})).toHaveAttribute('aria-expanded','true');await approval.getByRole('button',{name:'收起请求详情'}).click();await expect(approval.getByRole('region',{name:'授权请求详情'})).toHaveCount(0);await expect(page.getByRole('region',{name:/^(处理任务请求|Handle task requests)$/,exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'执行授权'})).toHaveCount(1);
 await approval.getByRole('button',{name:'批准本次'}).click();await expect(approval).toBeHidden();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='approve'));expect(calls).toHaveLength(2);expect(calls[1].input).toEqual({runId:'evidence',approvalId:'request-1',decision:'accept'});
});
test('native questions can be answered in task detail',async({page})=>{
 const detail=await setup(page,'question');await page.getByLabel('使用哪个测试环境？').fill('隔离测试环境');await page.getByRole('button',{name:'提交回答'}).click();await expect(page.getByLabel('使用哪个测试环境？')).toBeHidden();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='answer').input)).toEqual({runId:'evidence',requestId:'question-1',answers:{target:'隔离测试环境'}});
});
test('persistent declarative form saves and submits through the shared input controller',async({page})=>{
 const detail=await setup(page,'form');await page.getByLabel('环境名称').fill('隔离环境 A');await expect(page.getByRole('button',{name:'提交补充信息'})).toBeEnabled();await page.getByRole('button',{name:'提交补充信息'}).click();await expect(page.getByLabel('环境名称')).toBeHidden();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='input'&&c.input.action==='submit').input.values)).toEqual({target:'隔离环境 A'});
});
test('missing request offers recovery and a working full-task destination',async({page})=>{
 const detail=await setup(page,'missing');await detail.getByRole('button',{name:'交付与验收',exact:true}).click();await expect(detail).toContainText('尚未读取到具体请求');await detail.getByRole('button',{name:'刷新待处理请求'}).click();await expect(detail.getByRole('button',{name:'打开完整任务'})).toBeVisible();await detail.getByRole('button',{name:'打开完整任务'}).click();await expect(page.getByRole('heading',{name:'原始任务证据（测试数据）'})).toBeVisible();
});
for(const [width,english,dark] of [[1280,false,false],[390,false,true],[1280,true,true],[390,true,false]] as const)test(`waiting task visual ${width} ${english} ${dark}`,async({page})=>{
 await page.setViewportSize({width,height:900});const detail=await setup(page,'approval',`?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 const approve=page.getByRole('button',{name:english?'Approve once':'批准本次'});await approve.scrollIntoViewIfNeeded();await approve.focus();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(approve).toBeFocused();expect(await approve.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBeTruthy();await page.screenshot({path:`/tmp/workforce-waiting-${width}-${english}-${dark}.png`});
 await page.getByRole('button',{name:english?'Decline':'拒绝',exact:true}).click();await expect(page.getByRole('region',{name:english?'Execution approval':'执行授权',exact:true})).toHaveCount(0);
});
test('dismissed requests stay collapsed even when new requests arrive',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'收起请求',exact:true}).click();
 await page.evaluate(()=>{const w=window as any;w.__taskRun.approvals.push({...w.__taskRun.approvals[0],id:'request-2'});w.__taskEmit();});
 await expect(page.getByRole('button',{name:'批准本次',exact:true})).toBeHidden();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'查看并处理',exact:true}).click();
 await page.getByRole('button',{name:'批准本次',exact:true}).click();
 await expect(page.getByRole('button',{name:'批准本次',exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'处理任务请求',exact:true})).toHaveCount(0);
});
for(const width of [1280,390])test(`question surface has one frame and no repeated headings ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,'question');
 await page.evaluate(()=>{const w=window as any;w.__taskRun.questions[0].questions=[{id:'target',question:'远端写入超时，请确认连接是否已恢复？',options:[{label:'已授权并恢复',description:'先核对已有文件，再继续创建测试目录与测试文件。'},{label:'仍未恢复／无法授权',description:'保留未验证状态，并报告具体受阻项。'}]}];w.__taskEmit();});
 const surface=page.getByRole('region',{name:'处理任务请求',exact:true});
 await expect(surface.locator('[data-slot=card]')).toHaveCount(0);
 await expect(surface.getByText('等待你的回答',{exact:true})).toHaveCount(0);
 await expect(surface.getByText('待补充信息',{exact:true})).toHaveCount(1);
 await expect(surface.getByRole('button',{name:'稍后填写'})).toHaveCount(0);
 expect(await surface.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
 await page.getByRole('textbox',{name:'继续对话',exact:true}).hover();
 await page.screenshot({path:`/tmp/question-flat-${width}.png`});
 await surface.getByLabel('远端写入超时，请确认连接是否已恢复？').fill('恢复了，请先检查文件');
 await surface.getByRole('button',{name:'提交回答',exact:true}).click();
 await expect(surface).toHaveCount(0);
});
test('leaving the retained workspace hides the request and preserves its answer',async({page})=>{
 await setup(page,'question');
 await page.evaluate(()=>{const w=window as any;w.__taskRun.questions[0].questions[0].options=[{label:'已恢复'},{label:'尚未恢复'}];w.__taskEmit();});
 const surface=page.getByRole('region',{name:'处理任务请求',exact:true});
 await surface.getByRole('radio',{name:'已恢复',exact:true}).click();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();
 await page.getByRole('button',{name:'配置模型服务',exact:true}).click();
 await expect(page.getByRole('heading',{name:'原始任务证据（测试数据）'})).toBeVisible();
 await expect(surface).toBeHidden();
 await page.getByRole('button',{name:'返回项目空间',exact:true}).click();
 await expect(surface).toBeVisible();await expect(surface.getByRole('radio',{name:'已恢复',exact:true})).toBeChecked();
 await surface.getByRole('button',{name:'提交回答',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.find((c:any)=>c.action==='answer').input.answers)).toEqual({target:'已恢复'});
});
test('empty request surface disappears and a fresh batch opens automatically',async({page})=>{
 await setup(page);const surface=page.getByRole('region',{name:'处理任务请求',exact:true});
 await surface.getByRole('button',{name:'批准本次',exact:true}).click();await expect(surface).toHaveCount(0);
 await page.evaluate(()=>{const w=window as any;w.__taskRun.approvals=[{id:'new-batch',method:'commandExecution',detail:'{"command":"pwd"}'}];w.__taskRun.status='waiting';w.__taskEmit();});
 await expect(surface.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();await expect(surface).toContainText('pwd');
 await surface.getByRole('button',{name:'收起请求',exact:true}).click();
 await page.evaluate(()=>{const w=window as any;w.__taskRun.approvals=[];w.__taskEmit();});await expect(surface).toHaveCount(0);
 await page.evaluate(()=>{const w=window as any;w.__taskRun.approvals=[{id:'third-batch',method:'commandExecution',detail:'{"command":"ls"}'}];w.__taskEmit();});
 await expect(surface.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();await expect(surface).toContainText('ls');
 // Completion and the next request may arrive in the same runtime update.
 await page.evaluate(()=>{const w=window as any;w.__taskRun.approvals=[{id:'fourth-batch',method:'commandExecution',detail:'{"command":"date"}'}];w.__taskEmit();});
 await expect(surface).toContainText('date');await expect(surface.getByRole('button',{name:'批准本次',exact:true})).toBeVisible();
 expect(await surface.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
});
