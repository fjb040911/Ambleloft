import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.removeItem('atelier.active-view.v1');
  const createdAt='2026-11-04T09:00:00Z';
  const runs=[{id:'project-run',title:'项目内任务',projectId:'project'},{id:'standalone-run',title:'独立任务',projectId:null}].map(run=>({...run,createdAt,status:'completed',model:'fixture',messages:[{id:run.id+'-user',role:'user',text:run.title},{id:run.id+'-answer',role:'assistant',phase:'final_answer',text:run.title+'的结果'}],tools:[],approvals:[]}));
  const workspace={language:'zh-CN',layoutMode:'activity',theme:'light',projects:[{id:'project',name:'重启测试项目',path:'/tmp/restart-test',createdAt}],tasks:[{id:'draft',title:'项目草稿',prompt:'继续项目草稿',projectId:'project',createdAt}]};
  (window as any).desktop={
   getProvider:async()=>({configured:false}),getDevice:async()=>({mode:'desktop'}),readWorkspace:async()=>workspace,
   listRuns:async()=>runs.map(run=>({...run,summaryOnly:true,messages:[]})),
   getRunPage:async({id}:any)=>{await new Promise(resolve=>setTimeout(resolve,80));return structuredClone(runs.find(run=>run.id===id));},
   onRun:()=>()=>{},onCommand:()=>()=>{},
   onOpenConversation:(callback:any)=>{(window as any).__openConversation=callback;return()=>{};},
  };
 });
 await page.goto('/');
});

test('first project task after restart keeps its project category, including after switching to standalone tasks',async({page})=>{
 const groups=page.getByRole('navigation',{name:'分组导航'});
 const projectTask=page.locator('.tree-task > button:first-child').filter({hasText:'项目内任务'});
 // Reload clears the restored view and rehydrates only task summaries, as on a cold start.
 await page.reload();
 await projectTask.click();
 await expect(page.getByText('项目内任务的结果',{exact:true})).toBeVisible();
 await expect(groups.getByRole('button',{name:'项目',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.tree-task.selected')).toContainText('项目内任务');
 await groups.getByRole('button',{name:'任务',exact:true}).click();
 await page.locator('.tree-task > button:first-child').filter({hasText:'独立任务'}).click();
 await expect(page.getByText('独立任务的结果',{exact:true})).toBeVisible();
 await expect(groups.getByRole('button',{name:'任务',exact:true})).toHaveAttribute('aria-pressed','true');
 await groups.getByRole('button',{name:'项目',exact:true}).click();
 await projectTask.click();
 await expect(groups.getByRole('button',{name:'项目',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.tree-task.selected')).toContainText('项目内任务');
});

test('external conversation openings use the target project for runs and drafts',async({page})=>{
 const groups=page.getByRole('navigation',{name:'分组导航'});
 await expect(groups.getByRole('button',{name:'项目',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__openConversation({kind:'run',recordId:'project-run'}));
 await expect(page.getByText('项目内任务的结果',{exact:true})).toBeVisible();
 await expect(groups.getByRole('button',{name:'项目',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>(window as any).__openConversation({kind:'run',recordId:'standalone-run'}));
 await expect(page.getByText('独立任务的结果',{exact:true})).toBeVisible();
 await expect(groups.getByRole('button',{name:'任务',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>(window as any).__openConversation({kind:'draft',recordId:'draft'}));
 await expect(page.getByRole('textbox',{name:'任务内容'})).toHaveValue('继续项目草稿');
 await expect(groups.getByRole('button',{name:'项目',exact:true})).toHaveAttribute('aria-pressed','true');
});
