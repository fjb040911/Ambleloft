import {test,expect} from '@playwright/test';
import {prepare,project} from './fixtures/file-panel';

test('file tree and menus support keyboard navigation and focus restoration',async({page})=>{
 await prepare(page);await project(page);
 const tree=page.getByRole('tree',{name:'项目文件',exact:true});const folder=tree.getByRole('treeitem',{name:'src',exact:true});
 await folder.focus();await page.keyboard.press('ArrowRight');await expect(folder).toHaveAttribute('aria-expanded','true');
 const file=tree.getByRole('treeitem',{name:'main.ts',exact:true});await expect(file).toBeVisible();await page.keyboard.press('ArrowRight');await expect(file).toBeFocused();
 await page.keyboard.press('Shift+F10');const menu=page.getByRole('menu',{name:'文件操作'});await expect(menu).toBeVisible();
 await page.keyboard.press('ArrowDown');await expect(menu.locator('[role=menuitem]:focus')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(file).toBeFocused();await expect(page.getByRole('region',{name:'项目文件面板'})).toBeVisible();
 await page.keyboard.press('ArrowLeft');await expect(folder).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(folder).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('ArrowDown');const md=tree.getByRole('treeitem',{name:'README.md',exact:true});await expect(md).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('.file-markdown h1')).toHaveText('项目说明');
 const open=page.getByRole('button',{name:'打开方式',exact:true});await open.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menu',{name:'打开方式'})).toBeVisible();await page.keyboard.press('Escape');await expect(open).toBeFocused();
 await page.getByRole('button',{name:'更多文件操作'}).click();await page.getByRole('menuitem',{name:'刷新文件',exact:true}).click();await expect(page.locator('.file-markdown h1')).toHaveText('项目说明');
 await page.screenshot({path:'test-results/file-panel-toolbar-light.png',animations:'disabled'});
});

test('preview tabs have explicit keep actions and closing activates the adjacent tab',async({page})=>{
 await prepare(page);await project(page);
 for(const name of ['README.md','index.html','report.docx']){
  await page.getByRole('treeitem',{name,exact:true}).click();await page.getByRole('button',{name:'保留此标签 '+name,exact:true}).click();
 }
 await expect(page.getByRole('tab')).toHaveCount(3);
 await page.getByRole('tab',{name:'README.md',exact:true}).click();
 await page.getByRole('button',{name:'关闭文件 README.md',exact:true}).click();
 await expect(page.getByRole('tab',{name:'index.html',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tab',{name:'index.html',exact:true})).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'report.docx',exact:true})).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Delete');await expect(page.getByRole('tab',{name:'index.html',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('treeitem',{name:'README.md',exact:true}).click();await expect(page.getByRole('tab',{name:'README.md',exact:true})).toHaveAttribute('title',/临时预览/);
 await page.getByRole('treeitem',{name:'report.docx',exact:true}).click();await expect(page.getByRole('tab',{name:'README.md',exact:true})).toHaveCount(0);
});

test('capped file panel resizes from actual width and saves once on release',async({page})=>{
 await prepare(page);await page.setViewportSize({width:1240,height:840});
 await page.evaluate(()=>localStorage.setItem('atelier.files.v1.width','1400'));await page.reload();await project(page);
 const slot=page.locator('.file-panel-slot');const handle=page.getByRole('separator',{name:'调整文件面板宽度'});
 await slot.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished));});
 await expect.poll(()=>handle.getAttribute('aria-valuenow')).toBe(String(Math.round((await slot.boundingBox())!.width)));
 const initial=(await slot.boundingBox())!.width;const box=(await handle.boundingBox())!;
 await page.evaluate(()=>{(window as any).__widthWrites=[];const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='atelier.files.v1.width')(window as any).__widthWrites.push(value);return original.call(this,key,value);};});
 await page.mouse.move(box.x+3,box.y+80);await page.mouse.down();
 for(const delta of [20,50,80]){await page.mouse.move(box.x+3+delta,box.y+80);expect((await slot.boundingBox())!.width).toBe(initial-delta);}
 expect(await page.evaluate(()=>(window as any).__widthWrites)).toEqual([]);
 await page.mouse.up();await expect.poll(()=>page.evaluate(()=>(window as any).__widthWrites.length)).toBe(1);
 await expect(page.locator('html')).not.toHaveClass(/file-resizing/);
 await handle.press('Home');await expect(slot).toHaveCSS('width','400px');
 await page.getByRole('button',{name:'展开预览'}).click();await expect(handle).toHaveCount(0);await page.getByRole('button',{name:'恢复面板宽度'}).click();await expect(slot).toHaveCSS('width','400px');
});

