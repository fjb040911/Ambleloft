import {test,expect,type Page} from '@playwright/test';

async function prepare(page:Page){
  await page.addInitScript(()=>{
    sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'projects'}));
    let state:any={theme:'light',layoutMode:'activity',projects:[{id:'p',name:'所属项目',path:'/fixture',createdAt:'2026-11-14'}],tasks:[{id:'draft',title:'项目草稿',prompt:'尚未发送的草稿',modelId:'',projectId:'p',status:'draft',createdAt:'2026-11-14'}]};
    const make=(id:string,title:string,projectId:string|null)=>({id,title,projectId,model:'fixture',cwd:'/fixture',createdAt:'2026-11-14',status:'completed',tools:[],approvals:[],messages:[{id:'u',role:'user',text:'已发送的问题'},{id:'a',role:'assistant',phase:'final_answer',text:'保留当前对话内容\n\n'.repeat(40)}]});
    let runs:any[]=[make('selected','项目任务','p'),make('other','其他项目任务','p'),make('standalone','独立任务',null)];
    const w=window as any;w.__reads=0;
    w.desktop={
      readWorkspace:async()=>structuredClone(state),saveWorkspace:async(value:any)=>{state=structuredClone(value);},
      getProvider:async()=>({configured:true,model:'fixture',baseUrl:'http://localhost/v1'}),getDevice:async()=>({name:'Test',mode:'desktop'}),
      listRuns:async()=>structuredClone(runs),getRunPage:async({id}:any)=>{w.__reads++;return structuredClone(runs.find(run=>run.id===id));},
      onRun:(fn:any)=>{w.__publish=fn;return()=>{};},onCommand:(fn:any)=>{w.__command=fn;return()=>{};},
      editRun:async(input:any)=>{
        w.__editInput=input;
        if(w.__fail)throw new Error('保存失败，请重试');
        if(w.__hold)await new Promise<void>(resolve=>{w.__release=resolve;});
        const run=runs.find(run=>run.id===input.id);
        if(input.archived!==undefined)run.archivedAt=input.archived?'2026-11-14':null;
        if(input.title!==undefined)run.title=input.title;
        if(input.projectId!==undefined)run.projectId=input.projectId;
        if(input.remove)runs=runs.filter(run=>run.id!==input.id);
        else w.__publish(structuredClone(run));
        // Match the actual IPC response, not the runtime's full in-memory list.
        return runs.map(run=>({...structuredClone(run),messages:[],tools:[],approvals:[],summaryOnly:true}));
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button',{name:'管理任务：项目任务',exact:true}).waitFor();
}
async function select(page:Page,title:string){
  if(title==='独立任务')await page.getByRole('navigation',{name:'分组导航'}).getByRole('button',{name:'任务',exact:true}).click();
  await page.locator('.workspace-navigation').getByTitle(title,{exact:true}).click();
}
async function archive(page:Page,title:string){
  await page.getByRole('button',{name:`管理任务：${title}`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'管理任务',exact:true});
  await dialog.getByRole('button',{name:'归档任务',exact:true}).click();
  await dialog.getByRole('button',{name:'确认归档任务',exact:true}).click();
}

for(const title of ['项目任务','项目草稿'])test(`archiving selected ${title} returns to its parent project`,async({page})=>{
  await prepare(page);await select(page,title);await archive(page,title);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'所属项目',exact:true})).toBeVisible();
  await expect(page.locator('.project-tree-name')).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('navigation',{name:'分组导航'}).getByRole('button',{name:'项目',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:`管理任务：${title}`,exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('atelier.active-view.v1')!))).toMatchObject({page:'projects',projectId:'p',activeGroup:'projects'});
});

test('archiving an unassociated selected task returns to standalone task creation',async({page})=>{
  await prepare(page);await select(page,'独立任务');await archive(page,'独立任务');
  await expect(page.getByRole('textbox',{name:'任务内容'})).toHaveValue('');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('atelier.active-view.v1')!))).toMatchObject({page:'home',projectId:'',activeGroup:'chats',runId:null});
});

test('archiving another task preserves the current conversation and unsent text',async({page})=>{
  await prepare(page);await select(page,'项目任务');
  const composer=page.getByRole('textbox',{name:'继续对话'});
  await composer.fill('还没有发送的补充');
  const messages=page.getByRole('region',{name:'任务消息'});
  await messages.evaluate(el=>{el.scrollTop=120;});
  await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBe(120);
  await page.evaluate(()=>{(window as any).__conversation=document.querySelector('.conversation-scroll');});
  await archive(page,'其他项目任务');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(composer).toHaveValue('还没有发送的补充');
  await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBe(120);
  await expect(page.locator('.workspace-navigation').getByTitle('项目任务',{exact:true})).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>({same:(window as any).__conversation===document.querySelector('.conversation-scroll'),reads:(window as any).__reads}))).toEqual({same:true,reads:0});
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('atelier.active-view.v1')!))).toMatchObject({page:'home',projectId:'p',runId:'selected'});
});

test('archiving another task preserves the selected draft',async({page})=>{
  await prepare(page);await select(page,'项目草稿');
  const composer=page.getByRole('textbox',{name:'任务内容'});await composer.fill('草稿的未保存修改');
  await archive(page,'其他项目任务');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(composer).toHaveValue('草稿的未保存修改');
  await expect(page.locator('.draft-context-bar')).toContainText('项目草稿');
});

test('archiving uses persisted project instead of an unsaved project selection',async({page})=>{
  await prepare(page);await select(page,'项目任务');
  await page.getByRole('button',{name:'管理任务：项目任务',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'管理任务',exact:true});
  await dialog.locator('select').selectOption('');
  await dialog.getByRole('button',{name:'归档任务',exact:true}).click();await dialog.getByRole('button',{name:'确认归档任务',exact:true}).click();
  await expect(page.getByRole('heading',{name:'所属项目',exact:true})).toBeVisible();
});

test('failed archive keeps the selected conversation and allows retry',async({page})=>{
  await prepare(page);await select(page,'项目任务');
  await page.evaluate(()=>{(window as any).__fail=true;});await archive(page,'项目任务');
  const dialog=page.getByRole('dialog',{name:'管理任务',exact:true});
  await expect(dialog.getByRole('alert')).toHaveText('保存失败，请重试');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('atelier.active-view.v1')!))).toMatchObject({page:'home',runId:'selected'});
  await page.evaluate(()=>{(window as any).__fail=false;});
  await dialog.getByRole('button',{name:'确认归档任务',exact:true}).click();
  await expect(page.getByRole('heading',{name:'所属项目',exact:true})).toBeVisible();
});

test('archive completion does not override navigation while saving',async({page})=>{
  await prepare(page);await select(page,'项目任务');
  await page.evaluate(()=>{(window as any).__hold=true;});await archive(page,'项目任务');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__release)).toBe('function');
  // Native New Task remains available while the archive IPC request is pending.
  await page.evaluate(()=>{(window as any).__command('new-task');});
  // The pending modal may hide the background from the accessibility tree.
  await expect(page.getByRole('textbox',{name:'任务内容',includeHidden:true})).toBeAttached();
  await page.evaluate(()=>{(window as any).__release();});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'任务内容'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('atelier.active-view.v1')!))).toMatchObject({page:'home',runId:null,projectId:'',activeGroup:'chats'});
});
