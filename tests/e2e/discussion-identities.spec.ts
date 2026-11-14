import {test,expect,type Page} from '@playwright/test';
const fixture='/tests/manual/project-space-qa.html';
async function prepare(page:Page,english=false,dark=false){
 await page.goto(fixture+`?lang=${english?'en':'zh'}&theme=${dark?'dark':'light'}`);
 await page.evaluate(({english})=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');
  const names=english?['Product manager','Architect']:['产品经理','架构师'];
  r.participants=names.map((name,i)=>({employeeId:i?'architect':'writer',runId:'expert-'+i,status:'completed',output:(english?'Validate the goal, constraints and acceptance criteria.':'先核对目标、约束与验收条件。').repeat(3),role:{name,revision:2,skills:[]},contribution:{id:'contribution-'+i,author:{kind:'expert',id:i?'architect':'writer',name},stage:'analysis',replyToContributionId:null,provenance:'recorded',context:{version:'abcdef1234567890',assignment:i?'Architecture':'Requirements',priorRequestIds:[],historyTruncated:false,historySpaceIds:[],documents:[]}}}));
  const runs:any={};r.participants.forEach((p:any,i:number)=>{runs[p.runId]={id:p.runId,title:p.role.name,projectId:null,cwd:'/fixture',model:'Same model',baseUrl:'',createdAt:r.createdAt,status:'completed',error:'',tools:[],approvals:[],messages:[{id:'u'+i,role:'user',text:r.prompt},{id:'a'+i,role:'assistant',phase:'final_answer',text:Array.from({length:30},(_,n)=>`${p.role.name} — ${n+1}. ${p.output}`).join('\n\n')}]};});
  window.desktop!.getRunPage=async({id}:any)=>structuredClone(runs[id]);
  const listeners=new Set<any>();window.desktop!.onRun=(fn:any)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
  (window as any).identityQA={runs,update:(id:string,patch:any)=>{Object.assign(runs[id],patch);listeners.forEach(fn=>fn(structuredClone(runs[id])));}};
  qa.emit();
 },{english});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true}).click();
}
for(const [width,english,dark] of [[1280,false,false],[390,false,false],[1280,true,true],[800,false,true]] as const)test(`expert attribution is distinct and sticky at ${width} ${english?'en':'zh'} ${dark?'dark':'light'}`,async({page})=>{
 await page.setViewportSize({width,height:900});await prepare(page,english,dark);
 await expect(page.locator('.discussion-expert-transcript')).toHaveCount(2);
 const first=page.locator('.wf-response').first(),second=page.locator('.wf-response').nth(1);
 await expect(first).toHaveAttribute('aria-labelledby',/writer-name/);await expect(second).toHaveAttribute('data-expert-id','architect');
 await expect(first.locator('.wf-speaker-name')).toContainText(english?'Product manager':'产品经理');await expect(second.locator('.wf-speaker-name')).toContainText(english?'Architect':'架构师');
 await expect(first.locator('.wf-speaker-name')).toContainText('Same model');await expect(second.locator('.wf-speaker-name')).toContainText('Same model');
 await expect(page.getByRole('article',{name:english?'Your message':'你的消息',exact:true})).toHaveCount(1);
 const composer=page.locator('.wf-discussion-composer'),original=(await composer.boundingBox())!;
 await page.screenshot({path:`/tmp/discussion-identities-top-${width}-${english}.png`});
 await first.evaluate(el=>{const scroller=el.closest('.qa-scroll')!;scroller.scrollTop+=el.getBoundingClientRect().top+320;});
 const tabs=(await page.locator('.wf-space-navigation').boundingBox())!,header=(await first.locator('.wf-speaker-header').boundingBox())!;
 expect(header.y).toBeGreaterThanOrEqual(tabs.y+tabs.height-2);expect(header.y).toBeLessThan(tabs.y+tabs.height+5);
 expect(Math.abs((await composer.boundingBox())!.y-original.y)).toBeLessThan(2);
 await page.screenshot({path:`/tmp/discussion-identities-sticky-${width}-${english}.png`});
 await first.getByRole('button',{name:english?'View context for Product manager':'查看产品经理的发言依据'}).click();
 const context=page.getByRole('dialog',{name:english?'Context for this contribution':'本次发言依据'});await expect(context).toContainText('Requirements');await expect(context).toContainText('abcdef123456');await page.keyboard.press('Escape');
 await page.locator('.wf-discussion-roster button').nth(1).click();await expect(second).toBeFocused();
 await second.getByRole('button',{name:english?'Response actions':'回复操作',exact:true}).click();await page.getByRole('menuitem',{name:english?'View execution record':'查看执行记录',exact:true}).click();await expect(page.getByRole('heading',{name:'原始任务证据（测试数据）'})).toBeVisible();await page.getByRole('button',{name:'返回项目空间'}).click();await expect(page.getByRole('tab',{name:english?'Discussion':'讨论',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('live per-expert statuses, partial failure and legacy context remain truthful',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const qa=(window as any).identityQA;qa.update('expert-0',{status:'running',queued:true});qa.update('expert-1',{status:'running'});});
 await expect(page.locator('.wf-response').first().locator('.wf-discussion-status')).toHaveText('排队中');await expect(page.locator('.wf-response').nth(1).locator('.wf-discussion-status')).toHaveText('分析中');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');r.participants[1].status='failed';r.participants[1].error='Provider unavailable';r.participants[1].output='';delete r.participants[1].contribution;delete r.participants[1].runId;qa.emit();(window as any).identityQA.update('expert-0',{status:'completed',queued:false});});
 const second=page.locator('.wf-response').nth(1);await expect(second).toContainText('Provider unavailable');await expect(second).toContainText('本次未产生回复');await expect(page.locator('.wf-response').first().locator('.wf-discussion-status')).toHaveText('已完成');
 await second.getByRole('button',{name:'查看架构师的发言依据'}).click();await expect(page.getByRole('dialog')).toContainText('历史记录未保存完整的发言依据');await page.keyboard.press('Escape');
 await second.getByRole('button',{name:'重新请求此专家'}).click();await expect(page.getByLabel('这次想推进什么？')).toHaveValue('明确发布目标');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='start'))).toHaveLength(0);
});

