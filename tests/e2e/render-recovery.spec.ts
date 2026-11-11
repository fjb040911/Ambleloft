import {test,expect} from '@playwright/test';
test('render failure isolates the conversation and permits diagnostics and recovery without replay',async({page})=>{
 await page.goto('/tests/manual/render-recovery.html');
 await expect(page.getByText('Sidebar remains available')).toBeVisible();
 await expect(page.getByText('内容暂时无法显示')).toBeVisible();
 await page.getByRole('button',{name:'导出诊断数据',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-exported','true');
 await page.getByRole('button',{name:'重新显示',exact:true}).click();
 await expect(page.getByText('内容暂时无法显示')).toBeVisible();
 await page.evaluate(()=> (window as unknown as {repairTranscript():void}).repairTranscript());
 await page.getByRole('button',{name:'重新显示',exact:true}).click();
 await expect(page.getByText('Transcript recovered')).toBeVisible();
});
