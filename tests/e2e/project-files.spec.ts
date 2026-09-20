import {test,expect,type Page} from '@playwright/test';
async function prepare(page:Page){
 await page.addInitScript(()=>{
  const files:Record<string,any>={
   'README.md':{kind:'markdown',text:'# 项目说明\n\n只读文件预览'},
   'src/main.ts':{kind:'code',text:'const answer = 42;\nconsole.log(answer);'},
   'index.html':{kind:'html',text:'<h1>Hello</h1>'},
   'report.docx':{kind:'unsupported',reason:'此格式请使用外部应用打开。'},
  };
  (window as any).__files=files;
  const run={id:'run',projectId:'p',title:'项目任务',cwd:'/actual-task-root',model:'fixture',baseUrl:'http://localhost',status:'completed',createdAt:new Date().toISOString(),messages:[{id:'u',role:'user',text:'查看文件'},{id:'a',role:'assistant',text:'请查看右侧项目文件。'}],tools:[],approvals:[],error:''};
  (window as any).desktop={
   readWorkspace:async()=>({tasks:[],projects:[{id:'p',name:'Demo',path:'/project',createdAt:''}],theme:'light'}),saveWorkspace:async()=>{},
   getDevice:async()=>({mode:'desktop'}),getProvider:async()=>({configured:false}),listRuns:async()=>[run],onRun:()=>()=>{},onCommand:()=>()=>{},
   copyText:async(text:string)=>{(window as any).__copied=text;},
   projectFiles:{
    context:async(input:any)=>({root:input.runId?'/actual-task-root':'/project',baseUrl:'atelier-preview://fixture/'}),
    list:async(input:any)=>({entries:input.path==='src'?[{name:'main.ts',path:'src/main.ts',directory:false}]:[{name:'src',path:'src',directory:true},...['README.md','index.html','report.docx'].map(path=>({name:path,path,directory:false}))],truncated:false}),
    search:async(input:any)=>({entries:Object.keys(files).filter(path=>path.toLowerCase().includes(input.query.toLowerCase())).map(path=>({name:path.split('/').pop(),path,directory:false})),truncated:false}),
    read:async(input:any)=>{(window as any).__readContext=input;if(!files[input.path])throw new Error('文件已删除');const file=files[input.path];const version=file.text||'1';return input.version===version?{unchanged:true,version}:{...file,path:input.path,name:input.path.split('/').pop(),size:100,version,truncated:false};},
    apps:async()=>[{id:'vscode',name:'Visual Studio Code'}],open:async(input:any)=>{(window as any).__opened=input;return {id:input.application||'default',name:'Visual Studio Code'};},
   },
  };
 });
 await page.goto('/');
}
async function project(page:Page){await page.getByLabel('当前项目',{exact:true}).selectOption('p');await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();}
test('project-only entry, preview modes, read-only source and persisted state',async({page})=>{
 await prepare(page);await expect(page.getByRole('button',{name:'显示侧边面板',exact:true})).toHaveCount(0);
 await project(page);const panel=page.getByRole('region',{name:'项目文件面板'});
 await panel.getByRole('button',{name:'README.md',exact:true}).click();await expect(panel.locator('.markdown h1')).toHaveText('项目说明');
 await panel.getByRole('button',{name:'代码',exact:true}).click();await expect(panel.locator('.cm-content')).toContainText('# 项目说明');await expect(panel.locator('.cm-content')).toHaveAttribute('contenteditable','false');
 await panel.getByRole('button',{name:'查找内容',exact:true}).click();await expect(panel.locator('.cm-search input[name=search]')).toBeVisible();await panel.locator('.cm-search input[name=search]').fill('项目');await panel.locator('.cm-search input[name=search]').press('Enter');await expect(panel.locator('.cm-searchMatch')).not.toHaveCount(0);
 await panel.locator('.cm-search button[name=close]').click();
 await panel.locator('.cm-content').click();await page.keyboard.type('should not edit');await expect(panel.locator('.cm-content')).not.toContainText('should not edit');
 await page.getByRole('button',{name:'隐藏侧边面板',exact:true}).click();await expect(panel).not.toBeVisible();
 await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();await expect(panel.locator('.cm-content')).toContainText('# 项目说明');
 await page.getByLabel('当前项目',{exact:true}).selectOption('');await expect(panel).toHaveCount(0);
 await page.getByLabel('当前项目',{exact:true}).selectOption('p');await expect(page.locator('.cm-content')).toContainText('# 项目说明');
});
test('temporary tabs, pinned tabs, filtering, external opening and file changes',async({page})=>{
 await prepare(page);await project(page);const tree=page.getByRole('complementary',{name:'项目文件树'});
 await tree.getByRole('button',{name:'README.md',exact:true}).dblclick();
 await tree.getByRole('button',{name:'src',exact:true}).click();await tree.getByRole('button',{name:'main.ts',exact:true}).click();
 await expect(page.getByRole('tab')).toHaveCount(2);await expect(page.locator('.cm-content')).toContainText('answer = 42');
 await tree.getByRole('button',{name:'report.docx',exact:true}).click();await expect(page.getByRole('tab')).toHaveCount(2);await expect(page.getByRole('tab',{name:'main.ts'})).toHaveCount(0);
 await page.getByLabel('筛选文件',{exact:true}).fill('src/main');await tree.getByRole('button',{name:'src/main.ts',exact:true}).click();
 await page.getByRole('button',{name:'打开方式',exact:true}).click();await page.getByRole('menuitem',{name:'Visual Studio Code',exact:true}).click();expect(await page.evaluate(()=>(window as any).__opened.path)).toBe('src/main.ts');
 await page.evaluate(()=>{(window as any).__files['src/main.ts'].text='const updated = true;';});await expect(page.locator('.cm-content')).toContainText('updated = true');
 await page.evaluate(()=>{delete (window as any).__files['src/main.ts'];});await expect(page.getByRole('alert')).toContainText('文件已删除');
});
test('session directory wins and narrow layout remains usable',async({page})=>{
 await prepare(page);await page.locator('.tree-task > button:first-child').filter({hasText:'项目任务'}).click();await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();
 await expect(page.locator('.file-root')).toContainText('/actual-task-root');await page.locator('.file-tree').getByRole('button',{name:'README.md',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__readContext.runId)).toBe('run');
 await page.getByRole('separator',{name:'调整文件面板宽度'}).focus();await page.keyboard.press('ArrowLeft');
 await page.setViewportSize({width:800,height:650});await page.getByRole('button',{name:'显示/隐藏文件树'}).click();await expect(page.locator('.file-tree')).toHaveCount(0);
 const bounds=await page.locator('.project-file-panel').boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(800);
 await page.screenshot({path:'test-results/project-file-panel-narrow.png'});
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.project-file-panel').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('independent toolbars, project page entry, typed icons and anchored context menu',async({page})=>{
 await prepare(page);
 await page.getByRole('button',{name:'Demo',exact:true}).click();
 await expect(page.getByRole('button',{name:'显示侧边面板',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();
 await expect(page.getByText('开发预览',{exact:true})).toHaveCount(0);
 // Measure both surfaces in the same frame after the open transition settles.
 await expect.poll(()=>page.evaluate(()=>{
  const toolbar=document.querySelector('.conversation-shell > .toolbar')!.getBoundingClientRect();
  const panel=document.querySelector('.project-file-panel')!.getBoundingClientRect();
  return Math.abs(toolbar.y-panel.y)<2&&toolbar.right<=panel.left+2;
 })).toBe(true);
 const tree=page.getByRole('complementary',{name:'项目文件树'});
 const md=tree.getByRole('button',{name:'README.md',exact:true});
 const html=tree.getByRole('button',{name:'index.html',exact:true});
 expect(await md.locator('.file-type-icon').evaluate(el=>getComputedStyle(el).color)).not.toBe(await html.locator('.file-type-icon').evaluate(el=>getComputedStyle(el).color));
 await html.click({button:'right',position:{x:35,y:12}});
 const row=await html.boundingBox();const menu=await page.getByRole('menu',{name:'文件操作'}).boundingBox();
 expect(Math.abs(menu!.y-(row!.y+12))).toBeLessThan(5);
 expect(menu!.x+menu!.width).toBeLessThanOrEqual(1240);
 await page.getByRole('menuitem',{name:'复制相对路径',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__copied)).toBe('index.html');
 await expect(page.getByRole('menu')).toHaveCount(0);
 await page.screenshot({path:'test-results/project-panel-layout.png'});
});

 test('resizing follows the pointer immediately and clears drag state on release',async({page})=>{
 await prepare(page);await project(page);
 const separator=page.getByRole('separator',{name:'调整文件面板宽度',exact:true});
 await separator.hover();const initial=Number(await separator.getAttribute('aria-valuenow'));
 const box=await separator.boundingBox();
 await page.mouse.move(box!.x+box!.width/2,box!.y+80);await page.mouse.down();
 await page.mouse.move(box!.x+box!.width/2-40,box!.y+80);
 await expect(separator).toHaveAttribute('aria-valuenow',String(initial+40));
 expect(await page.locator('.file-panel-slot').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await page.mouse.up();await expect(separator).not.toHaveAttribute('data-resizing','true');
 await separator.focus();await page.keyboard.press('ArrowRight');
 await expect(separator).toHaveAttribute('aria-valuenow',String(initial+16));
});

for(const projectless of [false,true])test(`delivered filenames use the appropriate destination (${projectless?'standalone':'project'} chat)`,async({page})=>{
 await prepare(page);
 await page.addInitScript(({projectless})=>{
  const desktop=(window as any).desktop;const list=desktop.listRuns;
  desktop.accessArtifact=async(input:any)=>{(window as any).__artifactAccess=input;return input.preview?{name:'README.md',text:'# 弹窗中的文档'}:null;};
  desktop.listRuns=async()=>{const runs=await list();runs[0].artifacts=[{id:'doc',turnKey:'u',path:'/actual-task-root/README.md',name:'README.md',size:32,modifiedAt:''},{id:'office',turnKey:'u',path:'/actual-task-root/report.docx',name:'report.docx',size:64,modifiedAt:''}];if(projectless)runs[0].projectId=null;return runs;};
  if(projectless)desktop.readWorkspace=async()=>({tasks:[],projects:[],theme:'light'});
 },{projectless});
 await page.reload();await page.locator('.tree-task > button:first-child').click();
 const artifact=page.locator('.delivered-file').filter({hasText:'README.md'});
 await expect(artifact.locator('[data-file-type=md]')).toBeVisible();
 await artifact.getByRole('button',{name:'预览 README.md',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'README.md'})).toContainText('弹窗中的文档');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await artifact.getByRole('button',{name:'README.md',exact:true}).click();
 if(projectless){
  expect(await page.evaluate(()=>(window as any).__artifactAccess)).toEqual({runId:'run',id:'doc',preview:false});
  await expect(page.locator('.project-file-panel')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'显示侧边面板',exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return;
 }
 const panel=page.getByRole('region',{name:'项目文件面板'});
 await expect(panel.locator('.markdown h1')).toHaveText('项目说明');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(panel.getByRole('tab',{name:'README.md',exact:true})).toHaveAttribute('aria-selected','true');
 await panel.getByRole('button',{name:'代码',exact:true}).click();
 await page.getByRole('button',{name:'隐藏侧边面板',exact:true}).click();
 await artifact.getByRole('button',{name:'README.md',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(panel.locator('.markdown h1')).toHaveText('项目说明');
 await page.locator('.delivered-file-name').filter({hasText:'report.docx'}).click();
 await expect(panel.getByRole('tab',{name:'report.docx',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(panel).toContainText('此格式请使用外部应用打开');
 await page.evaluate(()=>{delete (window as any).__files['README.md'];});
 await artifact.getByRole('button',{name:'README.md',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('文件已删除');
});

test('preview zoom precedes mode switch and only scales preview content',async({page})=>{
 await prepare(page);await project(page);const panel=page.getByRole('region',{name:'项目文件面板'});
 await panel.getByRole('button',{name:'README.md',exact:true}).click();
 const zoom=panel.getByRole('group',{name:'预览缩放'});
 await expect(zoom.locator('output')).toHaveText('100%');
 expect(await zoom.evaluate(el=>!!(el.compareDocumentPosition(el.parentElement!.querySelector('.file-mode')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await zoom.getByRole('button',{name:'放大',exact:true}).click();await expect(zoom.locator('output')).toHaveText('110%');
 expect(await panel.locator('.file-markdown-scaled').evaluate(el=>getComputedStyle(el).zoom)).toBe('1.1');
 await panel.getByRole('button',{name:'代码',exact:true}).click();await expect(zoom).toHaveCount(0);await expect(panel.getByRole('button',{name:'查找内容',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'预览',exact:true}).click();await expect(zoom.locator('output')).toHaveText('110%');
 await zoom.getByRole('button',{name:'还原尺寸',exact:true}).click();await expect(zoom.locator('output')).toHaveText('100%');
 for(let i=0;i<6;i++)if(await zoom.getByRole('button',{name:'缩小',exact:true}).isEnabled())await zoom.getByRole('button',{name:'缩小',exact:true}).click();
 await expect(zoom.locator('output')).toHaveText('50%');await expect(zoom.getByRole('button',{name:'缩小',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'index.html',exact:true}).click();await expect(zoom.locator('output')).toHaveText('100%');
 await zoom.getByRole('button',{name:'放大',exact:true}).click();expect(await panel.locator('.file-html').evaluate(el=>getComputedStyle(el).zoom)).toBe('1.1');
});
