import {test,expect} from '@playwright/test';
async function setup(page:import('@playwright/test').Page,secondTask=false){
 await page.addInitScript(secondTask=>{
 sessionStorage.setItem('atelier.active-view.v1',JSON.stringify({page:'home',activeGroup:'chats'}));
 const providers=[{id:'a',name:'服务 A',model:'Model A',models:['Model A','Model B'],configured:true,baseUrl:'http://localhost/v1',hasKey:false,executable:''},{id:'b',name:'服务 B',model:'Model 1',models:['Model 1'],configured:true,baseUrl:'http://localhost/v2',hasKey:false,executable:''}];
 const run={id:'r',providerId:'a',title:'现有任务',model:'Model A',baseUrl:providers[0].baseUrl,cwd:'/tmp',createdAt:new Date().toISOString(),status:'completed',error:'',messages:[{id:'u',role:'user',text:'你好'},{id:'a',role:'assistant',text:'你好'}],tools:[],approvals:[]};
 (window as any).desktop={getProvider:async()=>providers[0],listProviders:async()=>({defaultId:'a',providers}),getDevice:async()=>({name:'Mac',memoryGB:64,mode:'desktop'}),readWorkspace:async()=>({layoutMode:'classic',tasks:[],projects:[],theme:'light'}),saveWorkspace:async()=>{},listRuns:async()=>secondTask?[run,{...run,id:'r2',title:'另一项任务'}]:[run],onRun:(listener:any)=>{(window as any).__notifyRun=listener;return()=>{};},onCommand:()=>()=>{},selectAttachments:async()=>[{name:'brief.txt',path:'/tmp/brief.txt'}],startRun:async(input:any)=>{(window as any).__sent=input;return {...run,model:input.model,providerId:input.providerId,status:'running'};}};
 },secondTask);await page.goto('/');
}
test('composer groups models, adds context, preserves draft through settings',async({page})=>{
 await setup(page);await page.getByRole('textbox',{name:'任务内容',exact:true}).fill('我的草稿');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();const menu=page.getByRole('dialog',{name:'模型列表'});
 await expect(menu.getByText('本地模型',{exact:true})).toHaveCount(0);await expect(page.getByText('自定义模型',{exact:true})).toHaveCount(0);
 await menu.getByRole('option',{name:'Model B 服务 A'}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('Model B');
 await page.getByRole('button',{name:'添加内容',exact:true}).click();await expect(page.getByRole('button',{name:'关闭添加菜单'})).toBeVisible();await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();await expect(page.locator('[data-align=block-start] [data-slot=attachment]')).toContainText('brief.txt');await expect(page.getByRole('combobox',{name:'当前项目'})).toContainText('不关联项目');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'返回应用',exact:true}).click();await expect(page.getByRole('textbox',{name:'任务内容',exact:true})).toHaveValue('我的草稿');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();const sent=await page.evaluate(()=>(window as any).__sent);expect(sent.model).toBe('Model B');expect(sent.attachments[0].path).toBe('/tmp/brief.txt');
});
test('existing task confirms service and full access changes and submits next-turn options',async({page})=>{
 await setup(page);await page.locator('.tree-task > button:first-child').filter({hasText:'现有任务'}).click();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:'Model 1 服务 B'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('Model A');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('option',{name:'Model 1 服务 B'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'切换模型服务',exact:true}).click();
 await page.getByRole('button',{name:'默认权限',exact:true}).click();await page.locator('[data-slot=toggle-group-item]').filter({hasText:'完全访问'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'允许完全访问',exact:true}).click();await expect(page.getByRole('button',{name:'完全访问',exact:true}).and(page.locator('[data-slot=popover-trigger]'))).toBeVisible();
 await page.getByRole('textbox',{name:'继续对话'}).fill('继续');await page.getByRole('button',{name:'发送后续消息'}).click();const sent=await page.evaluate(()=>(window as any).__sent);expect(sent).toMatchObject({runId:'r',providerId:'b',model:'Model 1',permission:'full',confirmProviderChange:true});
 await page.setViewportSize({width:800,height:600});await page.screenshot({path:'test-results/composer-compact.png'});
});

