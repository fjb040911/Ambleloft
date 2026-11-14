import {test,expect,type Page} from '@playwright/test';
async function enter(page:Page,theme='light'){
 await page.goto('/tests/manual/project-space-qa.html?theme='+theme);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.acceptancePolicy={mode:'auto',maxRepairs:2,maxRetries:2};p.packages[0].definition.acceptanceChecks=[{id:'links',kind:'metric',requirement:'所有发布链接返回 HTTP 200',evidence:'/failed',target:'check-links --json',expected:'0',operator:'eq'}];qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
}
for(const [width,theme] of [[1280,'light'],[390,'dark']] as const)test(`automatic review shows evidence and preserves fixed actions at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await enter(page,theme);
 await expect(page.getByText('默认自动验收 · 最多修复 2 次 · 证据不足转人工',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].attempts[0].automaticReview={state:'checking'};qa.emit();});
 await expect(page.locator('.wf-graph-node[data-package-id="copy"]')).toContainText('自动验收中');
 await page.locator('.wf-graph-node[data-package-id="copy"]').click();const detail=page.getByRole('region',{name:'任务详情与验收'});
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].attempts[0].automaticReview={state:'done',outcome:'indeterminate',results:[{id:'links',outcome:'indeterminate',reason:'缺少完整的链接测试记录',evidence:[]}]};qa.emit();});
 const summary=detail.getByRole('region',{name:'验收规则与结果'});await summary.scrollIntoViewIfNeeded();await expect(summary).toContainText('证据不足');await expect(summary).toContainText('所有发布链接返回 HTTP 200');
 await expect(detail.getByRole('button',{name:'验收通过',exact:true})).toBeEnabled();
 expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 const button=(await detail.getByRole('button',{name:'验收通过',exact:true}).boundingBox())!;expect(button.y+button.height).toBeLessThanOrEqual(900);
 await page.screenshot({path:`/tmp/acceptance-review-${width}-${theme}.png`});
});
test('rerun confirmation lists affected descendants before sending a restart',async({page})=>{
 await enter(page);await page.locator('.wf-graph-node[data-package-id="copy"]').click();await page.getByRole('button',{name:'从此处重跑',exact:true}).click();
 const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('发布文案、发布包整理');await expect(dialog).not.toContainText('测试环境验证');
 expect(await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'))).toHaveLength(0);
 await dialog.getByRole('button',{name:'重新执行受影响节点'}).click();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>c.action==='control'));
 expect(calls).toHaveLength(1);expect(calls[0].input).toMatchObject({action:'restart',packageId:'copy',confirmed:true,resumePlan:true});
});
test('plan default and node overrides remain editable without changing the live plan',async({page})=>{
 await enter(page);await page.locator('.wf-graph-node[data-package-id="copy"]').click();await page.getByRole('button',{name:'修订任务',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'修订任务与流程'});
 await expect(editor.getByRole('combobox',{name:'节点验收方式',exact:true}).first()).toHaveValue('inherit');
 await editor.getByRole('combobox',{name:'节点验收方式',exact:true}).first().selectOption('complete');
 await expect(editor).toContainText('不代表交付质量已达标');
 await editor.getByText('自动验收指标 · 1',{exact:true}).click();await expect(editor.getByLabel('指标路径（JSON Pointer）')).toHaveValue('/failed');
 await editor.getByLabel('预期值',{exact:true}).fill('1');
 expect(await page.evaluate(()=>(window as any).spaceQA.snapshot.plans[0].packages[0].definition.acceptanceChecks[0].expected)).toBe('0');
 await editor.getByRole('button',{name:'保留草稿并关闭'}).click();await expect(editor).toBeHidden();
});
