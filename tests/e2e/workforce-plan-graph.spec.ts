import {test,expect,type Page} from '@playwright/test';
async function enter(page:Page,query=''){
 await page.goto('/tests/manual/project-space-qa.html'+query);await page.getByRole('button',{name:/产品发布 准备新版/}).click();
}
async function tasks(page:Page,en=false){await page.getByRole('tab',{name:en?'Tasks':'任务',exact:true}).click();await expect(page.locator('.wf-graph-node')).toHaveCount(3);}
const mutationCalls=(page:Page)=>page.evaluate(()=>(window as any).spaceQA.calls.filter((c:any)=>['control','review','approve','savePlan'].includes(c.action)));
for(const [width,en,dark] of [[1440,false,false],[390,false,true],[1440,true,true],[390,true,false]] as const)test(`graph and detail ${width} en=${en} dark=${dark}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await enter(page,`?lang=${en?'en':'zh'}&theme=${dark?'dark':'light'}`);await tasks(page,en);
 const graph=page.locator('.wf-plan-graph');const node=graph.locator('[data-package-id="bundle"]');
 if(width===390){await expect.poll(async()=>Number((await graph.getByRole('status',{name:en?'Zoom level':'缩放比例'}).textContent())?.replace('%',''))).toBeGreaterThanOrEqual(80);await graph.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/workforce-graph-initial-${en}.png`});}
 await expect(node).toContainText(en?'Waiting for prerequisites':'等待前置任务');await expect(node).toContainText('发布文案');
 await graph.getByRole('button',{name:en?'Read at 100 percent':'原始比例阅读'}).click();await expect(graph.getByRole('status',{name:en?'Zoom level':'缩放比例'})).toHaveText('100%');
 await graph.getByRole('button',{name:en?'Zoom in graph':'放大流程图'}).click();await graph.getByRole('button',{name:en?'Fit graph':'查看全图'}).click();
 await graph.getByRole('button',{name:new RegExp(en?'Locate attention':'定位待处理')}).click();await expect(graph.locator('[data-package-id="copy"]')).toBeFocused();
 await graph.locator('[data-package-id="copy"]').press('ArrowRight');await expect(graph.locator('[data-package-id="testing"]')).toBeFocused();
 await graph.getByRole('button',{name:en?'Fit graph':'查看全图'}).click();
 await node.click();const detail=page.getByRole('region',{name:en?'Task details and review':'任务详情与验收'});await expect(detail.getByRole('heading',{name:'发布包整理',exact:true})).toBeVisible();
 await expect(graph.locator('[data-package-id="copy"]')).toHaveAttribute('data-relation','upstream');
 await detail.getByRole('button',{name:en?'Back to graph':'返回流程图',exact:true}).click();await expect(node).toBeFocused();
 await page.getByRole('combobox',{name:en?'Filter tasks by status':'任务状态筛选'}).selectOption('accepted');await expect(graph.locator('.wf-graph-node')).toHaveCount(3);await expect(node).toHaveAttribute('data-dimmed','true');
 await page.getByRole('combobox',{name:en?'Filter tasks by status':'任务状态筛选'}).selectOption('all');await graph.getByRole('button',{name:en?'Fit graph':'查看全图'}).click();
 await graph.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`/tmp/workforce-graph-${width}-${en}-${dark}.png`});expect(await mutationCalls(page)).toEqual([]);
});
test('selection survives refresh and graph gestures cannot mutate dependencies',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});await enter(page);await tasks(page);const graph=page.locator('.wf-plan-graph');await graph.locator('[data-package-id="copy"]').click();
 const positions=await graph.locator('.react-flow__node').evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform));const viewport=await graph.locator('.react-flow__viewport').getAttribute('style');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].status='accepted';qa.snapshot.plans[0].packages[0].stale=true;qa.emit();});await expect(graph.locator('[data-package-id="copy"]')).toHaveAttribute('aria-current','true');await expect(graph.locator('[data-package-id="copy"]')).toContainText('依据已更新');await expect(graph.locator('.wf-graph-edge')).not.toHaveClass(/is-accepted/);expect(await graph.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport);expect(await graph.locator('.react-flow__node').evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform))).toEqual(positions);
 await page.getByRole('button',{name:'返回流程图',exact:true}).click();
 const node=graph.locator('[data-package-id="copy"]');await node.press('Delete');await expect(graph.locator('.wf-graph-node')).toHaveCount(3);const box=(await node.boundingBox())!;await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+90,box.y+80,{steps:8});await page.mouse.up();expect(await graph.locator('.react-flow__node').evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform))).toEqual(positions);expect(await mutationCalls(page)).toEqual([]);
});
test('status updates retain positions, viewport, selected task across navigation',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});await enter(page);await tasks(page);
 const graph=page.locator('.wf-plan-graph'),nodes=graph.locator('.react-flow__node');
 await graph.getByRole('button',{name:'放大流程图'}).click();
 const canvas=graph.getByRole('region');await canvas.focus();await canvas.press('ArrowRight');
 const positions=await nodes.evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform));const viewport=await graph.locator('.react-flow__viewport').getAttribute('style');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].status='accepted';qa.emit();});
 await expect(graph.locator('[data-package-id="bundle"]')).toContainText('前置任务已全部验收');expect(await nodes.evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform))).toEqual(positions);expect(await graph.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport);
 await expect(graph.locator('.wf-graph-edge')).toHaveClass(/is-accepted/);
 await page.getByRole('tab',{name:'概览',exact:true}).click();await page.getByRole('button',{name:'查看流程图',exact:true}).click();await expect(graph).toBeVisible();expect(await mutationCalls(page)).toEqual([]);
});
test('waiting authorization is not an ordinary dependency wait; archived graph still works',async({page})=>{
 await enter(page);await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[2].status='waiting';qa.snapshot.plans[0].packages[2].attempts=[{id:'wait',runId:'wait-run'}];const old=window.desktop!.getRunPage!;window.desktop!.getRunPage=async input=>input.id==='wait-run'?{...await old({id:'evidence'}),id:'wait-run',status:'waiting',approvals:[{id:'approval',method:'command',detail:'Fixture command'}]}:old(input);qa.snapshot.spaces[0].archivedAt='2026-11-02';qa.emit();});await tasks(page);
 await expect(page.locator('.wf-graph-node[data-package-id="testing"]')).toContainText('等待授权');await expect(page.locator('.wf-graph-node[data-package-id="bundle"]')).toContainText('等待前置任务');await expect(page.getByRole('button',{name:'暂停计划',exact:true})).toBeDisabled();
 await page.locator('.wf-graph-node[data-package-id="testing"]').click();const detail=page.getByRole('region',{name:'任务详情与验收'});await expect(detail).toContainText('空间已归档，只能查看执行记录');await expect(detail.getByRole('button',{name:'允许本次',exact:true})).toHaveCount(0);
 expect(await mutationCalls(page)).toEqual([]);
});
test('thirty nodes, multiple plans, missing associations and refresh failure retain readable state',async({page})=>{
 await enter(page);await page.evaluate(()=>{const qa=(window as any).spaceQA,p=structuredClone(qa.snapshot.plans[0]),definition=p.packages[0].definition;p.id='large-plan';p.name='批量联调';p.packages=Array.from({length:30},(_,i)=>({id:'task-'+i,definition:{...definition,id:'task-'+i,title:'工作包 '+i,ownerId:'removed',projectId:'removed',dependencies:i<3?[]:['task-'+(i-3)]},status:'pending',attempts:[]}));qa.snapshot.plans.push(p);qa.emit();});
 await page.getByRole('tab',{name:'任务',exact:true}).click();await page.getByRole('combobox',{name:'选择协作计划'}).selectOption('large-plan');const large=page.locator('#wf-plan-large-plan'),first=page.locator('#wf-plan-launch');await expect(large.locator('.wf-graph-node')).toHaveCount(30);await expect(large.locator('.react-flow__edge')).toHaveCount(27);await expect(large.locator('.wf-graph-node').first()).toContainText('专家已移除');await expect(large.locator('.wf-graph-node').first()).toContainText('项目已移除');
 await page.getByRole('combobox',{name:'选择协作计划'}).selectOption('launch');await expect(large).toHaveCount(0);await expect(first.locator('.wf-graph-node')).toHaveCount(3);
 await page.evaluate(()=>{window.desktop!.spaces!.snapshot=async()=>{throw Error('测试：刷新暂不可用');};(window as any).spaceQA.emit();});await expect(page.getByRole('alert')).toContainText('测试：刷新暂不可用');await expect(first.locator('.wf-graph-node')).toHaveCount(3);expect(await mutationCalls(page)).toEqual([]);
});
test('repair-workflow fork and join remains read-only and exposes every blocking dependency',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});await enter(page);await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0],base=p.packages[0].definition;p.name='设备维修工单 · 流程验证';p.packages=[['contract','接口契约与部署边界',[],'review'],['environment','远端环境核验',[],'failed'],['api','远端 API 与持久化实现',['contract','environment'],'pending'],['web','本地工单网页开发',['contract'],'pending'],['verify','远端接口独立验证',['api'],'pending'],['delivery','端到端联调与验收',['web','verify'],'pending']].map(([id,title,dependencies,status])=>({id,definition:{...base,id,title,dependencies},status,attempts:[]}));qa.emit();});
 await page.getByRole('tab',{name:'任务',exact:true}).click();const graph=page.locator('.wf-plan-graph');await expect(graph.locator('.wf-graph-node')).toHaveCount(6);await expect(graph.locator('.react-flow__edge')).toHaveCount(6);
 await graph.locator('[data-package-id="api"]').click();await expect(graph.locator('[data-package-id="contract"]')).toHaveAttribute('data-relation','upstream');await expect(graph.locator('[data-package-id="environment"]')).toHaveAttribute('data-relation','upstream');await expect(graph.locator('[data-package-id="web"]')).toHaveAttribute('data-relation','none');await expect(graph.locator('[data-package-id="delivery"]')).toHaveAttribute('data-relation','downstream');
 const detail=page.getByRole('region',{name:'任务详情与验收'});await expect(detail.getByRole('region',{name:'调度依据'})).toContainText('远端环境核验 · 执行失败');await page.screenshot({path:'/tmp/workforce-repair-graph-detail.png'});await detail.getByRole('button',{name:'返回流程图'}).click();await graph.getByRole('button',{name:'查看全图'}).click();await graph.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/workforce-repair-graph.png'});expect(await mutationCalls(page)).toEqual([]);
});
test('unsaved plan preview displays live dependencies, detects cycles and never saves',async({page})=>{
 await enter(page);await tasks(page);await page.evaluate(()=>{const qa=(window as any).spaceQA;const p=qa.snapshot.plans[0];p.status='paused';qa.emit();localStorage.setItem('workforce-plan-draft:space:launch',JSON.stringify({revision:p.revision,value:{name:'预览计划',goal:'验证依赖',packages:p.packages.map((w:any)=>w.definition)}}));});
 await page.getByRole('button',{name:'发布准备的计划操作',exact:true}).click();await page.getByRole('menuitem',{name:'修订计划',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'继续分配工作'}).click();
 const graph=dialog.locator('.wf-plan-graph');await expect(graph.locator('.wf-graph-node')).toHaveCount(3);await expect(graph.locator('.wf-graph-node-status').first()).toHaveText('待确认项目关系');await expect(graph.locator('.is-accepted')).toHaveCount(0);
 if(await dialog.locator('.wf-package-editor').first().getAttribute('open')===null)await dialog.locator('.wf-package-editor').first().locator('summary').click();await dialog.locator('.wf-package-editor').first().getByRole('checkbox',{name:'发布包整理',exact:true}).check();
 await expect(graph.getByRole('alert')).toContainText('存在循环依赖');await expect(dialog.getByRole('button',{name:'检查计划',exact:true})).toBeDisabled();await expect(graph.locator('.wf-graph-canvas')).toHaveCount(0);expect(await mutationCalls(page)).toEqual([]);
});
test('long titles and 200% font scaling preserve graph controls and complete detail',async({page})=>{
 await page.setViewportSize({width:390,height:900});await enter(page,'?lang=en&theme=dark');await tasks(page,true);
 await page.evaluate(()=>{document.documentElement.style.setProperty('--font-scale','2');const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].definition.title='Contract, deployment boundary and integration verification '.repeat(8);qa.emit();});
 const graph=page.locator('.wf-plan-graph');await graph.getByRole('button',{name:/Locate attention/}).click();const node=graph.locator('[data-package-id="copy"]');await expect(node).toBeFocused();await node.press('Enter');const detail=page.getByRole('region',{name:'Task details and review'});await expect(detail.getByRole('heading').first()).toContainText('Contract, deployment');
 await detail.getByRole('button',{name:'Back to graph',exact:true}).click();expect(await graph.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await graph.getByRole('button',{name:'Fit graph'}).click();await graph.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/workforce-graph-font-200.png'});expect(await mutationCalls(page)).toEqual([]);
});

