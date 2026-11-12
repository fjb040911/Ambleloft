import {test,expect,type Page} from '@playwright/test';
async function enter(page:Page,theme='light'){
 await page.goto('/tests/manual/project-space-qa.html?theme='+theme);
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'讨论',exact:true}).click();
}
async function longDiscussion(page:Page,extraTopics=0){
 await page.evaluate(extraTopics=>{const qa=(window as any).spaceQA,request=qa.snapshot.requests.find((r:any)=>r.id==='discussion');request.participants[0].output='侧栏吸顶回归验证。\n\n'.repeat(120);
  for(let i=0;i<extraTopics;i++)qa.snapshot.requests.push({...structuredClone(request),id:'sidebar-topic-'+i,prompt:'测试话题 '+i,participants:[]});qa.emit();
 },extraTopics);
 await expect(page.getByText('侧栏吸顶回归验证。',{exact:true}).first()).toBeVisible();
 await expect.poll(()=>page.locator('.qa-scroll').evaluate(el=>el.scrollHeight)).toBeGreaterThan(2000);
}
for(const theme of ['light','dark'])test(`whole topic navigator stays below pinned tabs during long discussion in ${theme}`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});await enter(page,theme);await longDiscussion(page);
 const scroller=page.locator('.qa-scroll'),navigation=page.locator('.wf-space-navigation'),browser=page.getByRole('region',{name:'话题与相关内容'}),search=browser.getByRole('textbox',{name:'搜索话题'});
 await scroller.evaluate(el=>el.scrollTop=0);expect((await browser.boundingBox())!.y).toBeGreaterThan((await navigation.boundingBox())!.y+(await navigation.boundingBox())!.height);
 for(const top of [350,900,1800]){
  await scroller.evaluate((el,top)=>el.scrollTop=top,top);
  await expect.poll(async()=>{const nav=(await navigation.boundingBox())!,box=(await browser.boundingBox())!;return Math.abs(box.y-nav.y-nav.height);}).toBeLessThan(2);
  await expect(search).toBeInViewport();await expect(browser.getByRole('button',{name:'明确发布目标',exact:true})).toBeInViewport();
 }
 await search.fill('没有匹配的话题');await expect(browser.getByText('没有匹配的话题',{exact:true})).toBeInViewport();await search.fill('');
 await page.getByRole('button',{name:'收起讨论侧栏',exact:true}).click();await expect(browser).toBeHidden();
 await page.getByRole('button',{name:'展开讨论侧栏',exact:true}).click();await expect(search).toBeInViewport();
 await page.screenshot({path:`/tmp/discussion-sidebar-sticky-fixed-${theme}.png`});
});
test('long topic list scrolls inside the pinned sidebar without moving the discussion',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await enter(page);await longDiscussion(page,40);
 const scroller=page.locator('.qa-scroll'),browser=page.getByRole('region',{name:'话题与相关内容'}),list=browser.locator('.wf-topic-scroll');
 await scroller.evaluate(el=>el.scrollTop=900);
 await expect.poll(async()=>{const b=(await browser.boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(720);
 const before=await scroller.evaluate(el=>el.scrollTop);await list.hover();await page.mouse.wheel(0,5000);
 await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 expect(await scroller.evaluate(el=>el.scrollTop)).toBe(before);
 await expect(browser.getByRole('textbox',{name:'搜索话题'})).toBeInViewport();await expect(browser.getByRole('button',{name:'测试话题 39',exact:true})).toBeInViewport();
 await page.setViewportSize({width:1280,height:560});await expect.poll(async()=>{const b=(await browser.boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(560);
});
for(const theme of ['light','dark'])test(`discussion sidebar resizes, collapses and remembers width in ${theme}`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});await enter(page,theme);
 const sidebar=page.getByRole('complementary',{name:'讨论上下文'}),main=page.getByRole('region',{name:'讨论对话'}),input=page.getByLabel('这次想推进什么？');
 await input.fill('保留未发送内容');await page.locator('.qa-scroll').evaluate(el=>{el.scrollTop=0;});
 const separator=page.getByRole('separator',{name:'调整讨论侧栏宽度'});
 const initial=(await sidebar.boundingBox())!.width,handle=(await separator.boundingBox())!;
 await page.mouse.move(handle.x+handle.width/2,Math.min(handle.y+100,500));await page.mouse.down();await page.mouse.move(handle.x-100,Math.min(handle.y+100,500),{steps:8});await page.mouse.up();
 await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeGreaterThan(initial+70);
 const resized=(await sidebar.boundingBox())!.width,before=(await main.boundingBox())!.width;
 await page.getByRole('button',{name:'收起讨论侧栏',exact:true}).click();await expect(sidebar).toBeHidden();await expect(separator).toBeHidden();
 expect((await main.boundingBox())!.width).toBeGreaterThan(before+resized-5);await expect(input).toHaveValue('保留未发送内容');
 await page.getByRole('button',{name:'展开讨论侧栏',exact:true}).click();await expect(sidebar).toBeVisible();
 await expect(sidebar.getByRole('list',{name:'话题列表',exact:true})).toBeVisible();
 await expect.poll(async()=>Math.abs((await sidebar.boundingBox())!.width-resized)).toBeLessThan(1);
 await separator.focus();await page.keyboard.press('ArrowLeft');
 await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeGreaterThan(resized+5);
 const keyboardWidth=(await sidebar.boundingBox())!.width;
 await page.screenshot({path:`/tmp/discussion-sidebar-${theme}.png`});
 await page.getByRole('button',{name:'收起讨论侧栏',exact:true}).click();await page.reload();
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await expect(page.getByRole('button',{name:'展开讨论侧栏',exact:true})).toBeVisible();await expect(sidebar).toBeHidden();await expect(input).toHaveValue('保留未发送内容');
 await page.getByRole('button',{name:'展开讨论侧栏',exact:true}).click();await expect.poll(async()=>Math.abs((await sidebar.boundingBox())!.width-keyboardWidth)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('narrow context remains optional and does not overwrite desktop preferences',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('workforce.discussion-sidebar.v1',JSON.stringify({collapsed:true,width:350}));});
 await page.setViewportSize({width:390,height:850});await enter(page);
 const sidebar=page.getByRole('complementary',{name:'讨论上下文'}),input=page.getByLabel('这次想推进什么？');
 await expect(page.locator('.wf-context-desktop-toggle')).toHaveCount(0);await input.fill('窄屏草稿');await expect(sidebar).toBeHidden();await expect(page.getByRole('separator',{name:'调整讨论侧栏宽度'})).toHaveCount(0);
 await page.getByRole('button',{name:'查看讨论与相关内容'}).click();await expect(sidebar).toBeVisible();
 await page.getByRole('button',{name:'收起讨论上下文'}).click();await expect(sidebar).toBeHidden();
 await page.setViewportSize({width:1280,height:850});await expect(page.getByRole('button',{name:'展开讨论侧栏',exact:true})).toBeVisible();await expect(input).toHaveValue('窄屏草稿');
 await page.getByRole('button',{name:'展开讨论侧栏',exact:true}).click();await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeCloseTo(350,0);
 await page.setViewportSize({width:390,height:850});await expect(sidebar).toBeHidden();await expect(input).toHaveValue('窄屏草稿');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

for(const theme of ['light','dark'])test(`drag-collapse can reopen from the sticky tabs in ${theme}`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});await enter(page,theme);
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].output='讨论内容与验收标准。\n\n'.repeat(120);qa.emit();});
 const navigation=page.locator('.wf-space-navigation'),sidebar=page.getByRole('complementary',{name:'讨论上下文'}),scroller=page.locator('.qa-scroll');
 const close=page.getByRole('button',{name:'收起讨论侧栏',exact:true}),open=page.getByRole('button',{name:'展开讨论侧栏',exact:true});
 await expect(navigation.getByRole('button',{name:'收起讨论侧栏',exact:true})).toHaveCount(1);
 await expect(page.locator('.wf-discussion-header .wf-context-desktop-toggle')).toHaveCount(0);
 await page.getByLabel('这次想推进什么？').fill('未发送的讨论内容');
 const initialWidth=(await sidebar.boundingBox())!.width;
 await page.getByLabel('这次想推进什么？').evaluate(el=>el.blur());
 await expect.poll(()=>scroller.evaluate(el=>el.scrollHeight)).toBeGreaterThan(2000);
 await scroller.evaluate(el=>{el.scrollTop=650;});await expect.poll(async()=>(await navigation.boundingBox())!.y).toBeLessThan(2);
 await expect(close).toBeInViewport();expect((await page.locator('.wf-discussion-header').boundingBox())!.y).toBeLessThan(0);
 const handle=(await page.getByRole('separator',{name:'调整讨论侧栏宽度'}).boundingBox())!,layout=(await page.locator('.wf-discussion-layout').boundingBox())!;
 await page.mouse.move(handle.x+handle.width/2,200);await page.mouse.down();await page.mouse.move(layout.x+layout.width-40,200,{steps:10});await page.mouse.up();
 await expect(sidebar).toBeHidden();await expect(open).toBeInViewport();await expect(open).toHaveText('展开侧栏');
 const top=await scroller.evaluate(el=>el.scrollTop),button=(await open.boundingBox())!,nav=(await navigation.boundingBox())!;
 expect(button.x+button.width).toBeCloseTo(nav.x+nav.width,0);expect(button.y).toBeGreaterThanOrEqual(nav.y);expect(button.y+button.height).toBeLessThanOrEqual(nav.y+nav.height);
 await page.screenshot({path:`/tmp/discussion-sticky-expand-${theme}.png`});
 // Click its visible position so the driver does not auto-scroll the sticky button.
 const openBounds=(await open.boundingBox())!;await page.mouse.click(openBounds.x+openBounds.width/2,openBounds.y+openBounds.height/2);await expect(sidebar).toBeVisible();await expect.poll(async()=>Math.abs((await sidebar.boundingBox())!.width-initialWidth)).toBeLessThan(1);
 await expect(sidebar.getByRole('list',{name:'话题列表',exact:true})).toBeVisible();await expect(page.getByLabel('这次想推进什么？')).toHaveValue('未发送的讨论内容');
 expect(Math.abs(await scroller.evaluate(el=>el.scrollTop)-top)).toBeLessThan(2);
 await page.getByRole('tab',{name:'文档与产物',exact:true}).click();await expect(page.locator('.wf-context-desktop-toggle')).toHaveCount(0);
 await page.getByRole('tab',{name:'讨论',exact:true}).click();await expect(close).toBeInViewport();
});