test('composer popovers move and restore keyboard focus without overflowing',async({page})=>{
 await setup(page);await page.setViewportSize({width:760,height:600});
 const trigger=page.getByRole('button',{name:'选择模型',exact:true});
 await trigger.focus();await page.keyboard.press('Enter');
 const menu=page.getByRole('dialog',{name:'模型列表'});
 await expect(menu.getByRole('combobox',{name:'搜索模型'})).toBeFocused();
 const bounds=await menu.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(12);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(748);
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(menu).toHaveCount(0);
 await trigger.click();await page.getByRole('option',{name:'Model B 服务 A'}).click();await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'添加内容',exact:true}).click();
 await expect(page.getByRole('button',{name:'文件和文件夹',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'添加内容',exact:true})).toBeFocused();
 await page.evaluate(()=>{(window as any).desktop.selectAttachments=async()=>[{name:'很长的文件名'.repeat(35)+'.md',path:'/tmp/long.md'}];});
 await page.getByRole('button',{name:'添加内容',exact:true}).click();await page.getByRole('button',{name:'文件和文件夹',exact:true}).click();
 const chip=page.getByRole('button',{name:/移除附件/});await expect(chip).toBeVisible();
 expect(await page.locator('.composer:visible').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();
 expect(await menu.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.screenshot({path:'test-results/composer-accessibility.png'});
});

test('pending submission accepts new typing without resending and a failure retains both drafts',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{(window as any).__sendCount=0;(window as any).desktop.startRun=()=>new Promise((resolve,reject)=>{(window as any).__sendCount++;(window as any).__rejectSend=reject;});});
 const input=page.getByRole('textbox',{name:'任务内容',exact:true});await input.fill('保留这份草稿');
 await page.getByRole('button',{name:'发送任务',exact:true}).click();await expect(input).toBeEnabled();await expect(input).toHaveValue('');await input.fill('新输入');await input.press('Enter');expect(await page.evaluate(()=>(window as any).__sendCount)).toBe(1);
 await page.evaluate(()=>(window as any).__rejectSend(new Error('暂时无法发送')));
 await expect(input).toBeEnabled();await expect(input).toHaveValue('保留这份草稿\n\n新输入');
 const notice=page.getByRole('alert').filter({hasText:'暂时无法发送'});
 const composer=page.locator('.new-task-composer .composer');
 const alertBox=(await notice.boundingBox())!;
 expect((await composer.boundingBox())!.y-alertBox.y-alertBox.height).toBeCloseTo(12,0);
 await notice.getByRole('button',{name:'关闭提示'}).click();
 expect((await composer.boundingBox())!.y).toBeCloseTo(alertBox.y,0);
});

test('composer grows, handles IME and retains running drafts until explicitly sent',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{const desktop=(window as any).desktop,original=desktop.startRun;desktop.startRun=async(input:any)=>({...await original(input),id:input.runId||'new-run'});});
 const home=page.getByRole('textbox',{name:'任务内容',exact:true});
 const initial=(await home.boundingBox())!.height;
 await home.fill(Array(20).fill('多行草稿').join('\n'));
 expect((await home.boundingBox())!.height).toBeGreaterThan(initial);
 expect((await home.boundingBox())!.height).toBeLessThanOrEqual(200);
 await home.fill('中文输入');
 await expect.poll(async()=>(await home.boundingBox())!.height).toBe(initial);
 await home.dispatchEvent('keydown',{key:'Enter',isComposing:true});
 expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await home.press('Shift+Enter');await expect(home).toHaveValue('中文输入\n');
 await home.press('Enter');
 const input=page.getByRole('textbox',{name:'继续对话'});
 await input.fill('下一轮的草稿');await input.press('Enter');
 await expect(input).toHaveValue('下一轮的草稿');
 await expect(page.locator('.composer-notice:visible')).toContainText('草稿尚未发送');
 expect(await page.evaluate(()=>(window as any).__sent.prompt)).toBe('中文输入\n');
});

test('model picker supports search and keyboard selection',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'选择模型',exact:true}).click();
 const search=page.getByRole('combobox',{name:'搜索模型'});await search.fill('Model B');
 await expect(page.getByRole('dialog',{name:'模型列表'}).getByRole('option').first()).toHaveAttribute('aria-label','Model B 服务 A');await search.press('Enter');
 await expect(page.getByRole('button',{name:'选择模型',exact:true})).toContainText('Model B');
 await expect(page.getByRole('button',{name:'选择模型',exact:true})).toBeFocused();
});


