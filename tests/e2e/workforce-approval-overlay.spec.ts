import {test,expect} from '@playwright/test';
for(const width of [1280,390])test(`approval float preserves layout and navigation ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/manual/project-space-qa.html');
 await page.evaluate(()=>{const w=window as any,qa=w.spaceQA,api=window.desktop!,original=api.getRunPage!.bind(api),listeners=new Set<any>();let run:any;
 for(const [i,p] of qa.snapshot.plans[0].packages.slice(0,2).entries()){p.status='waiting';p.attempts=[{id:'a'+i,number:1,runId:'wait'+i,status:'waiting'}];}
 api.getRunPage=async input=>{run={...await original({id:'evidence'}),id:input.id,status:'waiting',approvals:[1,2].map(n=>({id:'approval-'+n,method:'commandExecution',detail:JSON.stringify({command:'pwd\n'.repeat(100),cwd:'/example',reason:'检查项目 '+n})}))};return structuredClone(run);};
 api.onRun=fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
 api.approveRun=async input=>{qa.calls.push({action:'approve',input});run.approvals=run.approvals.filter((a:any)=>a.id!==input.approvalId);for(const fn of listeners)fn(structuredClone(run));};qa.emit();});
 await page.getByRole('button',{name:/产品发布 准备新版/}).click();await page.getByRole('tab',{name:'任务',exact:true}).click();await page.locator('.wf-graph-node[data-package-id="copy"]').click();
 const surface=page.getByRole('region',{name:'处理任务请求',exact:true});await expect(surface).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 const input=page.getByRole('textbox',{name:'继续对话',exact:true});await input.fill('可以继续编辑草稿');await expect(input).toBeFocused();
 const initial=await input.boundingBox(),chat=await page.locator('.wf-node-conversation').boundingBox();
 await surface.getByRole('button',{name:'查看请求详情'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const approve=surface.getByRole('button',{name:'批准本次',exact:true});await approve.scrollIntoViewIfNeeded();
 expect(await approve.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBeTruthy();
 await approve.click();await expect(approve).toHaveCount(0);await expect(surface).toContainText('已批准本次命令');await expect(surface.getByRole('region',{name:'下一项请求'})).toContainText('pwd');
 await page.screenshot({path:`/tmp/request-preview-${width}.png`});
 await surface.getByRole('button',{name:'审核此项',exact:true}).click();await expect(approve).toBeVisible();await expect(surface).toContainText('检查项目 2');
 await surface.getByRole('button',{name:'收起请求',exact:true}).click();await expect(approve).toBeHidden();
 expect(await input.boundingBox()).toEqual(initial);expect(await page.locator('.wf-node-conversation').boundingBox()).toEqual(chat);
 await page.getByRole('button',{name:'查看并处理',exact:true}).click();await expect(approve).toBeVisible();
 await page.screenshot({path:`/tmp/approval-float-${width}.png`});
 await page.getByRole('button',{name:'返回流程图',exact:true}).click();await expect(page.locator('.wf-graph-node[data-package-id="copy"]')).toBeVisible();
 await expect(page.locator('.wf-request-surface.is-floating')).toHaveCount(0);
});
