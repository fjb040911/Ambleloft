import {test,expect} from '@playwright/test';
test('search opens from sidebar, filters content and pages through results',async({page})=>{
 await page.addInitScript(()=>{
  const runs=Array.from({length:25},(_,i)=>({id:'r'+i,title:'任务 '+i,status:'completed',createdAt:new Date(Date.UTC(2026,8,1+i)).toISOString(),model:'fixture',cwd:'/fixture',messages:[{id:'u'+i,role:'user',text:'历史内容关键词 产品规划'}],tools:[],approvals:[]}));
  (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[{id:'p',name:'产品空间',createdAt:'2026-01-01'}],theme:'light'}),listRuns:async()=>runs,onRun:()=>()=>{},onCommand:()=>()=>{},extensions:{list:async()=>({installed:[{manifest:{id:'ext',name:'产品扩展',description:'工具',contributes:{}},enabled:true}],capabilities:{}})}};
 });
 await page.goto('/');const trigger=page.getByRole('button',{name:'搜索工作台',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'搜索工作台'});const search=dialog.getByRole('combobox');await expect(search).toBeFocused();
 await expect(dialog.locator('.search-result:not(.search-action)')).toHaveCount(20);await expect(dialog.locator('.search-result:not(.search-action)').first()).toContainText('任务 24');
 await dialog.getByRole('option',{name:'加载更多'}).click();await expect(dialog.locator('.search-result:not(.search-action)')).toHaveCount(25);
 await search.fill('历史 关键词');await expect(dialog.locator('.search-result:not(.search-action)')).toHaveCount(20);
 await search.fill('不存在的关键词');await expect(dialog).toContainText('没有找到相关结果');
 await dialog.getByRole('tab',{name:'项目',exact:true}).click();
 await search.fill('产品空间');await expect(dialog.locator('.search-result:not(.search-action)')).toHaveCount(1);
 await dialog.getByRole('tab',{name:'扩展',exact:true}).click();
 await search.fill('产品扩展');await expect(dialog.locator('.search-result')).toContainText('产品扩展');
 await dialog.getByRole('tab',{name:'任务',exact:true}).click();
 await search.fill('历史');await expect(dialog.locator('.search-result:not(.search-action)')).toHaveCount(20);
 const list=dialog.locator('[cmdk-list]');
 expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 const inputY=(await search.boundingBox())!.y;
 await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 expect((await search.boundingBox())!.y).toBe(inputY);
 await list.evaluate(el=>{el.scrollTop=0;});
 await expect(dialog.getByRole('tab')).toHaveCount(5);
 expect((await dialog.boundingBox())!.width).toBeGreaterThan(700);
 await search.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await expect(search).toBeFocused();await expect(dialog.locator('.search-result:not(.search-action)').first()).toHaveAttribute('aria-selected','true');
 const rows=dialog.locator('.search-result:not(.search-action)');
 expect(await rows.nth(0).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await rows.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor));
 await page.screenshot({path:'test-results/workspace-search.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await expect(dialog).toHaveCSS('background-color','rgb(36, 39, 46)');
 await page.screenshot({path:'test-results/workspace-search-dark.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect(page.locator('.tree-task.selected')).toContainText('任务 24');
 await trigger.click();
 const actionSearch=dialog.getByRole('combobox');

 await dialog.getByRole('tab',{name:'快捷操作',exact:true}).click();
 await expect(dialog.locator('.search-action')).toHaveCount(4);
 await actionSearch.fill('创建项目');
 await expect(dialog.locator('.search-action')).toHaveCount(1);
 await actionSearch.press('Enter');
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'创建项目',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await trigger.click();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});

test('server content matches remain visible and quick actions execute',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).__queries=[];
  (window as any).desktop={
   getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),
   readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},
   searchWorkspace:async(input:any)=>{
    (window as any).__queries.push(input);
    if(input.query==='报错')throw new Error('搜索暂时不可用');
    return {items:[{id:'remote',kind:'task',title:'服务端匹配结果',snippet:'仅历史消息匹配，摘要中没有关键词'}],total:1,next:null};
   },
  };
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索工作台',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'搜索工作台'});
 const input=dialog.getByRole('combobox');
 await input.fill('隐藏关键词');
 await expect(dialog.getByRole('option',{name:/服务端匹配结果/})).toBeVisible();
 await input.fill('报错');await expect(dialog.getByRole('alert')).toContainText('搜索暂时不可用');
 await input.fill('');await expect(dialog.getByRole('alert')).toHaveCount(0);
 await dialog.getByRole('tab',{name:'快捷操作',exact:true}).click();
 await expect(dialog.locator('.search-action')).toHaveCount(4);


 await input.fill('settings');
 await expect(dialog.locator('.search-action')).toHaveCount(1);

 await input.press('Enter');
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('.settings-workspace')).toBeVisible();
});

