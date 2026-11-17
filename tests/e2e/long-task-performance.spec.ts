import {test,expect} from '@playwright/test';
test('text deltas do not reload configuration and hidden workforce does not refresh snapshots',async({page})=>{
 await page.goto('/tests/fixtures/long-task-performance.html');await expect(page.getByRole('button',{name:/产品发布 准备新版/})).toBeVisible();
 await page.waitForTimeout(250);
 const emit=async(status:string,count=1)=>page.evaluate(({status,count})=>{for(let i=0;i<count;i++)(window as any).longTaskQA.emit({id:'evidence',status,error:'',messages:[{id:'a',role:'assistant',text:'token '+i}],tools:[],approvals:[],questions:[],collaboration:{requestId:'plan-request'}});},{status,count});
 const baseline=await page.evaluate(()=>(window as any).longTaskQA.counters);
 await emit('running');await page.waitForTimeout(250);await emit('running',100);await page.waitForTimeout(250);
 const after=await page.evaluate(()=>(window as any).longTaskQA.counters);
 expect(after.configuration).toBe(baseline.configuration);expect(after.spaces).toBe(baseline.spaces+1);expect(after.legacy).toBe(0);expect(after.snapshots).toBe(0);
 await page.evaluate(()=>(window as any).spaceQA.setActive(false));await expect(page.getByRole('heading',{name:'原始任务证据（测试数据）'})).toBeVisible();
 await emit('completed');await page.evaluate(()=>(window as any).spaceQA.emit());await page.waitForTimeout(350);
 expect(await page.evaluate(()=>(window as any).longTaskQA.counters)).toEqual(after);
 await page.getByRole('button',{name:'返回项目空间'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).longTaskQA.counters.configuration)).toBe(after.configuration+1);
});
test('collecting a previewed discussion requests full text rather than saving the tail',async({page})=>{
 await page.goto('/tests/fixtures/long-task-performance.html');
 await page.evaluate(()=>{const q=(window as any).spaceQA;q.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].output='TAIL PREVIEW';q.snapshot.requests.find((r:any)=>r.id==='discussion').participants[0].outputTruncated=true;q.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'讨论',exact:true}).click();
 await page.getByRole('button',{name:'本轮操作',exact:true}).click();await page.getByRole('menuitem',{name:'整理为文档',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).longTaskQA.counters.fullReads)).toBe(1);
 const textarea=page.getByRole('dialog').locator('textarea');await expect(textarea).toContainText('FULL BEGIN');await expect(textarea).toContainText('FULL END');await expect(textarea).not.toContainText('TAIL PREVIEW');
});
