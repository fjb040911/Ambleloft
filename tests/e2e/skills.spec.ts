import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){await page.addInitScript(()=>{
 const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
 const skill={id:'skill-1',name:'meeting-summary',description:'整理会议纪要和待办',body:'Summarize the meeting.',enabled:true,version:1,path:'/skills/one/SKILL.md',files:['SKILL.md','references/format.md'],sourcePath:'/original/meeting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};let skills:any[]=[skill];let run:any;
 (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>skills,detail:async(id:string)=>skills.find(s=>s.id===id),import:async()=>{const item={...skill,id:'skill-2',name:'writing-review'};skills.push(item);return {skill:item};},update:async(input:any)=>{skills=skills.map(s=>s.id===input.id?{...s,...input,version:s.version+(input.body?1:0)}:s);return skills.find(s=>s.id===input.id);},remove:async(id:string)=>{skills=skills.filter(s=>s.id!==id);}},startRun:async(input:any)=>{if((window as any).__fail)throw new Error('发送失败');(window as any).__sent=input;const message={id:crypto.randomUUID(),role:'user',text:input.prompt||'执行所选技能',skills:(input.selectedSkillIds||[]).map((id:string)=>({...skills.find(s=>s.id===id)}))};run={id:'r',providerId:'p',title:'技能任务',model:'test',baseUrl:provider.baseUrl,cwd:'/tmp',createdAt:new Date().toISOString(),status:'completed',error:'',tools:[],approvals:[],messages:[...(run?.messages||[]),message,{id:crypto.randomUUID(),role:'assistant',text:'已完成'}]};return run;}};
 });await page.goto('/');}
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
async function openSkill(page:Page){await setup(page);await picker(page);await page.getByRole('button',{name:'管理技能'}).click();await page.locator('.personal-skill-card').first().click();return page.getByRole('dialog',{name:'meeting-summary',exact:true});}
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
 await saved.getByRole('button',{name:'删除技能'}).click();await page.getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.personal-skill-card')).toHaveCount(0);
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
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改'}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('.personal-skill-card').first()).toBeFocused();
});
