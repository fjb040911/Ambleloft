import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,paused=false,missingHandler=false){
 await page.addInitScript(({paused,missingHandler})=>{
 const run:any={id:'input-test',title:'补充信息测试',model:'fixture',baseUrl:'http://localhost/v1',cwd:'/tmp',createdAt:new Date().toISOString(),status:paused?'interrupted':'running',messages:[{id:'u',role:'user',text:'规划旅行'}],tools:[],approvals:[]};
 let callback:any,inputCallback:any;
 const snapshot:any={policy:{paused,generation:paused?1:0},deliveries:paused?[{id:'one',runId:run.id,text:'之前填写的日期',state:'queued'},{id:'two',runId:run.id,text:'之前填写的预算',state:'queued'}]:[]};
 const w=window as any;w.__requests=[];w.__starts=[];w.__resumes=[];w.__snapshot=snapshot;w.__complete=()=>{run.status='completed';callback(structuredClone(run));};
 w.desktop={listProviders:async()=>({defaultId:'a',providers:[{id:'a',name:'服务 A',configured:true,baseUrl:run.baseUrl,model:'fixture',models:['fixture','Model B']},{id:'b',name:'服务 B',configured:true,baseUrl:'http://other.local/v1',model:'Other model',models:['Other model']}]}),getProvider:async()=>({configured:true,baseUrl:run.baseUrl,model:'fixture',executable:'',hasKey:false}),getDevice:async()=>({name:'Test',mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',projects:[],tasks:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>[run],onRun:(fn:any)=>{callback=fn;return()=>{};},onCommand:()=>()=>{},
 startRun:async(input:any)=>{w.__starts.push(input);run.model=input.model;run.status='running';callback(structuredClone(run));return structuredClone(run);},
 stopRun:async()=>{snapshot.policy={paused:true,generation:snapshot.policy.generation+1};run.status='interrupted';callback(structuredClone(run));inputCallback?.({runId:run.id});},
 inputs:{list:async()=>{if(missingHandler)throw Error("Error invoking remote method 'input:list': Error: No handler registered for 'input:list'");return structuredClone(snapshot);},onChanged:(fn:any)=>{inputCallback=fn;return()=>{};},append:(input:any)=>{w.__requests.push(input);return new Promise((resolve,reject)=>{w.__accept=()=>{snapshot.deliveries.unshift({id:input.clientMutationId,runId:run.id,text:input.text,state:'queued'});inputCallback?.({runId:run.id});resolve(snapshot.deliveries[0]);};w.__reject=()=>reject(Error('暂时无法发送'));});},action:async(input:any)=>{w.__resumes.push(input);if(input.expectedPolicyGeneration!==snapshot.policy.generation)throw Error('CONFLICT');snapshot.policy={paused:false,generation:snapshot.policy.generation+1};snapshot.deliveries.forEach((d:any)=>{d.held=!input.deliveryIds.includes(d.id);});inputCallback?.({runId:run.id});return snapshot.policy;}}};
 },{paused,missingHandler});await page.goto('/');await page.locator('.tree-task > button:first-child').filter({hasText:'补充信息测试'}).click();
}
test('active send retains newly typed text and keeps Stop available',async({page})=>{
 await setup(page);const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('目的地上海');await input.press('Enter');
 await expect(page.getByRole('button',{name:'发送补充',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'停止',exact:true})).toBeEnabled();await expect(input).toBeEnabled();
 await input.fill('预算三千');await page.evaluate(()=>(window as any).__accept());await expect(input).toHaveValue('预算三千');await page.getByRole('button',{name:/查看投递记录/}).click();await expect(page.getByRole('region',{name:'补充消息'})).toContainText('排队中');
 await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'发送补充',exact:true}).click();
 await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByText('任务已暂停',{exact:true})).toBeVisible();await expect(input).toHaveValue('预算三千');
});
test('failed sends retain draft and retry the same delivery identity',async({page})=>{
 await setup(page);const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('下周出发');await input.press('Enter');await page.evaluate(()=>(window as any).__reject());await expect(page.getByRole('alert')).toContainText('暂时无法发送');await expect(input).toHaveValue('下周出发');await input.press('Enter');
 expect(await page.evaluate(()=>{const r=(window as any).__requests;return r.length===2&&r[0].clientMutationId===r[1].clientMutationId;})).toBe(true);
 await page.evaluate(()=>(window as any).__accept());await expect(input).toHaveValue('');
});
test('paused content is opt-in and unselected content remains held',async({page})=>{
 await setup(page,true);const panel=page.getByRole('region',{name:'补充消息'});await panel.getByRole('button',{name:/查看投递记录/}).click();await expect(panel.getByRole('checkbox').first()).not.toBeChecked();
 await expect(panel.getByRole('button',{name:/继续发送所选内容/})).toBeDisabled();await panel.getByRole('checkbox',{name:'之前填写的日期'}).check();await panel.getByRole('button',{name:/继续发送所选内容/}).click();
 expect(await page.evaluate(()=>(window as any).__resumes[0].deliveryIds)).toEqual(['one']);expect(await page.evaluate(()=>(window as any).__snapshot.deliveries.find((d:any)=>d.id==='two').held)).toBe(true);
 await page.setViewportSize({width:760,height:700});await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();await page.screenshot({path:'test-results/user-input-paused.png'});
});
test('send and continue starts a new turn without releasing old supplemental content',async({page})=>{
 await setup(page,true);const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('改为下个月出发');await page.getByRole('button',{name:'发送并继续',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__starts.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(0);
 expect(await page.evaluate(()=>(window as any).__resumes[0].deliveryIds)).toEqual([]);
 expect(await page.evaluate(()=>(window as any).__snapshot.deliveries.every((d:any)=>d.held))).toBe(true);
 await expect(input).toHaveValue('');
});
test('Stop remains independent while a supplemental send is pending',async({page})=>{
 await setup(page);const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('尚在发送的补充');await input.press('Enter');await page.getByRole('button',{name:'停止',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__snapshot.policy.paused)).toBe(true);await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0);await page.evaluate(()=>(window as any).__reject());await expect(input).toHaveValue('尚在发送的补充');
 await page.setViewportSize({width:760,height:700});await page.screenshot({path:'test-results/user-input-stopped.png'});
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await expect(page.getByRole('region',{name:'补充消息'})).toHaveCount(0);await expect(input).toHaveValue('尚在发送的补充');await page.screenshot({path:'test-results/user-input-stopped-dark.png',animations:'disabled'});
});

test('empty supplemental history stays invisible; stale backend gives restart guidance',async({page})=>{
 await setup(page);await expect(page.getByText('暂时无法读取补充消息，请重试',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'补充消息',exact:true})).toHaveCount(0);
});
test('missing input IPC handler is not reported as a retryable read failure',async({page})=>{
 await setup(page,false,true);
 await expect(page.getByRole('alert')).toContainText('应用更新尚未完成，请退出并重新打开 Ambleloft');
 await expect(page.getByText('暂时无法读取补充消息，请重试',{exact:true})).toHaveCount(0);
});


