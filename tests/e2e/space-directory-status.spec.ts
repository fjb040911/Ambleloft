import {test,expect,type Page} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
async function populate(page:Page){
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,s=qa.snapshot,p=s.plans[0],base=structuredClone(p.packages[0]);
  p.packages[0].status='running';p.packages[1].status='accepted';p.packages[2].status='accepted';
  p.packages.push({...base,id:'approval',status:'waiting',definition:{...base.definition,id:'approval',title:'部署授权'},attempts:[{...base.attempts[0],id:'approval-attempt',runId:'approval-run',requestId:'approval-request'}]});
  p.events.push({seq:2,detail:'接口验证完成',type:'review',at:'2026-11-04T10:00:00Z'});
  const original=(window as any).desktop.getRunPage;
  (window as any).desktop.getRunPage=async(input:any)=>input.id==='approval-run'?{...(await original({id:'evidence'})),id:'approval-run',status:'waiting',approvals:[{id:'approval',method:'item/commandExecution/requestApproval',detail:'{"command":"echo test"}'}]}:original(input);
  s.requests.push({id:'host-question',spaceId:'space',prompt:'确认发布目标',mode:'discussion',createdAt:'2026-11-04T10:01:00Z',participants:[],documentRefs:[],host:{status:'ready',revision:1,steps:[],brief:null,question:{requestKey:'q',reason:'目标地址是什么？',source:{definition:{title:'目标',fields:[]}},prefill:{}}}});
  qa.emit();
 });
}
for(const [width,theme] of [[1280,'light'],[800,'dark'],[390,'light']] as const)test(`directory exposes execution, pending categories and scoped progress at ${width}px ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto(fixture+'?theme='+theme);await populate(page);
 const entry=page.locator('.wf-space-entry').filter({hasText:'产品发布'});
 await expect(entry.locator('.wf-space-runtime')).toHaveText('执行中');
 await expect(entry.getByRole('button',{name:'待授权 1',exact:true})).toBeVisible();
 await expect(entry.getByRole('button',{name:'待补充 1',exact:true})).toBeVisible();
 await expect(entry.locator('.wf-space-plan-summary')).toContainText('已验收 2/4 · 执行中 1');
 await expect(entry.locator('.wf-space-latest')).toContainText('确认发布目标');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/space-status-${width}-${theme}.png`,fullPage:true});
 await entry.getByRole('button',{name:'待授权 1',exact:true}).click();
 await expect(page.getByRole('heading',{name:'部署授权',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'任务',exact:true})).toHaveAttribute('aria-selected','true');
});
test('primary action opens attention overview; question link opens its discussion; paused and completed stay distinct',async({page})=>{
 await page.goto(fixture);await populate(page);
 const entry=page.locator('.wf-space-entry').filter({hasText:'产品发布'});
 await entry.getByRole('button',{name:'去处理',exact:true}).click();
 await expect(page.getByRole('heading',{name:/需要你处理/})).toBeVisible();
 await page.getByRole('button',{name:'项目空间',exact:true}).click();
 await entry.getByRole('button',{name:'待补充 1',exact:true}).click();
 await expect(page.getByRole('tab',{name:'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('heading',{name:'确认发布目标',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'项目空间',exact:true}).click();
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.status='paused';p.packages.forEach((item:any)=>{item.status='interrupted';item.stopReason='plan-pause';});qa.snapshot.requests.find((r:any)=>r.id==='host-question').host.question.answeredBy='answered';qa.emit();});
 await expect(entry.locator('.wf-space-runtime')).toHaveText('已暂停');
 await expect(entry.getByRole('button',{name:/待恢复/})).toHaveCount(0);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.status='completed';p.packages.forEach((item:any)=>{item.status='accepted';});qa.emit();});
 await expect(entry.locator('.wf-space-runtime')).toHaveText('本轮计划已完成');
 await expect(entry.locator('.wf-space-plan-summary')).toContainText('已验收 4/4');
});
test('multiple plans and unknown requests stay legible with long content in English',async({page})=>{
 await page.setViewportSize({width:390,height:1000});await page.goto(fixture+'?lang=en&theme=dark');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];qa.snapshot.spaces[0].name='A long cross-project delivery and integration workspace '.repeat(5);p.name='A long integration plan with deployment and acceptance criteria '.repeat(3);const next=structuredClone(p);next.id='second';next.name='Second plan';next.packages=[{...next.packages[0],status:'waiting',attempts:[{runId:'missing-request',requestId:'unknown-request'}]}];qa.snapshot.plans.push(next,{...structuredClone(p),id:'history',name:'Historical completed plan',status:'completed'});qa.emit();});
 const entry=page.locator('.wf-space-entry').first();
 await expect(entry.locator('.wf-space-plan-summary')).toContainText('2 unfinished plans');
 await expect(entry.locator('.wf-space-plan-summary')).not.toContainText('Historical completed plan');
 await expect(entry.getByRole('button',{name:'Unknown status 1',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect((await entry.locator('.wf-space-entry-title strong').boundingBox())!.height).toBeLessThanOrEqual(46);
});
