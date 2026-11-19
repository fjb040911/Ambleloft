import {test,expect} from '@playwright/test';
const url='/tests/manual/project-space-qa.html?view=store&discovery-demo=1';
for(const c of [{name:'desktop-zh',width:1280,en:false,dark:false},{name:'narrow-en-dark',width:390,en:true,dark:true},{name:'desktop-en-dark',width:1280,en:true,dark:true},{name:'narrow-zh',width:390,en:false,dark:false}])test(`role discovery ${c.name}`,async({page})=>{
 await page.setViewportSize({width:c.width,height:950});await page.goto(url+`&lang=${c.en?'en':'zh'}&theme=${c.dark?'dark':'light'}`);
 const cards=page.locator('.wf-role-card'),search=page.getByRole('searchbox',{name:c.en?'Search experts, capabilities or goals':'搜索专家、能力或工作目标'});
 await expect(cards).toHaveCount(10);await search.fill('ＰＭ');await expect(cards).toHaveCount(1);
 const detail=cards.getByRole('button',{name:c.en?/^View details:/:/^查看详情：/});await detail.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(detail).toBeFocused();await expect(search).toHaveValue('ＰＭ');
 await page.getByRole('button',{name:c.en?'Clear filters':'清除筛选',exact:true}).click();
 const categories=page.getByRole('group',{name:c.en?'Filter work categories':'筛选工作分类'});
 await categories.getByRole('button',{name:c.en?'Engineering':'研发工程',exact:true}).click();await expect(cards).toHaveCount(5);
 await cards.filter({has:page.getByRole('button',{name:c.en?'View role: Software Architect':'查看角色：架构师',exact:true})}).getByRole('button',{name:c.en?'API design':'接口设计',exact:true}).click();await expect(cards).toHaveCount(2);
 await search.fill('not-an-expert-123');await expect(cards).toHaveCount(0);await expect(page.getByText(c.en?'No matching roles':'没有匹配的角色',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:c.en?'Clear filters':'清除筛选',exact:true}).first().click();await expect(cards).toHaveCount(10);
 await page.getByRole('button',{name:c.en?'Refresh role library':'刷新角色库'}).click();await expect(cards).toHaveCount(10);
 await categories.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(await categories.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath(`role-discovery-${c.name}.png`)});
});
test('personal discovery edits survive steps and do not restore a removed skill',async({page})=>{
 await page.goto(url);await page.getByRole('button',{name:'查看详情：产品经理',exact:true}).click();await page.getByRole('button',{name:'调整后添加'}).click();
 await page.getByText('分类与搜索（可选）',{exact:true}).click();
 await page.getByLabel('中文搜索关键词',{exact:true}).fill('芯片规划, 用户自定');await page.getByLabel('能力标签',{exact:true}).fill('自定能力');
 await page.getByRole('button',{name:'配置技能',exact:true}).click();await page.getByRole('button',{name:'移除声明：需求研究',exact:true}).click();
 await page.getByRole('button',{name:'定义角色',exact:true}).click();await page.getByText('分类与搜索（可选）',{exact:true}).click();await expect(page.getByLabel('中文搜索关键词',{exact:true})).toHaveValue('芯片规划, 用户自定');
 await page.getByRole('button',{name:'确认配置',exact:true}).click();await expect(page.getByText('未声明额外技能，可以先按角色职责开始工作。',{exact:true})).toBeVisible();
});
test('offline refresh keeps filters and verified metadata; long content fits narrow cards',async({page})=>{
 await page.setViewportSize({width:390,height:950});await page.goto(url+'&theme=dark');
 await page.evaluate(()=>{const api=(window as any).desktop.workforce,load=api.roles;api.roles=async()=>{const catalog=await load();catalog.items[0].discovery.tags[0].title['zh-CN']='复杂业务领域的长能力标签'.repeat(5);return {...catalog,stale:true,error:'offline'};};});
 await page.getByRole('searchbox',{name:'搜索专家、能力或工作目标'}).fill('PM');await page.getByRole('button',{name:'刷新角色库'}).click();
 await expect(page.locator('.wf-role-card')).toHaveCount(1);await expect(page.getByRole('searchbox')).toHaveValue('PM');await expect(page.getByRole('alert').filter({hasText:'角色库暂时无法刷新。'})).toBeVisible();
 expect(await page.locator('.wf-role-card').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.locator('.wf-role-card').scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('role-discovery-offline-long.png')});
});