for(const dark of [false,true])test(`execution flows follow dependencies without blinking or moving nodes dark=${dark}`,async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});await enter(page,`?theme=${dark?'dark':'light'}`);await tasks(page);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.packages[0].status='accepted';p.packages[1].status='running';p.packages[2].status='pending';p.packages[2].definition.dependencies=['bundle'];qa.emit();});
 const graph=page.locator('.wf-plan-graph');await expect(graph.locator('.wf-graph-edge-flow')).toHaveCount(1);await graph.scrollIntoViewIfNeeded();await expect(graph).toHaveAttribute('data-motion','true');
 const running=graph.locator('[data-package-id="bundle"]');await expect(running).toHaveAttribute('data-executing','true');await expect(graph.locator('[data-package-id="testing"]')).toHaveAttribute('data-executing','false');
 const path=graph.locator('.wf-graph-edge-flow'),border=running.locator('.wf-graph-node-light rect');
 await expect(path).toHaveCSS('animation-name','wf-graph-flow');await expect(border).toHaveCSS('animation-name','wf-graph-node-flow');
 // Both traces move in their path's positive direction via decreasing dashoffset.
 for(const trace of [path,border]){
  const offsets=await trace.evaluate(async el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=0;const start=parseFloat(getComputedStyle(el).strokeDashoffset);animation.currentTime=600;return [start,parseFloat(getComputedStyle(el).strokeDashoffset)];});expect(offsets[1]).toBeLessThan(offsets[0]);
 }
 const base=graph.locator('.is-accepted .react-flow__edge-path');await expect(base).toHaveCSS('stroke-dasharray','none');await expect(base).toHaveCSS('animation-name','none');
 const coordinates=await graph.locator('.react-flow__node').evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform));
 await path.evaluate(el=>{(window as any).motionPath=el;const animation=el.getAnimations()[0];animation.currentTime=400;});
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].reason='执行状态更新';qa.emit();});await expect(running).toContainText('执行状态更新');
 expect(await path.evaluate(el=>el===(window as any).motionPath)).toBeTruthy();expect(await path.evaluate(el=>el.getAnimations()[0].currentTime)).toBe(400);
 expect(await graph.locator('.react-flow__node').evaluateAll(els=>els.map(el=>(el as HTMLElement).style.transform))).toEqual(coordinates);
 await graph.screenshot({path:`/tmp/workforce-graph-flow-${dark?'dark':'light'}.png`});
 await graph.evaluate(el=>{(el as HTMLElement).style.transform='translateY(3000px)';});await expect(graph).toHaveAttribute('data-motion','false');await expect(path).toHaveCSS('animation-play-state','paused');await graph.evaluate(el=>{(el as HTMLElement).style.transform='';});await expect(graph).toHaveAttribute('data-motion','true');
 for(const status of ['waiting','stopping','review','accepted','failed','interrupted','pending','preparing']){
  await page.evaluate(status=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[1].status=status;qa.emit();},status);
  await expect(running).toHaveAttribute('data-executing','false');await expect(graph.locator('.wf-graph-edge-flow')).toHaveCount(0);
 }
 expect(await mutationCalls(page)).toEqual([]);
});
test('reduced motion retains static execution cues and stale prerequisites never imply flow',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});await enter(page,'?lang=en&theme=dark');await tasks(page,true);
 await page.evaluate(()=>{const qa=(window as any).spaceQA,p=qa.snapshot.plans[0];p.packages[0].status='accepted';p.packages[1].status='running';qa.emit();});
 const graph=page.locator('.wf-plan-graph'),running=graph.locator('[data-package-id="bundle"]');await graph.getByRole('button',{name:'Locate running'}).click();
 await expect(running).toBeFocused();await expect(running.locator('.wf-graph-node-light rect')).toHaveCSS('animation-name','none');await expect(running.locator('.wf-graph-node-light rect')).toHaveCSS('stroke-dasharray','none');await expect(graph.locator('.wf-graph-edge-flow')).toHaveCSS('animation-name','none');
 await graph.screenshot({path:'/tmp/workforce-graph-flow-reduced.png'});
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.snapshot.plans[0].packages[0].stale=true;qa.emit();});await expect(graph.locator('.wf-graph-edge-flow')).toHaveCount(0);
 expect(await graph.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();expect(await mutationCalls(page)).toEqual([]);
});

