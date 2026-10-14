import { test, expect } from '@playwright/test';
import {prepare} from './fixtures/file-panel';

for (const layoutMode of ['activity', 'classic']) {
 test(`${layoutMode}: project tasks paginate independently and keep order when merely opened`, async ({ page }) => {
  await page.addInitScript(({layoutMode}) => {
   if(localStorage.getItem('atelier.workspace.v1')) return;
   localStorage.setItem('atelier.task-recency.v1',JSON.stringify({'agent-0':Date.now()+86400000}));
   const projects = ['agent', 'research', 'small'].map(id => ({ id, name:id, path:'/tmp/'+id, createdAt:'2026-01-01T00:00:00.000Z' }));
   const tasks = projects.flatMap(project => Array.from({length:project.id==='small'?5:12}, (_,index) => ({
    id:`${project.id}-${index}`, title:`${project.id} task ${index}`, prompt:`Prompt ${index}`, projectId:project.id,
    status:'draft', modelId:'', createdAt:new Date(Date.UTC(2026,0,index+1)).toISOString(),
   })));
   localStorage.setItem('atelier.workspace.v1', JSON.stringify({theme:'light', language:'zh-CN', layoutMode, projects, tasks}));
  }, {layoutMode});
  await page.goto('/');
  const agent=page.locator('#nav-task-list-agent');
  const research=page.locator('#nav-task-list-research');
  const rows=agent.locator('.tree-task');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('agent task 11');
  await expect(research.locator('.tree-task')).toHaveCount(5);
  await expect(page.locator('#nav-task-list-small').getByRole('button',{name:/展开显示/})).toHaveCount(0);
  const more=agent.getByRole('button',{name:'展开显示：agent',exact:true});
  await more.focus();await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(10);
  await expect(research.locator('.tree-task')).toHaveCount(5);
  await more.click();await expect(rows).toHaveCount(12);
  await expect(more).toHaveCount(0);
  await agent.getByRole('button',{name:'agent task 0 草稿',exact:true}).click();
  await expect(rows.first()).toContainText('agent task 11');
  await agent.getByRole('button',{name:'收起显示：agent',exact:true}).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).not.toHaveClass(/selected/);
  await page.reload();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('agent task 11');
  await more.click();
  await page.getByRole('button',{name:'折叠项目：agent',exact:true}).click();
  await expect(agent).toBeHidden();
  await page.getByRole('button',{name:'展开项目：agent',exact:true}).click();
  await expect(rows).toHaveCount(10);
  expect(await page.locator('.workspace-navigation').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await agent.getByRole('button',{name:'收起显示：agent',exact:true}).click();
  await page.mouse.move(1000,100);
  await page.screenshot({path:`test-results/project-pagination-${layoutMode}-light.png`});
  await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('atelier.workspace.v1')!);state.theme='dark';state.language='en';localStorage.setItem('atelier.workspace.v1',JSON.stringify(state));});
  await page.reload();
  await expect(agent.getByRole('button',{name:'Show more：agent',exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/project-pagination-${layoutMode}-dark.png`});
 });
}

test('new user interaction changes order while viewing and streaming do not',async({page})=>{
 await prepare(page);
 await page.addInitScript(()=>{
  const d=(window as any).desktop;
  const base=(window as any).__panelRun;
  const old={...base,id:'old',title:'Older task',createdAt:'2026-01-01T00:00:00.000Z'};
  const recent={...base,id:'recent',title:'Recent task',createdAt:'2026-02-01T00:00:00.000Z'};
  (window as any).__olderTask=old;d.listRuns=async()=>[recent,old];
 });
 await page.reload();
 const rows=page.locator('#nav-task-list-p .tree-task');
 await expect(rows.first()).toContainText('Recent task');
 await rows.filter({hasText:'Older task'}).locator('button').first().click();
 await expect(rows.first()).toContainText('Recent task');
 await page.evaluate(()=>{const w=window as any;w.__panelEmit({...w.__olderTask,updatedAt:'2026-03-01T00:00:00.000Z'});});
 await expect(rows.first()).toContainText('Recent task');
 await page.evaluate(()=>{const w=window as any;w.__panelEmit({...w.__olderTask,lastTurnStartedAt:'2026-03-01T00:00:00.000Z',messages:[...w.__olderTask.messages,{role:'user',text:'Continue',timing:{startedAt:'2026-03-01T00:00:00.000Z'}}]});});
 await expect(rows.first()).toContainText('Older task');
});
