import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,builtin=false){await page.addInitScript((builtin)=>{
 const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
 const skill={id:'skill-1',name:'meeting-summary',description:'整理会议纪要和待办',body:'Summarize the meeting.',enabled:true,version:1,path:'/skills/one/SKILL.md',files:['SKILL.md','references/format.md'],sourcePath:'/original/meeting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(builtin)Object.assign(skill,{builtIn:{key:'supplemental-input',version:1,digest:'test'},displayName:'补充信息'});let skills:any[]=[skill];let run:any;
 (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>skills,detail:async(id:string)=>skills.find(s=>s.id===id),import:async()=>{const item={...skill,id:'skill-2',name:'writing-review'};skills.push(item);return {skill:item};},update:async(input:any)=>{skills=skills.map(s=>s.id===input.id?{...s,...input,version:s.version+(input.body?1:0)}:s);return skills.find(s=>s.id===input.id);},remove:async(id:string)=>{skills=skills.filter(s=>s.id!==id);}},startRun:async(input:any)=>{if((window as any).__fail)throw new Error('发送失败');(window as any).__sent=input;const message={id:crypto.randomUUID(),role:'user',text:input.prompt||'执行所选技能',skills:(input.selectedSkillIds||[]).map((id:string)=>({...skills.find(s=>s.id===id)}))};run={id:'r',providerId:'p',title:'技能任务',model:'test',baseUrl:provider.baseUrl,cwd:'/tmp',createdAt:new Date().toISOString(),status:'completed',error:'',tools:[],approvals:[],messages:[...(run?.messages||[]),message,{id:crypto.randomUUID(),role:'assistant',text:'已完成'}]};return run;}};
 },builtin);await page.goto('/');}
async function picker(page:Page){await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'技能',exact:true}).click();}
test('skill tags are separate from text, survive failure and apply to only the submitted turn',async({page})=>{
 await setup(page);await picker(page);const item=page.getByRole('option',{name:/meeting-summary/});await item.click();await expect(item).toHaveAttribute('data-checked','true');await item.click();await expect(page.locator('.composer .skill-tag')).toHaveCount(0);await item.click();await page.keyboard.press('Escape');
 await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('');await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
 await page.locator('.composer .skill-tag button').first().click();await expect(page.getByRole('dialog',{name:'meeting-summary'})).toContainText('Summarize the meeting.');await page.getByRole('dialog',{name:'meeting-summary'}).getByRole('button',{name:'关闭',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await page.screenshot({path:'test-results/skills-composer.png'});
 await page.evaluate(()=>(window as any).__fail=true);await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
 await page.evaluate(()=>(window as any).__fail=false);await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(page.locator('.message.user .skill-tag')).toContainText('meeting-summary');await expect(page.locator('.composer .skill-tag')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds)).toEqual(['skill-1']);
 await page.getByRole('textbox',{name:'继续对话'}).fill('再简短一些');await page.getByRole('button',{name:'发送后续消息'}).click();expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds||[])).toEqual([]);
});
async function openSkill(page:Page){await setup(page);await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'技能与扩展',exact:true}).click();await page.getByRole('button',{name:/^管理 /}).first().click();return page.getByRole('dialog',{name:'meeting-summary',exact:true});}
test('skills edit in place, save to preview, disable and delete',async({page})=>{
 const dialog=await openSkill(page);await dialog.evaluate(el=>(window as any).__skillDialog=el);
 await dialog.getByRole('button',{name:'编辑',exact:true}).click();
 expect(await dialog.evaluate(el=>el===(window as any).__skillDialog)).toBe(true);
 await expect(dialog.getByRole('button',{name:'保存修改'})).toBeDisabled();
 await dialog.getByLabel('名称',{exact:true}).fill('会议助手');await dialog.getByLabel('技能指令',{exact:true}).fill('# Updated workflow');
 await dialog.getByRole('button',{name:'保存修改'}).click();
 const saved=page.getByRole('dialog',{name:'会议助手',exact:true});await expect(saved.getByRole('heading',{name:'Updated workflow'})).toBeVisible();await expect(saved).toContainText('v2');
 await expect(saved.getByRole('status')).toContainText('技能已保存');
 await saved.getByRole('button',{name:'停用',exact:true}).click();await expect(saved).toContainText('已停用');
 await saved.getByRole('button',{name:'删除技能'}).click();await page.getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.store-installed-row')).toHaveCount(0);
});

