import {test,expect} from '@playwright/test';

test('navigation states and settings cards share scalable radius tokens',async({page})=>{
 await page.setViewportSize({width:1200,height:900});
 await page.addInitScript(()=>{
  let workspace={theme:'light',layoutMode:'activity',projects:[],tasks:[]};
  const provider={id:'fixture',name:'测试服务',configured:true,model:'fixture',models:['fixture'],baseUrl:'https://fixture.invalid/v1',hasKey:false};
  (window as any).desktop={readWorkspace:async()=>workspace,saveWorkspace:async(value:any)=>{workspace=value;},getProvider:async()=>provider,listProviders:async()=>({defaultId:provider.id,providers:[provider]}),listRuns:async()=>[],onRun:()=>()=>{},onCommand:()=>()=>{},getDevice:async()=>({mode:'desktop'})};
 });
 await page.goto('/');
 const activity=page.locator('.activity-group').first();
 await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await activity.hover();await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await activity.click();await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const group=page.locator('.settings-group').first(),card=page.locator('.settings-content [data-slot=card]').first();
 await expect(group).toBeVisible();
 const radius=(el:any)=>el.evaluate((node:Element)=>parseFloat(getComputedStyle(node).borderTopLeftRadius));
 const wide=await radius(group);
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();await expect(card).toBeVisible();
 expect(await radius(card)).toBeCloseTo(wide);
 await page.getByRole('button',{name:'通用',exact:true}).click();await expect(group).toBeVisible();
 await expect(page.locator('.settings-sidebar [data-slot=sidebar-menu-button]').first()).toHaveCSS('border-top-left-radius','10px');
 await page.setViewportSize({width:800,height:900});
 const narrow=await radius(group);expect(narrow).toBeLessThan(wide);
 await page.getByRole('combobox',{name:'字体大小',exact:true}).selectOption('130');
 expect(await radius(group)).toBeGreaterThan(narrow);
 await expect(page.locator('.settings-sidebar [data-slot=sidebar-menu-button]').first()).toHaveCSS('border-top-left-radius','13px');
 expect(await page.locator('.settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/adaptive-radius-settings.png'});
});