test('confirmation focuses cancel and Escape restores the model trigger',async({page})=>{
 await setup(page);await page.locator('.tree-task > button:first-child').click();
 const trigger=page.getByRole('button',{name:'选择模型',exact:true});await trigger.click();await page.getByRole('option',{name:'Model 1 服务 B'}).click();
 const confirmation=page.getByRole('alertdialog');await expect(confirmation.getByRole('button',{name:'取消',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(confirmation).toHaveCount(0);await expect(trigger).toBeFocused();await expect(trigger).toContainText('Model A');
});

test('permission modes clearly show selection, confirm full access and restore default',async({page})=>{
 await setup(page);const trigger=page.getByRole('button',{name:'默认权限',exact:true});await trigger.click();
 const popup=page.getByRole('dialog',{name:'权限模式'});const modes=popup.locator('[data-slot=toggle-group-item]');
 await expect(modes.first()).toHaveAttribute('aria-pressed','true');await expect(modes.last()).toHaveAttribute('aria-pressed','false');
 expect(await popup.locator('[data-slot=popover-title]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(16);
 await page.screenshot({path:'test-results/permission-modes-light.png',animations:'disabled'});
 await modes.last().click();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();await expect(trigger).toBeFocused();
 await trigger.click();await modes.last().click();await page.getByRole('alertdialog').getByRole('button',{name:'允许完全访问',exact:true}).click();
 await page.getByRole('button',{name:'完全访问',exact:true}).click();await expect(modes.last()).toHaveAttribute('aria-pressed','true');await modes.first().click();await expect(popup).not.toBeVisible();await expect(trigger).toBeVisible();await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面语言').selectOption('en');await page.getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('button',{name:'Back to app',exact:true}).click();await page.setViewportSize({width:360,height:740});
 await page.getByRole('button',{name:'Default permissions',exact:true}).click();const english=page.getByRole('dialog',{name:'Permission mode'});
 await expect(english).toContainText('Permission mode');expect(await english.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/permission-modes-english-dark.png',animations:'disabled'});
});

test('prompt input isolates docs radius and focus from legacy theme in home and follow-up',async({page})=>{
 await setup(page);
 for(const surface of ['home','followup']){
  if(surface==='followup')await page.locator('.tree-task > button:first-child').filter({hasText:'现有任务'}).click();
  const composer=page.locator('.composer:visible'),group=composer.locator(':scope > [data-slot=input-group]'),input=composer.getByRole('textbox');
  for(const theme of ['light','dark','system']){
   await page.emulateMedia({colorScheme:'dark'});
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
   await input.evaluate(el=>(el as HTMLElement).blur());
   await expect(group).toHaveCSS('border-radius','18px');
   await expect(group).toHaveCSS('border-color',theme==='light'?'rgb(222, 222, 222)':'rgba(0, 0, 0, 0)');
   await expect(group).toHaveCSS('border-top-width','1px');
   if(theme==='light')await expect(group).toHaveCSS('background-color','rgb(255, 255, 255)');
   await input.focus();
   await expect(group).toHaveCSS('border-color',theme==='light'?'oklch(0.708 0 0)':'oklch(0.556 0 0)');
   await expect.poll(()=>group.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 3px');
   await expect(input).toHaveCSS('outline-style','none');
   await expect(input).toHaveCSS('outline-offset','0px');
   await expect(input).toHaveCSS('border-width','0px');
   await page.screenshot({path:`test-results/prompt-focus-${surface}-${theme}.png`,animations:'disabled'});
  }
 }
});

test('a changed endpoint requires confirmation at send time and cancel preserves the draft',async({page})=>{
 await setup(page);
 await page.locator('.tree-task > button:first-child').click();
 await page.evaluate(()=>{
  const desktop=(window as any).desktop,list=desktop.listProviders;
  desktop.listProviders=async()=>{const catalog=await list();return {...catalog,providers:catalog.providers.map((p:any)=>({...p,baseUrl:'https://new.example/v1'}))};};
 });
 const input=page.getByRole('textbox',{name:'继续对话'});
 await input.fill('确认后才发送');await input.press('Enter');
 const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('https://new.example/v1');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(input).toHaveValue('确认后才发送');
 expect(await page.evaluate(()=>(window as any).__sent)).toBeUndefined();
 await input.press('Enter');await dialog.getByRole('button',{name:'切换模型服务',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__sent)).toMatchObject({runId:'r',confirmProviderChange:true,confirmedProviderBaseUrl:'https://new.example/v1',prompt:'确认后才发送'});
});

test('a rejected continuation has one dismissible notice owned by its task',async({page})=>{
 await setup(page,true);
 const task=(title:string)=>page.locator('.tree-task > button:first-child').filter({hasText:title});
 await task('现有任务').click();
 await page.evaluate(()=>{(window as any).desktop.startRun=async()=>{throw Error("Error invoking remote method 'agent:start': Error: 切换服务需要确认将会话历史发送到新的端点");};});
 const input=page.getByRole('textbox',{name:'继续对话'});
 await input.fill('保留草稿');await input.press('Enter');
 const notice=page.getByRole('alert').filter({hasText:'重新选择模型'});
 await expect(notice).toHaveCount(1);await expect(input).toHaveValue('保留草稿');
 const alertBox=(await notice.boundingBox())!;
 const composerBox=(await page.locator('.conversation-dock .composer:visible').boundingBox())!;
 expect(composerBox.y-alertBox.y-alertBox.height).toBeCloseTo(12,0);
 await expect(page.getByText(/Error invoking remote method/)).toHaveCount(0);
 await task('另一项任务').click();await expect(notice).toHaveCount(0);
 await task('现有任务').click();await expect(input).toHaveValue('保留草稿');
 // A non-resident task may have been unmounted. Reproduce the failure to check dismissal.
 await input.press('Enter');await notice.getByRole('button',{name:'关闭提示'}).click();
 await expect(notice).toHaveCount(0);await expect(input).toHaveValue('保留草稿');
});

for(const width of [1240,390]){
 test(`first send keeps the composer anchored until the conversation opens at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await setup(page);
  await page.evaluate(()=>{
   const w=window as any,desktop=w.desktop,start=desktop.startRun;
   desktop.startRun=(input:any)=>new Promise(resolve=>{
    w.acceptFirstMessage=async()=>resolve({...await start(input),id:'fresh-chat',messages:[{id:'first',role:'user',text:input.prompt}]});
   });
  });
  const firstInput=page.getByRole('textbox',{name:'任务内容',exact:true});
  await firstInput.fill('首轮消息\n'.repeat(60));await firstInput.press('Enter');
  await expect(page.getByLabel('正在发送的消息')).toBeVisible();
  const box=page.locator('.composer:visible > [data-slot=input-group]');
  const pending=await box.boundingBox();
  const userBubble=page.locator('[data-slot=bubble-content]:visible').first();
  const before=(await userBubble.boundingBox())!;
  await page.evaluate(()=>(window as any).acceptFirstMessage());
  await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
  const opened=await box.boundingBox();
  const after=(await userBubble.boundingBox())!;
  expect(before.y).toBeCloseTo(after.y,0);
  expect(pending!.y+pending!.height).toBeCloseTo(opened!.y+opened!.height,0);
  expect(pending!.y).toBeCloseTo(opened!.y,0);
  expect(pending!.width).toBeCloseTo(opened!.width,0);
 });
}

for(const width of [1240,390]){
 test(`first outgoing bubble keeps its position when accepted at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  let release!:()=>void;
  const loading=new Promise<void>(resolve=>{release=resolve;});
  const moduleRequested=page.waitForRequest(request=>new URL(request.url()).pathname==='/src/Conversation.tsx');
  await page.route('**/src/Conversation.tsx*',async route=>{await loading;await route.continue();});
  await setup(page);
  await page.evaluate(()=>{
   const w=window as any,start=w.desktop.startRun;
   w.desktop.startRun=(input:any)=>new Promise(resolve=>{
    w.acceptFirstMessage=async()=>{
     const run={...await start(input),id:'new-chat',messages:[{id:'first',role:'user',text:input.prompt}]};
     w.__notifyRun({...run,status:'preparing',summaryOnly:true,messages:[]});
     resolve(run);
    };
   });
  });
  const text='请帮我整理今天的安排';
  const input=page.getByRole('textbox',{name:'任务内容',exact:true});
  await input.fill(text);await input.press('Enter');
  const bubble=page.locator('[data-slot=bubble-content]:visible').filter({hasText:text});
  await expect(bubble).toHaveCount(1);
  const pending=(await bubble.boundingBox())!;
  await page.evaluate(()=>(window as any).acceptFirstMessage());
  try{
   await moduleRequested;
   await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
   await expect(bubble).toBeVisible();
   expect((await bubble.boundingBox())!.y).toBeCloseTo(pending.y,0);
  }finally{release();}
  await expect(page.getByRole('textbox',{name:'继续对话'})).toBeVisible();
  await expect(bubble).toHaveCount(1);
  const accepted=(await bubble.boundingBox())!;
  expect(pending.y).toBeLessThan(160);
  expect(pending.y).toBeCloseTo(accepted.y,0);
  expect(pending.x).toBeCloseTo(accepted.x,0);
 });
}
