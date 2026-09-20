import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){await page.addInitScript(()=>{
 const provider={id:'p',name:'Test',model:'test',models:['test'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''};
 const skill={id:'skill-1',name:'meeting-summary',description:'整理会议纪要和待办',body:'Summarize the meeting.',enabled:true,version:1,path:'/skills/one/SKILL.md',files:['SKILL.md','references/format.md'],sourcePath:'/original/meeting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};let skills:any[]=[skill];let run:any;
 (window as any).desktop={getProvider:async()=>provider,listProviders:async()=>({defaultId:'p',providers:[provider]}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),saveWorkspace:async()=>{},listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},skills:{list:async()=>skills,detail:async(id:string)=>skills.find(s=>s.id===id),import:async()=>{const item={...skill,id:'skill-2',name:'writing-review'};skills.push(item);return {skill:item};},update:async(input:any)=>{skills=skills.map(s=>s.id===input.id?{...s,...input,version:s.version+(input.body?1:0)}:s);return skills.find(s=>s.id===input.id);},remove:async(id:string)=>{skills=skills.filter(s=>s.id!==id);}},startRun:async(input:any)=>{if((window as any).__fail)throw new Error('发送失败');(window as any).__sent=input;const message={id:crypto.randomUUID(),role:'user',text:input.prompt||'执行所选技能',skills:(input.selectedSkillIds||[]).map((id:string)=>({...skills.find(s=>s.id===id)}))};run={id:'r',providerId:'p',title:'技能任务',model:'test',baseUrl:provider.baseUrl,cwd:'/tmp',createdAt:new Date().toISOString(),status:'completed',error:'',tools:[],approvals:[],messages:[...(run?.messages||[]),message,{id:crypto.randomUUID(),role:'assistant',text:'已完成'}]};return run;}};
 });await page.goto('/');}
async function picker(page:Page){await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'技能',exact:true}).click();}
test('skill tags are separate from text, survive failure and apply to only the submitted turn',async({page})=>{
 await setup(page);await picker(page);const item=page.getByRole('button',{name:/meeting-summary 整理/});await item.click();await expect(item).toHaveAttribute('aria-pressed','true');await item.click();await expect(page.locator('.composer .skill-tag')).toHaveCount(0);await item.click();await page.keyboard.press('Escape');
 await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('');await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
 await page.locator('.composer .skill-tag button').first().click();await expect(page.getByRole('dialog',{name:'meeting-summary'})).toContainText('Summarize the meeting.');await page.getByRole('dialog',{name:'meeting-summary'}).getByRole('button',{name:'关闭',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await page.screenshot({path:'test-results/skills-composer.png'});
 await page.evaluate(()=>(window as any).__fail=true);await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(page.locator('.composer .skill-tag')).toHaveCount(1);
 await page.evaluate(()=>(window as any).__fail=false);await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(page.locator('.message.user .skill-tag')).toContainText('meeting-summary');await expect(page.locator('.composer .skill-tag')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds)).toEqual(['skill-1']);
 await page.getByRole('textbox',{name:'继续对话'}).fill('再简短一些');await page.getByRole('button',{name:'发送后续消息'}).click();expect(await page.evaluate(()=>(window as any).__sent.selectedSkillIds||[])).toEqual([]);
});
test('personal skills can be imported, edited, disabled and removed from settings',async({page})=>{
 await setup(page);await picker(page);await page.getByRole('button',{name:'管理技能'}).click();const settings=page.locator('.settings-workspace');await expect(settings.locator('.personal-skill-card')).toHaveCount(1);
 await settings.getByRole('button',{name:'导入本地技能'}).click();await expect(settings.locator('.personal-skill-card')).toHaveCount(2);
 await settings.locator('.personal-skill-card').filter({hasText:'meeting-summary'}).click();let dialog=page.getByRole('dialog',{name:'技能详情'});await dialog.getByLabel('名称',{exact:true}).fill('会议助手');await dialog.getByLabel('技能指令').fill('Updated workflow');await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await settings.locator('.personal-skill-card').filter({hasText:'会议助手'}).click();dialog=page.getByRole('dialog',{name:'技能详情'});await expect(dialog.getByLabel('技能指令')).toHaveValue('Updated workflow');await dialog.getByRole('button',{name:'停用',exact:true}).click();await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(settings.locator('.personal-skill-card').filter({hasText:'会议助手'})).toContainText('已停用');await page.screenshot({path:'test-results/skills-manager.png'});
 await settings.getByRole('button',{name:'返回应用'}).click();await picker(page);await expect(page.getByRole('dialog',{name:'添加内容'})).not.toContainText('会议助手');await page.getByRole('button',{name:'管理技能'}).click();await settings.locator('.personal-skill-card').filter({hasText:'会议助手'}).click();page.once('dialog',d=>d.accept());await page.getByRole('dialog',{name:'技能详情'}).getByRole('button',{name:'删除',exact:true}).click();await expect(settings.locator('.personal-skill-card')).toHaveCount(1);
});

test('skill detail keeps pending saves visible and recovers after failure',async({page})=>{
 await setup(page);await picker(page);await page.getByRole('button',{name:'管理技能'}).click();
 await page.locator('.personal-skill-card').first().click();
 const dialog=page.getByRole('dialog',{name:'技能详情'});
 await dialog.getByLabel('名称',{exact:true}).fill('未保存修改');
 await page.evaluate(()=>{(window as any).desktop.skills.update=()=>new Promise((resolve,reject)=>{(window as any).__rejectSave=reject;});});
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'处理中…',exact:true})).toBeDisabled();
 await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 await page.evaluate(()=>(window as any).__rejectSave(new Error('保存失败，请重试')));
 await expect(dialog.getByRole('alert')).toContainText('保存失败');
 await expect(dialog.getByLabel('名称',{exact:true})).toHaveValue('未保存修改');
 await expect(dialog.getByRole('button',{name:'保存',exact:true})).toBeEnabled();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await expect(page.locator('.personal-skill-card').first()).toBeFocused();
});
