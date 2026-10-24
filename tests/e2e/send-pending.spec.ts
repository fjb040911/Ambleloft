import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,existing=false,longHistory=false,interrupted=false){
 await page.addInitScript(({existing,longHistory,interrupted})=>{
  const w=window as any,provider={id:'p',name:'Fixture',configured:true,model:'fixture',models:['fixture'],baseUrl:'http://localhost/v1'};
  const run={id:'run',title:'已有任务',providerId:'p',model:'fixture',baseUrl:provider.baseUrl,status:interrupted?'interrupted':'completed',error:interrupted?'已停止，请核实结果后继续。':'',createdAt:new Date().toISOString(),messages:[{id:'u',role:'user',text:'之前的问题'},{id:'a',role:'assistant',phase:'final_answer',text:'之前的回复'}],tools:[],approvals:[],questions:[]};
  if(longHistory)run.messages=Array.from({length:12},(_,i)=>[{id:'u'+i,role:'user',text:'历史问题 '+i},{id:'a'+i,role:'assistant',phase:'final_answer',text:('历史回答 '+i+'\n\n').repeat(12)}]).flat();
  let listener:any;w.__calls=0;
  w.desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Test',memoryGB:32}),readWorkspace:async()=>({layoutMode:'classic',projects:[],tasks:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>existing?[run]:[],onRun:(fn:any)=>{listener=fn;return()=>{};},onCommand:()=>()=>{},skills:{list:async()=>[]},extensions:{list:async()=>({capabilities:{},installed:[]})},
   startRun:(input:any)=>{w.__calls++;w.__input=input;return new Promise((resolve,reject)=>{w.__reject=()=>reject(Error('测试发送失败'));w.__accept=()=>{const next={...run,status:'running',error:'',messages:[...(existing?run.messages:[]),{id:'new',role:'user',text:input.prompt}]};listener(next);resolve(next);};});},stopRun:async()=>{}
  };
 },{existing,longHistory,interrupted});await page.goto('/');if(existing)await page.locator('.tree-task > button:first-child').filter({hasText:'已有任务'}).click();
}
test('new task immediately shows a bubble, clears the draft and animates without duplicate sends',async({page})=>{
 await setup(page);const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('帮我整理方案');const color=await page.getByRole('button',{name:'发送任务',exact:true}).evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));await input.press('Enter');
 await expect(input).toHaveValue('');await expect(page.getByLabel('正在发送的消息')).toContainText('帮我整理方案');const button=page.getByRole('button',{name:'正在发送…',exact:true});await expect(button).toBeDisabled();await expect(button.locator('[data-slot=spinner]')).toBeVisible();
 await expect.poll(()=>button.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))).toEqual(color);await expect(button).toHaveCSS('opacity','1');expect(await page.evaluate(()=>(window as any).__calls)).toBe(1);await page.screenshot({path:'test-results/new-task-sending.png'});
 await page.evaluate(()=>(window as any).__accept());await expect(page.getByLabel('正在发送的消息')).toHaveCount(0);await expect(page.getByLabel('你的消息',{exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'停止',exact:true})).toBeVisible();
});
test('failed initial send restores the draft and enables retry',async({page})=>{
 await setup(page);const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('保留这段输入');await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(input).toHaveValue('');await page.evaluate(()=>(window as any).__reject());await expect(input).toHaveValue('保留这段输入');await expect(page.getByLabel('正在发送的消息')).toHaveCount(0);await expect(page.getByRole('button',{name:'发送任务',exact:true})).toBeEnabled();
});
test('follow-up clears immediately and failure preserves both submitted and newly typed drafts',async({page})=>{
 await setup(page,true);const input=page.locator('.followup textarea');await input.fill('继续分析');await input.press('Enter');await expect(input).toHaveValue('');await expect(page.getByLabel('正在发送的消息')).toContainText('继续分析');await expect(page.getByRole('button',{name:'正在发送…',exact:true})).toBeDisabled();
 await input.fill('再补充一点');await page.evaluate(()=>(window as any).__reject());await expect(input).toHaveValue('继续分析\n\n再补充一点');await expect(page.getByLabel('正在发送的消息')).toHaveCount(0);
});
test('acknowledged follow-up replaces the placeholder once and retains the next draft',async({page})=>{
 await setup(page,true);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');const input=page.locator('.followup textarea');await input.fill('继续分析');await input.press('Enter');await expect(page.getByLabel('正在发送的消息')).toBeVisible();await input.fill('下一条草稿');await page.screenshot({path:'test-results/followup-sending-dark.png',animations:'disabled'});await page.evaluate(()=>(window as any).__accept());await expect(page.getByLabel('正在发送的消息')).toHaveCount(0);await expect(page.getByLabel('你的消息',{exact:true})).toHaveCount(2);await expect(input).toHaveValue('下一条草稿');
});

for(const interrupted of [false,true])test(`long conversation stays at the latest message during send and acknowledgement (interrupted=${interrupted})`,async({page})=>{
 await setup(page,true,true,interrupted);
 const viewport=page.locator('.conversation-scroll:visible');
 const input=page.getByRole('textbox',{name:'继续对话'});
 await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
 await input.fill('最新的问题');await input.press('Enter');
 await expect(page.getByLabel('正在发送的消息')).toBeVisible();
 await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
 await page.evaluate(()=>(window as any).__accept());
 await expect(page.getByLabel('正在发送的消息')).toHaveCount(0);
 await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
 await expect(page.locator('[data-turn-id="new"]')).toBeInViewport();
});

test('sending from older history and restoring a failed draft does not jump back to the first turn',async({page})=>{
 await setup(page,true,true);
 const viewport=page.locator('.conversation-scroll:visible');
 await viewport.hover();await page.mouse.wheel(0,-800);
 await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeGreaterThan(200);
 const input=page.getByRole('textbox',{name:'继续对话'});await input.fill('从历史继续');await input.press('Enter');
 await expect(page.getByLabel('正在发送的消息')).toBeInViewport();
 await page.evaluate(()=>(window as any).__reject());await expect(input).toHaveValue('从历史继续');
 await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
});