test('hidden graph retains valid geometry, square zoom controls and working pan',async({page})=>{
 await page.setViewportSize({width:1440,height:1200});
 await enter(page);await tasks(page);
 const graph=page.locator('.wf-plan-graph'),zoom=graph.getByRole('status',{name:'缩放比例'}),out=graph.getByRole('button',{name:'缩小流程图'});
 const box=await out.boundingBox();expect(box).not.toBeNull();expect(Math.abs(box!.width-box!.height)).toBeLessThan(1);
 await graph.evaluate(el=>{(el as HTMLElement).style.display='none';});
 // Let the hidden element's ResizeObserver report its zero dimensions.
 await page.waitForTimeout(150);
 expect(await graph.locator('.react-flow__node').evaluateAll(els=>els.every(el=>!el.getAttribute('style')?.includes('NaN')&&!el.getAttribute('style')?.includes('width: 0px')))).toBeTruthy();
 await graph.evaluate(el=>{(el as HTMLElement).style.display='';});
 await graph.getByRole('button',{name:'查看全图'}).click();await expect(zoom).toHaveText(/^\d+%$/);
 const before=await zoom.textContent();await out.click();await expect(zoom).not.toHaveText(before!);
 const viewport=graph.locator('.react-flow__viewport'),pane=graph.locator('.react-flow__pane');
 await pane.scrollIntoViewIfNeeded();
 const transform=await viewport.getAttribute('style'),bounds=await pane.boundingBox();
 await page.mouse.move(bounds!.x+20,bounds!.y+bounds!.height-30);await page.mouse.down();await page.mouse.move(bounds!.x+100,bounds!.y+bounds!.height-60,{steps:8});await page.mouse.up();
 await expect(viewport).not.toHaveAttribute('style',transform!);await expect(zoom).toHaveText(/^\d+%$/);
});

