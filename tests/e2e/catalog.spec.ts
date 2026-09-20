import {test,expect} from '@playwright/test';
test('shared model catalog keeps independent filters for main and settings',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'模型中心 探索'}).click();await page.getByRole('searchbox',{name:'搜索模型'}).fill('Qwen');await expect(page.locator('.app-shell .model-card')).toHaveCount(1);
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.locator('.settings-workspace');await settings.getByRole('navigation').getByRole('button',{name:'探索',exact:true}).click();
 await expect(settings.getByRole('button',{name:'本地模型',exact:true})).toHaveAttribute('aria-pressed','true');await expect(settings.locator('.model-card')).toHaveCount(3);
 await settings.getByRole('searchbox',{name:'搜索模型'}).fill('DeepSeek');await settings.locator('.model-card').click();await expect(page.getByRole('dialog')).toContainText('本地模型候选');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await settings.getByRole('button',{name:'返回应用'}).click();await expect(page.getByRole('searchbox',{name:'搜索模型'})).toHaveValue('Qwen');await expect(page.locator('.model-card').first()).toContainText('Qwen');
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect(settings.getByRole('searchbox',{name:'搜索模型'})).toHaveValue('DeepSeek');
});
test('capability tabs share content and preserve per-tab and per-entry state',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'能力与插件',exact:true}).click();await expect(page.getByRole('tab',{name:'技能',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'设计创作',exact:true}).click();await expect(page.locator('.skill-card')).toHaveCount(1);
 await page.getByRole('tab',{name:'插件',exact:true}).click();await expect(page.getByRole('heading',{name:'插件目录正在准备中'})).toBeVisible();await page.getByRole('tab',{name:'插件',exact:true}).press('ArrowLeft');await expect(page.getByRole('button',{name:'设计创作',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.locator('.settings-workspace');await settings.getByRole('navigation').getByRole('button',{name:'插件',exact:true}).click();await expect(settings.getByRole('tab',{name:'插件',exact:true})).toHaveAttribute('aria-selected','true');
 await settings.getByRole('tab',{name:'技能',exact:true}).click();await expect(settings.getByRole('navigation').getByRole('button',{name:'技能',exact:true})).toHaveAttribute('aria-current','page');await expect(settings.locator('.skill-card')).toHaveCount(3);
 await settings.getByRole('button',{name:'效率工具',exact:true}).click();await expect(settings.locator('.skill-card')).toHaveCount(1);await settings.locator('.skill-card').click();await expect(page.getByRole('dialog')).toContainText('不会安装插件');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.screenshot({path:'test-results/catalog-settings-skills.png'});
 await settings.getByRole('button',{name:'返回应用'}).click();await expect(page.getByRole('button',{name:'设计创作',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.skill-card')).toContainText('打磨一个想法');
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect(settings.getByRole('button',{name:'效率工具',exact:true})).toHaveAttribute('aria-pressed','true');
 await settings.locator('.skill-card').click();await page.getByRole('button',{name:'使用模板',exact:true}).click();await expect(page.getByRole('textbox',{name:'任务内容'})).toHaveValue(/梳理/);await expect(settings).toHaveCount(0);
});

 test('empty catalog results offer a direct way to clear filters',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'模型中心 探索'}).click();
 await page.getByRole('button',{name:'云端服务',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索模型'}).fill('no-matching-model');
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await expect(page.getByRole('searchbox',{name:'搜索模型'})).toHaveValue('');
 await expect(page.getByRole('button',{name:'全部',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.model-card').first()).toBeVisible();
 await page.getByRole('button',{name:'能力与插件',exact:true}).click();
 await page.getByRole('searchbox',{name:'搜索能力'}).fill('no-matching-skill');
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await expect(page.locator('.skill-card')).toHaveCount(3);
});
