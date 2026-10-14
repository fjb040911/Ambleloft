import {test,expect} from '@playwright/test';
import {prepare} from './fixtures/file-panel';
test('references, explicit deliveries and changes render independently',async({page})=>{
 await prepare(page);
 await page.addInitScript(()=>{
  const d=(window as any).desktop,list=d.listRuns;
  d.listRuns=async()=>{const [run]=await list();return [{...run,tools:[{id:'write',turnKey:'u',type:'fileChange',status:'completed',detail:JSON.stringify(['README.md','index.html','src/main.ts','deleted.txt','extra.ts'].map(path=>({path,kind:'update'})))}],messages:[run.messages[0],{id:'a',role:'assistant',text:'[阶段文档](README.md)'}],artifacts:[{id:'delivery',turnKey:'u',path:'/actual-task-root/index.html',name:'index.html',title:'页面预览',kind:'delivery',size:42},{id:'change',turnKey:'u',path:'/actual-task-root/src/main.ts',name:'main.ts',kind:'change',size:20}],fileChanges:[{turnKey:'u',files:['README.md','index.html','src/main.ts','deleted.txt','extra.ts'].map((path,i)=>({id:String(i),path,status:i===3?'deleted':'modified',additions:2,deletions:1}))}]}];};
 });
 await page.reload();await page.locator('.tree-task > button:first-child').click();
 await expect(page.locator('.delivered-file')).toHaveCount(1);await expect(page.locator('.delivered-file-name')).toHaveText('页面预览');
 await expect(page.locator('.turn-changes-summary')).toContainText('README.md');
 await expect(page.locator('.turn-changes-summary')).not.toContainText('index.html');
 await page.locator('.delivered-file').getByRole('button',{name:'查看本轮变更 index.html'}).click();
 await expect(page.getByRole('complementary',{name:'本轮文件变更'})).toContainText('index.html');
 await expect(page.getByRole('complementary',{name:'本轮文件变更'})).not.toContainText('README.md');
 await page.getByRole('button',{name:'关闭变更面板'}).click();
 await expect(page.locator('.turn-changes-summary')).not.toContainText('extra.ts');
 await page.locator('.turn-changes-summary').getByRole('button',{name:/展开显示/}).click();
 await expect(page.locator('.turn-changes-summary')).toContainText('extra.ts');
 await expect(page.locator('.turn-changes-summary').getByRole('button',{name:'deleted.txt'})).toHaveCount(0);
 await page.getByRole('link',{name:'阶段文档'}).click();
 await expect(page.getByRole('region',{name:'项目文件面板'}).locator('.markdown h1')).toHaveText('项目说明');
 await page.getByRole('button',{name:'隐藏侧边面板',exact:true}).click();
 await page.getByRole('button',{name:'查看本轮变更',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'本轮文件变更'})).toBeVisible();
 await page.screenshot({path:'/tmp/file-output-roles.png'});
});


test('legacy inferred artifacts and unattributed changes are hidden for read-only turns',async({page})=>{
 await prepare(page);
 await page.addInitScript(()=>{
  const d=(window as any).desktop,list=d.listRuns;
  d.listRuns=async()=>{const [run]=await list();return [{...run,tools:[{id:'read',turnKey:'u',type:'commandExecution',status:'completed',label:'cat src/main.ts',detail:'code'}],artifacts:[{id:'old',turnKey:'u',path:'/actual-task-root/src/main.ts',name:'main.ts',size:20}],fileChanges:[{turnKey:'u',files:[{id:'old-diff',path:'src/main.ts',status:'modified',additions:2,deletions:1}]}]}];};
 });
 await page.reload();await page.locator('.tree-task > button:first-child').click();
 await expect(page.getByRole('article',{name:'助手消息'})).toBeVisible();
 await expect(page.locator('.delivered-file')).toHaveCount(0);
 await expect(page.locator('.turn-changes-summary')).toHaveCount(0);
});
