import {test,expect} from '@playwright/test';
test('platform navigation removes model deployment and retains endpoint settings and skills',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'模型中心 探索'})).toHaveCount(0);
 await page.locator('.activity-rail').getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('button',{name:'技能与扩展',exact:true}).click();
 await expect(page.getByRole('tab',{name:/已安装/})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'从本地安装',exact:true}).click();
 await expect(page.getByRole('button',{name:'导入本地技能'})).toBeVisible();
 await page.getByRole('button',{name:'返回已安装',exact:true}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const nav=page.locator('.settings-workspace nav');
 await expect(nav.getByText('本地模型',{exact:true})).toHaveCount(0);
 await expect(nav.getByRole('button',{name:'运行时',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'模型提供商',exact:true}).click();
 await expect(page.getByRole('button',{name:'添加服务'})).toBeVisible();
});