test('narrow preview returns to the same file list and scroll position',async({page})=>{
 await prepare(page);await page.setViewportSize({width:900,height:700});
 await page.evaluate(()=>{localStorage.setItem('atelier.files.v1.width','480');const api=(window as any).desktop.projectFiles;api.list=async()=>({entries:Array.from({length:50},(_,i)=>({name:`file-${i}.md`,path:`file-${i}.md`,directory:false})),truncated:false});api.read=async(input:any)=>({path:input.path,name:input.path,kind:'markdown',text:'# Preview',size:20,version:'1'});});
 // Width is read when the project panel mounts.
 await project(page);const scroll=page.locator('.file-tree-scroll');const row=page.getByRole('treeitem',{name:'file-30.md',exact:true});
 await row.scrollIntoViewIfNeeded();const top=await scroll.evaluate(el=>el.scrollTop);
 await row.click();await expect(page.locator('.file-tree')).toBeHidden();await expect(page.getByRole('tab',{name:'file-30.md',exact:true})).toBeFocused();
 const toggle=page.getByRole('button',{name:'显示/隐藏文件树'});await expect(toggle).toHaveAttribute('title','文件列表');await toggle.click();
 await expect(row).toBeFocused();expect(await scroll.evaluate(el=>el.scrollTop)).toBe(top);
 await page.keyboard.press('Escape');await expect(page.locator('.file-tree')).toBeHidden();await expect(toggle).toBeFocused();await expect(page.getByRole('region',{name:'项目文件面板'})).toBeVisible();
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'test-results/file-panel-narrow-dark.png',animations:'disabled'});
});

test('file tree divider follows the pointer and commits only after release',async({page})=>{
 await prepare(page);await project(page);
 const tree=page.locator('.file-tree');const handle=page.getByRole('separator',{name:'调整文件树宽度',exact:true});
 const initial=(await tree.boundingBox())!.width;const box=(await handle.boundingBox())!;
 await page.evaluate(()=>{(window as any).__treeWrites=[];const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='atelier.files.v1.treeWidth')(window as any).__treeWrites.push(value);return original.call(this,key,value);};});
 await page.mouse.move(box.x+box.width/2,box.y+80);await page.mouse.down();
 for(const delta of [20,40,60]){await page.mouse.move(box.x+box.width/2-delta,box.y+80);expect((await tree.boundingBox())!.width).toBe(initial+delta);}
 expect(await page.evaluate(()=>(window as any).__treeWrites)).toEqual([]);
 await page.mouse.up();await expect.poll(()=>page.evaluate(()=>(window as any).__treeWrites.length)).toBe(1);
 await handle.press('Home');await expect(tree).toHaveCSS('width','170px');await handle.dblclick();await expect(tree).toHaveCSS('width','220px');
});

test('open target is visible before opening the menu and opening preserves the current task',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const api=(window as any).desktop.projectFiles;api.apps=async()=>[{id:'default',name:'Browser',icon:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6sUAAAAASUVORK5CYII='},{id:'vscode',name:'Visual Studio Code'}];api.open=async(input:any)=>{(window as any).__opened=input;return {id:input.application,name:input.application==='vscode'?'Visual Studio Code':'Browser'};};});
 await page.locator('.tree-task > button:first-child').filter({hasText:'项目任务'}).click();await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();await page.getByRole('treeitem',{name:'index.html',exact:true}).click();
 const open=page.getByRole('button',{name:'打开 · Browser',exact:true});await expect(open).toBeVisible();await expect(open.locator('img')).toBeVisible();await open.click();
 expect(await page.evaluate(()=>(window as any).__opened)).toMatchObject({runId:'run',path:'index.html',application:'default'});await expect(page.getByRole('tab',{name:'index.html',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.home-page')).toHaveCount(0);
 await page.getByRole('button',{name:'打开方式',exact:true}).click();await page.getByRole('menuitem',{name:'Visual Studio Code',exact:true}).click();await expect(page.getByRole('button',{name:'打开 · Visual Studio Code',exact:true})).toBeVisible();await expect(page.locator('.home-page')).toHaveCount(0);
 await page.reload();await expect(page.locator('.home-page')).toHaveCount(0);await expect(page.getByRole('region',{name:'项目文件面板'})).toBeVisible();await expect(page.getByRole('tab',{name:'index.html',exact:true})).toBeVisible();
});

test('open-with choices and icons follow the selected file type across platforms',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{
  const icon='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6sUAAAAASUVORK5CYII=';
  (window as any).desktop.projectFiles.apps=async({path}:any)=>path.endsWith('.html')?[{id:'default',name:'Google Chrome',icon,applicationId:'windows:Chrome'},{id:'windows:Edge',name:'Microsoft Edge',icon},{id:'windows:Editor',name:'Other Editor',icon,recommended:false}]:[{id:'default',name:'Word',icon},{id:'windows:WPS',name:'WPS Office',icon}];
 });
 await project(page);await page.getByRole('treeitem',{name:'index.html',exact:true}).click();
 await expect(page.getByRole('button',{name:'打开 · Google Chrome',exact:true}).locator('img')).toBeVisible();await page.getByRole('button',{name:'打开方式',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Microsoft Edge',exact:true}).locator('img')).toBeVisible();await expect(page.getByRole('menuitem').filter({hasText:'Google Chrome'})).toHaveCount(1);await expect(page.getByRole('menuitem',{name:'WPS Office',exact:true})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'更多应用',exact:true}).hover();await expect(page.getByRole('menuitem',{name:'Other Editor',exact:true}).locator('img')).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.getByRole('treeitem',{name:'report.docx',exact:true}).click();await expect(page.getByRole('button',{name:'打开 · Word',exact:true})).toBeVisible();await page.getByRole('button',{name:'打开方式',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'WPS Office',exact:true}).locator('img')).toBeVisible();await expect(page.getByRole('menuitem',{name:'Microsoft Edge',exact:true})).toHaveCount(0);await expect(page.getByRole('menuitem',{name:'打开所在文件夹',exact:true})).toBeVisible();
});