test('discussion experts share functional subagent names, streaming details and terminal history',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const q=(window as any).identityQA; q.update('expert-0',{status:'running',questions:[],tools:[{id:'native-review',label:'Kepler',turnKey:'u0',order:1,type:'analysis',nativeThreadId:'child-review',analysisTitle:'API contract review',analysisAgent:{id:'child-review',name:'Kepler',avatar:0},analysisTask:'Review API contracts',status:'running',detail:'Reading interfaces',nativeLifecycle:[{status:'pending',at:'2026-11-14T01:00:00Z'},{status:'running',at:'2026-11-14T01:00:01Z'}],nativeActivity:[{id:'check',title:'Inspect contracts',status:'running',text:'First chunk'}]}]});});
 const card=page.locator('.analysis-agent:visible').filter({hasText:'API contract review'});
 const trigger=card.locator(':scope > [data-slot=trace-collapsible] > [data-slot=trace-collapsible-trigger]');
 await expect(trigger).toContainText('进行中');await expect(trigger).not.toContainText('Kepler');await trigger.click();
 await expect(card.getByText('Review API contracts',{exact:true})).toBeVisible();await card.locator('summary').filter({hasText:'Inspect contracts'}).click();await expect(card.getByText('First chunk',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const q=(window as any).identityQA,run=q.runs['expert-0'];run.tools[0].nativeActivity[0].text+='; next chunk';run.tools[0].detail='Checking compatibility';q.update(run.id,{});});
 await expect(card.getByText('First chunk; next chunk',{exact:true})).toBeVisible();await expect(card.getByText('Checking compatibility',{exact:true})).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>{const q=(window as any).identityQA,run=q.runs['expert-0'],tool=run.tools[0];tool.status='completed';tool.nativeActivity[0].status='completed';tool.nativeLifecycle.push({status:'completed',at:'2026-11-14T01:01:00Z'});q.update(run.id,{status:'completed'});});
 await expect(trigger).toContainText('已完成');if(await trigger.getAttribute('aria-expanded')==='false')await trigger.click();
 await expect(card.getByRole('list',{name:'执行记录'})).toContainText('开始工作');await expect(card.getByRole('list',{name:'执行记录'})).toContainText('已完成');await expect(card.getByRole('button',{name:'停止分析',exact:true})).toHaveCount(0);
});
