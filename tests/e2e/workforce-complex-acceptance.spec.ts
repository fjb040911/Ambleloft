import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let data:any;
test.beforeAll(()=>{
 const folder=mkdtempSync(join(tmpdir(),'complex-browser-'));
 try{const file=join(folder,'scenario.json');execFileSync(process.execPath,['tests/fixtures/complex-acceptance.cjs',file]);data=JSON.parse(readFileSync(file,'utf8'));}finally{rmSync(folder,{recursive:true,force:true});}
});
async function show(page:Page,key:string){
 await page.evaluate(({snapshot,employees})=>{
  const qa=(window as any).spaceQA,p=snapshot.plan;p.spaceId='space';
  window.desktop!.workforce!.snapshot=async()=>({employees,globalSkills:[]});qa.snapshot.spaces[0].members=employees.map((e:any)=>({employeeId:e.id,assignment:'隔离案例',projectIds:[]}));
  qa.snapshot.plans=[p];qa.snapshot.requests=[];qa.snapshot.documents=[];
  window.desktop!.getRunPage=async({id}:any)=>{const run=snapshot.runs.find((r:any)=>r.id===id);if(!run)throw Error('Unknown test run');return {...structuredClone(run),cwd:'',error:run.error||'',fileChanges:[],artifacts:[]};};qa.emit();
 },{snapshot:data.snapshots[key],employees:data.employees});
}
async function enter(page:Page,key:string,theme='light'){
 await page.goto('/tests/manual/project-space-qa.html?theme='+theme);await show(page,key);
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();
}

const controls=(page:Page)=>page.getByRole('region',{name:'计划控制与待处理'});
const node=(page:Page,id:string)=>page.locator(`.wf-graph-node[data-package-id="${id}"]`);
test('automatic stages never ask for manual acceptance and graph viewport stays stable',async({page})=>{
 await enter(page,'checking');await expect(page.locator('.wf-plan-worklist>header')).toContainText('自动验收中');
 await expect(controls(page)).toContainText('无需操作');await expect(controls(page).getByRole('button',{name:/处理待办/})).toHaveCount(0);
 await expect(node(page,'scope')).toContainText('自动验收中');await expect(page.getByRole('button',{name:'定位执行中'})).toBeEnabled();
 const viewport=page.locator('.react-flow__viewport');const before=await viewport.evaluate(el=>(el as HTMLElement).style.transform);
 await show(page,'repairing');await expect(node(page,'api')).toContainText('自动修复中');await expect(controls(page)).toContainText('无需操作');
 expect(await viewport.evaluate(el=>(el as HTMLElement).style.transform)).toBe(before);
 await show(page,'retry-wait');await expect(node(page,'guide')).toContainText('等待自动重试');await expect(controls(page).getByRole('button',{name:/处理待办/})).toHaveCount(0);
 await show(page,'fallback');await expect(controls(page).getByRole('button',{name:'处理待办 · 1'})).toBeVisible();
 expect(await viewport.evaluate(el=>(el as HTMLElement).style.transform)).toBe(before);
});
for(const [width,theme] of [[1440,'light'],[390,'dark']] as const)test(`one direct action exposes the actual blocker at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await enter(page,'fallback',theme);
 await expect(page.locator('.wf-graph-node')).toHaveCount(10);
 const action=controls(page).getByRole('button',{name:'处理待办 · 1'});await action.scrollIntoViewIfNeeded();
 await expect(page.getByRole('dialog')).toHaveCount(0);await page.screenshot({path:`/tmp/complex-overview-${width}.png`});
 await action.focus();await page.keyboard.press('Enter');
 const detail=page.getByRole('region',{name:'任务详情与验收'});
 await expect(detail.getByRole('heading',{name:'验证访问边界',exact:true})).toBeVisible();await expect(detail).toContainText('连续验收未见改善');
 await expect(detail.getByRole('button',{name:'按原标准修复',exact:true})).toBeVisible();
 expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 const footer=detail.locator('.wf-review-actions');const box=(await footer.boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(1000);
 await page.screenshot({path:`/tmp/complex-fallback-${width}.png`});
});
test('missing evidence retries directly without reject-then-retry or editing criteria',async({page})=>{
 await enter(page,'missing-evidence');await controls(page).getByRole('button',{name:'处理待办 · 1'}).click();
 await page.getByRole('button',{name:'补充证据并重试',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).spaceQA.calls);expect(calls.filter((c:any)=>c.action==='review')).toHaveLength(0);
 expect(calls.filter((c:any)=>c.action==='control')).toHaveLength(1);expect(calls.find((c:any)=>c.action==='control').input).toMatchObject({action:'retry',packageId:'release'});
 expect(await page.evaluate(()=>(window as any).spaceQA.snapshot.plans[0].packages.find((p:any)=>p.id==='release').definition.acceptanceChecks[0].expected)).toBe('0');
});
test('completed branch replay shows exact scope and keeps unrelated acceptance',async({page})=>{
 await enter(page,'completed');await expect(controls(page)).toContainText('全部节点已完成');await expect(controls(page).getByText('待办详情',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'查看全图',exact:true}).click();await node(page,'archive').click();
 await expect(page.getByRole('heading',{name:'已按设置放行',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'验收结果与后续任务'})).toContainText('未核验质量');
 await page.getByRole('button',{name:'返回流程图',exact:true}).click();await page.getByRole('button',{name:'查看全图',exact:true}).click();await node(page,'client').click();
 await page.getByRole('button',{name:'从此处重跑',exact:true}).click();const dialog=page.getByRole('alertdialog');
 await expect(dialog).toContainText('实现客户端、验证端到端流程、验证响应时间、核对发布材料、发布后冒烟验证、归档运行记录');
 await expect(dialog).not.toContainText('实现服务接口');await dialog.getByRole('button',{name:'重新执行受影响节点'}).click();
 await show(page,'restarted');await page.getByRole('button',{name:'返回流程图',exact:true}).click();
 await expect(node(page,'api')).toContainText('已验收');await expect(node(page,'client')).toContainText('准备输入');await expect(node(page,'release')).toContainText('等待前置任务');
});