test('running nodes expose persistent input requests and clear them on input events',async({page})=>{
 await enter(page);
 await page.evaluate(()=>{
  const qa=(window as any).spaceQA;qa.inputPending=true;qa.inputListeners=new Set();
  const p=qa.snapshot.plans[0].packages[1];p.status='running';p.attempts=[{id:'input-attempt',runId:'input-run'}];
  const old=window.desktop!.getRunPage!;window.desktop!.getRunPage=async input=>({...await old({id:'evidence'}),id:input.id,status:'running',approvals:[],questions:[]});
  window.desktop!.inputs={list:async({runId}:any)=>({policy:{paused:false,generation:0},deliveries:[],requests:runId==='input-run'&&qa.inputPending?[{id:'form',state:'pending',runId:'input-run',conversationId:'input-run',originKey:'model',revision:1,reason:'请补充环境信息',draft:{},draftTouched:false,locale:'zh-CN',createdAt:'2026-11-03',template:{version:1,id:'form-template',title:'环境信息',steps:[{id:'step',title:'补充',fields:[{name:'answer',label:'环境地址',type:'text'}]}],submit:{kind:'chat',label:'提交'}}}]:[]}),onChanged:(fn:any)=>{qa.inputListeners.add(fn);return()=>qa.inputListeners.delete(fn);}} as any;qa.emit();
 });
 await tasks(page);const graph=page.locator('.wf-plan-graph'),node=graph.locator('[data-package-id="bundle"]');
 await expect(node).toContainText('待补充信息');await expect(node).toHaveAttribute('data-tone','attention');
 await expect(page.getByRole('region',{name:'计划控制与待处理'}).locator('summary')).toContainText('待办详情 · 3');
 const locate=graph.getByRole('button',{name:/定位待处理/});await expect(locate).toContainText('3');
 await locate.click();await locate.click();await expect(node).toBeFocused();
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.inputPending=false;qa.inputListeners.forEach((fn:any)=>fn({runId:'input-run'}));});
 await expect(node).not.toContainText('待补充信息');await expect(node).toContainText('执行中');await expect(locate).toContainText('2');
 await page.evaluate(()=>{const qa=(window as any).spaceQA;qa.inputPending=true;qa.inputListeners.forEach((fn:any)=>fn({runId:'input-run'}));});
 await expect(node).toContainText('待补充信息');expect(await mutationCalls(page)).toEqual([]);
});