test('skill edit keeps undo across preview, guards dirty exit and supports save shortcut',async({page})=>{
 const dialog=await openSkill(page);await dialog.getByRole('button',{name:'编辑',exact:true}).click();
 const editor=dialog.getByLabel('技能指令',{exact:true});await editor.fill('Draft instructions');
 await dialog.getByRole('tab',{name:'预览',exact:true}).click();await expect(dialog.locator('.markdown')).toContainText('Draft instructions');
 await dialog.getByRole('tab',{name:'编辑',exact:true}).click();await expect(editor).toHaveText('Draft instructions');
 await editor.press('ControlOrMeta+z');await expect(editor).toContainText('Summarize the meeting.');
 await editor.fill('Saved with shortcut');await editor.press('ControlOrMeta+s');await expect(dialog.locator('.markdown')).toContainText('Saved with shortcut');
 await dialog.getByRole('button',{name:'编辑',exact:true}).click();await dialog.getByLabel('名称',{exact:true}).fill('未保存');
 await page.keyboard.press('Escape');const confirm=page.getByRole('dialog',{name:'放弃未保存的修改？'});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'继续编辑'}).click();await expect(dialog.getByLabel('名称',{exact:true})).toHaveValue('未保存');
 await dialog.getByRole('button',{name:'取消编辑'}).click();await page.getByRole('button',{name:'放弃修改'}).click();await expect(dialog.getByRole('button',{name:'编辑',exact:true})).toBeFocused();await expect(dialog.locator('.markdown')).toContainText('Saved with shortcut');
 await page.setViewportSize({width:760,height:600});await dialog.getByRole('button',{name:'编辑',exact:true}).click();await expect(editor).toBeVisible();
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:'test-results/skill-inline-editor.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'test-results/skill-inline-editor-dark.png'});
});

test('skill detail keeps pending saves visible and recovers after failure',async({page})=>{
 const dialog=await openSkill(page);await dialog.getByRole('button',{name:'编辑',exact:true}).click();
 await dialog.getByLabel('名称',{exact:true}).fill('未保存修改');
 await page.evaluate(()=>{(window as any).desktop.skills.update=()=>new Promise((resolve,reject)=>{(window as any).__rejectSave=reject;});});
 await dialog.getByRole('button',{name:'保存修改'}).click();await expect(dialog.getByRole('button',{name:'正在保存…'})).toBeDisabled();await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 await page.evaluate(()=>(window as any).__rejectSave(new Error('保存失败，请重试')));
 await expect(dialog.getByRole('alert')).toContainText('保存失败');await expect(dialog.getByLabel('名称',{exact:true})).toHaveValue('未保存修改');await expect(dialog.getByRole('button',{name:'保存修改'})).toBeEnabled();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改'}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:/^管理 /}).first()).toBeFocused();
});

test('built-in guidance is read-only but can be disabled and reenabled',async({page})=>{
 await setup(page,true);await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'技能与扩展',exact:true}).click();await page.getByRole('button',{name:/^管理 /}).first().click();
 const dialog=page.getByRole('dialog',{name:'补充信息',exact:true});await expect(dialog).toContainText('内置 · 只读');await expect(dialog.getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'删除技能',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'停用',exact:true}).click();await expect(dialog).toContainText('已停用');await dialog.getByRole('button',{name:'启用',exact:true}).click();await expect(dialog).toContainText('已启用');
});


