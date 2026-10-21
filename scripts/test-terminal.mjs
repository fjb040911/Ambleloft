import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,mkdir,rm,realpath,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'amble-terminal-'));
const root=path.join(temp,'项目 with spaces');await mkdir(root);await mkdir(path.join(root,'folder'));
let app;
try{
 app=await electron.launch({...(process.argv[2]?{executablePath:path.resolve(process.argv[2])}:{}),args:[...(process.argv[2]?[]:['.']),`--user-data-dir=${path.join(temp,'profile')}`],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByLabel('任务内容',{exact:true}).waitFor();
 await page.evaluate(async root=>{await window.desktop.patchWorkspace({changes:[{kind:'project',action:'put',id:'terminal-test',expectedRevision:null,value:{id:'terminal-test',name:'Terminal test',path:root,createdAt:new Date().toISOString()}}]});},root);
 await page.reload();await page.getByRole('combobox',{name:'当前项目',exact:true}).click();await page.getByRole('option',{name:'Terminal test',exact:true}).click();
 const open=()=>app.evaluate(({Menu})=>{const view=Menu.getApplicationMenu().items.find(i=>i.label==='视图');assertMenu(view);function assertMenu(v){if(!v)throw Error('View menu missing');}view.submenu.items.find(i=>i.label==='打开终端').click();});
 await open();try{await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(1);}catch(e){console.error(await page.locator('.terminal-panel').innerText(),errors);throw e;}
 await expect(page.locator('.terminal-error')).toHaveCount(0);
 const first=(await page.evaluate(()=>window.desktop.terminal.list()))[0];assert.equal(first.cwd,await realpath(root));
 await page.locator('.terminal-screen:visible .xterm-helper-textarea').fill('');
 await page.keyboard.type('echo TERMINAL_""READY');await page.keyboard.press('Enter');
 await expect(page.locator('.terminal-screen:visible .xterm-rows')).toContainText('TERMINAL_READY');
 await page.evaluate(id=>window.desktop.terminal.write({id,data:`node -e "console.log(String.fromCharCode(27)+'[31mANSI_RED'+String.fromCharCode(27)+'[0m')"\r`}),first.id);
 await expect(page.locator('.terminal-screen:visible .xterm-fg-1').filter({hasText:'ANSI_RED'})).toBeVisible();
 // Theme changes update the live renderer without replacing the session or output.
 const setTheme=theme=>page.evaluate(async theme=>{const state=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:state.settingsRevision??0,value:{theme}}]});},theme);
 const checkTheme=async(background,foreground)=>{
  await expect(page.locator('.terminal-panel')).toHaveCSS('background-color',background);
  await expect(page.locator('.terminal-panel')).toHaveCSS('color',foreground);
  await expect(page.locator('.terminal-screen:visible .xterm-screen').locator('..')).toHaveCSS('background-color',background);
  await expect(page.locator('.terminal-screen:visible .xterm-rows')).toHaveCSS('color',foreground);
  const dark=background==='rgb(28, 30, 35)';
  await expect(page.locator('.terminal-tabs [aria-selected=true]')).toHaveCSS('background-color',dark?'rgb(46, 60, 87)':'rgb(228, 236, 250)');
  await expect(page.locator('.terminal-screen:visible .xterm-fg-1').filter({hasText:'ANSI_RED'})).toHaveCSS('color',dark?'rgb(244, 135, 129)':'rgb(180, 35, 24)');
  assert.equal((await page.evaluate(()=>window.desktop.terminal.list()))[0].id,first.id);
  await expect(page.locator('.terminal-screen:visible .xterm-rows')).toContainText('TERMINAL_READY');
 };
 await setTheme('light');await checkTheme('rgb(250, 251, 252)','rgb(38, 44, 53)');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/terminal-light.png'});
 await setTheme('dark');await checkTheme('rgb(28, 30, 35)','rgb(232, 234, 240)');
 await page.screenshot({path:'test-results/terminal-dark.png'});
 await setTheme('system');await page.emulateMedia({colorScheme:'light'});await checkTheme('rgb(250, 251, 252)','rgb(38, 44, 53)');
 await page.emulateMedia({colorScheme:'dark'});await checkTheme('rgb(28, 30, 35)','rgb(232, 234, 240)');
 await setTheme('light');await checkTheme('rgb(250, 251, 252)','rgb(38, 44, 53)');
 await page.evaluate(id=>window.desktop.terminal.write({id,data:`node -e "console.log('LONG'+'RUNNING');setInterval(()=>{},1000)"\r`}),first.id);
 await expect(page.locator('.terminal-screen:visible .xterm-rows')).toContainText('LONGRUNNING');
 await page.keyboard.press('Control+c');
 // ConPTY/PowerShell must finish returning to its prompt before the next command.
 if(process.platform==='win32')await expect.poll(async()=> (await page.locator('.terminal-screen:visible .xterm-rows').innerText()).trim().endsWith('>')).toBe(true);
 await page.keyboard.type('echo INTERRUPT_""OK');await page.keyboard.press('Enter');
 await expect(page.locator('.terminal-screen:visible .xterm-rows')).toContainText('INTERRUPT_OK');
 await open();await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(1);
 await page.getByRole('button',{name:'收起终端',exact:true}).click();await expect(page.locator('.terminal-panel')).toBeHidden();
 assert.equal((await page.evaluate(()=>window.desktop.terminal.list())).length,1);
 await page.evaluate(id=>window.desktop.terminal.write({id,data:'echo HIDDEN_STILL_RUNNING\r'}),first.id);
 await open();await expect(page.locator('.terminal-screen:visible .xterm-rows')).toContainText('HIDDEN_STILL_RUNNING');
 await page.getByRole('button',{name:'新建终端',exact:true}).click();await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(2);
 await page.getByRole('button',{name:'最大化终端',exact:true}).click();await expect(page.locator('.workspace-content')).toBeHidden();
 await page.getByRole('button',{name:'还原终端',exact:true}).click();await expect(page.locator('.workspace-content')).toBeVisible();
 const running=(await page.evaluate(()=>window.desktop.terminal.list())).at(-1);
 await page.evaluate(id=>window.desktop.terminal.write({id,data:`node -e "require('fs').writeFileSync('child.pid',String(process.pid));setInterval(()=>{},1000)"\r`}),running.id);
 await expect.poll(async()=>{try{return Number(await readFile(path.join(root,'child.pid'),'utf8'))>0;}catch{return false;}}).toBe(true);
 const childPid=Number(await readFile(path.join(root,'child.pid'),'utf8'));
 await page.getByRole('button',{name:'结束终端',exact:true}).click();await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(1);
 await expect.poll(()=>{try{process.kill(childPid,0);return false;}catch{return true;}}).toBe(true);
 await page.getByRole('combobox',{name:'当前项目',exact:true}).click();await page.getByRole('option',{name:'不关联项目',exact:true}).click();
 await open();await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(1);
 assert.equal((await page.evaluate(()=>window.desktop.terminal.list())).length,2);
 await page.getByRole('combobox',{name:'当前项目',exact:true}).click();await page.getByRole('option',{name:'Terminal test',exact:true}).click();
 await open();await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(1);
 await page.getByRole('button',{name:'显示侧边面板',exact:true}).click();
 await page.getByRole('complementary',{name:'项目文件树'}).getByRole('treeitem',{name:'folder',exact:true}).click({button:'right'});
 await page.getByRole('menuitem',{name:'在此处打开终端',exact:true}).click();
 await expect(page.locator('.terminal-tabs [role=tab]')).toHaveCount(2);
 assert.equal((await page.evaluate(()=>window.desktop.terminal.list())).at(-1).cwd,path.join(await realpath(root),'folder'));
 await page.getByRole('button',{name:'结束终端',exact:true}).click();
 // Invalid directory escape and unknown shell must never reach process spawning.
 const rejected=await page.evaluate(async()=>{const results=[];for(const input of [{projectId:'terminal-test',directory:'..'},{shell:'/does-not-exist'}]){try{await window.desktop.terminal.create(input);results.push(false);}catch{results.push(true);}}return results;});assert.deepEqual(rejected,[true,true]);
 // Window ownership protects the session even when the id is known.
 const secondEvent=app.waitForEvent('window');await page.evaluate(()=>window.desktop.newWindow());const second=await secondEvent;await second.waitForLoadState();
 await expect.poll(()=>second.evaluate(()=>!!window.desktop?.terminal)).toBe(true);
 assert.equal(await second.evaluate(async id=>{try{await window.desktop.terminal.write({id,data:'bad'});return false;}catch{return true;}},first.id),true);
 await second.close();
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/terminal-desktop.png'});
 assert.deepEqual(errors,[]);
 console.log('Terminal desktop passed: real PTY, light/dark/system themes with live session preservation, menu, cwd, typing, reuse, hidden output, tabs, maximize, termination, directory validation, window isolation.');
}finally{await app?.close();await rm(temp,{recursive:true,force:true});}
