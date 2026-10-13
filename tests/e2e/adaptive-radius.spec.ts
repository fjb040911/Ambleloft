import {test,expect} from '@playwright/test';

test('navigation states and settings cards share scalable radius tokens',async({page})=>{
 await page.setViewportSize({width:1200,height:900});
 await page.addInitScript(()=>localStorage.setItem('atelier.workspace.v1',JSON.stringify({theme:'light',layoutMode:'activity',projects:[],tasks:[]})));
 await page.goto('/');
 const activity=page.locator('.activity-group').first();
 await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await activity.hover();await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await activity.click();await expect(activity).toHaveCSS('border-top-left-radius','12px');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const group=page.locator('.settings-group').first(),card=page.locator('.settings-content [data-slot=card]').first();
 await expect(group).toBeVisible();await expect(card).toBeVisible();
 const radius=(el:any)=>el.evaluate((node:Element)=>parseFloat(getComputedStyle(node).borderTopLeftRadius));
 const wide=await radius(group);
 expect(await radius(card)).toBeCloseTo(wide);
 await expect(page.locator('.settings-sidebar [data-slot=sidebar-menu-button]').first()).toHaveCSS('border-top-left-radius','10px');
 await page.setViewportSize({width:800,height:900});
 const narrow=await radius(group);expect(narrow).toBeLessThan(wide);
 await page.getByRole('combobox',{name:'字体大小',exact:true}).selectOption('130');
 expect(await radius(group)).toBeGreaterThan(narrow);
 await expect(page.locator('.settings-sidebar [data-slot=sidebar-menu-button]').first()).toHaveCSS('border-top-left-radius','13px');
 expect(await page.locator('.settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/adaptive-radius-settings.png'});
});