test('$ selects a skill at the caret without sending, including in follow-up',async({page})=>{
 await setup(page,true);const input=page.getByRole('textbox',{name:'任务内容',exact:true});
 await input.fill('请整理 $补充 后面的文字');await input.press('Home');for(let i=0;i<7;i++)await input.press('ArrowRight');
 const item=page.getByRole('option',{name:/补充信息/});await expect(item).toBeVisible();await expect(input).toBeFocused();
 const activeId=await input.getAttribute('aria-activedescendant');expect(activeId).toBeTruthy();expect(await page.locator(`[id="${activeId}"]`).count()).toBe(1);
 await input.press('Enter');await expect(input).toHaveValue('请整理  后面的文字');await expect(page.locator('.composer .skill-tag')).toContainText('补充信息');
 expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await page.getByRole('button',{name:'发送任务',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds)).toEqual(['skill-1']);
 const followup=page.getByRole('textbox',{name:'继续对话'});await followup.fill('$');await expect(item).toBeVisible();await followup.press('Tab');await expect(followup).toHaveValue('');await expect(followup).toBeFocused();
 await followup.fill('再整理一次');await page.getByRole('button',{name:'发送后续消息'}).click();expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds)).toEqual(['skill-1']);
});

test('$ groups extensions, filters unavailable items and preserves ordinary dollar text',async({page})=>{
 await setup(page);await page.evaluate(()=>{(window as any).desktop.extensions={list:async()=>({capabilities:{},installed:[
  {manifest:{id:'acme.fpga',name:'FPGA 调试助手',description:'连接开发板并读取调试日志'},enabled:true,trusted:true},
  {manifest:{id:'acme.disabled',name:'Disabled extension'},enabled:false},
  {manifest:{id:'acme.untrusted',name:'Untrusted extension'},enabled:true,trusted:false},
 ]})};});
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('$');
 await expect(page.getByRole('option')).toHaveCount(2);await expect(input).toBeFocused();
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'test-results/composer-mentions.png'});
 await input.press('ArrowDown');await expect(page.getByRole('option',{name:/FPGA/})).toHaveAttribute('aria-selected','true');await expect(input).toHaveAttribute('aria-activedescendant',(await page.getByRole('option',{name:/FPGA/}).getAttribute('id'))!);
 await input.press('Escape');await expect(page.getByRole('option')).toHaveCount(0);await expect(input).toHaveValue('$');
 for(const text of ['费用 $100','echo ${HOME}','echo $(pwd)',String.raw`echo \$HOME`]){await input.fill(text);await expect(page.getByRole('option')).toHaveCount(0);}
 await input.fill('请用 $fpga');await expect(page.getByRole('option')).toHaveCount(1);await page.getByRole('option',{name:/FPGA/}).click();
 await expect(input).toHaveValue('请用 使用扩展「FPGA 调试助手」(acme.fpga) ');await expect(input).toBeFocused();expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await input.fill('$nothing');await expect(page.getByText('没有匹配的技能或扩展')).toBeVisible();await input.press('Enter');expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await input.fill('$meeting');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});await expect(input).toHaveValue('$meeting');await expect(page.locator('.composer .skill-tag')).toHaveCount(0);
 await input.press('Enter');await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
});


test('$ picker reflows on narrow screens and recovers from extension loading failure',async({page})=>{
 await setup(page);await page.setViewportSize({width:600,height:700});
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';(window as any).desktop.extensions={list:async()=>{throw Error('offline');}};});
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('$');
 await expect(page.getByText('部分列表未能加载，重新输入 $ 可重试。')).toBeVisible();await expect(page.getByRole('option',{name:/meeting-summary/})).toBeVisible();
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 const popup=page.locator('[data-slot="popover-content"]');expect(await popup.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0)).toBe(true);
 await page.screenshot({path:'test-results/composer-mentions-narrow-dark.png'});
 await input.press('Escape');await page.evaluate(()=>{(window as any).desktop.extensions.list=async()=>({capabilities:{},installed:[]});});await input.fill('');await input.fill('$');await expect(page.getByText('部分列表未能加载，重新输入 $ 可重试。')).toHaveCount(0);
 await input.press('Enter');await input.fill('$');await input.press('Enter');await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
});
