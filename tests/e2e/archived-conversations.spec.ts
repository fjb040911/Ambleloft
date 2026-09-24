import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.addInitScript(()=>{
  const stamp=new Date().toISOString();let state={theme:'light',projects:[{id:'p',name:'数据分析',path:'/fixture',createdAt:stamp}],tasks:[{id:'d',title:'报告草稿',projectId:'p',status:'draft',archivedAt:stamp,createdAt:stamp}]};
  let runs=[['a','数据报告','p'],['b','旧方案','p'],['c','普通聊天',null]].map(([id,title,projectId])=>({id,title,projectId,status:'completed',createdAt:stamp,archivedAt:stamp,messages:[],tools:[],approvals:[],error:''}));
  (window as any).__deleted=[];(window as any).__fail=false;
  (window as any).desktop={readWorkspace:async()=>state,saveWorkspace:async(next:any)=>{state=next;},getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>runs,onRun:()=>()=>{},onCommand:()=>()=>{},editRun:async(input:any)=>{if(input.id==='b'&&(window as any).__fail)throw new Error('模拟删除失败');if(input.remove){(window as any).__deleted.push(input.id);runs=runs.filter(r=>r.id!==input.id);}else runs=runs.map(r=>r.id===input.id?{...r,archivedAt:null}:r) as any;return runs;}};
 });
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'会话',exact:true}).click();
}
test('groups, searches and deletes only filtered results after explicit confirmation',async({page})=>{
 await setup(page);await expect(page.locator('.archive-row')).toHaveCount(4);await expect(page.locator('.archive-project-group')).toHaveCount(2);
 await page.getByLabel('搜索已归档会话').fill('数据');await expect(page.locator('.archive-row')).toHaveCount(3);
 await page.getByLabel('会话类型').selectOption('chat');await expect(page.locator('.archive-row')).toHaveCount(2);
 await page.getByRole('button',{name:'删除筛选结果',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('2 条会话');await expect(page.getByRole('dialog')).not.toContainText('普通聊天');
 await page.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>(window as any).__deleted)).toEqual([]);
 await page.getByLabel('全选当前结果').check();await page.getByRole('button',{name:'删除所选 (2)'}).click();await page.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__deleted)).toEqual(['a','b']);
 await page.getByLabel('搜索已归档会话').fill('');await page.getByLabel('会话类型').selectOption('all');await expect(page.locator('.archive-row')).toHaveCount(2);
 await page.getByLabel('筛选项目').selectOption('none');await expect(page.locator('.archive-row')).toContainText('普通聊天');await page.getByRole('button',{name:'还原',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(0);
});
test('batch deletion handles mixed drafts and failures without retrying deleted items',async({page})=>{
 await setup(page);await page.evaluate(()=>{(window as any).__fail=true;});
 await page.getByLabel('选择项目分组 数据分析').check();await page.getByRole('button',{name:'删除所选 (3)'}).click();await page.getByRole('button',{name:'确认永久删除',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('1 条会话删除失败');await expect(page.getByRole('dialog').locator('li')).toHaveCount(1);await expect(page.locator('.archive-row')).toHaveCount(2);
 await page.evaluate(()=>{(window as any).__fail=false;});await page.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__deleted)).toEqual(['a','b']);await expect(page.locator('.archive-row')).toContainText('普通聊天');
 await page.screenshot({path:'test-results/archived-conversations.png'});
});