test('settings shares global search and messages actions at the same sidebar position',async({page})=>{
 await page.goto('/');
 const searchButton=page.getByRole('button',{name:'搜索工作台',exact:true});
 const homeBox=await searchButton.boundingBox();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const settings=page.getByLabel('设置工作区');
 const settingsSearch=settings.getByRole('button',{name:'搜索工作台',exact:true});
 const box=await settingsSearch.boundingBox();
 expect(box!.y).toBe(homeBox!.y);expect(box!.x).toBe(homeBox!.x);
 await settingsSearch.click();
 const dialog=page.getByRole('dialog',{name:'搜索工作台'});
 await expect(dialog.getByRole('combobox')).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);await expect(settings).toBeVisible();
 await expect(settingsSearch).toBeFocused();
 await settings.getByRole('button',{name:'消息中心',exact:true}).click();
 await expect(settings).toHaveCount(0);
 await expect(page.getByRole('button',{name:'消息中心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('categorized search pages tasks separately and opens a matching skill',async({page})=>{
 await page.addInitScript(()=>{
 const skill={id:'s',name:'产品分析技能',description:'需求分析',updatedAt:'2026-09-01',version:1,enabled:true,body:'技能说明',files:[]};
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[{id:'p',name:'产品项目',createdAt:'2026-01-01'}],theme:'light'}),listRuns:async()=>Array.from({length:25},(_,i)=>({id:'r'+i,title:'产品任务 '+i,status:'completed',createdAt:new Date(Date.UTC(2026,8,i+1)).toISOString(),messages:[{id:'u',role:'user',text:'产品内容'}],tools:[],approvals:[]})),onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>[skill],detail:async()=>skill},extensions:{list:async()=>({installed:[],capabilities:{}})}};
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索工作台',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'搜索工作台'});
 await expect(dialog.getByRole('tab')).toHaveText(['任务','项目','扩展','技能','快捷操作']);
 await dialog.getByRole('tab',{name:'任务',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 await expect(dialog.getByRole('tab',{name:'项目',exact:true})).toBeFocused();
 await expect(dialog.getByRole('tab',{name:'项目',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(dialog.locator('.search-result')).toContainText('产品项目');
 await page.keyboard.press('ArrowLeft');
 await expect(dialog.getByRole('tab',{name:'任务',exact:true})).toBeFocused();
 await expect(dialog.getByRole('tab',{name:'任务',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(dialog.locator('.search-result')).toHaveCount(20);
 await dialog.getByRole('option',{name:'加载更多'}).click();await expect(dialog.locator('.search-result')).toHaveCount(25);
 await dialog.getByRole('combobox').fill('产品');
 await dialog.getByRole('tab',{name:'项目',exact:true}).click();await expect(dialog.locator('.search-result')).toHaveCount(1);await expect(dialog.locator('.search-result')).toContainText('产品项目');
 await dialog.getByRole('tab',{name:'扩展',exact:true}).click();await expect(dialog).toContainText('没有找到相关结果');
 await dialog.getByRole('tab',{name:'快捷操作',exact:true}).click();await dialog.getByRole('combobox').fill('');await expect(dialog.locator('.search-action')).toHaveCount(4);
 await dialog.getByRole('tab',{name:'技能',exact:true}).click();await expect(dialog.locator('.search-result')).toContainText('产品分析技能');
 expect((await dialog.boundingBox())!.width).toBeGreaterThan(700);
 await page.screenshot({path:'test-results/categorized-search.png'});
 await dialog.getByRole('option',{name:/产品分析技能/}).click();
 await expect(page.getByRole('dialog',{name:'产品分析技能',exact:true})).toBeVisible();
});

test('skills use the installed list even when global search returns no skills; empty and error are distinct',async({page})=>{
 await page.addInitScript(()=>{
 (window as any).__skillError=false;
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},searchWorkspace:async()=>({items:[],total:0,next:null}),skills:{list:async()=>{if((window as any).__skillError)throw new Error('技能接口暂时不可用');return Array.from({length:25},(_,i)=>({id:'s'+i,name:'已安装技能 '+i,description:'测试说明',updatedAt:'2026-09-30',enabled:true}));}}};
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索工作台',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'搜索工作台'});
 await dialog.getByRole('tab',{name:'技能',exact:true}).click();
 await expect(dialog.locator('[data-slot=command-item].search-result')).toHaveCount(20);
 await dialog.getByRole('option',{name:'加载更多'}).click();await expect(dialog.locator('.search-result')).toHaveCount(25);
 await dialog.getByRole('combobox').fill('没有这个技能');
 await expect(dialog.locator('[data-slot=empty-title]')).toHaveText('没有找到相关结果');
 await expect(dialog.getByRole('alert')).toHaveCount(0);
 await page.screenshot({path:'test-results/search-empty.png'});
 await dialog.getByRole('button',{name:'清除搜索'}).click();await expect(dialog.locator('.search-result')).toHaveCount(20);
 await page.evaluate(()=>(window as any).__skillError=true);
 await dialog.getByRole('combobox').fill('技能');await expect(dialog.getByRole('alert')).toContainText('技能接口暂时不可用');
 await expect(dialog.locator('[data-slot=empty]')).toHaveCount(0);
 await page.evaluate(()=>(window as any).__skillError=false);
 await dialog.getByRole('button',{name:'重试'}).click();await expect(dialog.locator('.search-result')).toHaveCount(20);
});

test('skill preview browses its bundle and keeps editing separate',async({page})=>{
 await page.addInitScript(()=>{
 const skill={id:'s',name:'预览技能',description:'查看技能目录',version:1,enabled:true,updatedAt:'2026-09-30',body:'# 技能指南',files:['SKILL.md','references/guide.md','scripts/run.py','assets/image.png','data.bin']};
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>[skill],detail:async()=>skill,readFile:async({file}:any)=>({path:file,size:12,...(file==='SKILL.md'?{kind:'markdown',text:'# 技能指南\n\n正文内容'}:file.endsWith('.md')?{kind:'markdown',text:'# 参考文档'}:file.endsWith('.py')?{kind:'text',text:'print("hello")'}:{kind:'unsupported',reason:'此文件格式暂不支持预览'})})}};
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索工作台',exact:true}).click();const search=page.getByRole('dialog',{name:'搜索工作台'});await search.getByRole('tab',{name:'技能',exact:true}).click();await search.getByRole('option',{name:/预览技能/}).click();
 const dialog=page.getByRole('dialog',{name:'预览技能',exact:true});
 await expect(dialog.getByRole('heading',{name:'技能指南'})).toBeVisible();
 await expect(dialog.getByLabel('技能指令')).toHaveCount(0);
 const tree=dialog.getByRole('navigation',{name:'技能文件'});
 await tree.getByRole('button',{name:'guide.md',exact:true}).click();await expect(dialog.getByRole('heading',{name:'参考文档'})).toBeVisible();
 await tree.getByRole('button',{name:'run.py',exact:true}).click();await expect(dialog.getByLabel('只读文件代码')).toContainText('print("hello")');
 await tree.getByRole('button',{name:'data.bin',exact:true}).click();await expect(dialog).toContainText('暂不支持预览');
 await tree.getByRole('button',{name:'SKILL.md',exact:true}).click();await dialog.getByRole('tab',{name:'源码',exact:true}).click();await expect(dialog.getByLabel('只读文件代码')).toContainText('# 技能指南');
 await expect(dialog.getByRole('tab',{name:'源码',exact:true})).toHaveAttribute('aria-selected','true');
 const handle=dialog.getByRole('separator');const before=(await tree.boundingBox())!.width;const rect=(await handle.boundingBox())!;
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x-90,rect.y+rect.height/2,{steps:10});await page.mouse.up();
 await expect.poll(async()=>(await tree.boundingBox())!.width).toBeGreaterThan(before+40);
 await page.screenshot({path:'test-results/skill-preview.png'});
 await dialog.getByRole('button',{name:'编辑',exact:true}).click();await expect(page.getByLabel('技能指令')).toBeVisible();
});

test('skill preview tolerates a stale main process without hiding real read errors',async({page})=>{
 await page.addInitScript(()=>{
 const skill={id:'s',name:'兼容技能',description:'旧进程预览',version:1,enabled:true,updatedAt:'2026-09-30',body:'# 缓存技能正文',files:['SKILL.md','guide.md']};
 (window as any).__readError="Error invoking remote method 'skills:readFile': Error: No handler registered for 'skills:readFile'";
 (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>[skill],detail:async()=>skill,readFile:async()=>{throw new Error((window as any).__readError);}}};
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索工作台',exact:true}).click();const search=page.getByRole('dialog',{name:'搜索工作台'});await search.getByRole('tab',{name:'技能',exact:true}).click();await search.getByRole('option',{name:/兼容技能/}).click();
 const dialog=page.getByRole('dialog',{name:'兼容技能',exact:true});
 await expect(dialog.getByRole('heading',{name:'缓存技能正文'})).toBeVisible();
 await dialog.getByRole('button',{name:'guide.md',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('请重启应用以启用文件预览');
 await expect(dialog).not.toContainText('No handler registered');
 await page.evaluate(()=>(window as any).__readError='文件读取失败');
 await dialog.getByRole('button',{name:'SKILL.md',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('文件读取失败');
});
