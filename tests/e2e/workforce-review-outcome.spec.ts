import {test,expect,type Page} from '@playwright/test';
async function open(page:Page,dark=false){
 await page.goto('/tests/manual/project-space-qa.html'+(dark?'?theme=dark':''));
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'任务',exact:true}).click();
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();
}
for(const width of [1280,390])test(`acceptance shows live downstream scheduling without leaving task ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await open(page,width===390);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];const template=p.packages[1];template.reason='等待上游工作包验收';p.packages.push({...structuredClone(template),id:'blocked',definition:{...template.definition,id:'blocked',title:'独立测试与部署验证',dependencies:['copy','testing']}});qa.emit();});
 const detail=page.locator('.wf-task-detail');await detail.evaluate(el=>el.scrollTop=el.scrollHeight);
 await page.getByRole('button',{name:'验收通过',exact:true}).click();
 const result=page.getByRole('region',{name:'验收结果与后续任务'});
 await expect(result).toBeVisible();await expect(result).toContainText('尚无后续任务开始执行');
 await expect(page.locator('[data-review-result]')).toBeFocused();
 await expect.poll(()=>detail.evaluate(el=>el.scrollTop)).toBe(0);
 await expect(result.locator('[data-successor-id="bundle"]')).toContainText('前置验收已满足');
 await expect(result.locator('[data-successor-id="bundle"]')).not.toContainText('等待上游工作包验收');
 await expect(result.locator('[data-successor-id="blocked"]')).toContainText('等待前置任务验收：测试环境验证');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].status='starting';qa.emit();});
 await expect(result).toContainText('0 项执行中，1 项准备中');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].status='running';qa.emit();});
 await expect(result).toContainText('1 项执行中，0 项准备中');
 await expect(result.locator('[data-successor-id="bundle"]')).toContainText('文案员工');
 expect(await result.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/review-outcome-${width}.png`});
 await detail.evaluate(el=>el.scrollTop=100);const position=await detail.evaluate(el=>el.scrollTop);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].status='waiting';qa.emit();});
 await expect(result.locator('[data-successor-id="bundle"]')).toContainText('等待输入或授权');
 expect(await detail.evaluate(el=>el.scrollTop)).toBe(position);
 await result.locator('[data-successor-id="bundle"]').getByRole('button',{name:'查看任务'}).click();
 await expect(page.locator('.wf-task-review h2')).toHaveText('发布包整理');
});
test('paused, resource-blocked, failed, and no-successor outcomes are explicit',async({page})=>{
 await open(page);await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].status='paused';qa.emit();});
 await page.getByRole('button',{name:'验收通过',exact:true}).click();
 const result=page.getByRole('region',{name:'验收结果与后续任务'});
 await expect(result).toContainText('计划未运行，不会启动新的任务');
 await expect(result.locator('[data-successor-id="bundle"]')).toContainText('尚未调度');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.status='running';p.packages[1].reason='等待同一工作目录中的任务结束';qa.emit();});
 await expect(result).toContainText('等待同一工作目录中的任务结束');
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0].packages[1];p.status='failed';p.reason='远端连接失败';qa.emit();});
 await expect(result.locator('[data-successor-id="bundle"]')).toContainText('执行失败');await expect(result).toContainText('远端连接失败');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].definition.dependencies=[];qa.emit();});
 await expect(result).toContainText('没有直接依赖本任务的后续任务');
 await expect(result).not.toContainText('本计划已全部验收完成');
});
test('failed acceptance keeps review controls and does not announce success',async({page})=>{
 await open(page);await page.evaluate(()=>{window.desktop!.spaces!.reviewPlan=async()=>{throw Error('验收证据版本已变化');};});
 await page.getByRole('button',{name:'验收通过',exact:true}).click();
 await expect(page.locator('.wf-task-review')).toContainText('验收证据版本已变化');
 await expect(page.getByRole('region',{name:'验收结果与后续任务'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'验收通过',exact:true})).toBeEnabled();
});
