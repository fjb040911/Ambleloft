import {_electron as electron} from '@playwright/test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'amble-about-desktop-'));
let app,clipboardBefore;
try {
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env:{...process.env,ATELIER_DEV:'0'}});
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desktop?.getAppInfo);
 clipboardBefore=await app.evaluate(({clipboard})=>clipboard.readText());
 await app.evaluate(({shell})=>{globalThis.aboutLinks=[];shell.openExternal=async url=>{globalThis.aboutLinks.push(url);};});
 const info=await page.evaluate(()=>window.desktop.getAppInfo());
 assert.equal(info.version,await app.evaluate(({app})=>app.getVersion()));assert.equal(info.channel,'development');
 assert.deepEqual(Object.keys(info).sort(),['arch','builtAt','channel','commit','dirty','osVersion','platform','version'].sort());
 await mkdir('test-results',{recursive:true});
 for(const language of ['zh-CN','en']) {
  await page.evaluate(async language=>{const state=await window.desktop.readWorkspace();await window.desktop.patchWorkspace({changes:[{kind:'settings',action:'patch',expectedRevision:state.settingsRevision??0,value:{language,theme:language==='en'?'dark':'light'}}]});},language);
  const en=language==='en';await page.getByRole('button',{name:en?'About Ambleloft':'关于 Ambleloft',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText('v'+info.version,{exact:false}).waitFor();
  assert.ok((await dialog.innerText()).includes(en?'Source build':'源码开发版'));
  assert.ok(!(await dialog.innerText()).includes('插件安装仍为规划'));
  await dialog.getByRole('button',{name:en?'Copy version info':'复制版本信息',exact:true}).click();
  await dialog.getByRole('button',{name:en?'Copied':'已复制',exact:true}).waitFor();
  const copied=await app.evaluate(({clipboard})=>clipboard.readText());assert.ok(copied.includes(info.version));assert.ok(copied.includes(info.arch));assert.ok(!copied.includes(profile));assert.ok(!copied.includes('/Users/'));assert.ok(copied.split('\n').length<=5);
  for(const name of en?['Website','Documentation','GitHub','Release notes','Report an issue','Apache-2.0 license','Third-party notices']:['官方网站','使用文档','GitHub','查看更新说明','反馈问题','Apache-2.0 许可证','第三方声明'])await dialog.getByRole('link',{name,exact:true}).click();
  await page.screenshot({path:`test-results/about-${en?'en-dark':'zh-light'}.png`});
  if(en){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,600));await page.screenshot({path:'test-results/about-en-compact.png'});const box=await dialog.boundingBox();assert.ok(box.height<=600);assert.ok(box.width<=800);}
  await dialog.getByRole('button',{name:en?'Close':'关闭',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 const links=await app.evaluate(()=>globalThis.aboutLinks);assert.equal(links.length,14);assert.ok(links.includes('https://ambleloft.com/en/docs/overview/'));assert.ok(links.includes('https://ambleloft.com/zh/docs/overview/'));assert.equal(links.filter(s=>s.endsWith('/releases')).length,2);
 console.log('PASS: real Electron version IPC, Chinese/light and English/dark dialog, clipboard whitelist, all external links, close and compact layout.');
} catch(error) {
 if(app){const page=await app.firstWindow();await page.screenshot({path:'test-results/about-failure.png'}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-2500));}throw error;
} finally {
 if(app&&clipboardBefore!==undefined)await app.evaluate(({clipboard},value)=>clipboard.writeText(value),clipboardBefore).catch(()=>{});
 await app?.close();await rm(profile,{recursive:true,force:true});
}
