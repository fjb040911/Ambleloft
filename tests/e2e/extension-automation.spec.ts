import {test,expect} from '@playwright/test';
test('automation settings preserve edits, require explicit retry and keep unknown outcome visible',async({page})=>{
 await page.addInitScript(()=>{
  const item={manifest:{id:'summary',name:'轮次摘要',description:'总结项目聊天',version:'1.0.0',contributes:{}},kind:'package',enabled:true,trusted:true,permissions:[{capability:'background.jobs',scope:'project'}],grants:[]};
  let policy={paused:true,providerId:'p',model:'m',dailyLimit:20};
  (window as any).desktop={getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},listProviders:async()=>({providers:[{id:'p',name:'测试服务',models:['m'],model:'m'}]}),readWorkspace:async()=>({tasks:[],projects:[],theme:'light',language:'zh-CN'}),extensions:{list:async()=>({installed:[item],capabilities:{}}),details:async()=>({readme:'摘要扩展',publisher:'Example',size:1000}),automation:async(input:any)=>{(window as any).__automationInput=input;if(input.action==='policy')policy=input.policy;return {policy,events:[],jobs:[{id:'job',eventKey:'turn-event',status:'unknown',model:'m',createdAt:Date.now()}]};}}};
 });
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置导航'}).getByRole('button',{name:'扩展',exact:true}).click();await page.locator('.extension-list-card').click();await page.getByRole('tab',{name:'后台自动化',exact:true}).click();
 const panel=page.getByRole('region',{name:'后台自动化',exact:true});await expect(panel.getByRole('switch')).not.toBeChecked();await panel.getByRole('switch').click();await panel.getByLabel('每 24 小时调用上限').fill('5');
 await page.getByRole('tab',{name:'详情',exact:true}).click();await page.getByRole('tab',{name:'后台自动化',exact:true}).click();await expect(panel.getByLabel('每 24 小时调用上限')).toHaveValue('5');
 await page.getByRole('button',{name:'返回扩展列表'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
 await panel.getByRole('button',{name:'保存设置',exact:true}).click();expect(await page.evaluate(()=>(window as any).__automationInput.policy)).toEqual({paused:false,providerId:'p',model:'m',dailyLimit:5});
 await panel.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('可能重复计费');await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>(window as any).__automationInput.action)).toBe('policy');
 await panel.getByRole('button',{name:'重新生成',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'重新生成',exact:true}).click();expect(await page.evaluate(()=>(window as any).__automationInput)).toEqual({id:'summary',action:'retryJob',jobId:'job'});
 await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(panel).toContainText('不会自动重试');await page.setViewportSize({width:860,height:900});await page.screenshot({path:'test-results/extension-automation.png'});expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
