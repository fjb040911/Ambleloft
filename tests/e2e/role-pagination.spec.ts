import {test,expect} from '@playwright/test';
const url='/tests/manual/project-space-qa.html?view=store&pagination-demo=1';
test('role library loads 24 at a time, retries without losing cards and filters the whole catalog',async({page})=>{
 await page.goto(url);const library=page.getByRole('region',{name:'角色库'}),cards=library.locator('.wf-role-card');
 await expect(cards).toHaveCount(24);await expect(library.getByRole('status')).toHaveText('已显示 24 项，共 61 项');
 await page.evaluate(()=>{(window as any).__rolePageFailure='offline';});await library.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(library.getByRole('alert')).toContainText('加载下一页失败');await expect(cards).toHaveCount(24);
 await library.getByRole('button',{name:'重试',exact:true}).click();await expect(cards).toHaveCount(48);
 await library.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(cards).toHaveCount(61);await expect(library.locator('.store-load-more')).toHaveCount(0);
 await library.getByRole('searchbox').fill('Test role 60');await expect(cards).toHaveCount(1);await expect(cards).toContainText('测试角色 60');
 await cards.getByRole('button',{name:'查看详情：测试角色 60',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(library.getByRole('searchbox')).toHaveValue('Test role 60');
 await library.getByRole('button',{name:'清除筛选',exact:true}).click();await expect(cards).toHaveCount(24);
 await library.getByRole('group',{name:'筛选工作分类'}).getByRole('button',{name:'研发工程',exact:true}).click();await expect(library.getByRole('status')).toHaveText('已显示 24 项，共 30 项');
 await cards.filter({has:page.getByRole('button',{name:'查看角色：测试角色 1',exact:true})}).getByRole('button',{name:'接口设计',exact:true}).click();await expect(cards).toHaveCount(12);
 expect(await page.evaluate(()=>(window as any).__rolePages.every((input:any)=>input.page.limit===24))).toBe(true);
});
test('changed snapshots restart cleanly and slow role searches cannot replace newer results',async({page})=>{
 await page.goto(url);const cards=page.locator('.wf-role-card');await expect(cards).toHaveCount(24);
 await page.evaluate(()=>{(window as any).__rolePageFailure='STORE_PAGE_CHANGED';});await page.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(page.getByRole('alert')).toContainText('目录已更新');
 await page.getByRole('button',{name:'重新加载列表'}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(cards.first()).toContainText('测试角色 0');
 expect(await page.evaluate(()=>(window as any).__rolePages.some((input:any)=>input.refresh&&!input.page.cursor))).toBe(true);
 expect(await cards.locator('h3').allTextContents()).toEqual([...new Set(await cards.locator('h3').allTextContents())]);
 await page.getByRole('searchbox').fill('slow');await expect.poll(()=>page.evaluate(()=>!!(window as any).__finishRoleSearch)).toBe(true);
 await page.getByRole('searchbox').fill('Test role 60');await expect(cards).toHaveCount(1);
 await page.evaluate(()=>(window as any).__finishRoleSearch());await expect(cards).toContainText('测试角色 60');
});
test('English pagination stays readable in dark narrow layouts and retains loaded roles on refresh failure',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto(url+'&lang=en&theme=dark');const cards=page.locator('.wf-role-card');await expect(cards).toHaveCount(24);
 await page.locator('.store-load-more').scrollIntoViewIfNeeded();await expect(cards).toHaveCount(48);await expect(page.getByRole('status')).toHaveText('Showing 48 of 61 items');
 await page.evaluate(()=>{(window as any).desktop.workforce.roles=async()=>{throw Error('offline');};});await page.getByRole('button',{name:'Refresh role library'}).click();await expect(page.getByRole('alert')).toContainText('could not be refreshed');await expect(cards).toHaveCount(48);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/role-pagination-dark-narrow.png'});
});

test('top tag filters include unloaded roles, retain selection when collapsed and compose with categories',async({page})=>{
 await page.goto(url);const cards=page.locator('.wf-role-card'),tags=page.getByRole('group',{name:'按标签筛选'});await expect(cards).toHaveCount(24);await expect(tags).toBeVisible();
 expect((await tags.boundingBox())!.y).toBeLessThan((await cards.first().boundingBox())!.y);
 await tags.getByRole('button',{name:'更多标签',exact:true}).click();await tags.getByRole('button',{name:'末页专属 1',exact:true}).click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('测试角色 60');
 await tags.getByRole('button',{name:'收起标签',exact:true}).click();await expect(tags.getByRole('button',{name:'末页专属 1',exact:true})).toHaveAttribute('aria-pressed','true');
 await tags.getByRole('button',{name:'末页专属 1',exact:true}).click();await expect(cards).toHaveCount(24);
 await page.getByRole('group',{name:'筛选工作分类'}).getByRole('button',{name:'研发工程',exact:true}).click();await expect(tags.getByRole('button',{name:/末页专属/})).toHaveCount(0);
 await page.screenshot({path:'/tmp/role-tag-filters-light.png'});
});
