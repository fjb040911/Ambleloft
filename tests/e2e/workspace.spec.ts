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

test('theme preference survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('model picker Escape restores focus', async ({ page }) => {
  await page.goto('/');
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

test('font size updates typography, persists and restores default',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();
 const slider=page.getByRole('slider',{name:'字体大小'});await expect(slider).toHaveValue('100');
 await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('110');
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).fontSize)).toBe('17.6px');
 await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(slider).toHaveValue('110');
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();await expect(slider).toHaveValue('100');
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).fontSize)).toBe('16px');
});
