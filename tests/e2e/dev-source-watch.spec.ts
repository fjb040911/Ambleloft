import {test,expect} from '@playwright/test';
import {writeFile,appendFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';

test('writing a generated document does not reload the discussion or discard its input',async({page})=>{
 const file=resolve('specs',`.chat-watch-${process.pid}-${Date.now()}.md`);
 try{
  await page.goto('/tests/manual/project-space-qa.html');
  await page.getByRole('button',{name:/产品发布 准备新版/}).click();
  await page.getByRole('tab',{name:'讨论',exact:true}).click();
  const input=page.getByLabel('这次想推进什么？');await input.fill('保留正在输入的讨论内容');
  const origin=await page.evaluate(()=>performance.timeOrigin);
  await writeFile(file,'# Generated document\n\ntext-blue-500\n');
  // Exercise the real dev file watcher rather than a mocked HMR event.
  await page.waitForTimeout(1000);
  await appendFile(file,'\nUpdated discussion notes.\n');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(origin);
  await expect(input).toHaveValue('保留正在输入的讨论内容');
 }finally{await rm(file,{force:true});}
});
