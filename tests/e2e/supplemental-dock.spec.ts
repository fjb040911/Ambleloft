import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,paused=false,native=false){
 await page.addInitScript(({paused,native})=>{
 const w=window as any;let event:any,runEvent:any;const now=new Date().toISOString();
 const run:any={id:'dock-run',title:'补充表单测试',model:'fixture',baseUrl:'http://localhost/v1',cwd:'/tmp',createdAt:now,status:'running',messages:[{id:'u',role:'user',text:'帮我做一份旅游攻略'}],tools:[],approvals:[]};
 if(native)run.questions=[{id:'native-question',questions:[{id:'transport',question:'怎样出行？'}]}];
 const request=(id:string,title:string)=>({id,turnKey:'u',order:1,runId:run.id,conversationId:run.id,projectId:null,originKey:'model',state:'pending',revision:0,reason:'确认目的地和预算，帮助安排适合你的行程。',locale:'zh-CN',createdAt:now,updatedAt:now,draft:{},draftTouched:false,template:{version:1,id,title,steps:[{id:'details',title,fields:[{name:'city',type:'text',label:'目的地',required:true},{name:'budget',type:'money',label:'预算',currency:'CNY'},{name:'notes',type:'textarea',label:'旅行偏好'}]}],submit:{kind:'chat',label:'提交'}}});
 const snapshot:any={policy:{paused,generation:paused?1:0},deliveries:[],requests:[request('a','补充出行计划'),request('b','住宿偏好')]};
 w.__interruptUnanswered=()=>{run.status='interrupted';run.questions=[];run.messages.push({id:'interrupted-question',role:'assistant',text:'',turnKey:'u',inputRecord:{requestId:'expired-native',state:'pending',questions:[{id:'purpose',label:'脚本具体需要完成什么？'}]}});snapshot.requests=[];snapshot.policy={paused:true,generation:2};event?.({runId:run.id});runEvent?.(structuredClone(run));};
 w.__followupAndStop=(text:string)=>{run.messages.push({id:'followup-'+run.messages.length,role:'user',text,inputDeliveryState:'delivered'});run.status='interrupted';snapshot.policy={paused:true,generation:snapshot.policy.generation+1};event?.({runId:run.id});runEvent?.(structuredClone(run));};
 const receipts=new Map();w.__setTools=(tools:any[])=>{run.tools=tools;runEvent(structuredClone(run));};w.__commands=[];w.__snapshot=snapshot;w.__refresh=()=>event?.({runId:run.id});w.__nextTurn=()=>{run.messages.push({id:'u2',role:'user',text:'继续下一项'});runEvent(structuredClone(run));};w.__failAfterCommit=false;
 w.__unknown=()=>{snapshot.deliveries=[{id:'unknown-one',runId:run.id,state:'unknown',text:'已确认的回答'}];event?.({runId:run.id});};
 w.__messageProposal=()=>{const r=snapshot.requests[0];r.revision++;r.proposal={id:'message-proposal',kind:'messageResolution',answer:{values:{city:'北京'},sourceMessages:[{id:'m',text:'我决定去北京。'}]}};event?.({runId:run.id});};
 w.__proposal=()=>{const r=snapshot.requests[0];r.revision++;r.proposal={id:'proposal-one',kind:'replacement',record:{...request('replacement','新的出行计划'),draft:{city:'北京'}}};event?.({runId:run.id});};
 w.__conflict=()=>{snapshot.requests[0].revision++;snapshot.requests[0].draft={city:'其他窗口的填写'};event?.({runId:run.id});};
 w.desktop={getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test',mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',projects:[],tasks:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[run],onWorkspace:(fn:any)=>{w.__locale=()=>fn({layoutMode:'classic',projects:[],tasks:[],theme:'dark',language:'en',revision:1});return()=>{};},onRun:(fn:any)=>{runEvent=fn;return()=>{};},answerRun:async(input:any)=>{w.__nativeAnswer=input;run.questions=[];runEvent(structuredClone(run));},onCommand:()=>()=>{},
 inputs:{list:async()=>structuredClone(snapshot),onChanged:(fn:any)=>{event=fn;return()=>{};},action:async(input:any)=>{
  w.__commands.push(input);if(receipts.has(input.clientMutationId))return structuredClone(receipts.get(input.clientMutationId));
  if(input.action==='reconcile')return structuredClone(snapshot.deliveries.find((d:any)=>d.id===input.deliveryId));
  const r=snapshot.requests.find((r:any)=>r.id===input.requestId);if(r.revision!==input.expectedRevision)throw Object.assign(Error('CONFLICT'),{code:'CONFLICT'});
  if(input.action==='submit'&&!input.values.city)throw Object.assign(Error('INVALID_ARGUMENT'),{code:'INVALID_ARGUMENT',fields:{city:'请填写目的地'}});
  if(input.action==='cancel')r.state='cancelled';
  if(input.action==='rejectProposal')delete r.proposal;
  if(input.action==='acceptProposal'){if(r.proposal?.id!==input.proposalId)throw Object.assign(Error('CONFLICT'),{code:'CONFLICT'});if(r.proposal.kind==='messageResolution'){r.state='answered';r.answer=r.proposal.answer;if(input.resume)snapshot.policy.paused=false;}else{r.state='superseded';snapshot.requests.push({...request('replacement','新的出行计划'),draft:{city:'北京'}});}delete r.proposal;}
  if(input.action==='beginEdit')r.draftTouched=true;
  if(input.action==='saveDraft')r.draft=structuredClone(input.values);
  if(input.action==='submit'&&w.__holdSubmit)await new Promise(resolve=>{w.__releaseSubmit=resolve;});
  if(input.action==='submit'){r.state='answered';r.deliveryId='answer';r.answer={values:input.values};snapshot.deliveries=[{id:'answer',requestId:r.id,runId:run.id,state:'queued',text:'已填写的出行信息'}];if(input.resume)snapshot.policy.paused=false;}
  r.revision++;receipts.set(input.clientMutationId,structuredClone(r));event?.({runId:run.id});
  if(w.__failAfterCommit){w.__failAfterCommit=false;throw Error('Disconnected');}return structuredClone(r);
 }}};
 },{paused,native});
 await page.goto('/');await page.locator('.tree-task > button:first-child').filter({hasText:'补充表单测试'}).click();
}
test('fixed dock preserves fields and focus through typing, switching, collapse and language change',async({page})=>{
 await setup(page);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');await dock.getByRole('textbox',{name:'旅行偏好',exact:true}).pressSequentially('想看展览，慢节奏');
 await expect(dock.getByRole('textbox',{name:'旅行偏好',exact:true})).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.notes)).toBe('想看展览，慢节奏');
 await dock.getByLabel('选择待补充事项').selectOption('b');await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('北京');
 await dock.getByLabel('选择待补充事项').selectOption('a');await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveValue('上海');
 await dock.getByRole('button',{name:'稍后填写'}).click();await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).not.toBeVisible();
 await page.getByRole('region',{name:'任务执行过程'}).getByRole('button',{name:'前往填写'}).first().click();await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveValue('上海');
 await page.setViewportSize({width:760,height:800});await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
 await page.screenshot({path:'test-results/supplemental-dock-light.png',animations:'disabled'});
 await page.evaluate(()=>(window as any).__locale());
 await expect(page.getByRole('button',{name:'Submit answers'})).toBeVisible();await expect(page.getByLabel('目的地').first()).toHaveValue('上海');
 await page.screenshot({path:'test-results/supplemental-dock-dark.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 const submit=await page.getByRole('button',{name:'Submit answers'}).boundingBox(),composer=await page.getByRole('textbox',{name:'Continue task'}).boundingBox();
 expect(submit!.y+submit!.height).toBeLessThan(composer!.y);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('validation focuses invalid field; submit and continue sends only once with policy generation',async({page})=>{
 await setup(page,true);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('button',{name:'提交并继续'}).click();await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toBeFocused();await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveAttribute('aria-invalid','true');
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await dock.getByRole('button',{name:'提交并继续'}).click();await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('已提交');
 expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.action==='submit').at(-1).resume)).toEqual({expectedPolicyGeneration:1});
});
test('lost save receipt retries same mutation and retains text',async({page})=>{
 await setup(page);await page.evaluate(()=>(window as any).__failAfterCommit=true);
 const dock=page.getByRole('region',{name:'待补充信息',exact:true});await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');
 await expect(dock.getByRole('alert')).toContainText('你的填写仍保留');await dock.getByRole('button',{name:'重试',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 expect(await page.evaluate(()=>{const calls=(window as any).__commands;return calls[0].clientMutationId===calls[1].clientMutationId;})).toBe(true);
});
test('external revision conflicts preserve unsaved input until explicit discard confirmation',async({page})=>{
 await setup(page);const dock=page.getByRole('region',{name:'待补充信息',exact:true}),city=dock.getByRole('textbox',{name:'目的地 *',exact:true});
 await city.fill('上海');await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await city.fill('我的未保存填写');await page.evaluate(()=>(window as any).__conflict());
 await expect(dock.getByRole('alert')).toContainText('内容已更新');await expect(city).toHaveValue('我的未保存填写');
 await dock.getByRole('button',{name:'查看最新版本'}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('button',{name:'载入最新版本',exact:true}).click();await expect(city).toHaveValue('其他窗口的填写');
});
test('native questions share the request selector and preserve their own response channel',async({page})=>{
 await setup(page,false,true);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'怎样出行？'}).fill('高铁');await dock.getByLabel('选择待补充事项').selectOption('a');
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('北京');await dock.getByLabel('选择待补充事项').selectOption('native:native-question');
 await expect(dock.getByRole('textbox',{name:'怎样出行？'})).toHaveValue('高铁');await dock.getByRole('button',{name:'提交回答'}).click();
 expect(await page.evaluate(()=>(window as any).__nativeAnswer)).toEqual({runId:'dock-run',requestId:'native-question',answers:{transport:'高铁'}});
 expect(await page.evaluate(()=>(window as any).__commands.some((c:any)=>c.action==='submit'))).toBe(false);
 await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveValue('北京');
});
test('submission freezes fields until acknowledged without disabling the conversation composer',async({page})=>{
 await setup(page);const dock=page.getByRole('region',{name:'待补充信息',exact:true}),city=dock.getByRole('textbox',{name:'目的地 *',exact:true});
 await city.fill('上海');await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await page.evaluate(()=>(window as any).__holdSubmit=true);await dock.getByRole('button',{name:'提交补充信息'}).click();
 await expect(city).toBeDisabled();await expect(page.getByRole('textbox',{name:'继续对话'})).toBeEnabled();
 await page.evaluate(()=>(window as any).__releaseSubmit());await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('已提交');
 await page.getByRole('button',{name:'补充出行计划',exact:true}).click();await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('上海');
});

test('replacement preview preserves original draft; reject keeps it and accept creates the new form',async({page})=>{
 await setup(page);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await page.evaluate(()=>(window as any).__proposal());await dock.getByRole('button',{name:'查看并确认'}).click();
 await expect(page.getByRole('alertdialog')).toContainText('新的出行计划');await expect(page.getByRole('alertdialog')).toContainText('北京');await page.screenshot({path:'test-results/supplemental-proposal.png',animations:'disabled'});
 await page.getByRole('alertdialog').getByRole('button',{name:'返回',exact:true}).click();
 await dock.getByRole('button',{name:'保留原填写',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'保留原填写',exact:true}).click();
 await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveValue('上海');await expect(dock.getByRole('button',{name:'查看并确认'})).toHaveCount(0);
 await page.evaluate(()=>(window as any).__proposal());await dock.getByRole('button',{name:'查看并确认'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认采用'}).click();
 await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('已替换');await dock.getByLabel('选择待补充事项').selectOption('replacement');await expect(dock.getByRole('textbox',{name:'目的地 *',exact:true})).toHaveValue('北京');
 await page.getByRole('button',{name:'补充出行计划',exact:true}).click();await page.getByRole('button',{name:'查看原填写'}).click();await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('上海');
});
test('cancellation requires confirmation and leaves a readable original entry',async({page})=>{
 await setup(page,true);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await dock.getByRole('button',{name:'取消这项补充',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('不会作为回答提交');
 await page.getByRole('alertdialog').getByRole('button',{name:'确认取消'}).click();
 await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('已取消');expect(await page.evaluate(()=>(window as any).__snapshot.policy.paused)).toBe(true);
});

test('message interpretation confirms the visible evidence and resumes only its answer',async({page})=>{
 await setup(page,true);await page.evaluate(()=>(window as any).__messageProposal());const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('button',{name:'查看并确认'}).click();await expect(page.getByRole('alertdialog')).toContainText('我决定去北京。');await page.getByRole('alertdialog').getByRole('button',{name:'确认并继续'}).click();
 await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText('已提交');expect(await page.evaluate(()=>(window as any).__commands.find((c:any)=>c.action==='acceptProposal').resume)).toEqual({expectedPolicyGeneration:1});
});
test('unknown delivery offers verification and never exposes a resend action',async({page})=>{
 await setup(page);await page.evaluate(()=>(window as any).__unknown());await page.getByRole('button',{name:/查看投递记录/}).click();await page.getByRole('button',{name:'核实是否送达'}).click();
 await expect(page.getByRole('region',{name:'补充消息',exact:true})).toContainText('暂未找到送达记录，不会自动重发。');
 expect(await page.evaluate(()=>(window as any).__commands.map((c:any)=>c.action))).toEqual(['reconcile']);
});

test('submitted answers stay at the request position with delivery status and no draft disclosure',async({page})=>{
 await setup(page);const process=page.getByRole('region',{name:'任务执行过程'}),dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');
 await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await process.getByRole('button',{name:'补充出行计划',exact:true}).click();await expect(process).not.toContainText('上海');
 await dock.getByRole('button',{name:'提交补充信息',exact:true}).click();await expect(process).toContainText('上海');await expect(process).toContainText('等待发送');
 await expect(process.getByRole('textbox')).toHaveCount(0);
 await page.screenshot({path:'test-results/input-process-record.png',animations:'disabled'});
});

test('answer status follows delivery and history stays in the originating turn',async({page})=>{
 await setup(page);const dock=page.getByRole('region',{name:'待补充信息',exact:true});
 await dock.getByRole('textbox',{name:'目的地 *',exact:true}).fill('上海');
 await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.requests[0].draft.city)).toBe('上海');
 await dock.getByRole('button',{name:'提交补充信息',exact:true}).click();
 for(const [state,label] of [['dispatching','正在发送'],['unknown','送达待核实'],['failed','发送失败'],['delivered','已送达']]){
  await page.evaluate(state=>{const w=window as any;w.__snapshot.deliveries[0].state=state;w.__refresh();},state);
  await expect(page.getByRole('region',{name:'任务执行过程'})).toContainText(label);
 }
 await page.evaluate(()=>(window as any).__nextTurn());
 await page.locator('[data-turn-id="u"]').getByRole('button',{name:'本轮已结束',exact:true}).click();
 await expect(page.locator('[data-turn-id="u"]').getByRole('button',{name:'补充出行计划',exact:true})).toBeVisible();
 await expect(page.locator('[data-turn-id="u2"]').getByRole('button',{name:'补充出行计划',exact:true})).toHaveCount(0);
});

test('input tools render readable answers and keep protocol data behind technical details',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{const w=window as any;w.__snapshot.requests[0].template.steps[0].fields.push({name:'pace',type:'select',label:'旅行节奏',options:[{label:'轻松',value:'relaxed'}]});w.__refresh();w.__setTools([{id:'read',turnKey:'u',order:3,type:'mcpToolCall',label:'input_read_answer',status:'completed',detail:JSON.stringify({arguments:{requestId:'a'},result:{content:[{type:'text',text:JSON.stringify({ok:true,value:{requestId:'a',state:'answered',answer:{values:{city:'北京',pace:'relaxed'},displayLabels:{city:'目的地',pace:'旅行节奏'}}}})}]}})}]);});
 const process=page.getByRole('region',{name:'任务执行过程'});
 await process.getByRole('button',{name:'读取你的回答',exact:true}).click();
 await expect(process).toContainText('北京');await expect(process).toContainText('轻松');
 await expect(process.getByText('relaxed',{exact:true})).toHaveCount(0);
 await expect(process.locator('pre')).toHaveCount(0);
 await page.getByRole('button',{name:'稍后填写',exact:true}).click();
 await process.getByRole('button',{name:'读取你的回答',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/input-readable-tool.png',animations:'disabled'});
 await process.getByRole('button',{name:'技术详情',exact:true}).click();await expect(process.locator('pre')).toContainText('requestId');
 await page.evaluate(()=>(window as any).__setTools([{id:'read',turnKey:'u',order:3,type:'mcpToolCall',label:'input_read_answer',status:'completed',detail:'broken json'}]));
 await expect(process).toContainText('暂时无法显示这一步的结果。');await expect(process.getByText('北京',{exact:true})).toHaveCount(0);
});

test('interrupted native question remains readable and notices can hide without resuming',async({page})=>{
 await setup(page);
 await page.evaluate(()=>(window as any).__interruptUnanswered());
 const reminder=page.getByRole('region',{name:'上次未回答的问题',exact:true});
 await expect(reminder).toContainText('脚本具体需要完成什么？');
 await expect(reminder).not.toContainText('提交回答');
 await page.getByRole('button',{name:'收起问题提示',exact:true}).click();
 await expect(reminder.getByText('脚本具体需要完成什么？')).not.toBeVisible();
 await page.getByRole('button',{name:'查看上次未回答的问题',exact:true}).click();
 await expect(reminder).toContainText('脚本具体需要完成什么？');
 await page.getByRole('button',{name:'收起暂停提示',exact:true}).click();
 await expect(page.getByRole('button',{name:'查看暂停状态',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__snapshot.policy.paused)).toBe(true);
 expect(await page.evaluate(()=>(window as any).__commands)).toEqual([]);
 await page.screenshot({path:'test-results/interrupted-question-recovery.png',animations:'disabled'});
});

test('supplied information retires both notices across subsequent stops while new questions still appear',async({page})=>{
 await setup(page);
 await page.evaluate(()=>(window as any).__interruptUnanswered());
 const reminder=page.getByRole('region',{name:'上次未回答的问题',exact:true});
 await expect(reminder).toBeVisible();
 await page.evaluate(()=>(window as any).__followupAndStop('继续'));
 await expect(reminder).toBeVisible();
 await page.evaluate(()=>(window as any).__followupAndStop('监控vllm的运行状态'));
 await expect(reminder).toHaveCount(0);
 await expect(page.getByRole('region',{name:'补充消息',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).__followupAndStop('继续'));
 await expect(reminder).toHaveCount(0);
 await expect(page.getByText('任务已暂停',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/resolved-question-paused.png',animations:'disabled'});
 await page.evaluate(()=>(window as any).__unknown());
 await expect(page.getByRole('region',{name:'补充消息',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__interruptUnanswered());
 await expect(reminder).toBeVisible();
});
