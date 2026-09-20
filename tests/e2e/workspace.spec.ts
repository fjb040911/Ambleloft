import { test, expect } from '@playwright/test';

test('draft survives reload, can be copied, and is deleted only after confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '任务内容' }).fill('整理我的品牌项目资料');
  await page.getByRole('button', { name: '保存任务草稿' }).click();
  await expect(page.getByRole('dialog')).toContainText('草稿尚未执行');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.locator('.tree-task > button:first-child').filter({hasText:'整理我的品牌项目资料'}).click();
  await page.getByRole('button', { name: '归档草稿', exact: true }).click();
  await page.getByRole('button', { name: '保留', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '复制到新任务' }).click();
  await expect(page.getByRole('textbox', { name: '任务内容' })).toHaveValue('整理我的品牌项目资料');
  await page.locator('.tree-task > button:first-child').filter({hasText:'整理我的品牌项目资料'}).click();
  await page.getByRole('button', { name: '归档草稿', exact: true }).click();
  await page.getByRole('button', { name: '归档草稿', exact: true }).click();
  await expect(page.getByText('你的聊天会显示在这里。')).toBeVisible();
});

test('catalog filtering, model preference and theme are interactive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '模型中心 探索' }).click();
  await page.getByRole('searchbox', { name: '搜索模型' }).fill('Qwen');
  await expect(page.locator('.model-card')).toHaveCount(1);
  await page.locator('.model-card').click();
  await expect(page.getByRole('dialog')).toContainText('尚未接入');
  await page.getByRole('button', { name: '用于草稿偏好' }).click();
  await expect(page.locator('.composer-note')).toContainText('Qwen');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('template prepares input without execution and dialog restores focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '能力与插件', exact: true }).click();
  await page.locator('.plugin-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('不会安装插件');
  await page.getByRole('button', { name: '使用模板' }).click();
  await expect(page.getByRole('textbox', { name: '任务内容' })).toHaveValue(/梳理/);
  await page.getByRole('button',{name:'选择模型',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'选择模型',exact:true})).toBeFocused();
});

test('project picker includes icons and padding in its native click target',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'添加项目',exact:true}).click();
 await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('交互验证项目');
 await page.getByRole('textbox',{name:'工作目录',exact:true}).fill('/tmp/project-picker');
 await page.getByRole('button',{name:'保存项目',exact:true}).click();
 await page.locator('.new-task').click();
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('切换项目时保留草稿');
 const picker=page.locator('.composer-project-picker');const select=page.getByRole('combobox',{name:'当前项目',exact:true});
 for(const fraction of [.08,.5,.94]){
  const rect=await picker.boundingBox();const point={x:rect!.x+rect!.width*fraction,y:rect!.y+rect!.height/2};
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('SELECT');
  await page.mouse.click(point.x,point.y);await page.keyboard.press('Escape');await expect(select).toBeFocused();
 }
 await select.selectOption({label:'交互验证项目'});await expect(input).toHaveValue('切换项目时保留草稿');
 await page.setViewportSize({width:760,height:600});await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
 await expect(select).toBeVisible();expect(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'test-results/home-project-picker.png'});
});
