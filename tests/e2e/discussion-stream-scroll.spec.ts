import {test,expect} from '@playwright/test';

for(const width of [1280,390])test(`streaming host follows the end without moving readers at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA,r=qa.snapshot.requests.find((r:any)=>r.id==='discussion');
  r.participants=[];
  r.host={status:'running',revision:1,model:'Test model',steps:[{id:'response',action:'reply',text:'正在核对项目关系与验收标准。\n\n'.repeat(70)}]};
  qa.emit();
 });
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();
 await page.getByRole('tab',{name:'讨论',exact:true}).click();
 const scroll=page.locator('.qa-scroll'),host=page.getByRole('region',{name:'主持人回复',exact:true});
 await expect(host).toContainText('正在核对项目关系与验收标准。');
 const distance=()=>scroll.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop);
 await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect.poll(distance).toBeLessThan(5);
 for(let i=0;i<3;i++){
  await page.evaluate(i=>{const qa=(window as any).spaceQA,h=qa.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.steps[0].text+=`\n\n流式更新 ${i}\n\n`+'新的执行信息。\n\n'.repeat(5);h.revision++;qa.emit();},i);
  await expect(host).toContainText(`流式更新 ${i}`);
  await expect.poll(distance).toBeLessThan(5);
 }
 await scroll.evaluate(el=>{el.scrollTop=500;});
 await expect(page.getByRole('button',{name:'回到最新消息',exact:true})).toBeVisible();
 const before=await scroll.evaluate(el=>el.scrollTop);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,h=qa.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.steps[0].text+='\n\n阅读历史期间的新内容';h.revision++;qa.emit();});
 await expect(host).toContainText('阅读历史期间的新内容');
 expect(await scroll.evaluate(el=>el.scrollTop)).toBeCloseTo(before,0);
 await page.getByRole('button',{name:'回到最新消息',exact:true}).click();
 await expect.poll(distance).toBeLessThan(5);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,h=qa.snapshot.requests.find((r:any)=>r.id==='discussion').host;h.steps[0].text+='\n\n本轮最终结果';h.status='completed';h.revision++;qa.emit();});
 await expect(host).toContainText('本轮最终结果');
 await expect.poll(distance).toBeLessThan(5);
});
