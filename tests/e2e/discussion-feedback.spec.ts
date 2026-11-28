import {test,expect,type Page} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
async function enter(page:Page,{empty=false,english=false,dark=false}={}){
 await page.goto(fixture+`?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 if(empty)await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests=q.snapshot.requests.filter((r:any)=>r.mode!=='discussion');q.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
for(const width of [390,800,1280])test(`empty discussion has no artificial scrolling at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await enter(page,{empty:true});
 await page.screenshot({path:test.info().outputPath(`discussion-empty-${width}.png`),animations:'disabled'});
 const geometry=await page.locator('.qa-scroll').evaluate(el=>({client:el.clientHeight,height:el.scrollHeight}));
 expect(geometry.height-geometry.client).toBeLessThanOrEqual(1);
 await expect(page.getByRole('button',{name:'回到最新消息'})).toHaveCount(0);
 const footer=await page.locator('.wf-discussion-footer').boundingBox();expect(footer!.y+footer!.height).toBeCloseTo(950,0);
});

for(const width of [390,1280])test(`empty discussion also fits a short window at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:720});await enter(page,{empty:true});
 await expect.poll(()=>page.locator('.qa-scroll').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
 await page.getByRole('tab',{name:'文档与产物',exact:true}).click();
 await page.locator('.qa-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
 await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.locator('.qa-scroll').evaluate(el=>el.scrollTop=0);
 await expect.poll(()=>page.locator('.qa-scroll').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
});

for(const [width,english,dark] of [[1280,false,false],[390,true,true]] as const)test(`brief opens in main workspace with stable topic list and source navigation ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await enter(page,{english,dark});
 const sidebar=page.getByRole('complementary',{name:english?'Discussion context':'讨论上下文'});
 if(width<800)await page.getByRole('button',{name:english?'Show discussion context':'查看讨论与相关内容'}).click();
 const toolbar=sidebar.locator('.wf-topic-toolbar'),before=await toolbar.boundingBox();
 await page.evaluate(()=>{const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');r.host={status:'completed',revision:1,ruleVersion:'fixture',steps:[{id:'result',text:'方案已整理',action:'reply',at:''}],brief:{goal:'工单登记与查询',items:Array.from({length:24},(_,i)=>({id:'item'+i,kind:'proposal',text:'基于已确认的范围，建议优先完善表单校验与服务错误反馈。'.repeat(3),sourceIds:['discussion']}))}};q.emit();});
 await expect(sidebar.getByRole('list',{name:english?'Topic list':'话题列表'})).toBeVisible();expect((await toolbar.boundingBox())!.y).toBeCloseTo(before!.y,0);
 await page.getByText(english?'Goal and decision sources':'目标与决定的来源',{exact:true}).click();
 const panel=page.locator('.wf-host-brief');await expect(page.locator('.wf-host-brief')).toBeVisible();
 await expect(sidebar.getByRole('list',{name:english?'Topic list':'话题列表'})).toBeVisible();await expect(sidebar.getByRole('button',{name:english?'All topics':'全部话题'})).toHaveCount(0);
 await panel.getByRole('button',{name:english?'Source 1':'来源 1'}).last().click();await expect(page.locator('#wf-request-discussion')).toBeFocused();
 await expect(page.locator('.wf-topic-chat')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
for(const [english,dark,reduced] of [[false,false,false],[true,true,true]] as const)test(`host uses shared thinking feedback, preserves manual reading and stops motion ${english}`,async({page})=>{
 await page.setViewportSize({width:english?390:1280,height:950});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await enter(page,{english,dark});
 await page.evaluate(()=>{const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');r.host={status:'running',revision:1,ruleVersion:'fixture',steps:[],brief:null,activity:{id:'model-pass',phase:'waiting',reasoning:'',reasoningFormat:'text',startedAt:new Date().toISOString()}};window.desktop!.spaces!.stopDiscussionHost=async()=>{r.host.status='interrupted';q.emit();return {stopped:true};};q.emit();});
 const host=page.getByRole('region',{name:english?'Host response':'主持人回复'});await expect(host.getByRole('status')).toContainText(english?'Waiting for the model':'等待模型响应');
 const label=host.locator('[data-slot=marker-content]');
 await expect(label).toHaveCSS('animation-name',reduced?'none':'tw-shimmer');
 if(!reduced){
  const position=await label.evaluate(el=>getComputedStyle(el).backgroundPosition);
  await expect.poll(()=>label.evaluate(el=>getComputedStyle(el).backgroundPosition)).not.toBe(position);
 }else{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(label).toHaveCSS('animation-name','tw-shimmer');
  await expect(label).toHaveCSS('background-clip','text');
  // Keep the sampled glyphs above the discussion's sticky composer.
  await label.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const atPhase=async(ms:number)=>{
   await label.evaluate((el,time)=>{const sweep=el.getAnimations()[0];sweep.pause();sweep.currentTime=time;},ms);
   return label.screenshot();
  };
  expect((await atPhase(0)).equals(await atPhase(1000))).toBe(false);
  await page.emulateMedia({reducedMotion:'reduce'});
 }
 expect(await host.locator('[data-slot=spinner]').evaluate(el=>getComputedStyle(el).animationName)).toBe(reduced?'none':'spin');
 await page.evaluate(()=>{const q=(window as any).spaceQA,h=q.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.activity.phase='reasoning';h.activity.reasoning=Array.from({length:30},(_,i)=>'Provider reasoning '+i).join('\n');h.revision++;q.emit();});
 const thought=host.getByRole('region',{name:english?'Thinking':'思考过程'});await expect(thought).toHaveCount(0);await host.getByRole('button',{name:english?'Thinking':'思考中',exact:true}).click();await expect(thought).toContainText('Provider reasoning 29');await expect(thought).toBeVisible();await page.locator('.qa-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect.poll(()=>thought.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
 await thought.evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{deltaY:-50,bubbles:true}));el.scrollTop=0;});
 await page.evaluate(()=>{const q=(window as any).spaceQA,h=q.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.activity.reasoning+='\nNew provider text';h.revision++;q.emit();});await expect(thought).toContainText('New provider text');expect(await thought.evaluate(el=>el.scrollTop)).toBe(0);
 await page.screenshot({path:test.info().outputPath(`discussion-thinking-${english}.png`),animations:'disabled'});
 await page.getByRole('button',{name:english?'Stop':'停止',exact:true}).click();await expect(host.getByRole('status')).toHaveCount(0);await expect(host.getByText(english?'Stopped':'已停止',{exact:true})).toBeVisible();
 await host.locator('[data-slot=trace-collapsible-trigger]').filter({hasText:english?'View model reasoning':'查看模型思考'}).click();await expect(thought).toContainText('New provider text');await expect(host.locator('[data-slot=spinner]')).toHaveCount(0);
 await page.evaluate(()=>{const q=(window as any).spaceQA,h=q.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.activity.reasoning='VeryLongUnbrokenProviderText'.repeat(100);h.revision++;q.emit();});
 await expect(thought).toContainText('VeryLongUnbrokenProviderText');expect(await thought.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});


test('host closes previously opened reasoning when the round completes',async({page})=>{
 await enter(page);
 await page.evaluate(()=>{const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');r.host={status:'running',revision:1,ruleVersion:'fixture',steps:[],brief:null,activity:{id:'model-pass',phase:'responding',reasoning:'保留这段思考记录',reasoningFormat:'text',startedAt:new Date().toISOString()}};q.emit();});
 const trace=page.locator('.wf-host-trace'),thought=trace.getByRole('region',{name:'思考过程'});
 await trace.locator('[data-slot=trace-collapsible-trigger]').click();await expect(thought).toBeVisible();
 await page.evaluate(()=>{const q=(window as any).spaceQA,h=q.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.status='completed';h.revision++;q.emit();});
 await expect(thought).toBeHidden();
 await trace.locator('[data-slot=trace-collapsible-trigger]').click();await expect(thought).toBeVisible();await expect(thought).toContainText('保留这段思考记录');
 await page.evaluate(()=>{(window as any).spaceQA.emit();});await expect(thought).toBeVisible();
});

test('host hands off to experts in one live slot and preserves its coordination messages',async({page})=>{
 await enter(page);
 await page.evaluate(()=>{
  const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[];
  r.host={status:'running',revision:1,steps:[{id:'scope',text:'先确认范围'}],activity:{id:'pass',phase:'waiting',reasoning:''}};
  q.emit();
 });
 const host=page.getByRole('region',{name:'主持人回复'}),slot=host.locator('.live-trace-activity');
 await expect(slot).toHaveText('等待下一步响应');
 const element=await slot.elementHandle();
 await page.evaluate(()=>{
  const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.host.activity.phase='experts';r.host.steps.push({id:'delegate',text:'请专家检查实现'});r.host.revision++;q.emit();
 });
 await expect(slot).toHaveText('正在启动专家');
 await expect(host.getByText('先确认范围',{exact:true})).toBeVisible();
 await expect(host.getByText('请专家检查实现',{exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[{employeeId:'writer',status:'preparing',output:''}];r.host.revision++;q.emit();
 });
 await page.getByRole('button',{name:/专家分析与执行记录/}).click();
 const preview=page.locator('[data-expert-id="writer"] .wf-output');
 await expect(preview.getByRole('status')).toHaveText('正在启动专家');
 await page.evaluate(()=>{
  const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[{employeeId:'writer',runId:'expert',status:'running',output:''}];r.host.revision++;q.emit();
 });
 await expect(slot).toHaveText('等待专家完成分析');
 expect(await slot.evaluate((el,previous)=>el===previous,element)).toBe(true);
 await page.evaluate(()=>{
  const q=(window as any).spaceQA,r=q.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants[0].status='completed';r.host.status='completed';r.host.revision++;q.emit();
 });
 await expect(slot).toHaveCount(0);
 await host.getByRole('button',{name:/查看协调过程/}).click();
 await expect(host.getByText('先确认范围',{exact:true})).toBeVisible();
});