test('stop then switch model and Enter carries model B through a new turn, not supplemental append',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'停止',exact:true}).click();
 await expect(page.getByRole('button',{name:'选择模型',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();
 await page.getByRole('option',{name:'Model B 服务 A',exact:true}).click();
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('继续');await input.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).__starts.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__starts[0])).toMatchObject({runId:'input-test',prompt:'继续',model:'Model B',providerId:'a'});
 expect(await page.evaluate(()=>(window as any).__requests)).toEqual([]);
 expect(await page.evaluate(()=>(window as any).__resumes[0].deliveryIds)).toEqual([]);
 await expect(input).toHaveValue('');
});

for(const ending of ['stop','complete'])test(`running model selection applies after ${ending} without changing supplemental delivery`,async({page})=>{
 await setup(page);
 const model=page.getByRole('button',{name:'选择模型',exact:true});
 await expect(model).toBeEnabled();await expect(page.getByRole('button',{name:'默认权限',exact:true})).toBeDisabled();
 await model.click();await page.getByRole('option',{name:'Model B 服务 A',exact:true}).click();
 await expect(model).toContainText('Model B');await expect(model).toContainText('下一轮');
 await expect(page.getByText('所选模型将在下一轮生效；本轮及补充消息仍使用：fixture',{exact:true})).toBeVisible();
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('补充背景');await input.press('Enter');
 await expect(model).toBeDisabled();await expect.poll(()=>page.evaluate(()=>(window as any).__requests.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__starts)).toEqual([]);
 await page.evaluate(()=>(window as any).__accept());await expect(model).toBeEnabled();
 if(ending==='stop')await page.getByRole('button',{name:'停止',exact:true}).click();
 else await page.evaluate(()=>(window as any).__complete());
 await expect(model).not.toContainText('下一轮');await expect(model).toContainText('Model B');
 await input.fill('继续');await input.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).__starts.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__starts[0])).toMatchObject({model:'Model B',providerId:'a',prompt:'继续'});
 expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(1);
});

test('idle task changes providers only after confirmation',async({page})=>{
 await setup(page,true);
 const model=page.getByRole('button',{name:'选择模型',exact:true});
 await model.click();await page.getByRole('option',{name:'Other model 服务 B',exact:true}).click();
 const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'切换模型服务',exact:true}).click();
 await expect(model).toContainText('Other model');
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('继续');await input.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).__starts.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__starts[0])).toMatchObject({model:'Other model',providerId:'b',confirmProviderChange:true});
});
